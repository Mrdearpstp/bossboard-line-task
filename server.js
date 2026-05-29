const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");

const root = __dirname;
const dataDir = path.join(os.tmpdir(), "linetask-data");
const tasksFile = path.join(dataDir, "tasks.json");
const lineUsersFile = path.join(dataDir, "line-users.json");
const lineTargetsFile = path.join(dataDir, "line-targets.json");
const usersFile = path.join(dataDir, "users.json");
const organizationsFile = path.join(dataDir, "organizations.json");
const membersFile = path.join(dataDir, "members.json");
const reminderSettingsFile = path.join(dataDir, "reminder-settings.json");
const projectsFile = path.join(dataDir, "projects.json");
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || (process.env.RENDER ? "0.0.0.0" : "127.0.0.1");
let databaseReady = false;
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png"
};

loadEnvFile();

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const seedTasks = [
  {
    id: "task-1",
    title: "ออกแบบ LINE notification flow",
    description: "กำหนดข้อความแจ้งเตือนสำหรับงานใหม่ งานใกล้ครบกำหนด และงานเลยกำหนด",
    project: "LINE Integration",
    status: "progress",
    priority: "high",
    assignee: "Narin",
    dueDate: "2026-05-18",
    tags: ["LINE", "Automation"],
    activity: [
      { id: "a1", text: "Narin ปรับข้อความแจ้งเตือนงานใกล้ครบกำหนด", time: "วันนี้ 10:15" },
      { id: "a2", text: "ระบบจำลองส่ง LINE preview สำเร็จ", time: "เมื่อวาน 16:40" }
    ]
  },
  {
    id: "task-2",
    title: "สร้าง Project dashboard",
    description: "รวมจำนวนงานตามสถานะ งานเสี่ยงเลยกำหนด และงานของฉันในหน้าเดียว",
    project: "Core App",
    status: "review",
    priority: "medium",
    assignee: "Mali",
    dueDate: "2026-05-20",
    tags: ["Dashboard"],
    activity: [{ id: "a3", text: "Mali ส่งหน้า dashboard ให้ตรวจ", time: "วันนี้ 09:30" }]
  },
  {
    id: "task-3",
    title: "กำหนด schema สำหรับ task และ comment",
    description: "เตรียมโครงสร้างข้อมูลให้รองรับ workspace, assignee, due date, activity log และ LINE user id",
    project: "Data Model",
    status: "todo",
    priority: "high",
    assignee: "Krit",
    dueDate: "2026-05-22",
    tags: ["Database"],
    activity: [{ id: "a4", text: "Krit เพิ่มฟิลด์ lineUserId ใน draft schema", time: "เมื่อวาน 11:05" }]
  },
  {
    id: "task-4",
    title: "ทดสอบมุมมอง Kanban กับทีมขาย",
    description: "รวบรวม feedback เรื่อง column, filter, และข้อมูลที่ควรแสดงบนการ์ดงาน",
    project: "UX Research",
    status: "done",
    priority: "low",
    assignee: "Pim",
    dueDate: "2026-05-15",
    tags: ["Research"],
    activity: [{ id: "a5", text: "Pim ปิดรอบสัมภาษณ์และสรุป feedback", time: "15 พ.ค. 2026" }]
  },
  {
    id: "task-5",
    title: "เพิ่มตัวกรองงานของฉัน",
    description: "ให้ผู้ใช้ค้นหางานจากชื่อ โปรเจกต์ ผู้รับผิดชอบ สถานะ และ priority ได้จากทุก view",
    project: "Core App",
    status: "progress",
    priority: "medium",
    assignee: "Narin",
    dueDate: "2026-05-24",
    tags: ["Search", "Filter"],
    activity: [{ id: "a6", text: "Narin ผูก search กับ board view แล้ว", time: "วันนี้ 13:20" }]
  }
];

const server = http.createServer(async (request, response) => {
  if (request.url && request.url.startsWith("/api/tasks")) {
    await handleTasksApi(request, response);
    return;
  }

  if (request.url && request.url.startsWith("/api/line")) {
    await handleLineApi(request, response);
    return;
  }

  if (request.url && request.url.startsWith("/api/team")) {
    await handleTeamApi(request, response);
    return;
  }

  if (request.url && request.url.startsWith("/api/projects")) {
    await handleProjectsApi(request, response);
    return;
  }

  if (request.url && request.url.startsWith("/brand/")) {
    const brandAssets = {
      "/brand/bossboard-logo.png": path.join(root, "static", "bossboard-logo.png"),
      "/brand/bossboard-mascot.png": path.join(root, "static", "bossboard-mascot.png")
    };
    const requestUrl = new URL(request.url || "/", `http://${host}:${port}`);
    const assetPath = brandAssets[requestUrl.pathname];
    if (!assetPath) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    fs.readFile(assetPath, (error, data) => {
      if (error) {
        response.writeHead(404);
        response.end("Brand asset not found");
        return;
      }
      response.writeHead(200, {
        "Cache-Control": "public, max-age=3600",
        "Content-Type": "image/png"
      });
      response.end(data);
    });
    return;
  }

  const requestUrl = new URL(request.url || "/", `http://${host}:${port}`);
  const safePath = requestUrl.pathname === "/" ? "index.html" : requestUrl.pathname.slice(1);
  const filePath = path.resolve(root, safePath);

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream"
    });
    response.end(data);
  });
});

async function ensureDatabase() {
  if (databaseReady) return;
  if (isSupabaseConfigured()) {
    const stateKeys = [
      ["tasks", seedTasks],
      ["lineUsers", []],
      ["lineTargets", []],
      ["users", []],
      ["organizations", []],
      ["members", []],
      ["reminderSettings", []],
      ["projects", []]
    ];
    for (const [key, fallback] of stateKeys) {
      const existingValue = await readSupabaseState(key, null);
      if (existingValue === null) {
        await writeSupabaseState(key, fallback);
      }
    }
    databaseReady = true;
    return;
  }

  await fsp.mkdir(dataDir, { recursive: true });
  try {
    await fsp.access(tasksFile);
  } catch {
    await writeTasks(seedTasks);
  }
  try {
    await fsp.access(lineUsersFile);
  } catch {
    await writeJsonFile(lineUsersFile, []);
  }
  try {
    await fsp.access(lineTargetsFile);
  } catch {
    await writeJsonFile(lineTargetsFile, []);
  }
  try {
    await fsp.access(usersFile);
  } catch {
    await writeJsonFile(usersFile, []);
  }
  try {
    await fsp.access(organizationsFile);
  } catch {
    await writeJsonFile(organizationsFile, []);
  }
  try {
    await fsp.access(membersFile);
  } catch {
    await writeJsonFile(membersFile, []);
  }
  try {
    await fsp.access(reminderSettingsFile);
  } catch {
    await writeJsonFile(reminderSettingsFile, []);
  }
  try {
    await fsp.access(projectsFile);
  } catch {
    await writeJsonFile(projectsFile, []);
  }
  databaseReady = true;
}

async function readTasks() {
  await ensureDatabase();
  if (isSupabaseConfigured()) return readSupabaseState("tasks", []);
  const raw = await fsp.readFile(tasksFile, "utf8");
  return JSON.parse(raw);
}

async function writeTasks(tasks) {
  if (isSupabaseConfigured()) {
    await writeSupabaseState("tasks", tasks);
    return;
  }
  await fsp.mkdir(dataDir, { recursive: true });
  await fsp.writeFile(tasksFile, `${JSON.stringify(tasks, null, 2)}\n`, "utf8");
}

async function readJsonFile(filePath, fallback) {
  if (isSupabaseConfigured()) {
    return readSupabaseState(getStateKeyForFile(filePath), fallback);
  }
  try {
    const raw = await fsp.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJsonFile(filePath, payload) {
  if (isSupabaseConfigured()) {
    await writeSupabaseState(getStateKeyForFile(filePath), payload);
    return;
  }
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function getStateKeyForFile(filePath) {
  const normalizedPath = path.basename(filePath);
  const stateKeys = {
    [path.basename(lineUsersFile)]: "lineUsers",
    [path.basename(lineTargetsFile)]: "lineTargets",
    [path.basename(usersFile)]: "users",
    [path.basename(organizationsFile)]: "organizations",
    [path.basename(membersFile)]: "members",
    [path.basename(reminderSettingsFile)]: "reminderSettings",
    [path.basename(projectsFile)]: "projects",
    [path.basename(tasksFile)]: "tasks"
  };
  return stateKeys[normalizedPath] || normalizedPath.replace(/\.json$/i, "");
}

function getSupabaseConfig() {
  return {
    url: String(process.env.SUPABASE_URL || "").replace(/\/+$/, ""),
    key: String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "")
  };
}

function isSupabaseConfigured() {
  const { url, key } = getSupabaseConfig();
  return Boolean(url && key);
}

async function callSupabase(pathname, options = {}) {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) throw new Error("Supabase is not configured");
  const result = await fetch(`${url}${pathname}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  if (!result.ok) {
    const detail = await result.text();
    throw new Error(`Supabase request failed (${result.status}): ${detail}`);
  }
  if (result.status === 204) return null;
  const text = await result.text();
  return text ? JSON.parse(text) : null;
}

async function readSupabaseState(name, fallback) {
  const rows = await callSupabase(`/rest/v1/linetask_state?name=eq.${encodeURIComponent(name)}&select=payload&limit=1`);
  if (!Array.isArray(rows) || !rows.length) return fallback;
  return rows[0].payload ?? fallback;
}

async function writeSupabaseState(name, payload) {
  await callSupabase("/rest/v1/linetask_state?on_conflict=name", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      name,
      payload,
      updated_at: new Date().toISOString()
    })
  });
}

async function readJsonBody(request) {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
  }
  return raw ? JSON.parse(raw) : {};
}

async function readRawBody(request) {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
  }
  return raw;
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function normalizeDueTime(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{1,2})(?::?(\d{2}))?$/);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  if (hour > 23 || minute > 59) return "";
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizeTask(input, existingTask) {
  return {
    id: String(input.id || existingTask?.id || `task-${Date.now()}`),
    title: String(input.title || "Untitled task").trim(),
    description: String(input.description || "").trim(),
    project: String(input.project || "General").trim(),
    status: ["todo", "progress", "review", "done"].includes(input.status) ? input.status : "todo",
    priority: ["high", "medium", "low"].includes(input.priority) ? input.priority : "medium",
    assignee: String(input.assignee || "Unassigned").trim(),
    assigneeUserId: String(input.assigneeUserId || existingTask?.assigneeUserId || "").trim(),
    organizationId: String(input.organizationId || existingTask?.organizationId || "").trim(),
    createdByUserId: String(input.createdByUserId || existingTask?.createdByUserId || "").trim(),
    createdByLineUserId: String(input.createdByLineUserId || existingTask?.createdByLineUserId || "").trim(),
    dueDate: String(input.dueDate || addDays(1)),
    dueTime: normalizeDueTime(input.dueTime ?? existingTask?.dueTime ?? ""),
    tags: Array.isArray(input.tags) ? input.tags.map(String).map((tag) => tag.trim()).filter(Boolean) : [],
    activity: Array.isArray(input.activity) ? input.activity : existingTask?.activity || []
  };
}

function normalizeReminderSettings(input = {}, existing = {}) {
  const reminderTime = String(input.reminderTime || existing.reminderTime || "09:00").slice(0, 5);
  const dueSoonTime = String(input.dueSoonTime || existing.dueSoonTime || reminderTime || "09:00").slice(0, 5);
  const dailySummaryTime = String(input.dailySummaryTime || existing.dailySummaryTime || "08:30").slice(0, 5);
  const defaultReminderTime = String(input.defaultReminderTime || existing.defaultReminderTime || reminderTime || "09:00").slice(0, 5);
  const defaultPriority = ["low", "medium", "high"].includes(input.defaultPriority || existing.defaultPriority)
    ? input.defaultPriority || existing.defaultPriority
    : "medium";
  return {
    lineUserId: String(input.lineUserId || existing.lineUserId || ""),
    enabled: input.enabled ?? existing.enabled ?? true,
    dailySummaryEnabled: input.dailySummaryEnabled ?? existing.dailySummaryEnabled ?? true,
    dailySummaryTime,
    dueSoonEnabled: input.dueSoonEnabled ?? existing.dueSoonEnabled ?? true,
    dueSoonDays: Math.max(0, Math.min(7, Number(input.dueSoonDays ?? existing.dueSoonDays ?? 1))),
    dueSoonTime,
    overdueEnabled: input.overdueEnabled ?? existing.overdueEnabled ?? true,
    reminderTime,
    quietHoursEnabled: input.quietHoursEnabled ?? existing.quietHoursEnabled ?? false,
    quietStart: String(input.quietStart || existing.quietStart || "22:00").slice(0, 5),
    quietEnd: String(input.quietEnd || existing.quietEnd || "08:00").slice(0, 5),
    defaultProject: String(input.defaultProject || existing.defaultProject || "Inbox").trim() || "Inbox",
    defaultPriority,
    defaultReminderTime,
    smartProjectEnabled: input.smartProjectEnabled ?? existing.smartProjectEnabled ?? true,
    sent: input.sent && typeof input.sent === "object" ? input.sent : existing.sent || {},
    updatedAt: new Date().toISOString()
  };
}

async function getReminderSettingsForUser(user) {
  const allSettings = await readJsonFile(reminderSettingsFile, []);
  const existing = allSettings.find((item) => item.lineUserId === user.lineUserId);
  return normalizeReminderSettings({ lineUserId: user.lineUserId }, existing);
}

async function saveReminderSettingsForUser(user, input) {
  const allSettings = await readJsonFile(reminderSettingsFile, []);
  const existing = allSettings.find((item) => item.lineUserId === user.lineUserId);
  const settings = normalizeReminderSettings({ ...input, lineUserId: user.lineUserId }, existing);
  const nextSettings = existing
    ? allSettings.map((item) => (item.lineUserId === user.lineUserId ? settings : item))
    : [settings, ...allSettings];
  await writeJsonFile(reminderSettingsFile, nextSettings);
  return settings;
}

function loadEnvFile() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...valueParts] = trimmed.split("=");
    if (!process.env[key]) {
      process.env[key] = valueParts.join("=").replace(/^["']|["']$/g, "");
    }
  }
}

function getLineConfig() {
  return {
    liffId: process.env.LINE_LIFF_ID || "",
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || "",
    channelSecret: process.env.LINE_CHANNEL_SECRET || "",
    targetId: process.env.LINE_TARGET_ID || ""
  };
}

function getLineClientId() {
  const { liffId } = getLineConfig();
  return String(process.env.LINE_LOGIN_CHANNEL_ID || liffId.split("-")[0] || "");
}

function isLocalHttpRequest(request) {
  const requestHost = String(request.headers.host || "");
  return requestHost.startsWith("localhost") || requestHost.startsWith("127.0.0.1");
}

async function verifyLineIdToken(idToken) {
  const clientId = getLineClientId();
  if (!idToken || !clientId) return null;
  const body = new URLSearchParams({
    id_token: idToken,
    client_id: clientId
  });
  const result = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  if (!result.ok) return null;
  return result.json();
}

async function getVerifiedLineProfileFromRequest(request) {
  if (isLocalHttpRequest(request)) return null;
  const idToken = request.headers["x-line-id-token"] || "";
  const verified = await verifyLineIdToken(idToken);
  if (!verified?.sub) return null;
  return verified;
}

function verifyLineSignature(rawBody, signature) {
  const { channelSecret } = getLineConfig();
  if (!channelSecret || !signature) return false;
  const digest = crypto.createHmac("sha256", channelSecret).update(rawBody).digest("base64");
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

async function callLineApi(pathname, payload) {
  const { channelAccessToken } = getLineConfig();
  if (!channelAccessToken) {
    throw new Error("LINE_CHANNEL_ACCESS_TOKEN is missing");
  }
  const response = await fetch(`https://api.line.me/v2/bot/message/${pathname}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${channelAccessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`LINE API error ${response.status}: ${detail}`);
  }
}

function buildTaskSummary(tasks) {
  const openTasks = tasks.filter((task) => task.status !== "done");
  const dueSoon = openTasks
    .slice()
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 5)
    .map((task, index) => `${index + 1}. ${task.title} - ${task.assignee} (${formatTaskDueAt(task)})`)
    .join("\n");
  return `สรุปงาน LineTask\nงานค้าง: ${openTasks.length}\nเสร็จแล้ว: ${
    tasks.length - openTasks.length
  }\n\nงานที่ควรดู:\n${dueSoon || "ไม่มีงานค้าง"}`;
}

function formatTaskLine(task, index) {
  return `${index + 1}. ${task.title} - ${task.assignee} (${formatTaskDueAt(task)}) [${task.status}]`;
}

function formatTaskDueAt(task) {
  return task.dueTime ? `${task.dueDate} ${task.dueTime}` : task.dueDate;
}

function formatTaskDetail(task) {
  return [
    `รายละเอียดงาน`,
    `ชื่อ: ${task.title}`,
    `สถานะ: ${task.status}`,
    `ผู้รับผิดชอบ: ${task.assignee}`,
    `ครบกำหนด: ${formatTaskDueAt(task)}`,
    `โปรเจกต์: ${task.project}`,
    `รายละเอียด: ${task.description || "-"}`
  ].join("\n");
}

function buildChangeSummary(beforeTask, afterTask) {
  if (!beforeTask || !afterTask) return "";
  const changes = [];
  if (beforeTask.title !== afterTask.title) changes.push(`เปลี่ยนชื่องาน: ${beforeTask.title} → ${afterTask.title}`);
  if (beforeTask.dueDate !== afterTask.dueDate) changes.push(`เลื่อนกำหนด: ${beforeTask.dueDate} → ${afterTask.dueDate}`);
  if ((beforeTask.dueTime || "") !== (afterTask.dueTime || "")) changes.push(`เปลี่ยนเวลา: ${beforeTask.dueTime || "ไม่ระบุ"} → ${afterTask.dueTime || "ไม่ระบุ"}`);
  if (beforeTask.status !== afterTask.status) changes.push(`เปลี่ยนสถานะ: ${beforeTask.status} → ${afterTask.status}`);
  if (beforeTask.assignee !== afterTask.assignee) changes.push(`เปลี่ยนผู้รับผิดชอบ: ${beforeTask.assignee} → ${afterTask.assignee}`);
  if (beforeTask.priority !== afterTask.priority) changes.push(`เปลี่ยน priority: ${beforeTask.priority} → ${afterTask.priority}`);
  if (beforeTask.description !== afterTask.description) changes.push("แก้ไขรายละเอียดงาน");
  return changes.slice(0, 4).join("\n");
}

function createActivityEntry(text, user = null, meta = {}) {
  return {
    id: `activity-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text: String(text || "อัปเดตงาน"),
    time: "ตอนนี้",
    createdAt: new Date().toISOString(),
    actorName: user?.displayName || "",
    actorUserId: user?.id || "",
    ...meta
  };
}

function buildActivityText(beforeTask, afterTask, fallbackText = "อัปเดตงาน") {
  const summary = buildChangeSummary(beforeTask, afterTask);
  return summary || fallbackText;
}

function buildTaskList(title, tasks) {
  if (!tasks.length) return `${title}\nไม่มีงานในรายการนี้`;
  return `${title}\n${tasks.slice(0, 10).map(formatTaskLine).join("\n")}`;
}

function todayDate() {
  return toDateString(new Date());
}

function toDateString(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toDateString(date);
}

function addWeeks(weeks) {
  return addDays(weeks * 7);
}

function normalizeYear(year) {
  const numericYear = Number(year);
  if (!numericYear) return new Date().getFullYear();
  if (numericYear < 100) return numericYear >= 50 ? 1957 + numericYear : 2000 + numericYear;
  return numericYear > 2400 ? numericYear - 543 : numericYear;
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function buildDate(year, monthIndex, day) {
  const clampedDay = Math.min(Number(day), daysInMonth(year, monthIndex));
  return toDateString(new Date(year, monthIndex, clampedDay));
}

const thaiMonthMap = {
  "ม.ค.": 0,
  "มกราคม": 0,
  "มกรา": 0,
  "ก.พ.": 1,
  "กุมภาพันธ์": 1,
  "กุมภา": 1,
  "มี.ค.": 2,
  "มีนาคม": 2,
  "มีนา": 2,
  "เม.ย.": 3,
  "เมษายน": 3,
  "เมษา": 3,
  "พ.ค.": 4,
  "พฤษภาคม": 4,
  "พฤษภา": 4,
  "มิ.ย.": 5,
  "มิถุนายน": 5,
  "มิถุนา": 5,
  "ก.ค.": 6,
  "กรกฎาคม": 6,
  "กรกฎา": 6,
  "ส.ค.": 7,
  "สิงหาคม": 7,
  "สิงหา": 7,
  "ก.ย.": 8,
  "กันยายน": 8,
  "กันยา": 8,
  "กันยน": 8,
  "ต.ค.": 9,
  "ตุลาคม": 9,
  "ตุลา": 9,
  "พ.ย.": 10,
  "พฤศจิกายน": 10,
  "พฤศจิกา": 10,
  "ธ.ค.": 11,
  "ธันวาคม": 11,
  "ธันวา": 11
};

function parseThaiMonth(value) {
  return thaiMonthMap[value.replace(/\s+/g, "")];
}

function stripDateWords(text) {
  return text
    .replace(/(^|\s)ให้(?=\s|$)/g, " ")
    .replace(/(^|\s)ภายใน(?=\s|$)/g, " ")
    .replace(/(^|\s)กำหนด(?=\s|$)/g, " ")
    .replace(/(^|\s)วันที่(?=\s|$)/g, " ")
    .replace(/(^|\s)เดือน(?=\s|$)/g, " ")
    .replace(/(^|\s)เวลา(?=\s|$)/g, " ")
    .replace(/(^|\s)ตอน(?=\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDueTimeFromText(text) {
  let cleanedText = text.trim();
  const patterns = [
    {
      regex: /(?:ตอน)?บ่าย\s*(\d{1,2})(?:[.:](\d{1,2}))?(?:\s*(?:น\.?|โมง))?/,
      hourOffset: 12
    },
    {
      regex: /(?:ตอน)?เย็น\s*(\d{1,2})(?:[.:](\d{1,2}))?(?:\s*(?:น\.?|โมง))?/,
      hourOffset: 12
    },
    {
      regex: /(?:ตอน)?ค่ำ\s*(\d{1,2})(?:[.:](\d{1,2}))?(?:\s*(?:น\.?|โมง))?/,
      hourOffset: 12
    },
    {
      regex: /(?:ตอน)?เช้า\s*(\d{1,2})(?:[.:](\d{1,2}))?(?:\s*(?:น\.?|โมง))?/,
      hourOffset: 0
    },
    {
      regex: /(\d{1,2})(?:[.:](\d{1,2}))?\s*(?:โมง)?\s*เช้า/,
      hourOffset: 0
    },
    {
      regex: /(\d{1,2})(?:[.:](\d{1,2}))?\s*(?:โมง)?\s*(?:บ่าย|เย็น|ค่ำ)/,
      hourOffset: 12
    },
    {
      regex: /(?:เวลา\s*)?(\d{1,2})[:.](\d{2})\s*(?:น\.?)?/,
      hourOffset: null
    },
    {
      regex: /(?:เวลา\s*)?(\d{1,2})\s*(?:น\.|โมง)/,
      hourOffset: null
    }
  ];

  if (/เที่ยงครึ่ง/.test(cleanedText)) {
    return { dueTime: "12:30", cleanedText: stripDateWords(cleanedText.replace(/เที่ยงครึ่ง/, "")) };
  }
  if (/เที่ยง/.test(cleanedText)) {
    return { dueTime: "12:00", cleanedText: stripDateWords(cleanedText.replace(/เที่ยง/, "")) };
  }

  for (const item of patterns) {
    const match = cleanedText.match(item.regex);
    if (!match) continue;
    let hour = Number(match[1]);
    const minute = Number(match[2] || 0);
    if (item.hourOffset === 12 && hour < 12) hour += 12;
    const dueTime = normalizeDueTime(`${hour}:${String(minute).padStart(2, "0")}`);
    if (!dueTime) continue;
    cleanedText = stripDateWords(cleanedText.replace(match[0], ""));
    return { dueTime, cleanedText };
  }

  return { dueTime: "", cleanedText };
}

function parseDueDateFromText(text) {
  const parsedTime = parseDueTimeFromText(text);
  let cleanedText = parsedTime.cleanedText;
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const result = (dueDate, nextText) => ({
    dueDate,
    dueTime: parsedTime.dueTime,
    cleanedText: stripDateWords(nextText)
  });

  const relativePatterns = [
    { pattern: /วันนี้/g, dueDate: todayDate() },
    { pattern: /พรุ่งนี้/g, dueDate: addDays(1) },
    { pattern: /มะรืน/g, dueDate: addDays(2) },
    { pattern: /tomorrow/ig, dueDate: addDays(1) },
    { pattern: /today/ig, dueDate: todayDate() }
  ];
  for (const item of relativePatterns) {
    if (item.pattern.test(cleanedText)) {
      return result(item.dueDate, cleanedText.replace(item.pattern, ""));
    }
  }

  const inDaysMatch = cleanedText.match(/อีก\s*(\d+)\s*วัน/);
  if (inDaysMatch) {
    return result(addDays(Number(inDaysMatch[1])), cleanedText.replace(inDaysMatch[0], ""));
  }

  const inWeeksMatch = cleanedText.match(/อีก\s*(\d+)\s*สัปดาห์/);
  if (inWeeksMatch) {
    return result(addWeeks(Number(inWeeksMatch[1])), cleanedText.replace(inWeeksMatch[0], ""));
  }

  if (cleanedText.includes("สิ้นเดือนหน้า")) {
    const nextMonth = currentMonth + 1;
    const year = currentYear + Math.floor(nextMonth / 12);
    const monthIndex = nextMonth % 12;
    return result(buildDate(year, monthIndex, daysInMonth(year, monthIndex)), cleanedText.replace("สิ้นเดือนหน้า", ""));
  }

  if (cleanedText.includes("ต้นเดือนหน้า")) {
    const nextMonth = currentMonth + 1;
    const year = currentYear + Math.floor(nextMonth / 12);
    const monthIndex = nextMonth % 12;
    return result(buildDate(year, monthIndex, 1), cleanedText.replace("ต้นเดือนหน้า", ""));
  }

  if (cleanedText.includes("สิ้นเดือน")) {
    return result(buildDate(currentYear, currentMonth, daysInMonth(currentYear, currentMonth)), cleanedText.replace("สิ้นเดือน", ""));
  }

  const dayNextMonthMatch = cleanedText.match(/(?:วันที่\s*)?(\d{1,2})\s*เดือนหน้า/);
  if (dayNextMonthMatch) {
    const nextMonth = currentMonth + 1;
    const year = currentYear + Math.floor(nextMonth / 12);
    const monthIndex = nextMonth % 12;
    return result(buildDate(year, monthIndex, dayNextMonthMatch[1]), cleanedText.replace(dayNextMonthMatch[0], ""));
  }

  const monthNames = Object.keys(thaiMonthMap).sort((a, b) => b.length - a.length).map((item) => item.replace(".", "\\."));
  const thaiDateRegex = new RegExp(`(?:วันที่\\s*)?(\\d{1,2})\\s*(${monthNames.join("|")})(?:\\s*(\\d{4}))?`);
  const thaiDateMatch = cleanedText.match(thaiDateRegex);
  if (thaiDateMatch) {
    const monthIndex = parseThaiMonth(thaiDateMatch[2]);
    const year = normalizeYear(thaiDateMatch[3] || currentYear);
    return result(buildDate(year, monthIndex, thaiDateMatch[1]), cleanedText.replace(thaiDateMatch[0], ""));
  }

  const numericDateMatch = cleanedText.match(/(?:วันที่\s*)?(\d{1,2})\s*(?:เดือน\s*)?(\d{1,2})(?:\s*(?:ปี|พ\.ศ\.|ค\.ศ\.)?\s*(\d{2,4}))?(?!\s*(?:น\.|โมง))/);
  if (numericDateMatch) {
    const day = Number(numericDateMatch[1]);
    const monthIndex = Number(numericDateMatch[2]) - 1;
    if (day >= 1 && day <= 31 && monthIndex >= 0 && monthIndex <= 11) {
      let year = normalizeYear(numericDateMatch[3] || currentYear);
      const today = new Date(currentYear, currentMonth, now.getDate());
      const candidate = new Date(year, monthIndex, Math.min(day, daysInMonth(year, monthIndex)));
      if (!numericDateMatch[3] && candidate < today) year += 1;
      return result(buildDate(year, monthIndex, day), cleanedText.replace(numericDateMatch[0], ""));
    }
  }

  const slashDateMatch = cleanedText.match(/(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/);
  if (slashDateMatch) {
    const day = Number(slashDateMatch[1]);
    const monthIndex = Number(slashDateMatch[2]) - 1;
    if (day >= 1 && day <= 31 && monthIndex >= 0 && monthIndex <= 11) {
      let year = normalizeYear(slashDateMatch[3] || currentYear);
      const today = new Date(currentYear, currentMonth, now.getDate());
      const candidate = new Date(year, monthIndex, Math.min(day, daysInMonth(year, monthIndex)));
      if (!slashDateMatch[3] && candidate < today) year += 1;
      return result(buildDate(year, monthIndex, day), cleanedText.replace(slashDateMatch[0], ""));
    }
  }

  const dayOnlyMatch = cleanedText.match(/(?:วันที่\s*)(\d{1,2})(?![-/])/);
  if (dayOnlyMatch) {
    const day = Number(dayOnlyMatch[1]);
    let year = currentYear;
    let monthIndex = currentMonth;
    if (day < now.getDate()) {
      const nextMonth = currentMonth + 1;
      year = currentYear + Math.floor(nextMonth / 12);
      monthIndex = nextMonth % 12;
    }
    return result(buildDate(year, monthIndex, day), cleanedText.replace(dayOnlyMatch[0], ""));
  }

  const dateMatch = cleanedText.match(/(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) {
    return result(dateMatch[1], cleanedText.replace(dateMatch[1], ""));
  }

  if (/ภายใน\s*(อาทิตย์|สัปดาห์)นี้|อาทิตย์นี้|สัปดาห์นี้/.test(cleanedText)) {
    const endOfWeek = new Date();
    const day = endOfWeek.getDay();
    const daysUntilSunday = (7 - day) % 7;
    endOfWeek.setDate(endOfWeek.getDate() + daysUntilSunday);
    return result(toDateString(endOfWeek), cleanedText.replace(/ภายใน\s*(อาทิตย์|สัปดาห์)นี้|อาทิตย์นี้|สัปดาห์นี้/g, ""));
  }

  return result(addDays(1), cleanedText);
}

function findTaskByQuery(tasks, query) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return null;
  return tasks.find((task) => task.title.toLowerCase().includes(normalized));
}

function shouldCreateNaturalTask(text) {
  const normalized = text.trim();
  if (!normalized || normalized.length < 3) return false;
  const blocked = ["สวัสดี", "hello", "hi", "ขอบคุณ", "โอเค", "ok", "ครับ", "ค่ะ"];
  if (blocked.includes(normalized.toLowerCase())) return false;
  return true;
}

function parseAssigneePhrase(text) {
  const match = text.match(/\s+ให้\s+(.+)$/);
  if (!match) return { cleanedText: text.trim(), assigneeQuery: "" };
  return {
    cleanedText: text.replace(match[0], "").trim(),
    assigneeQuery: match[1].trim()
  };
}

async function findAssigneeByText(query) {
  if (!query) return null;
  const normalized = query.replace(/^คุณ/, "").trim().toLowerCase();
  const users = await readJsonFile(usersFile, []);
  return users.find((user) => {
    const displayName = String(user.displayName || "").replace(/^คุณ/, "").trim().toLowerCase();
    const lineUserId = String(user.lineUserId || "").toLowerCase();
    return displayName.includes(normalized) || lineUserId === normalized;
  });
}

function getTaskDefaultProject(settings) {
  return String(settings?.defaultProject || "Inbox").trim() || "Inbox";
}

function inferProjectFromText(text, settings, tasks) {
  const defaultProject = getTaskDefaultProject(settings);
  if (settings?.smartProjectEnabled === false) return defaultProject;

  const normalizedText = String(text || "").toLowerCase();
  const projectNames = Array.from(
    new Set([defaultProject, "Inbox", ...tasks.map((task) => task.project).filter(Boolean)])
  )
    .map((project) => String(project).trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  const directMatch = projectNames.find((project) => {
    const normalizedProject = project.toLowerCase();
    return normalizedProject.length >= 3 && normalizedText.includes(normalizedProject);
  });
  if (directMatch) return directMatch;

  const keywordRules = [
    { pattern: /line|ไลน์|liff|notification|แจ้งเตือน/i, keywords: ["line", "ไลน์", "liff"] },
    { pattern: /โฆษณา|แคมเปญ|ads|marketing|facebook/i, keywords: ["โฆษณา", "แคมเปญ", "marketing", "ads"] }
  ];
  const keywordRule = keywordRules.find((rule) => rule.pattern.test(text || ""));
  if (keywordRule) {
    const keywordProject = projectNames.find((project) => {
      const normalizedProject = project.toLowerCase();
      return keywordRule.keywords.some((keyword) => normalizedProject.includes(keyword.toLowerCase()));
    });
    if (keywordProject) return keywordProject;
  }

  return defaultProject;
}

function inferPriorityFromText(text, settings) {
  const normalizedText = String(text || "").toLowerCase();
  if (/ด่วนมาก|เร่งด่วนมาก|asap|critical|ทันที/.test(normalizedText)) return "high";
  if (/ด่วน|สำคัญ|urgent|important/.test(normalizedText)) return "high";
  if (/ไม่ด่วน|ไม่เร่ง|low/.test(normalizedText)) return "low";
  return settings?.defaultPriority || "medium";
}

function applyDefaultDueTime(parsed, settings) {
  return parsed?.dueTime || settings?.defaultReminderTime || settings?.reminderTime || "09:00";
}

async function createTaskFromLineText(text, event, tasks) {
  const currentUser = await getLineUserFromEvent(event);
  const settings = await getReminderSettingsForUser(currentUser);
  const assigneePhrase = parseAssigneePhrase(text);
  const assigneeUser = await findAssigneeByText(assigneePhrase.assigneeQuery);
  const parsed = parseDueDateFromText(assigneePhrase.cleanedText);
  const title = parsed.cleanedText || text.trim();
  const project = inferProjectFromText(assigneePhrase.cleanedText, settings, tasks);
  const task = normalizeTask(
    {
      id: `task-${Date.now()}`,
      title,
      description: "สร้างจากข้อความ LINE",
      project,
      status: "todo",
      priority: inferPriorityFromText(text, settings),
      assignee: assigneeUser?.displayName || currentUser.displayName || getRequesterName(event),
      assigneeUserId: assigneeUser?.id || currentUser.id,
      createdByUserId: currentUser.id,
      createdByLineUserId: currentUser.lineUserId,
      dueDate: parsed.dueDate,
      dueTime: applyDefaultDueTime(parsed, settings),
      tags: ["LINE"],
      activity: [{ id: `activity-${Date.now()}`, text: "สร้างจากข้อความ LINE แบบอัตโนมัติ", time: "ตอนนี้" }]
    },
    null
  );
  await writeTasks([task, ...tasks]);
  return task;
}

function getRequesterName(event) {
  return event.source?.userId || "LINE user";
}

function normalizeUserProfile(input, existingUser) {
  return {
    ...existingUser,
    displayName: String(input.displayName || existingUser.displayName || "User").trim(),
    pictureUrl: String(input.pictureUrl || existingUser.pictureUrl || "").trim(),
    avatarUrl: String(input.avatarUrl || input.pictureUrl || existingUser.avatarUrl || existingUser.pictureUrl || "").trim(),
    department: String(input.department || existingUser.department || "").trim(),
    position: String(input.position || existingUser.position || "").trim(),
    phone: String(input.phone || existingUser.phone || "").trim(),
    bio: String(input.bio || existingUser.bio || "").trim(),
    updatedAt: new Date().toISOString()
  };
}

function calculateUserKpi(user, tasks) {
  const today = todayDate();
  const keys = [user.lineUserId, user.displayName, user.id].filter(Boolean).map((item) => String(item).toLowerCase());
  const assignedTasks = tasks.filter(
    (task) => task.assigneeUserId === user.id || keys.includes(String(task.assignee || "").toLowerCase())
  );
  const total = assignedTasks.length;
  const done = assignedTasks.filter((task) => task.status === "done").length;
  const active = assignedTasks.filter((task) => task.status !== "done").length;
  const overdue = assignedTasks.filter((task) => task.status !== "done" && task.dueDate < today).length;
  const dueSoon = assignedTasks.filter((task) => task.status !== "done" && task.dueDate >= today).slice(0, 5);
  return {
    total,
    done,
    active,
    overdue,
    completionRate: total ? Math.round((done / total) * 100) : 0,
    dueSoon
  };
}

function getLineTargetId(source) {
  if (!source) return "";
  if (source.type === "group") return source.groupId || "";
  if (source.type === "room") return source.roomId || "";
  return source.userId || "";
}

async function rememberLineTarget(source) {
  const targetId = getLineTargetId(source);
  if (!targetId || targetId.startsWith("dev-")) return;
  const targets = await readJsonFile(lineTargetsFile, []);
  const target = {
    targetId,
    type: source.type || "user",
    updatedAt: new Date().toISOString()
  };
  const nextTargets = targets.some((item) => item.targetId === targetId)
    ? targets.map((item) => (item.targetId === targetId ? target : item))
    : [target, ...targets];
  await writeJsonFile(lineTargetsFile, nextTargets);
}

async function getDefaultLineTarget() {
  const configuredTarget = getLineConfig().targetId;
  if (configuredTarget) return configuredTarget;
  const targets = await readJsonFile(lineTargetsFile, []);
  return targets[0]?.targetId || "";
}

async function replyLine(replyToken, text) {
  if (replyToken.startsWith("dev-")) {
    console.log(text);
    return;
  }
  await callLineApi("reply", {
    replyToken,
    messages: [{ type: "text", text }]
  });
}

async function replyLineMessages(replyToken, messages) {
  if (replyToken.startsWith("dev-")) {
    console.log(JSON.stringify(messages, null, 2));
    return;
  }
  try {
    await callLineApi("reply", {
      replyToken,
      messages
    });
  } catch (error) {
    console.error(error);
    const fallback = messages.map((message) => message.altText || "มีการอัปเดตงาน").join("\n");
    await replyLine(replyToken, fallback);
  }
}

function getPublicBaseUrl() {
  return (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
}

function getAppUrl(pathname = "/line.html") {
  const { liffId } = getLineConfig();
  const queryIndex = pathname.indexOf("?");
  const query = queryIndex >= 0 ? pathname.slice(queryIndex) : "";
  if (liffId) return `https://miniapp.line.me/${liffId}${query}`;
  const baseUrl = getPublicBaseUrl();
  return baseUrl ? `${baseUrl}${pathname}` : pathname;
}

function buildTaskFlex(task, heading = "จดสำเร็จ", changeSummary = "") {
  const appUrl = getAppUrl(`/line.html?task=${encodeURIComponent(task.id)}`);
  const rescheduleUrl = getAppUrl(`/line.html?task=${encodeURIComponent(task.id)}&action=reschedule`);
  const openAppUrl = getAppUrl("/line.html");
  return {
    type: "flex",
    altText: `${heading}: ${task.title}`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#FFF1E7",
        contents: [
          {
            type: "text",
            text: `${heading} ✅`,
            weight: "bold",
            size: "xl",
            color: "#221827"
          },
          {
            type: "text",
            text: "ตรวจสอบรายละเอียดงานด้านล่าง",
            margin: "sm",
            size: "sm",
            color: "#726477"
          }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          {
            type: "box",
            layout: "horizontal",
            spacing: "md",
            contents: [
              {
                type: "text",
                text: task.status === "done" ? "เสร็จแล้ว" : "งาน",
                flex: 0,
                size: "xs",
                color: task.status === "done" ? "#06C755" : "#F97316",
                weight: "bold",
                align: "center"
              },
              {
                type: "text",
                text: task.project || "LINE",
                size: "md",
                color: "#5F5662",
                margin: "md",
                weight: "bold"
              }
            ]
          },
          {
            type: "text",
            text: task.title,
            weight: "bold",
            size: "xl",
            wrap: true,
            color: "#221827"
          },
          {
            type: "separator",
            margin: "md"
          },
          {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            contents: [
              flexInfoRow("ผู้รับผิดชอบ", task.assignee || "-"),
              flexInfoRow("ครบกำหนด", formatTaskDueAt(task) || "-"),
              flexInfoRow("Priority", task.priority || "-"),
              flexInfoRow("สถานะ", task.status || "-")
            ]
          },
          {
            type: "text",
            text: task.description || "ไม่มีรายละเอียด",
            wrap: true,
            size: "sm",
            color: "#726477",
            margin: "md"
          },
          ...(changeSummary
            ? [
                {
                  type: "box",
                  layout: "vertical",
                  backgroundColor: "#FFF1E7",
                  cornerRadius: "md",
                  paddingAll: "12px",
                  margin: "md",
                  contents: [
                    {
                      type: "text",
                      text: "สิ่งที่เปลี่ยน",
                      size: "xs",
                      color: "#F97316",
                      weight: "bold"
                    },
                    {
                      type: "text",
                      text: changeSummary,
                      wrap: true,
                      size: "sm",
                      color: "#221827",
                      margin: "sm"
                    }
                  ]
                }
              ]
            : [])
        ]
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#F97316",
            action: {
              type: "uri",
              label: "แก้ไข",
              uri: appUrl
            }
          }
,
          {
            type: "box",
            layout: "horizontal",
            spacing: "sm",
            contents: [
              {
                type: "button",
                style: "secondary",
                action: {
                  type: "message",
                  label: "กำลังทำ",
                  text: `กำลังทำ ${task.title}`
                }
              },
              {
                type: "button",
                style: "secondary",
                action: {
                  type: "uri",
                  label: "เลื่อนกำหนด",
                  uri: rescheduleUrl
                }
              }
            ]
          },
          {
            type: "box",
            layout: "horizontal",
            spacing: "sm",
            contents: [
              {
                type: "button",
                style: "secondary",
                action: {
                  type: "message",
                  label: "เสร็จ",
                  text: `เสร็จ ${task.title}`
                }
              },
              {
                type: "button",
                style: "secondary",
                action: {
                  type: "uri",
                  label: "เปิดแอป",
                  uri: openAppUrl
                }
              }
            ]
          }
        ]
      }
    }
  };
}

function flexInfoRow(label, value) {
  return {
    type: "box",
    layout: "horizontal",
    contents: [
      {
        type: "text",
        text: label,
        size: "sm",
        color: "#726477",
        flex: 3
      },
      {
        type: "text",
        text: String(value),
        size: "sm",
        color: "#221827",
        wrap: true,
        flex: 5
      }
    ]
  };
}

function buildTaskFlex(task, heading = "จดสำเร็จ", changeSummary = "") {
  const appUrl = getAppUrl(`/line.html?task=${encodeURIComponent(task.id)}`);
  const rescheduleUrl = getAppUrl(`/line.html?task=${encodeURIComponent(task.id)}&action=reschedule`);
  const openAppUrl = getAppUrl("/line.html");
  const status = getFlexStatus(task.status);
  const priority = getFlexPriority(task.priority);
  const progress = getFlexProgress(task);
  const dueText = formatTaskDueAt(task) || "ยังไม่ตั้งกำหนด";
  const projectName = task.project || "LINE";

  return {
    type: "flex",
    altText: `${heading}: ${task.title}`,
    contents: {
      type: "bubble",
      size: "mega",
      styles: {
        header: { backgroundColor: "#FFF4E8" },
        body: { backgroundColor: "#FFFFFF" },
        footer: { backgroundColor: "#FFFFFF" }
      },
      header: {
        type: "box",
        layout: "vertical",
        paddingAll: "18px",
        contents: [
          {
            type: "box",
            layout: "horizontal",
            spacing: "md",
            alignItems: "center",
            contents: [
              {
                type: "box",
                layout: "vertical",
                width: "42px",
                height: "42px",
                cornerRadius: "14px",
                backgroundColor: "#FF7A00",
                justifyContent: "center",
                alignItems: "center",
                contents: [
                  {
                    type: "text",
                    text: status.icon,
                    size: "xl",
                    align: "center"
                  }
                ]
              },
              {
                type: "box",
                layout: "vertical",
                flex: 1,
                contents: [
                  {
                    type: "text",
                    text: `${heading} ${status.icon}`,
                    weight: "bold",
                    size: "xl",
                    color: "#1F1A17",
                    wrap: true
                  },
                  {
                    type: "text",
                    text: "ตรวจสอบรายละเอียดและเลือกทำต่อด้านล่าง",
                    margin: "xs",
                    size: "xs",
                    color: "#7A6A5E",
                    wrap: true
                  }
                ]
              }
            ]
          }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        paddingAll: "18px",
        contents: [
          {
            type: "box",
            layout: "horizontal",
            spacing: "sm",
            contents: [
              flexPill(projectName, "#FFF1DE", "#F97316"),
              flexPill(status.label, status.bg, status.color),
              flexPill(priority.label, priority.bg, priority.color)
            ]
          },
          {
            type: "text",
            text: task.title || "Untitled task",
            weight: "bold",
            size: "xl",
            color: "#15110D",
            wrap: true
          },
          {
            type: "box",
            layout: "vertical",
            backgroundColor: "#FFF8EF",
            cornerRadius: "16px",
            paddingAll: "14px",
            spacing: "sm",
            contents: [
              flexIconInfoRow("📅", "ครบกำหนด", dueText),
              flexIconInfoRow("👤", "ผู้รับผิดชอบ", task.assignee || "ฉัน"),
              flexIconInfoRow("📌", "สถานะ", `${status.label} · ${priority.label}`)
            ]
          },
          {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            contents: [
              {
                type: "box",
                layout: "horizontal",
                contents: [
                  {
                    type: "text",
                    text: "ความคืบหน้า",
                    size: "xs",
                    color: "#7A6A5E",
                    weight: "bold",
                    flex: 1
                  },
                  {
                    type: "text",
                    text: `${progress}%`,
                    size: "xs",
                    color: "#F97316",
                    weight: "bold",
                    align: "end"
                  }
                ]
              },
              {
                type: "box",
                layout: "vertical",
                height: "8px",
                backgroundColor: "#F1E6DA",
                cornerRadius: "999px",
                contents: [
                  {
                    type: "box",
                    layout: "vertical",
                    height: "8px",
                    width: `${progress}%`,
                    backgroundColor: "#FF7A00",
                    cornerRadius: "999px",
                    contents: []
                  }
                ]
              }
            ]
          },
          {
            type: "text",
            text: task.description || "สร้างจากข้อความ LINE เปิดแอปเพื่อเติมรายละเอียดเพิ่มเติมได้",
            wrap: true,
            size: "sm",
            color: "#65584E",
            margin: "sm"
          },
          ...(changeSummary
            ? [
                {
                  type: "box",
                  layout: "vertical",
                  backgroundColor: "#ECFFE9",
                  cornerRadius: "14px",
                  paddingAll: "12px",
                  spacing: "xs",
                  contents: [
                    {
                      type: "text",
                      text: "อัปเดตล่าสุด",
                      size: "xs",
                      color: "#0E8A36",
                      weight: "bold"
                    },
                    {
                      type: "text",
                      text: changeSummary,
                      wrap: true,
                      size: "sm",
                      color: "#1F1A17"
                    }
                  ]
                }
              ]
            : [])
        ]
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "14px",
        contents: [
          {
            type: "button",
            style: "primary",
            height: "sm",
            color: "#FF7A00",
            action: {
              type: "uri",
              label: "แก้ไขรายละเอียด",
              uri: appUrl
            }
          },
          {
            type: "box",
            layout: "horizontal",
            spacing: "sm",
            contents: [
              flexMessageButton("กำลังทำ", `กำลังทำ ${task.title}`),
              flexUriButton("เลื่อนกำหนด", rescheduleUrl)
            ]
          },
          {
            type: "box",
            layout: "horizontal",
            spacing: "sm",
            contents: [
              flexMessageButton("เสร็จ", `เสร็จ ${task.title}`),
              flexUriButton("เปิดแอป", openAppUrl)
            ]
          }
        ]
      }
    }
  };
}

function getFlexStatus(status) {
  const meta = {
    todo: { label: "รอทำ", icon: "📝", color: "#805000", bg: "#FFF2CC" },
    progress: { label: "กำลังทำ", icon: "🔥", color: "#C44D00", bg: "#FFE1C2" },
    review: { label: "รอตรวจ", icon: "🔎", color: "#3156A8", bg: "#E7EEFF" },
    done: { label: "เสร็จแล้ว", icon: "✅", color: "#0B8F3A", bg: "#E8FBEA" }
  };
  return meta[status] || meta.todo;
}

function getFlexPriority(priority) {
  const meta = {
    high: { label: "ด่วน", color: "#C62828", bg: "#FFE1E1" },
    medium: { label: "ปกติ", color: "#A35A00", bg: "#FFF2CC" },
    low: { label: "ไม่ด่วน", color: "#557060", bg: "#EDF7EE" }
  };
  return meta[priority] || meta.medium;
}

function getFlexProgress(task) {
  if (task.status === "done") return 100;
  if (task.status === "review") return 75;
  if (task.status === "progress") return 55;
  return task.priority === "high" ? 30 : 20;
}

function flexPill(text, backgroundColor, color) {
  return {
    type: "box",
    layout: "vertical",
    flex: 0,
    backgroundColor,
    cornerRadius: "999px",
    paddingTop: "5px",
    paddingBottom: "5px",
    paddingStart: "10px",
    paddingEnd: "10px",
    contents: [
      {
        type: "text",
        text: String(text || "-").slice(0, 20),
        size: "xs",
        weight: "bold",
        color,
        align: "center"
      }
    ]
  };
}

function flexIconInfoRow(icon, label, value) {
  return {
    type: "box",
    layout: "horizontal",
    spacing: "sm",
    alignItems: "center",
    contents: [
      { type: "text", text: icon, size: "sm", flex: 0 },
      {
        type: "text",
        text: label,
        size: "xs",
        color: "#7A6A5E",
        flex: 3
      },
      {
        type: "text",
        text: String(value || "-"),
        size: "xs",
        color: "#1F1A17",
        weight: "bold",
        wrap: true,
        flex: 6
      }
    ]
  };
}

function flexMessageButton(label, text) {
  return {
    type: "button",
    style: "secondary",
    height: "sm",
    action: {
      type: "message",
      label,
      text
    }
  };
}

function flexUriButton(label, uri) {
  return {
    type: "button",
    style: "secondary",
    height: "sm",
    action: {
      type: "uri",
      label,
      uri
    }
  };
}

async function pushLine(to, text) {
  await callLineApi("push", {
    to,
    messages: [{ type: "text", text }]
  });
}

async function pushLineMessages(to, messages) {
  await callLineApi("push", {
    to,
    messages
  });
}

function buildReminderText(user, tasks, title = "แจ้งเตือนงานจาก BossBoard") {
  const openTasks = tasks.filter((task) => task.status !== "done");
  const lines = [
    title,
    `คุณมีงานที่ต้องติดตาม ${openTasks.length} งาน`
  ];
  openTasks.slice(0, 5).forEach((task, index) => {
    lines.push(`${index + 1}. ${task.title} (${formatTaskDueAt(task)})`);
  });
  const appUrl = getAppUrl("/line.html");
  lines.push("");
  lines.push(`เปิดแอป: ${appUrl}`);
  return lines.join("\n");
}

function getBangkokParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    dateKey: `${values.year}-${values.month}-${values.day}`,
    timeKey: `${values.hour}:${values.minute}`
  };
}

function getDateDiffInDays(dateA, dateB) {
  const start = new Date(`${dateA}T00:00:00+07:00`).getTime();
  const end = new Date(`${dateB}T00:00:00+07:00`).getTime();
  return Math.round((start - end) / 86400000);
}

function isWithinQuietHours(settings, timeKey) {
  if (!settings.quietHoursEnabled) return false;
  const current = timeKey.replace(":", "");
  const start = settings.quietStart.replace(":", "");
  const end = settings.quietEnd.replace(":", "");
  if (start < end) return current >= start && current < end;
  return current >= start || current < end;
}

function shouldSendReminder(settings, bucket, dateKey) {
  return settings.sent?.[bucket] !== dateKey;
}

async function markReminderSent(user, settings, bucket, dateKey) {
  await saveReminderSettingsForUser(user, {
    ...settings,
    sent: {
      ...(settings.sent || {}),
      [bucket]: dateKey
    }
  });
}

async function sendReminderToUser(user, tasks, title, bucket, dateKey) {
  if (!isPushableLineUserId(user.lineUserId) || !tasks.length) return;
  await pushLine(user.lineUserId, buildReminderText(user, tasks, title));
  const settings = await getReminderSettingsForUser(user);
  await markReminderSent(user, settings, bucket, dateKey);
}

let reminderTickRunning = false;

async function runReminderTick() {
  if (reminderTickRunning) return;
  reminderTickRunning = true;
  try {
    const { dateKey, timeKey } = getBangkokParts();
    const [users, tasks] = await Promise.all([readJsonFile(usersFile, []), readTasks()]);
    for (const user of users) {
      const settings = await getReminderSettingsForUser(user);
      if (!settings.enabled || isWithinQuietHours(settings, timeKey)) continue;
      const visibleTasks = await getVisibleTasksForUser(user, tasks);
      const openTasks = visibleTasks.filter((task) => task.status !== "done");
      if (settings.dailySummaryEnabled && settings.dailySummaryTime === timeKey && shouldSendReminder(settings, "dailySummary", dateKey)) {
        await sendReminderToUser(user, openTasks, "สรุปงานวันนี้จาก BossBoard", "dailySummary", dateKey);
        continue;
      }
      if (settings.dueSoonEnabled && settings.dueSoonTime === timeKey && shouldSendReminder(settings, "dueSoon", dateKey)) {
        const dueSoonTasks = openTasks.filter((task) => {
          const diff = getDateDiffInDays(task.dueDate, dateKey);
          return diff >= 0 && diff <= settings.dueSoonDays;
        });
        await sendReminderToUser(user, dueSoonTasks, `งานที่ใกล้ครบกำหนดใน ${settings.dueSoonDays} วัน`, "dueSoon", dateKey);
        continue;
      }
      if (settings.overdueEnabled && settings.reminderTime === timeKey && shouldSendReminder(settings, "overdue", dateKey)) {
        const overdueTasks = openTasks.filter((task) => getDateDiffInDays(task.dueDate, dateKey) < 0);
        await sendReminderToUser(user, overdueTasks, "งานเลยกำหนดที่ควรรีบดู", "overdue", dateKey);
      }
    }
  } catch (error) {
    console.error("Reminder tick failed", error);
  } finally {
    reminderTickRunning = false;
  }
}

async function getTaskLineTarget(task, preferredUser = null) {
  if (isPushableLineUserId(preferredUser?.lineUserId)) return preferredUser.lineUserId;
  if (isPushableLineUserId(task.createdByLineUserId)) return task.createdByLineUserId;
  if (task.assigneeUserId) {
    const users = await readJsonFile(usersFile, []);
    const assignee = users.find((user) => user.id === task.assigneeUserId);
    if (isPushableLineUserId(assignee?.lineUserId)) return assignee.lineUserId;
  }
  return "";
}

function isPushableLineUserId(value) {
  return /^U[a-f0-9]{32}$/i.test(String(value || ""));
}

async function notifyTaskUpdate(task, heading = "อัปเดตงานแล้ว", changeSummary = "", preferredUser = null) {
  const targetId = await getTaskLineTarget(task, preferredUser);
  if (!targetId) return;
  try {
    await pushLineMessages(targetId, [buildTaskFlex(task, heading, changeSummary)]);
  } catch (error) {
    console.error(error);
    try {
      await pushLine(targetId, `${heading}: ${task.title}\n${changeSummary ? `${changeSummary}\n` : ""}สถานะ: ${task.status}\nครบกำหนด: ${task.dueDate}`);
    } catch (fallbackError) {
      console.error(fallbackError);
    }
  }
}

async function saveLineProfile(profile) {
  const users = await readJsonFile(lineUsersFile, []);
  const user = {
    userId: String(profile.userId || ""),
    displayName: String(profile.displayName || ""),
    pictureUrl: String(profile.pictureUrl || ""),
    updatedAt: new Date().toISOString()
  };
  if (!user.userId) return user;
  const nextUsers = users.some((item) => item.userId === user.userId)
    ? users.map((item) => (item.userId === user.userId ? user : item))
    : [user, ...users];
  await writeJsonFile(lineUsersFile, nextUsers);
  await upsertAppUserFromLineProfile(profile);
  return user;
}

async function upsertAppUserFromLineProfile(profile) {
  const lineUserId = String(profile.userId || "");
  if (!lineUserId) return null;
  const users = await readJsonFile(usersFile, []);
  const existingUser = users.find((user) => user.lineUserId === lineUserId);
  const user = {
    ...(existingUser || {}),
    id: existingUser?.id || createId("user"),
    lineUserId,
    displayName: String(profile.displayName || existingUser?.displayName || "LINE user"),
    pictureUrl: String(profile.pictureUrl || existingUser?.pictureUrl || ""),
    email: existingUser?.email || "",
    createdAt: existingUser?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  const nextUsers = existingUser
    ? users.map((currentUser) => (currentUser.id === existingUser.id ? user : currentUser))
    : [user, ...users];
  await writeJsonFile(usersFile, nextUsers);
  return user;
}

async function getCurrentUser(request) {
  const url = new URL(request.url || "/", `http://${host}:${port}`);
  const isLocalRequest = isLocalHttpRequest(request);
  const verifiedProfile = await getVerifiedLineProfileFromRequest(request);
  if (!verifiedProfile && !isLocalRequest) return null;

  const requestedLineUserId = url.searchParams.get("lineUserId") || request.headers["x-line-user-id"];
  const lineUserId = verifiedProfile?.sub || requestedLineUserId || "dev-user";
  const users = await readJsonFile(usersFile, []);
  let user = users.find((item) => item.lineUserId === lineUserId);
  if (!user) {
    user = {
      id: createId("user"),
      lineUserId,
      displayName: verifiedProfile?.name || (lineUserId === "dev-user" ? "Dev User" : "LINE user"),
      pictureUrl: verifiedProfile?.picture || "",
      email: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await writeJsonFile(usersFile, [user, ...users]);
  } else if (verifiedProfile?.name || verifiedProfile?.picture) {
    const updatedUser = {
      ...user,
      displayName: verifiedProfile.name || user.displayName,
      pictureUrl: verifiedProfile.picture || user.pictureUrl,
      updatedAt: new Date().toISOString()
    };
    await writeJsonFile(usersFile, users.map((item) => (item.id === user.id ? updatedUser : item)));
    user = updatedUser;
  }
  return user;
}

async function getMembershipsForUser(userId) {
  const [organizations, members, users] = await Promise.all([
    readJsonFile(organizationsFile, []),
    readJsonFile(membersFile, []),
    readJsonFile(usersFile, [])
  ]);
  return members
    .filter((member) => member.userId === userId)
    .map((member) => ({
      ...member,
      organization: organizations.find((org) => org.id === member.organizationId),
      user: users.find((item) => item.id === member.userId)
    }));
}

function canManageMembers(members, userId, organizationId) {
  const membership = members.find((member) => member.userId === userId && member.organizationId === organizationId);
  return Boolean(membership && ["Admin", "Manager"].includes(membership.role));
}

function getUserIdentityKeys(user) {
  return [user?.id, user?.lineUserId, user?.displayName]
    .filter(Boolean)
    .map((item) => String(item).trim().toLowerCase());
}

async function getOrganizationIdsForUser(userId) {
  const members = await readJsonFile(membersFile, []);
  return members
    .filter((member) => member.userId === userId && member.status === "active")
    .map((member) => member.organizationId);
}

function canAccessTask(task, user, organizationIds) {
  if (!user) return false;
  if (user.lineUserId === "dev-user") return true;
  if (task.createdByUserId && task.createdByUserId === user.id) return true;
  if (task.createdByLineUserId && task.createdByLineUserId === user.lineUserId) return true;
  if (task.assigneeUserId && task.assigneeUserId === user.id) return true;
  if (task.organizationId && organizationIds.includes(task.organizationId)) return true;

  const keys = getUserIdentityKeys(user);
  return !task.organizationId && !task.assigneeUserId && keys.includes(String(task.assignee || "").trim().toLowerCase());
}

async function getVisibleTasksForUser(user, tasks = null) {
  const [allTasks, organizationIds] = await Promise.all([
    tasks ? Promise.resolve(tasks) : readTasks(),
    getOrganizationIdsForUser(user.id)
  ]);
  return allTasks.filter((task) => canAccessTask(task, user, organizationIds));
}

function normalizeProject(input, existingProject, user) {
  const name = String(input.name || existingProject?.name || "โปรเจกต์ใหม่").trim();
  return {
    id: String(input.id || existingProject?.id || createId("project")),
    name,
    description: String(input.description || existingProject?.description || "").trim(),
    color: String(input.color || existingProject?.color || "#ff8a00").trim(),
    icon: String(input.icon || existingProject?.icon || "folder").trim(),
    priority: String(input.priority || existingProject?.priority || "normal").trim(),
    startDate: String(input.startDate || existingProject?.startDate || "").trim(),
    endDate: String(input.endDate || existingProject?.endDate || "").trim(),
    members: (Array.isArray(input.members)
      ? input.members
      : Array.isArray(existingProject?.members)
        ? existingProject.members
        : [])
      .map((member) => ({
        id: String(member.id || "").trim(),
        name: String(member.name || "").trim(),
        avatarUrl: String(member.avatarUrl || member.pictureUrl || "").trim()
      }))
      .filter((member) => member.name || member.id || member.avatarUrl),
    ownerUserId: String(input.ownerUserId || existingProject?.ownerUserId || user?.id || "").trim(),
    ownerLineUserId: String(input.ownerLineUserId || existingProject?.ownerLineUserId || user?.lineUserId || "").trim(),
    createdAt: existingProject?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function canAccessProject(project, user) {
  if (!project || !user) return false;
  if (project.ownerUserId && project.ownerUserId === user.id) return true;
  if (project.ownerLineUserId && project.ownerLineUserId === user.lineUserId) return true;
  return false;
}

async function getProjectsForUser(user) {
  const [storedProjects, visibleTasks] = await Promise.all([
    readJsonFile(projectsFile, []),
    getVisibleTasksForUser(user)
  ]);
  const projectMap = new Map();
  storedProjects.filter((project) => canAccessProject(project, user)).forEach((project) => {
    projectMap.set(project.name, { ...project, total: 0, done: 0, nextDue: "" });
  });
  visibleTasks.forEach((task) => {
    const name = task.project || "ทั่วไป";
    const current =
      projectMap.get(name) ||
      normalizeProject({ name, description: "สร้างจากงานที่มีอยู่" }, null, user);
    current.total = (current.total || 0) + 1;
    current.done = (current.done || 0) + (task.status === "done" ? 1 : 0);
    if (task.dueDate && (!current.nextDue || task.dueDate < current.nextDue)) current.nextDue = task.dueDate;
    projectMap.set(name, current);
  });
  return Array.from(projectMap.values()).sort((a, b) => a.name.localeCompare(b.name, "th"));
}

async function getLineUserFromEvent(event) {
  const lineUserId = event.source?.userId || "dev-user";
  const users = await readJsonFile(usersFile, []);
  let user = users.find((item) => item.lineUserId === lineUserId);
  if (!user) {
    user = {
      id: createId("user"),
      lineUserId,
      displayName: lineUserId === "dev-user" ? "Dev User" : "LINE user",
      pictureUrl: "",
      email: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await writeJsonFile(usersFile, [user, ...users]);
  }
  return user;
}

async function handleTeamApi(request, response) {
  try {
    const url = new URL(request.url || "/", `http://${host}:${port}`);
    const currentUser = await getCurrentUser(request);
    if (!currentUser) {
      sendJson(response, 401, { error: "LINE user is required" });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/team/me") {
      sendJson(response, 200, {
        user: currentUser,
        memberships: await getMembershipsForUser(currentUser.id)
      });
      return;
    }

    if (request.method === "PATCH" && url.pathname === "/api/team/me/profile") {
      const input = await readJsonBody(request);
      const users = await readJsonFile(usersFile, []);
      const updatedUser = normalizeUserProfile(input, currentUser);
      await writeJsonFile(usersFile, users.map((user) => (user.id === currentUser.id ? updatedUser : user)));
      sendJson(response, 200, updatedUser);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/team/me/kpi") {
      sendJson(response, 200, calculateUserKpi(currentUser, await readTasks()));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/team/assignees") {
      const [memberships, members, users] = await Promise.all([
        getMembershipsForUser(currentUser.id),
        readJsonFile(membersFile, []),
        readJsonFile(usersFile, [])
      ]);
      const organizationIds = memberships.map((membership) => membership.organizationId);
      const assignees = members
        .filter((member) => organizationIds.includes(member.organizationId) && member.status === "active")
        .map((member) => ({
          memberId: member.id,
          organizationId: member.organizationId,
          role: member.role,
          user: users.find((user) => user.id === member.userId)
        }))
        .filter((item) => item.user);
      sendJson(response, 200, assignees);
      return;
    }

    if (request.method === "GET" && url.pathname.match(/^\/api\/team\/users\/[^/]+\/profile$/)) {
      const userId = url.pathname.split("/")[4];
      const [users, members, tasks] = await Promise.all([
        readJsonFile(usersFile, []),
        readJsonFile(membersFile, []),
        readTasks()
      ]);
      const targetUser = users.find((user) => user.id === userId);
      if (!targetUser) {
        sendJson(response, 404, { error: "User not found" });
        return;
      }
      const sharedMembership = members.find(
        (member) =>
          member.userId === targetUser.id &&
          members.some(
            (currentMember) =>
              currentMember.userId === currentUser.id &&
              currentMember.organizationId === member.organizationId &&
              (currentMember.userId === targetUser.id || ["Admin", "Manager"].includes(currentMember.role))
          )
      );
      if (!sharedMembership) {
        sendJson(response, 403, { error: "Only self, Admin, or Manager can view this profile" });
        return;
      }
      sendJson(response, 200, {
        user: targetUser,
        kpi: calculateUserKpi(targetUser, tasks),
        memberships: members.filter((member) => member.userId === targetUser.id)
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/team/organizations") {
      const input = await readJsonBody(request);
      const organizations = await readJsonFile(organizationsFile, []);
      const members = await readJsonFile(membersFile, []);
      const organization = {
        id: createId("org"),
        name: String(input.name || "New Team").trim(),
        createdBy: currentUser.id,
        createdAt: new Date().toISOString()
      };
      const member = {
        id: createId("member"),
        organizationId: organization.id,
        userId: currentUser.id,
        role: "Admin",
        status: "active",
        invitedAt: new Date().toISOString(),
        joinedAt: new Date().toISOString()
      };
      await writeJsonFile(organizationsFile, [organization, ...organizations]);
      await writeJsonFile(membersFile, [member, ...members]);
      sendJson(response, 201, { organization, member });
      return;
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/team/organizations/")) {
      const organizationId = url.pathname.split("/")[4];
      const [organizations, members, users] = await Promise.all([
        readJsonFile(organizationsFile, []),
        readJsonFile(membersFile, []),
        readJsonFile(usersFile, [])
      ]);
      const organization = organizations.find((org) => org.id === organizationId);
      if (!organization) {
        sendJson(response, 404, { error: "Organization not found" });
        return;
      }
      sendJson(response, 200, {
        organization,
        members: members
          .filter((member) => member.organizationId === organizationId)
          .map((member) => ({
            ...member,
            user: users.find((user) => user.id === member.userId)
          }))
      });
      return;
    }

    if (request.method === "POST" && url.pathname.match(/^\/api\/team\/organizations\/[^/]+\/members$/)) {
      const organizationId = url.pathname.split("/")[4];
      const input = await readJsonBody(request);
      const [members, users] = await Promise.all([readJsonFile(membersFile, []), readJsonFile(usersFile, [])]);
      if (!canManageMembers(members, currentUser.id, organizationId)) {
        sendJson(response, 403, { error: "Only Admin or Manager can invite members" });
        return;
      }
      const lineUserId = String(input.lineUserId || "").trim();
      const displayName = String(input.displayName || lineUserId || "Invited member").trim();
      let invitedUser = users.find((user) => user.lineUserId === lineUserId);
      if (!invitedUser) {
        invitedUser = {
          id: createId("user"),
          lineUserId,
          displayName,
          pictureUrl: "",
          email: String(input.email || ""),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        await writeJsonFile(usersFile, [invitedUser, ...users]);
      }
      const existingMember = members.find((member) => member.organizationId === organizationId && member.userId === invitedUser.id);
      if (existingMember) {
        sendJson(response, 200, existingMember);
        return;
      }
      const member = {
        id: createId("member"),
        organizationId,
        userId: invitedUser.id,
        role: ["Admin", "Manager", "Member"].includes(input.role) ? input.role : "Member",
        status: lineUserId ? "active" : "invited",
        invitedAt: new Date().toISOString(),
        joinedAt: lineUserId ? new Date().toISOString() : ""
      };
      await writeJsonFile(membersFile, [member, ...members]);
      sendJson(response, 201, { ...member, user: invitedUser });
      return;
    }

    if (request.method === "POST" && url.pathname.match(/^\/api\/team\/organizations\/[^/]+\/join$/)) {
      const organizationId = url.pathname.split("/")[4];
      const [organizations, members] = await Promise.all([
        readJsonFile(organizationsFile, []),
        readJsonFile(membersFile, [])
      ]);
      const organization = organizations.find((org) => org.id === organizationId);
      if (!organization) {
        sendJson(response, 404, { error: "Organization not found" });
        return;
      }
      const existingMember = members.find((member) => member.organizationId === organizationId && member.userId === currentUser.id);
      if (existingMember) {
        sendJson(response, 200, { organization, member: existingMember });
        return;
      }
      const member = {
        id: createId("member"),
        organizationId,
        userId: currentUser.id,
        role: "Member",
        status: "active",
        invitedAt: new Date().toISOString(),
        joinedAt: new Date().toISOString()
      };
      await writeJsonFile(membersFile, [member, ...members]);
      sendJson(response, 201, { organization, member });
      return;
    }

    if (request.method === "PATCH" && url.pathname.startsWith("/api/team/members/")) {
      const memberId = url.pathname.split("/")[4];
      const input = await readJsonBody(request);
      const members = await readJsonFile(membersFile, []);
      const member = members.find((item) => item.id === memberId);
      if (!member) {
        sendJson(response, 404, { error: "Member not found" });
        return;
      }
      if (!canManageMembers(members, currentUser.id, member.organizationId)) {
        sendJson(response, 403, { error: "Only Admin or Manager can change roles" });
        return;
      }
      const updatedMember = {
        ...member,
        role: ["Admin", "Manager", "Member"].includes(input.role) ? input.role : member.role,
        status: input.status || member.status
      };
      await writeJsonFile(membersFile, members.map((item) => (item.id === memberId ? updatedMember : item)));
      sendJson(response, 200, updatedMember);
      return;
    }

    sendJson(response, 404, { error: "Team endpoint not found" });
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: error.message || "Team API error" });
  }
}

async function handleLineWebhookEvent(event) {
  if (event.type !== "message" || event.message?.type !== "text" || !event.replyToken) return;
  await rememberLineTarget(event.source);

  const text = event.message.text.trim();
  const currentUser = await getLineUserFromEvent(event);
  const tasks = await readTasks();
  const visibleTasks = await getVisibleTasksForUser(currentUser, tasks);
  const openTasks = visibleTasks.filter((task) => task.status !== "done");

  if (text === "สรุป" || text === "งาน" || text.toLowerCase() === "summary") {
    await replyLine(event.replyToken, buildTaskSummary(visibleTasks));
    return;
  }

  if (text === "ช่วยเหลือ" || text.toLowerCase() === "help") {
    await replyLine(
      event.replyToken,
      [
        "คำสั่งที่ใช้ได้",
        "สรุป",
        "งานวันนี้",
        "งานค้าง",
        "งานของฉัน",
        "ดูงาน ชื่องาน",
        "เพิ่มงาน ชื่องาน พรุ่งนี้",
        "กำลังทำ ชื่องาน",
        "รอตรวจ ชื่องาน",
        "เลื่อนงาน ชื่องาน พรุ่งนี้",
        "เสร็จ ชื่องาน"
      ].join("\n")
    );
    return;
  }

  if (text === "งานวันนี้" || text === "วันนี้" || text.toLowerCase() === "today") {
    await replyLine(event.replyToken, buildTaskList("งานวันนี้", visibleTasks.filter((task) => task.dueDate === todayDate())));
    return;
  }

  if (text === "งานค้าง" || text === "ค้าง" || text.toLowerCase() === "open") {
    await replyLine(event.replyToken, buildTaskList("งานค้าง", openTasks.sort((a, b) => a.dueDate.localeCompare(b.dueDate))));
    return;
  }

  if (text === "งานของฉัน" || text.toLowerCase() === "mine") {
    await replyLine(event.replyToken, buildTaskList("งานของฉัน", openTasks));
    return;
  }

  if (text.startsWith("ดูงาน ") || text.toLowerCase().startsWith("show ")) {
    const task = findTaskByQuery(visibleTasks, text.replace("ดูงาน ", "").replace(/^show /i, ""));
    if (task) {
      await replyLineMessages(event.replyToken, [buildTaskFlex(task, "รายละเอียดงาน")]);
    } else {
      await replyLine(event.replyToken, "ไม่พบงานที่ค้นหา");
    }
    return;
  }

  if (text.startsWith("เสร็จ ") || text.toLowerCase().startsWith("done ")) {
    const task = findTaskByQuery(openTasks, text.replace("เสร็จ ", "").replace(/^done /i, ""));
    if (!task) {
      await replyLine(event.replyToken, "ไม่พบงานค้างที่ตรงกับชื่อนี้");
      return;
    }
    const updatedTask = {
      ...task,
      status: "done",
      activity: [{ id: `activity-${Date.now()}`, text: "ปิดงานจาก LINE", time: "ตอนนี้" }, ...task.activity]
    };
    await writeTasks(tasks.map((currentTask) => (currentTask.id === task.id ? updatedTask : currentTask)));
    await replyLineMessages(event.replyToken, [buildTaskFlex(updatedTask, "ปิดงานแล้ว", buildChangeSummary(task, updatedTask))]);
    return;
  }

  if (text.startsWith("กำลังทำ ") || text.toLowerCase().startsWith("progress ")) {
    const task = findTaskByQuery(openTasks, text.replace("กำลังทำ ", "").replace(/^progress /i, ""));
    if (!task) {
      await replyLine(event.replyToken, "ไม่พบงานค้างที่ตรงกับชื่อนี้");
      return;
    }
    const updatedTask = {
      ...task,
      status: "progress",
      activity: [{ id: `activity-${Date.now()}`, text: "เปลี่ยนสถานะเป็นกำลังทำจาก LINE", time: "ตอนนี้" }, ...task.activity]
    };
    await writeTasks(tasks.map((currentTask) => (currentTask.id === task.id ? updatedTask : currentTask)));
    await replyLineMessages(event.replyToken, [buildTaskFlex(updatedTask, "อัปเดตงานแล้ว", buildChangeSummary(task, updatedTask))]);
    return;
  }

  if (text.startsWith("รอตรวจ ") || text.toLowerCase().startsWith("review ")) {
    const task = findTaskByQuery(openTasks, text.replace("รอตรวจ ", "").replace(/^review /i, ""));
    if (!task) {
      await replyLine(event.replyToken, "ไม่พบงานค้างที่ตรงกับชื่อนี้");
      return;
    }
    const updatedTask = {
      ...task,
      status: "review",
      activity: [{ id: `activity-${Date.now()}`, text: "เปลี่ยนสถานะเป็นรอตรวจจาก LINE", time: "ตอนนี้" }, ...task.activity]
    };
    await writeTasks(tasks.map((currentTask) => (currentTask.id === task.id ? updatedTask : currentTask)));
    await replyLineMessages(event.replyToken, [buildTaskFlex(updatedTask, "อัปเดตงานแล้ว", buildChangeSummary(task, updatedTask))]);
    return;
  }

  if (text.startsWith("เลื่อนงาน ") || text.toLowerCase().startsWith("reschedule ")) {
    const raw = text.replace("เลื่อนงาน ", "").replace(/^reschedule /i, "").trim();
    const parsed = parseDueDateFromText(raw);
    const task = findTaskByQuery(openTasks, parsed.cleanedText);
    if (!task) {
      await replyLine(event.replyToken, "ไม่พบงานค้างที่ต้องการเลื่อน");
      return;
    }
    const updatedTask = {
      ...task,
      dueDate: parsed.dueDate,
      dueTime: parsed.dueTime || task.dueTime || "",
      activity: [{ id: `activity-${Date.now()}`, text: `เลื่อนกำหนดเป็น ${parsed.dueDate}${parsed.dueTime ? ` ${parsed.dueTime}` : ""} จาก LINE`, time: "ตอนนี้" }, ...task.activity]
    };
    await writeTasks(tasks.map((currentTask) => (currentTask.id === task.id ? updatedTask : currentTask)));
    await replyLineMessages(event.replyToken, [buildTaskFlex(updatedTask, "เลื่อนกำหนดแล้ว", buildChangeSummary(task, updatedTask))]);
    return;
  }

  if (text.startsWith("เพิ่มงาน ") || text.toLowerCase().startsWith("add ")) {
    const assigneePhrase = parseAssigneePhrase(text.replace("เพิ่มงาน ", "").replace(/^add /i, "").trim());
    const assigneeUser = await findAssigneeByText(assigneePhrase.assigneeQuery);
    const parsed = parseDueDateFromText(assigneePhrase.cleanedText);
    const settings = await getReminderSettingsForUser(currentUser);
    const title = parsed.cleanedText;
    if (!title) {
      await replyLine(event.replyToken, "พิมพ์แบบนี้ได้เลย: เพิ่มงาน โทรหาลูกค้า");
      return;
    }
    const project = inferProjectFromText(assigneePhrase.cleanedText, settings, tasks);
    const task = normalizeTask(
      {
        id: `task-${Date.now()}`,
        title,
        description: "สร้างจากข้อความ LINE",
        project,
        status: "todo",
        priority: inferPriorityFromText(text, settings),
        assignee: assigneeUser?.displayName || currentUser.displayName || getRequesterName(event),
        assigneeUserId: assigneeUser?.id || currentUser.id,
        createdByUserId: currentUser.id,
        createdByLineUserId: currentUser.lineUserId,
        dueDate: parsed.dueDate,
        dueTime: applyDefaultDueTime(parsed, settings),
        tags: ["LINE"],
        activity: [{ id: `activity-${Date.now()}`, text: "สร้างจาก LINE webhook", time: "ตอนนี้" }]
      },
      null
    );
    await writeTasks([task, ...tasks]);
    await replyLineMessages(event.replyToken, [buildTaskFlex(task, "จดสำเร็จ")]);
    return;
  }

  if (shouldCreateNaturalTask(text)) {
    const task = await createTaskFromLineText(text, event, tasks);
    await replyLineMessages(event.replyToken, [buildTaskFlex(task, "จดสำเร็จ")]);
    return;
  }

  await replyLine(event.replyToken, "พิมพ์จดงานได้เลย เช่น ประชุมพรุ่งนี้ 10 โมง, ส่งรายงานวันที่ 31, เตือนกินยา 20:00 หรือใช้คำสั่ง: สรุป, งานวันนี้, งานค้าง, เพิ่มงาน ชื่องาน พรุ่งนี้, กำลังทำ ชื่องาน, เสร็จ ชื่องาน");
}

async function handleLineApi(request, response) {
  try {
    const url = new URL(request.url || "/", `http://${host}:${port}`);
    const { liffId, channelAccessToken, channelSecret, targetId } = getLineConfig();

    if (request.method === "GET" && url.pathname === "/api/line/config") {
      sendJson(response, 200, {
        liffId,
        isLiffConfigured: Boolean(liffId),
        isMessagingConfigured: Boolean(channelAccessToken && channelSecret),
        hasPushTarget: Boolean(targetId)
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/line/profile") {
      const profile = await readJsonBody(request);
      const verifiedProfile = await getVerifiedLineProfileFromRequest(request);
      if (!verifiedProfile && !isLocalHttpRequest(request)) {
        sendJson(response, 401, { error: "LINE ID token is required" });
        return;
      }
      if (verifiedProfile) {
        profile.userId = verifiedProfile.sub;
        profile.displayName = verifiedProfile.name || profile.displayName;
        profile.pictureUrl = verifiedProfile.picture || profile.pictureUrl;
      }
      sendJson(response, 200, await saveLineProfile(profile));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/line/reminder-settings") {
      const currentUser = await getCurrentUser(request);
      if (!currentUser) {
        sendJson(response, 401, { error: "LINE user is required" });
        return;
      }
      sendJson(response, 200, await getReminderSettingsForUser(currentUser));
      return;
    }

    if (request.method === "PATCH" && url.pathname === "/api/line/reminder-settings") {
      const currentUser = await getCurrentUser(request);
      if (!currentUser) {
        sendJson(response, 401, { error: "LINE user is required" });
        return;
      }
      const input = await readJsonBody(request);
      sendJson(response, 200, await saveReminderSettingsForUser(currentUser, input));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/line/test-reminder") {
      const currentUser = await getCurrentUser(request);
      if (!currentUser) {
        sendJson(response, 401, { error: "LINE user is required" });
        return;
      }
      const visibleTasks = await getVisibleTasksForUser(currentUser);
      await pushLine(currentUser.lineUserId, buildReminderText(currentUser, visibleTasks, "ทดสอบแจ้งเตือนจาก BossBoard"));
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/line/push-summary") {
      const currentUser = await getCurrentUser(request);
      const input = await readJsonBody(request);
      const to = input.to || currentUser?.lineUserId || targetId;
      if (!to) {
        sendJson(response, 400, { error: "LINE_TARGET_ID is missing" });
        return;
      }
      const tasks = currentUser ? await getVisibleTasksForUser(currentUser) : await readTasks();
      await pushLine(to, buildTaskSummary(tasks));
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/line/webhook") {
      sendJson(response, 200, { ok: true, message: "LINE webhook is ready. LINE will call this endpoint with POST." });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/line/dev-command") {
      const input = await readJsonBody(request);
      await handleLineWebhookEvent({
        type: "message",
        replyToken: "dev-reply-token",
        source: { type: "user", userId: input.userId || "dev-user" },
        message: { type: "text", text: input.text || "" }
      });
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/line/webhook") {
      const rawBody = await readRawBody(request);
      const signature = request.headers["x-line-signature"];
      if (!verifyLineSignature(rawBody, signature)) {
        sendJson(response, 401, { error: "Invalid LINE signature" });
        return;
      }
      const body = rawBody ? JSON.parse(rawBody) : {};
      await Promise.all((body.events || []).map(handleLineWebhookEvent));
      sendJson(response, 200, { ok: true });
      return;
    }

    sendJson(response, 404, { error: "LINE endpoint not found" });
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: error.message || "LINE integration error" });
  }
}

async function handleProjectsApi(request, response) {
  try {
    const url = new URL(request.url || "/", `http://${host}:${port}`);
    const id = decodeURIComponent(url.pathname.replace("/api/projects", "").replace(/^\/+/, ""));
    const currentUser = await getCurrentUser(request);
    if (!currentUser) {
      sendJson(response, 401, { error: "LINE user is required" });
      return;
    }

    if (request.method === "GET" && !id) {
      sendJson(response, 200, await getProjectsForUser(currentUser));
      return;
    }

    if (request.method === "POST" && !id) {
      const input = await readJsonBody(request);
      const allProjects = await readJsonFile(projectsFile, []);
      const existingProject = allProjects.find(
        (project) => canAccessProject(project, currentUser) && project.name.trim().toLowerCase() === String(input.name || "").trim().toLowerCase()
      );
      if (existingProject) {
        sendJson(response, 200, existingProject);
        return;
      }
      const project = normalizeProject(input, null, currentUser);
      await writeJsonFile(projectsFile, [project, ...allProjects]);
      sendJson(response, 201, project);
      return;
    }

    if (request.method === "PUT" && id) {
      const input = await readJsonBody(request);
      const allProjects = await readJsonFile(projectsFile, []);
      const existingProject = allProjects.find((project) => project.id === id);
      if (!existingProject) {
        sendJson(response, 404, { error: "Project not found" });
        return;
      }
      if (!canAccessProject(existingProject, currentUser)) {
        sendJson(response, 403, { error: "You do not have access to this project" });
        return;
      }
      const project = normalizeProject({ ...existingProject, ...input, id }, existingProject, currentUser);
      await writeJsonFile(projectsFile, allProjects.map((item) => (item.id === id ? project : item)));
      sendJson(response, 200, project);
      return;
    }

    if (request.method === "DELETE" && id) {
      const allProjects = await readJsonFile(projectsFile, []);
      const existingProject = allProjects.find((project) => project.id === id);
      if (!existingProject) {
        sendJson(response, 404, { error: "Project not found" });
        return;
      }
      if (!canAccessProject(existingProject, currentUser)) {
        sendJson(response, 403, { error: "You do not have access to this project" });
        return;
      }
      await writeJsonFile(projectsFile, allProjects.filter((project) => project.id !== id));
      sendJson(response, 200, { ok: true, deletedProjectId: id });
      return;
    }

    sendJson(response, 405, { error: "Method not allowed" });
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: "Internal server error" });
  }
}

async function handleTasksApi(request, response) {
  try {
    const url = new URL(request.url || "/", `http://${host}:${port}`);
    const id = decodeURIComponent(url.pathname.replace("/api/tasks", "").replace(/^\/+/, ""));
    const currentUser = await getCurrentUser(request);
    if (!currentUser) {
      sendJson(response, 401, { error: "LINE user is required" });
      return;
    }
    const organizationIds = await getOrganizationIdsForUser(currentUser.id);

    if (request.method === "GET" && !id) {
      sendJson(response, 200, await getVisibleTasksForUser(currentUser));
      return;
    }

    if (request.method === "POST" && !id) {
      const input = await readJsonBody(request);
      const tasks = await readTasks();
      const task = normalizeTask(
        {
          ...input,
          id: input.id || `task-${Date.now()}`,
          assignee: input.assignee || currentUser.displayName || "Unassigned",
          assigneeUserId: input.assigneeUserId || currentUser.id,
          createdByUserId: currentUser.id,
          createdByLineUserId: currentUser.lineUserId,
          activity: [
            createActivityEntry("สร้างงานใหม่", currentUser),
            ...(Array.isArray(input.activity) ? input.activity : [])
          ]
        },
        null
      );
      const nextTasks = [task, ...tasks];
      await writeTasks(nextTasks);
      sendJson(response, 201, task);
      return;
    }

    if (request.method === "PUT" && id) {
      const input = await readJsonBody(request);
      const tasks = await readTasks();
      const existingTask = tasks.find((task) => task.id === id);
      if (!existingTask) {
        sendJson(response, 404, { error: "Task not found" });
        return;
      }
      if (!canAccessTask(existingTask, currentUser, organizationIds)) {
        sendJson(response, 403, { error: "You do not have access to this task" });
        return;
      }
      const task = normalizeTask(
        {
          ...input,
          id,
        },
        existingTask
      );
      task.activity = [
        createActivityEntry(input.activityText || buildActivityText(existingTask, task, "บันทึกการเปลี่ยนแปลง"), currentUser, {
          changes: buildChangeSummary(existingTask, task)
        }),
        ...(Array.isArray(input.activity) ? input.activity : existingTask.activity)
      ];
      await writeTasks(tasks.map((currentTask) => (currentTask.id === id ? task : currentTask)));
      if (input.notifyLine !== false) {
        await notifyTaskUpdate(task, "อัปเดตงานแล้ว", buildChangeSummary(existingTask, task), currentUser);
      }
      sendJson(response, 200, task);
      return;
    }

    if (request.method === "PATCH" && id) {
      const input = await readJsonBody(request);
      const tasks = await readTasks();
      const existingTask = tasks.find((task) => task.id === id);
      if (!existingTask) {
        sendJson(response, 404, { error: "Task not found" });
        return;
      }
      if (!canAccessTask(existingTask, currentUser, organizationIds)) {
        sendJson(response, 403, { error: "You do not have access to this task" });
        return;
      }
      const task = normalizeTask(
        {
          ...existingTask,
          ...input,
          id
        },
        existingTask
      );
      task.activity = [
        createActivityEntry(input.activityText || buildActivityText(existingTask, task, "อัปเดตงาน"), currentUser, {
          changes: buildChangeSummary(existingTask, task)
        }),
        ...existingTask.activity
      ];
      await writeTasks(tasks.map((currentTask) => (currentTask.id === id ? task : currentTask)));
      if (input.notifyLine !== false) {
        await notifyTaskUpdate(task, "อัปเดตงานแล้ว", buildChangeSummary(existingTask, task), currentUser);
      }
      sendJson(response, 200, task);
      return;
    }

    if (request.method === "DELETE" && id) {
      const tasks = await readTasks();
      const existingTask = tasks.find((task) => task.id === id);
      if (!existingTask) {
        sendJson(response, 404, { error: "Task not found" });
        return;
      }
      if (!canAccessTask(existingTask, currentUser, organizationIds)) {
        sendJson(response, 403, { error: "You do not have access to this task" });
        return;
      }
      const nextTasks = tasks.filter((task) => task.id !== id);
      await writeTasks(nextTasks);
      sendJson(response, 200, { ok: true });
      return;
    }

    sendJson(response, 405, { error: "Method not allowed" });
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: "Internal server error" });
  }
}

ensureDatabase().then(() => {
  server.listen(port, host, () => {
    console.log(`LineTask is running at http://${host}:${port}`);
  });
  setInterval(runReminderTick, 60 * 1000);
  runReminderTick();
});
