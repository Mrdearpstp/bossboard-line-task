const DEFAULT_RENDER_ORIGIN = "https://bossboard-line-task.onrender.com";
const DEFAULT_LIFF_ID = "2010109340-Oj89MY4l";
const PROXY_TIMEOUT_MS = 12000;

export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (context.request.method === "GET" && url.pathname === "/api/line/config") {
    const appOrigin = url.origin;
    return Response.json(
      {
        liffId: context.env.LINE_LIFF_ID || DEFAULT_LIFF_ID,
        loginRedirectUri: `${appOrigin}/line`,
        isLiffConfigured: true,
        isMessagingConfigured: Boolean(context.env.LINE_CHANNEL_ACCESS_TOKEN),
        hasPushTarget: false,
        source: "cloudflare-pages"
      },
      {
        headers: {
          "cache-control": "no-store"
        }
      }
    );
  }

  const nativeResponse = await handleCloudflareApi(context, url);
  if (nativeResponse) return nativeResponse;

  return proxyToRender(context, "/api");
}

async function handleCloudflareApi(context, url) {
  if (url.pathname === "/api/line/webhook") {
    if (context.request.method === "GET") {
      return nativeJson({
        ok: true,
        service: "BossBoard LINE webhook",
        runtime: "cloudflare-pages"
      });
    }
    if (context.request.method === "POST") {
      return handleNativeLineWebhook(context);
    }
    return jsonError("Method not allowed", 405);
  }

  if (!isSupabaseConfigured(context.env)) return null;

  const { request } = context;
  if (request.method === "POST" && url.pathname === "/api/line/profile") {
    const verifiedProfile = await getVerifiedLineProfile(request, context.env);
    if (!verifiedProfile) {
      return jsonError("A valid LINE login token is required", 401);
    }

    const input = await request.json().catch(() => ({}));
    const lineProfile = {
      userId: verifiedProfile.sub,
      displayName: verifiedProfile.name || input.displayName || "LINE user",
      pictureUrl: verifiedProfile.picture || input.pictureUrl || "",
      updatedAt: new Date().toISOString()
    };
    await saveLineProfile(context.env, lineProfile);
    return nativeJson(lineProfile);
  }

  const nativeTeamPaths = new Set([
    "/api/team/me",
    "/api/team/assignees",
    "/api/team/me/kpi"
  ]);
  const isNativeTeamRequest = request.method === "GET" && nativeTeamPaths.has(url.pathname);
  const isNativeTaskRequest = (url.pathname === "/api/tasks" || url.pathname.startsWith("/api/tasks/"))
    && ["GET", "POST", "DELETE"].includes(request.method);
  const isNativeProjectRequest = url.pathname === "/api/projects" || url.pathname.startsWith("/api/projects/");
  if (!isNativeTeamRequest && !isNativeTaskRequest && !isNativeProjectRequest) return null;

  const currentUser = await getCurrentUser(request, context.env);
  if (!currentUser) {
    return jsonError("LINE user is required", 401);
  }

  if (url.pathname === "/api/team/me") {
    return nativeJson({
      user: currentUser,
      memberships: await getMembershipsForUser(context.env, currentUser.id)
    });
  }

  if (url.pathname === "/api/team/assignees") {
    return nativeJson(await getAssignees(context.env, currentUser));
  }

  if (url.pathname === "/api/team/me/kpi") {
    const tasks = await readState(context.env, "tasks", []);
    return nativeJson(calculateUserKpi(currentUser, getVisibleTasksForUser(currentUser, tasks, await readTeamState(context.env))));
  }

  if (url.pathname === "/api/tasks" || url.pathname.startsWith("/api/tasks/")) {
    return handleNativeTasks(context, url, currentUser);
  }

  if (url.pathname === "/api/projects" || url.pathname.startsWith("/api/projects/")) {
    return handleNativeProjects(context, url, currentUser);
  }

  return null;
}

async function handleNativeLineWebhook(context) {
  const { request, env } = context;
  if (!env.LINE_CHANNEL_SECRET || !env.LINE_CHANNEL_ACCESS_TOKEN) {
    return jsonError("LINE messaging is not configured", 503);
  }
  if (!isSupabaseConfigured(env)) {
    return jsonError("Database is not configured", 503);
  }

  const signature = request.headers.get("x-line-signature") || "";
  const rawBody = await request.arrayBuffer();
  if (!signature || !(await verifyLineWebhookSignature(rawBody, signature, env.LINE_CHANNEL_SECRET))) {
    console.warn(JSON.stringify({ event: "line_webhook_rejected", reason: "invalid_signature" }));
    return jsonError("Invalid LINE signature", 401);
  }

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const events = Array.isArray(payload.events) ? payload.events : [];
  const work = Promise.allSettled(events.map((event) => processLineWebhookEvent(event, env)));
  if (typeof context.waitUntil === "function") {
    context.waitUntil(work);
  } else {
    await work;
  }

  return nativeJson({ ok: true, accepted: events.length });
}

async function verifyLineWebhookSignature(rawBody, signature, channelSecret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(channelSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, rawBody));
  const expected = bytesToBase64(digest);
  return constantTimeEqual(expected, signature);
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function constantTimeEqual(left, right) {
  const leftBytes = new TextEncoder().encode(String(left || ""));
  const rightBytes = new TextEncoder().encode(String(right || ""));
  if (leftBytes.length !== rightBytes.length) return false;
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

async function processLineWebhookEvent(event, env) {
  if (event?.type !== "message" || event?.message?.type !== "text") return;
  const lineUserId = String(event?.source?.userId || "").trim();
  const replyToken = String(event?.replyToken || "").trim();
  const text = String(event?.message?.text || "").trim();
  if (!lineUserId || !replyToken || !text) return;

  try {
    const currentUser = await getOrCreateWebhookUser(env, lineUserId);
    const [tasks, teamState] = await Promise.all([
      readState(env, "tasks", []),
      readTeamState(env)
    ]);
    const visibleTasks = getVisibleTasksForUser(currentUser, tasks, teamState);
    const result = await applyLineTextCommand(env, text, currentUser, tasks, visibleTasks);
    await replyLineMessage(env, replyToken, result.messages);
    console.log(JSON.stringify({
      event: "line_webhook_processed",
      command: result.command,
      lineUserId: maskIdentifier(lineUserId)
    }));
  } catch (error) {
    console.error(JSON.stringify({
      event: "line_webhook_failed",
      lineUserId: maskIdentifier(lineUserId),
      message: error?.message || "Unknown webhook error"
    }));
    await replyLineMessage(env, replyToken, [{
      type: "text",
      text: "ขออภัย ระบบบันทึกงานไม่สำเร็จ ลองส่งข้อความอีกครั้งนะ"
    }]).catch(() => {});
  }
}

async function getOrCreateWebhookUser(env, lineUserId) {
  const users = await readState(env, "users", []);
  const existingUser = users.find((user) => user.lineUserId === lineUserId);
  const lineProfile = await fetchLineMessagingProfile(env, lineUserId);
  const now = new Date().toISOString();
  const user = {
    ...(existingUser || {}),
    id: existingUser?.id || createId("user"),
    lineUserId,
    displayName: lineProfile?.displayName || existingUser?.displayName || "LINE user",
    pictureUrl: lineProfile?.pictureUrl || existingUser?.pictureUrl || "",
    email: existingUser?.email || "",
    createdAt: existingUser?.createdAt || now,
    updatedAt: now
  };
  const nextUsers = existingUser
    ? users.map((item) => (item.id === existingUser.id ? user : item))
    : [user, ...users];
  await writeState(env, "users", nextUsers);
  await saveLineProfile(env, {
    userId: lineUserId,
    displayName: user.displayName,
    pictureUrl: user.pictureUrl,
    updatedAt: now
  });
  return user;
}

async function fetchLineMessagingProfile(env, lineUserId) {
  const response = await fetch(`https://api.line.me/v2/bot/profile/${encodeURIComponent(lineUserId)}`, {
    headers: { Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` }
  });
  if (!response.ok) return null;
  return response.json();
}

async function applyLineTextCommand(env, rawText, currentUser, tasks, visibleTasks) {
  const text = rawText.replace(/\s+/g, " ").trim();
  const normalized = text.toLowerCase();

  if (/^(สรุป|summary|งานทั้งหมด)$/.test(normalized)) {
    return {
      command: "summary",
      messages: [{ type: "text", text: buildTaskSummaryText(visibleTasks) }]
    };
  }

  if (/^(งานวันนี้|วันนี้|today)$/.test(normalized) || /วันนี้.*เหลือ.*งาน/.test(normalized)) {
    const today = bangkokDateString(new Date());
    const todayTasks = visibleTasks.filter((task) => task.status !== "done" && task.dueDate === today);
    return {
      command: "today",
      messages: [{ type: "text", text: buildTaskListText("งานวันนี้", todayTasks) }]
    };
  }

  if (/^(งานค้าง|ค้าง|open|ดูงาน|งานของฉัน)$/.test(normalized)) {
    return {
      command: "open_tasks",
      messages: [{
        type: "text",
        text: buildTaskListText("งานที่ยังไม่เสร็จ", visibleTasks.filter((task) => task.status !== "done"))
      }]
    };
  }

  const statusCommand = parseStatusCommand(text);
  if (statusCommand) {
    const matchedTask = findTaskByTitle(visibleTasks, statusCommand.query);
    if (!matchedTask) {
      return {
        command: "status_not_found",
        messages: [{ type: "text", text: `ยังหางาน “${statusCommand.query}” ไม่เจอ ลองพิมพ์ชื่อให้ใกล้เคียงขึ้นนะ` }]
      };
    }
    const updatedTask = normalizeTask({
      ...matchedTask,
      status: statusCommand.status,
      activity: [
        ...(matchedTask.activity || []),
        createActivityEntry(statusCommand.activityText, currentUser)
      ]
    }, matchedTask);
    await writeState(env, "tasks", tasks.map((task) => (task.id === matchedTask.id ? updatedTask : task)));
    return {
      command: `status_${statusCommand.status}`,
      messages: [{
        type: "text",
        text: `${statusCommand.replyLabel} “${updatedTask.title}” แล้ว`
      }]
    };
  }

  const parsed = parseNaturalTask(text);
  const task = normalizeTask({
    id: createId("task"),
    title: parsed.title,
    description: "สร้างจากข้อความ LINE",
    project: "Inbox",
    status: "todo",
    priority: parsed.priority,
    assignee: currentUser.displayName,
    assigneeUserId: currentUser.id,
    createdByUserId: currentUser.id,
    createdByLineUserId: currentUser.lineUserId,
    dueDate: parsed.dueDate,
    dueTime: parsed.dueTime,
    tags: ["LINE"],
    activity: [createActivityEntry("สร้างงานจากข้อความ LINE", currentUser)]
  }, null);
  await writeState(env, "tasks", [task, ...tasks]);

  const dueLabel = formatThaiTaskDue(task);
  return {
    command: "create_task",
    messages: [{
      type: "text",
      text: `จดให้แล้ว\n${task.title}\nกำหนด: ${dueLabel}\nโปรเจกต์: Inbox`
    }]
  };
}

function parseStatusCommand(text) {
  const commands = [
    { pattern: /^(?:เสร็จ|ทำเสร็จ|ปิดงาน)\s+(.+)$/i, status: "done", replyLabel: "ปิดงาน", activityText: "เปลี่ยนสถานะเป็นเสร็จแล้วผ่าน LINE" },
    { pattern: /^(?:กำลังทำ|เริ่มทำ|ทำต่อ)\s+(.+)$/i, status: "progress", replyLabel: "เปลี่ยนเป็นกำลังทำ", activityText: "เปลี่ยนสถานะเป็นกำลังทำผ่าน LINE" },
    { pattern: /^(?:รอตรวจ|ส่งตรวจ)\s+(.+)$/i, status: "review", replyLabel: "ส่งงานเข้ารอตรวจ", activityText: "เปลี่ยนสถานะเป็นรอตรวจผ่าน LINE" }
  ];
  for (const command of commands) {
    const match = text.match(command.pattern);
    if (match) return { ...command, query: match[1].trim() };
  }
  return null;
}

function findTaskByTitle(tasks, query) {
  const needle = normalizeSearchText(query);
  if (!needle) return null;
  const openTasks = tasks.filter((task) => task.status !== "done");
  return openTasks.find((task) => normalizeSearchText(task.title) === needle)
    || openTasks.find((task) => normalizeSearchText(task.title).includes(needle))
    || openTasks.find((task) => needle.includes(normalizeSearchText(task.title)))
    || null;
}

function normalizeSearchText(value) {
  return String(value || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function parseNaturalTask(text, now = new Date()) {
  const dueDate = parseThaiDueDate(text, now);
  const dueTime = parseThaiDueTime(text);
  const title = stripThaiSchedulePhrases(text) || text.trim() || "งานใหม่";
  return {
    title,
    dueDate,
    dueTime,
    priority: /(ด่วนมาก|สำคัญมาก|เร่งด่วน)/.test(text)
      ? "high"
      : /(ไม่ด่วน|ไว้ก่อน)/.test(text) ? "low" : "medium"
  };
}

function parseThaiDueDate(text, now = new Date()) {
  const base = bangkokDateParts(now);
  if (/มะรืน/.test(text)) return datePartsToString(addCalendarDays(base, 2));
  if (/พรุ่งนี้/.test(text)) return datePartsToString(addCalendarDays(base, 1));
  if (/วันนี้/.test(text)) return datePartsToString(base);

  const nextMonthMatch = text.match(/วันที่?\s*(\d{1,2})\s*เดือนหน้า/);
  if (nextMonthMatch) {
    return safeDateString(base.year, base.month + 1, Number(nextMonthMatch[1]));
  }

  const monthNames = {
    "ม.ค.": 1, "มกรา": 1, "มกราคม": 1,
    "ก.พ.": 2, "กุมภา": 2, "กุมภาพันธ์": 2,
    "มี.ค.": 3, "มีนา": 3, "มีนาคม": 3,
    "เม.ย.": 4, "เมษา": 4, "เมษายน": 4,
    "พ.ค.": 5, "พฤษภา": 5, "พฤษภาคม": 5,
    "มิ.ย.": 6, "มิถุนา": 6, "มิถุนายน": 6,
    "ก.ค.": 7, "กรกฎา": 7, "กรกฎาคม": 7,
    "ส.ค.": 8, "สิงหา": 8, "สิงหาคม": 8,
    "ก.ย.": 9, "กันยา": 9, "กันยายน": 9,
    "ต.ค.": 10, "ตุลา": 10, "ตุลาคม": 10,
    "พ.ย.": 11, "พฤศจิกา": 11, "พฤศจิกายน": 11,
    "ธ.ค.": 12, "ธันวา": 12, "ธันวาคม": 12
  };
  const monthPattern = Object.keys(monthNames)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join("|");
  const explicitMatch = text.match(new RegExp(`วันที่?\\s*(\\d{1,2})\\s*(${monthPattern})(?:\\s*(\\d{2,4}))?`));
  if (explicitMatch) {
    let year = explicitMatch[3] ? Number(explicitMatch[3]) : base.year;
    if (year > 2400) year -= 543;
    if (year < 100) year += 2000;
    return safeDateString(year, monthNames[explicitMatch[2]], Number(explicitMatch[1]));
  }

  const dayOnlyMatch = text.match(/วันที่?\s*(\d{1,2})(?!\s*(?:โมง|นาฬิกา|:|\.))/);
  if (dayOnlyMatch) {
    const day = Number(dayOnlyMatch[1]);
    let year = base.year;
    let month = base.month;
    if (day < base.day) {
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }
    return safeDateString(year, month, day);
  }

  return datePartsToString(base);
}

function parseThaiDueTime(text) {
  const digitalMatch = text.match(/(?:เวลา\s*)?([01]?\d|2[0-3])\s*[:.]\s*([0-5]\d)/);
  if (digitalMatch) return `${digitalMatch[1].padStart(2, "0")}:${digitalMatch[2]}`;

  const eveningMatch = text.match(/(\d{1,2})\s*ทุ่ม(?:\s*(ครึ่ง))?/);
  if (eveningMatch) {
    const hour = Number(eveningMatch[1]) + 18;
    if (hour <= 23) return `${String(hour).padStart(2, "0")}:${eveningMatch[2] ? "30" : "00"}`;
  }

  const afternoonMatch = text.match(/บ่าย\s*(\d{1,2})(?:\s*โมง)?(?:\s*(ครึ่ง))?/);
  if (afternoonMatch) {
    const hour = Number(afternoonMatch[1]) + 12;
    if (hour <= 23) return `${String(hour).padStart(2, "0")}:${afternoonMatch[2] ? "30" : "00"}`;
  }

  const clockMatch = text.match(/(?:เวลา\s*)?(\d{1,2})\s*(โมง(?:เช้า|เย็น)?|นาฬิกา)(?:\s*(ครึ่ง))?/);
  if (!clockMatch) return "";
  let hour = Number(clockMatch[1]);
  if (/เย็น/.test(clockMatch[2]) && hour < 12) hour += 12;
  if (/เช้า/.test(clockMatch[2]) && hour === 12) hour = 0;
  if (hour > 23) return "";
  return `${String(hour).padStart(2, "0")}:${clockMatch[3] ? "30" : "00"}`;
}

function stripThaiSchedulePhrases(text) {
  return text
    .replace(/(?:วันนี้|พรุ่งนี้|มะรืน)/g, " ")
    .replace(/วันที่?\s*\d{1,2}\s*เดือนหน้า/g, " ")
    .replace(/วันที่?\s*\d{1,2}\s*(?:มกราคม|มกรา|ม\.ค\.|กุมภาพันธ์|กุมภา|ก\.พ\.|มีนาคม|มีนา|มี\.ค\.|เมษายน|เมษา|เม\.ย\.|พฤษภาคม|พฤษภา|พ\.ค\.|มิถุนายน|มิถุนา|มิ\.ย\.|กรกฎาคม|กรกฎา|ก\.ค\.|สิงหาคม|สิงหา|ส\.ค\.|กันยายน|กันยา|ก\.ย\.|ตุลาคม|ตุลา|ต\.ค\.|พฤศจิกายน|พฤศจิกา|พ\.ย\.|ธันวาคม|ธันวา|ธ\.ค\.)(?:\s*\d{2,4})?/g, " ")
    .replace(/วันที่?\s*\d{1,2}/g, " ")
    .replace(/(?:เวลา\s*)?(?:[01]?\d|2[0-3])\s*[:.]\s*[0-5]\d/g, " ")
    .replace(/\d{1,2}\s*ทุ่ม(?:\s*ครึ่ง)?/g, " ")
    .replace(/บ่าย\s*\d{1,2}(?:\s*โมง)?(?:\s*ครึ่ง)?/g, " ")
    .replace(/(?:เวลา\s*)?\d{1,2}\s*(?:โมง(?:เช้า|เย็น)?|นาฬิกา)(?:\s*ครึ่ง)?/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[,;:.\-–—]+|[,;:.\-–—]+$/g, "")
    .trim();
}

function bangkokDateParts(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { year: Number(values.year), month: Number(values.month), day: Number(values.day) };
}

function bangkokDateString(date) {
  return datePartsToString(bangkokDateParts(date));
}

function addCalendarDays(parts, days) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  };
}

function safeDateString(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() + 1 !== month
    || date.getUTCDate() !== day
  ) {
    return bangkokDateString(new Date());
  }
  return datePartsToString({ year, month, day });
}

function datePartsToString(parts) {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildTaskSummaryText(tasks) {
  const open = tasks.filter((task) => task.status !== "done");
  const done = tasks.filter((task) => task.status === "done");
  const today = bangkokDateString(new Date());
  const todayOpen = open.filter((task) => task.dueDate === today);
  const overdue = open.filter((task) => task.dueDate && task.dueDate < today);
  return [
    "สรุปงาน BossBoard",
    `งานทั้งหมด: ${tasks.length}`,
    `ยังไม่เสร็จ: ${open.length}`,
    `วันนี้: ${todayOpen.length}`,
    `เลยกำหนด: ${overdue.length}`,
    `เสร็จแล้ว: ${done.length}`
  ].join("\n");
}

function buildTaskListText(title, tasks) {
  if (!tasks.length) return `${title}\nไม่มีงานค้างอยู่`;
  const rows = tasks.slice(0, 10).map((task, index) => {
    const due = formatThaiTaskDue(task);
    return `${index + 1}. ${task.title} — ${due}`;
  });
  if (tasks.length > 10) rows.push(`และอีก ${tasks.length - 10} งาน`);
  return [title, ...rows].join("\n");
}

function formatThaiTaskDue(task) {
  if (!task.dueDate) return "ยังไม่กำหนด";
  const [year, month, day] = task.dueDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  const label = new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(date);
  return task.dueTime ? `${label} ${task.dueTime} น.` : label;
}

async function replyLineMessage(env, replyToken, messages) {
  const response = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ replyToken, messages })
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`LINE reply failed (${response.status}): ${detail}`);
  }
}

function maskIdentifier(value) {
  const text = String(value || "");
  if (text.length < 8) return "***";
  return `${text.slice(0, 4)}…${text.slice(-4)}`;
}

async function handleNativeTasks(context, url, currentUser) {
  const { request, env } = context;
  const id = decodeResourceId(url.pathname, "/api/tasks");

  // Updates still use Render so existing LINE Flex notifications keep working.
  if (["PUT", "PATCH"].includes(request.method)) return null;

  const [tasks, teamState] = await Promise.all([
    readState(env, "tasks", []),
    readTeamState(env)
  ]);
  const visibleTasks = getVisibleTasksForUser(currentUser, tasks, teamState);

  if (request.method === "GET") {
    if (!id) return nativeJson(visibleTasks);
    const task = visibleTasks.find((item) => item.id === id);
    return task ? nativeJson(task) : jsonError("Task not found", 404);
  }

  if (request.method === "POST" && !id) {
    const input = await request.json().catch(() => ({}));
    const assigneeUser = getAllowedAssignee(input.assigneeUserId, currentUser, teamState);
    const task = normalizeTask(
      {
        ...input,
        id: input.id || createId("task"),
        assignee: assigneeUser.displayName || currentUser.displayName || "Unassigned",
        assigneeUserId: assigneeUser.id,
        createdByUserId: currentUser.id,
        createdByLineUserId: currentUser.lineUserId,
        activity: [
          createActivityEntry("Created task", currentUser),
          ...(Array.isArray(input.activity) ? input.activity : [])
        ]
      },
      null
    );
    await writeState(env, "tasks", [task, ...tasks]);
    return nativeJson(task, 201);
  }

  if (request.method === "DELETE" && id) {
    const existingTask = tasks.find((task) => task.id === id);
    if (!existingTask) return jsonError("Task not found", 404);
    if (!visibleTasks.some((task) => task.id === id)) {
      return jsonError("You do not have access to this task", 403);
    }
    await writeState(env, "tasks", tasks.filter((task) => task.id !== id));
    return nativeJson({ ok: true });
  }

  return jsonError("Method not allowed", 405);
}

async function handleNativeProjects(context, url, currentUser) {
  const { request, env } = context;
  const id = decodeResourceId(url.pathname, "/api/projects");
  const [projects, tasks, teamState] = await Promise.all([
    readState(env, "projects", []),
    readState(env, "tasks", []),
    readTeamState(env)
  ]);

  if (request.method === "GET" && !id) {
    const visibleTasks = getVisibleTasksForUser(currentUser, tasks, teamState);
    return nativeJson(getProjectsForUser(currentUser, projects, visibleTasks));
  }

  if (request.method === "POST" && !id) {
    const input = await request.json().catch(() => ({}));
    const normalizedName = String(input.name || "").trim().toLowerCase();
    const existingProject = projects.find(
      (project) => canAccessProject(project, currentUser)
        && String(project.name || "").trim().toLowerCase() === normalizedName
    );
    if (existingProject) return nativeJson(existingProject);

    const project = normalizeProject(input, null, currentUser);
    await writeState(env, "projects", [project, ...projects]);
    return nativeJson(project, 201);
  }

  const existingProject = projects.find((project) => project.id === id);
  if (!existingProject) return jsonError("Project not found", 404);
  if (!canAccessProject(existingProject, currentUser)) {
    return jsonError("You do not have access to this project", 403);
  }

  if (request.method === "GET") return nativeJson(existingProject);

  if (request.method === "PUT") {
    const input = await request.json().catch(() => ({}));
    const project = normalizeProject({ ...existingProject, ...input, id }, existingProject, currentUser);
    await writeState(env, "projects", projects.map((item) => (item.id === id ? project : item)));
    return nativeJson(project);
  }

  if (request.method === "DELETE") {
    await writeState(env, "projects", projects.filter((project) => project.id !== id));
    return nativeJson({ ok: true, deletedProjectId: id });
  }

  return jsonError("Method not allowed", 405);
}

async function getVerifiedLineProfile(request, env) {
  const idToken = request.headers.get("x-line-id-token") || "";
  const accessToken = getBearerToken(request);
  const clientId = String(env.LINE_LOGIN_CHANNEL_ID || (env.LINE_LIFF_ID || DEFAULT_LIFF_ID).split("-")[0] || "");
  if (!clientId) return null;

  if (idToken) {
    const response = await fetch("https://api.line.me/oauth2/v2.1/verify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        id_token: idToken,
        client_id: clientId
      })
    });
    if (response.ok) {
      const profile = await response.json();
      if (profile?.sub) return profile;
    }
  }

  if (!accessToken) return null;
  const verifyResponse = await fetch(
    `https://api.line.me/oauth2/v2.1/verify?access_token=${encodeURIComponent(accessToken)}`
  );
  if (!verifyResponse.ok) return null;
  const accessTokenInfo = await verifyResponse.json();
  if (String(accessTokenInfo.client_id || "") !== clientId) return null;

  const profileResponse = await fetch("https://api.line.me/v2/profile", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!profileResponse.ok) return null;
  const profile = await profileResponse.json();
  return profile?.userId
    ? {
        sub: profile.userId,
        name: profile.displayName || "",
        picture: profile.pictureUrl || ""
      }
    : null;
}

function getBearerToken(request) {
  const authorization = request.headers.get("authorization") || "";
  return authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "";
}

async function getCurrentUser(request, env) {
  const verifiedProfile = await getVerifiedLineProfile(request, env);
  if (!verifiedProfile) return null;

  const users = await readState(env, "users", []);
  const existingUser = users.find((user) => user.lineUserId === verifiedProfile.sub);
  const now = new Date().toISOString();
  const user = {
    ...(existingUser || {}),
    id: existingUser?.id || createId("user"),
    lineUserId: verifiedProfile.sub,
    displayName: verifiedProfile.name || existingUser?.displayName || "LINE user",
    pictureUrl: verifiedProfile.picture || existingUser?.pictureUrl || "",
    email: existingUser?.email || "",
    createdAt: existingUser?.createdAt || now,
    updatedAt: now
  };

  const nextUsers = existingUser
    ? users.map((item) => (item.id === existingUser.id ? user : item))
    : [user, ...users];
  await writeState(env, "users", nextUsers);
  return user;
}

async function saveLineProfile(env, profile) {
  const [lineUsers, users] = await Promise.all([
    readState(env, "lineUsers", []),
    readState(env, "users", [])
  ]);
  const existingAppUser = users.find((user) => user.lineUserId === profile.userId);
  const appUser = {
    ...(existingAppUser || {}),
    id: existingAppUser?.id || createId("user"),
    lineUserId: profile.userId,
    displayName: profile.displayName,
    pictureUrl: profile.pictureUrl,
    email: existingAppUser?.email || "",
    createdAt: existingAppUser?.createdAt || profile.updatedAt,
    updatedAt: profile.updatedAt
  };

  const nextLineUsers = lineUsers.some((user) => user.userId === profile.userId)
    ? lineUsers.map((user) => (user.userId === profile.userId ? profile : user))
    : [profile, ...lineUsers];
  const nextUsers = existingAppUser
    ? users.map((user) => (user.id === existingAppUser.id ? appUser : user))
    : [appUser, ...users];

  await Promise.all([
    writeState(env, "lineUsers", nextLineUsers),
    writeState(env, "users", nextUsers)
  ]);
}

async function readTeamState(env) {
  const [organizations, members, users] = await Promise.all([
    readState(env, "organizations", []),
    readState(env, "members", []),
    readState(env, "users", [])
  ]);
  return { organizations, members, users };
}

async function getMembershipsForUser(env, userId) {
  const { organizations, members, users } = await readTeamState(env);
  return members
    .filter((member) => member.userId === userId)
    .map((member) => ({
      ...member,
      organization: organizations.find((organization) => organization.id === member.organizationId),
      user: users.find((user) => user.id === member.userId)
    }));
}

async function getAssignees(env, currentUser) {
  const { organizations, members, users } = await readTeamState(env);
  const organizationIds = members
    .filter((member) => member.userId === currentUser.id && member.status === "active")
    .map((member) => member.organizationId);

  return members
    .filter((member) => organizationIds.includes(member.organizationId) && member.status === "active")
    .map((member) => ({
      memberId: member.id,
      organizationId: member.organizationId,
      organization: organizations.find((organization) => organization.id === member.organizationId),
      role: member.role,
      user: users.find((user) => user.id === member.userId)
    }))
    .filter((item) => item.user);
}

function getVisibleTasksForUser(user, tasks, teamState) {
  const organizationIds = teamState.members
    .filter((member) => member.userId === user.id && member.status === "active")
    .map((member) => member.organizationId);
  const identityKeys = [user.id, user.lineUserId, user.displayName]
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase());

  return tasks.filter((task) => {
    if (task.createdByUserId === user.id || task.createdByLineUserId === user.lineUserId) return true;
    if (task.assigneeUserId === user.id) return true;
    if (task.organizationId && organizationIds.includes(task.organizationId)) return true;
    return !task.organizationId
      && !task.assigneeUserId
      && identityKeys.includes(String(task.assignee || "").trim().toLowerCase());
  });
}

function getAllowedAssignee(requestedUserId, currentUser, teamState) {
  if (!requestedUserId || requestedUserId === currentUser.id) return currentUser;
  const currentOrganizationIds = teamState.members
    .filter((member) => member.userId === currentUser.id && member.status === "active")
    .map((member) => member.organizationId);
  const canAssign = teamState.members.some(
    (member) => member.userId === requestedUserId
      && member.status === "active"
      && currentOrganizationIds.includes(member.organizationId)
  );
  return canAssign
    ? teamState.users.find((user) => user.id === requestedUserId) || currentUser
    : currentUser;
}

function normalizeTask(input, existingTask) {
  return {
    id: String(input.id || existingTask?.id || createId("task")),
    title: String(input.title || existingTask?.title || "Untitled task").trim(),
    description: String(input.description ?? existingTask?.description ?? "").trim(),
    project: String(input.project || existingTask?.project || "General").trim(),
    status: ["todo", "progress", "review", "done"].includes(input.status)
      ? input.status
      : existingTask?.status || "todo",
    priority: ["high", "medium", "low"].includes(input.priority)
      ? input.priority
      : existingTask?.priority || "medium",
    assignee: String(input.assignee || existingTask?.assignee || "Unassigned").trim(),
    assigneeUserId: String(input.assigneeUserId || existingTask?.assigneeUserId || "").trim(),
    organizationId: String(input.organizationId || existingTask?.organizationId || "").trim(),
    createdByUserId: String(input.createdByUserId || existingTask?.createdByUserId || "").trim(),
    createdByLineUserId: String(input.createdByLineUserId || existingTask?.createdByLineUserId || "").trim(),
    dueDate: String(input.dueDate || existingTask?.dueDate || addDays(1)),
    dueTime: normalizeDueTime(input.dueTime ?? existingTask?.dueTime ?? ""),
    tags: Array.isArray(input.tags)
      ? input.tags.map(String).map((tag) => tag.trim()).filter(Boolean)
      : existingTask?.tags || [],
    activity: Array.isArray(input.activity) ? input.activity : existingTask?.activity || []
  };
}

function normalizeProject(input, existingProject, user) {
  return {
    id: String(input.id || existingProject?.id || createId("project")),
    name: String(input.name || existingProject?.name || "New project").trim(),
    description: String(input.description ?? existingProject?.description ?? "").trim(),
    color: String(input.color || existingProject?.color || "#ff8a00").trim(),
    icon: String(input.icon || existingProject?.icon || "folder").trim(),
    priority: String(input.priority || existingProject?.priority || "normal").trim(),
    startDate: String(input.startDate || existingProject?.startDate || "").trim(),
    endDate: String(input.endDate || existingProject?.endDate || "").trim(),
    members: (Array.isArray(input.members) ? input.members : existingProject?.members || [])
      .map((member) => ({
        id: String(member.id || "").trim(),
        name: String(member.name || "").trim(),
        avatarUrl: String(member.avatarUrl || member.pictureUrl || "").trim()
      }))
      .filter((member) => member.id || member.name || member.avatarUrl),
    ownerUserId: String(input.ownerUserId || existingProject?.ownerUserId || user.id).trim(),
    ownerLineUserId: String(input.ownerLineUserId || existingProject?.ownerLineUserId || user.lineUserId).trim(),
    createdAt: existingProject?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function canAccessProject(project, user) {
  return Boolean(
    project
      && user
      && (
        (project.ownerUserId && project.ownerUserId === user.id)
        || (project.ownerLineUserId && project.ownerLineUserId === user.lineUserId)
      )
  );
}

function getProjectsForUser(user, projects, visibleTasks) {
  const projectMap = new Map();
  projects
    .filter((project) => canAccessProject(project, user))
    .forEach((project) => projectMap.set(project.name, { ...project, total: 0, done: 0, nextDue: "" }));

  visibleTasks.forEach((task) => {
    const name = task.project || "General";
    const current = projectMap.get(name)
      || normalizeProject({ name, description: "Created from existing tasks" }, null, user);
    current.total = (current.total || 0) + 1;
    current.done = (current.done || 0) + (task.status === "done" ? 1 : 0);
    if (task.dueDate && (!current.nextDue || task.dueDate < current.nextDue)) current.nextDue = task.dueDate;
    projectMap.set(name, current);
  });

  return Array.from(projectMap.values()).sort((a, b) => a.name.localeCompare(b.name, "th"));
}

function createActivityEntry(text, user) {
  return {
    id: createId("activity"),
    text,
    time: "Now",
    createdAt: new Date().toISOString(),
    actorName: user?.displayName || "",
    actorUserId: user?.id || ""
  };
}

function normalizeDueTime(value) {
  const match = String(value || "").trim().match(/^(\d{1,2})(?::?(\d{2}))?$/);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  if (hour > 23 || minute > 59) return "";
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function addDays(days) {
  const date = new Date(Date.now() + days * 86400000);
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
}

function decodeResourceId(pathname, basePath) {
  return decodeURIComponent(pathname.slice(basePath.length).replace(/^\/+/, ""));
}

function calculateUserKpi(user, tasks) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
  const total = tasks.length;
  const done = tasks.filter((task) => task.status === "done").length;
  const active = tasks.filter((task) => task.status !== "done").length;
  const overdue = tasks.filter((task) => task.status !== "done" && task.dueDate && task.dueDate < today).length;
  const dueSoon = tasks
    .filter((task) => task.status !== "done" && task.dueDate && task.dueDate >= today)
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))
    .slice(0, 5);
  return {
    userId: user.id,
    total,
    done,
    active,
    overdue,
    completionRate: total ? Math.round((done / total) * 100) : 0,
    dueSoon
  };
}

function isSupabaseConfigured(env) {
  return Boolean(env.SUPABASE_URL && (env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY));
}

async function readState(env, name, fallback) {
  const rows = await callSupabase(
    env,
    `/rest/v1/linetask_state?name=eq.${encodeURIComponent(name)}&select=payload&limit=1`
  );
  return Array.isArray(rows) && rows.length ? rows[0].payload ?? fallback : fallback;
}

async function writeState(env, name, payload) {
  await callSupabase(env, "/rest/v1/linetask_state?on_conflict=name", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      name,
      payload,
      updated_at: new Date().toISOString()
    })
  });
}

async function callSupabase(env, pathname, options = {}) {
  const origin = String(env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY || "";
  const response = await fetch(`${origin}${pathname}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase request failed (${response.status}): ${detail}`);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

function nativeJson(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-bossboard-api": "cloudflare-native"
    }
  });
}

function jsonError(message, status) {
  return nativeJson({ error: message }, status);
}

async function proxyToRender({ request, env }, mountPath) {
  const origin = (env.RENDER_ORIGIN || DEFAULT_RENDER_ORIGIN).replace(/\/$/, "");
  const sourceUrl = new URL(request.url);
  const targetUrl = new URL(`${origin}${sourceUrl.pathname}${sourceUrl.search}`);

  const headers = new Headers(request.headers);
  stripHopByHopHeaders(headers);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("Render origin timeout"), PROXY_TIMEOUT_MS);
  const init = {
    method: request.method,
    headers,
    redirect: "manual",
    signal: controller.signal
  };

  if (!["GET", "HEAD"].includes(request.method)) {
    init.body = request.body;
  }

  try {
    const response = await fetch(targetUrl, init);
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set("x-bossboard-proxy", `cloudflare-pages:${mountPath}`);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders
    });
  } catch (error) {
    return Response.json(
      {
        error: "Cloudflare proxy failed",
        message: error.message || "Render origin did not respond in time"
      },
      { status: 502 }
    );
  } finally {
    clearTimeout(timeout);
  }
}

function stripHopByHopHeaders(headers) {
  [
    "connection",
    "host",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade"
  ].forEach((header) => headers.delete(header));
}

export {
  parseNaturalTask,
  parseThaiDueDate,
  parseThaiDueTime,
  stripThaiSchedulePhrases,
  verifyLineWebhookSignature
};
