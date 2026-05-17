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
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || (process.env.RENDER ? "0.0.0.0" : "127.0.0.1");
let databaseReady = false;
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8"
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
      ["members", []]
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
    dueDate: String(input.dueDate || new Date(Date.now() + 86400000).toISOString().slice(0, 10)),
    tags: Array.isArray(input.tags) ? input.tags.map(String).map((tag) => tag.trim()).filter(Boolean) : [],
    activity: Array.isArray(input.activity) ? input.activity : existingTask?.activity || []
  };
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
    .map((task, index) => `${index + 1}. ${task.title} - ${task.assignee} (${task.dueDate})`)
    .join("\n");
  return `สรุปงาน LineTask\nงานค้าง: ${openTasks.length}\nเสร็จแล้ว: ${
    tasks.length - openTasks.length
  }\n\nงานที่ควรดู:\n${dueSoon || "ไม่มีงานค้าง"}`;
}

function formatTaskLine(task, index) {
  return `${index + 1}. ${task.title} - ${task.assignee} (${task.dueDate}) [${task.status}]`;
}

function formatTaskDetail(task) {
  return [
    `รายละเอียดงาน`,
    `ชื่อ: ${task.title}`,
    `สถานะ: ${task.status}`,
    `ผู้รับผิดชอบ: ${task.assignee}`,
    `ครบกำหนด: ${task.dueDate}`,
    `โปรเจกต์: ${task.project}`,
    `รายละเอียด: ${task.description || "-"}`
  ].join("\n");
}

function buildChangeSummary(beforeTask, afterTask) {
  if (!beforeTask || !afterTask) return "";
  const changes = [];
  if (beforeTask.title !== afterTask.title) changes.push(`เปลี่ยนชื่องาน: ${beforeTask.title} → ${afterTask.title}`);
  if (beforeTask.dueDate !== afterTask.dueDate) changes.push(`เลื่อนกำหนด: ${beforeTask.dueDate} → ${afterTask.dueDate}`);
  if (beforeTask.status !== afterTask.status) changes.push(`เปลี่ยนสถานะ: ${beforeTask.status} → ${afterTask.status}`);
  if (beforeTask.assignee !== afterTask.assignee) changes.push(`เปลี่ยนผู้รับผิดชอบ: ${beforeTask.assignee} → ${afterTask.assignee}`);
  if (beforeTask.priority !== afterTask.priority) changes.push(`เปลี่ยน priority: ${beforeTask.priority} → ${afterTask.priority}`);
  if (beforeTask.description !== afterTask.description) changes.push("แก้ไขรายละเอียดงาน");
  return changes.slice(0, 4).join("\n");
}

function buildTaskList(title, tasks) {
  if (!tasks.length) return `${title}\nไม่มีงานในรายการนี้`;
  return `${title}\n${tasks.slice(0, 10).map(formatTaskLine).join("\n")}`;
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function toDateString(date) {
  return date.toISOString().slice(0, 10);
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
    .replace(/\bให้\b/g, "")
    .replace(/\bภายใน\b/g, "")
    .replace(/\bกำหนด\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDueDateFromText(text) {
  let cleanedText = text.trim();
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const relativePatterns = [
    { pattern: /วันนี้/g, dueDate: todayDate() },
    { pattern: /พรุ่งนี้/g, dueDate: addDays(1) },
    { pattern: /มะรืน/g, dueDate: addDays(2) },
    { pattern: /tomorrow/ig, dueDate: addDays(1) },
    { pattern: /today/ig, dueDate: todayDate() }
  ];
  for (const item of relativePatterns) {
    if (item.pattern.test(cleanedText)) {
      return { dueDate: item.dueDate, cleanedText: stripDateWords(cleanedText.replace(item.pattern, "")) };
    }
  }

  const inDaysMatch = cleanedText.match(/อีก\s*(\d+)\s*วัน/);
  if (inDaysMatch) {
    return { dueDate: addDays(Number(inDaysMatch[1])), cleanedText: stripDateWords(cleanedText.replace(inDaysMatch[0], "")) };
  }

  const inWeeksMatch = cleanedText.match(/อีก\s*(\d+)\s*สัปดาห์/);
  if (inWeeksMatch) {
    return { dueDate: addWeeks(Number(inWeeksMatch[1])), cleanedText: stripDateWords(cleanedText.replace(inWeeksMatch[0], "")) };
  }

  if (cleanedText.includes("สิ้นเดือนหน้า")) {
    const nextMonth = currentMonth + 1;
    const year = currentYear + Math.floor(nextMonth / 12);
    const monthIndex = nextMonth % 12;
    return { dueDate: buildDate(year, monthIndex, daysInMonth(year, monthIndex)), cleanedText: stripDateWords(cleanedText.replace("สิ้นเดือนหน้า", "")) };
  }

  if (cleanedText.includes("ต้นเดือนหน้า")) {
    const nextMonth = currentMonth + 1;
    const year = currentYear + Math.floor(nextMonth / 12);
    const monthIndex = nextMonth % 12;
    return { dueDate: buildDate(year, monthIndex, 1), cleanedText: stripDateWords(cleanedText.replace("ต้นเดือนหน้า", "")) };
  }

  if (cleanedText.includes("สิ้นเดือน")) {
    return { dueDate: buildDate(currentYear, currentMonth, daysInMonth(currentYear, currentMonth)), cleanedText: stripDateWords(cleanedText.replace("สิ้นเดือน", "")) };
  }

  const dayNextMonthMatch = cleanedText.match(/(?:วันที่\s*)?(\d{1,2})\s*เดือนหน้า/);
  if (dayNextMonthMatch) {
    const nextMonth = currentMonth + 1;
    const year = currentYear + Math.floor(nextMonth / 12);
    const monthIndex = nextMonth % 12;
    return {
      dueDate: buildDate(year, monthIndex, dayNextMonthMatch[1]),
      cleanedText: stripDateWords(cleanedText.replace(dayNextMonthMatch[0], ""))
    };
  }

  const monthNames = Object.keys(thaiMonthMap).sort((a, b) => b.length - a.length).map((item) => item.replace(".", "\\."));
  const thaiDateRegex = new RegExp(`(?:วันที่\\s*)?(\\d{1,2})\\s*(${monthNames.join("|")})(?:\\s*(\\d{4}))?`);
  const thaiDateMatch = cleanedText.match(thaiDateRegex);
  if (thaiDateMatch) {
    const monthIndex = parseThaiMonth(thaiDateMatch[2]);
    const year = normalizeYear(thaiDateMatch[3] || currentYear);
    return {
      dueDate: buildDate(year, monthIndex, thaiDateMatch[1]),
      cleanedText: stripDateWords(cleanedText.replace(thaiDateMatch[0], ""))
    };
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
    return {
      dueDate: buildDate(year, monthIndex, day),
      cleanedText: stripDateWords(cleanedText.replace(dayOnlyMatch[0], ""))
    };
  }

  const dateMatch = text.match(/(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) {
    return { dueDate: dateMatch[1], cleanedText: text.replace(dateMatch[1], "").trim() };
  }

  return { dueDate: addDays(1), cleanedText: stripDateWords(cleanedText) };
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

async function createTaskFromLineText(text, event, tasks) {
  const assigneePhrase = parseAssigneePhrase(text);
  const assigneeUser = await findAssigneeByText(assigneePhrase.assigneeQuery);
  const parsed = parseDueDateFromText(assigneePhrase.cleanedText);
  const title = parsed.cleanedText || text.trim();
  const task = normalizeTask(
    {
      id: `task-${Date.now()}`,
      title,
      description: "สร้างจากข้อความ LINE",
      project: "LINE",
      status: "todo",
      priority: /ด่วน|urgent|สำคัญ/.test(text) ? "high" : "medium",
      assignee: assigneeUser?.displayName || getRequesterName(event),
      assigneeUserId: assigneeUser?.id || "",
      dueDate: parsed.dueDate,
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
              flexInfoRow("ครบกำหนด", task.dueDate || "-"),
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

async function notifyTaskUpdate(task, heading = "อัปเดตงานแล้ว", changeSummary = "") {
  const targetId = await getDefaultLineTarget();
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
  const lineUserId = request.headers["x-line-user-id"] || url.searchParams.get("lineUserId") || "dev-user";
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

async function handleTeamApi(request, response) {
  try {
    const url = new URL(request.url || "/", `http://${host}:${port}`);
    const currentUser = await getCurrentUser(request);

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
  const tasks = await readTasks();
  const openTasks = tasks.filter((task) => task.status !== "done");

  if (text === "สรุป" || text === "งาน" || text.toLowerCase() === "summary") {
    await replyLine(event.replyToken, buildTaskSummary(tasks));
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
    await replyLine(event.replyToken, buildTaskList("งานวันนี้", tasks.filter((task) => task.dueDate === todayDate())));
    return;
  }

  if (text === "งานค้าง" || text === "ค้าง" || text.toLowerCase() === "open") {
    await replyLine(event.replyToken, buildTaskList("งานค้าง", openTasks.sort((a, b) => a.dueDate.localeCompare(b.dueDate))));
    return;
  }

  if (text === "งานของฉัน" || text.toLowerCase() === "mine") {
    const requester = getRequesterName(event);
    await replyLine(
      event.replyToken,
      buildTaskList(
        "งานของฉัน",
        openTasks.filter((task) => task.assignee === requester || task.assignee.toLowerCase() === "narin")
      )
    );
    return;
  }

  if (text.startsWith("ดูงาน ") || text.toLowerCase().startsWith("show ")) {
    const task = findTaskByQuery(tasks, text.replace("ดูงาน ", "").replace(/^show /i, ""));
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
      activity: [{ id: `activity-${Date.now()}`, text: `เลื่อนกำหนดเป็น ${parsed.dueDate} จาก LINE`, time: "ตอนนี้" }, ...task.activity]
    };
    await writeTasks(tasks.map((currentTask) => (currentTask.id === task.id ? updatedTask : currentTask)));
    await replyLineMessages(event.replyToken, [buildTaskFlex(updatedTask, "เลื่อนกำหนดแล้ว", buildChangeSummary(task, updatedTask))]);
    return;
  }

  if (text.startsWith("เพิ่มงาน ") || text.toLowerCase().startsWith("add ")) {
    const assigneePhrase = parseAssigneePhrase(text.replace("เพิ่มงาน ", "").replace(/^add /i, "").trim());
    const assigneeUser = await findAssigneeByText(assigneePhrase.assigneeQuery);
    const parsed = parseDueDateFromText(assigneePhrase.cleanedText);
    const title = parsed.cleanedText;
    if (!title) {
      await replyLine(event.replyToken, "พิมพ์แบบนี้ได้เลย: เพิ่มงาน โทรหาลูกค้า");
      return;
    }
    const task = normalizeTask(
      {
        id: `task-${Date.now()}`,
        title,
        description: "สร้างจากข้อความ LINE",
        project: "LINE",
        status: "todo",
        priority: "medium",
        assignee: assigneeUser?.displayName || getRequesterName(event),
        assigneeUserId: assigneeUser?.id || "",
        dueDate: parsed.dueDate,
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

  await replyLine(event.replyToken, "ใช้คำสั่งได้: สรุป, งานวันนี้, งานค้าง, งานของฉัน, ดูงาน ชื่องาน, เพิ่มงาน ชื่องาน พรุ่งนี้, กำลังทำ ชื่องาน, รอตรวจ ชื่องาน, เลื่อนงาน ชื่องาน พรุ่งนี้, เสร็จ ชื่องาน");
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
      sendJson(response, 200, await saveLineProfile(profile));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/line/push-summary") {
      const input = await readJsonBody(request);
      const to = input.to || targetId;
      if (!to) {
        sendJson(response, 400, { error: "LINE_TARGET_ID is missing" });
        return;
      }
      await pushLine(to, buildTaskSummary(await readTasks()));
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

async function handleTasksApi(request, response) {
  try {
    const url = new URL(request.url || "/", `http://${host}:${port}`);
    const id = decodeURIComponent(url.pathname.replace("/api/tasks", "").replace(/^\/+/, ""));

    if (request.method === "GET" && !id) {
      sendJson(response, 200, await readTasks());
      return;
    }

    if (request.method === "POST" && !id) {
      const input = await readJsonBody(request);
      const tasks = await readTasks();
      const task = normalizeTask(
        {
          ...input,
          id: input.id || `task-${Date.now()}`,
          activity: [
            { id: `activity-${Date.now()}`, text: "สร้างงานใหม่", time: "ตอนนี้" },
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
      const task = normalizeTask(
        {
          ...input,
          id,
          activity: [
            { id: `activity-${Date.now()}`, text: "บันทึกการเปลี่ยนแปลง", time: "ตอนนี้" },
            ...(Array.isArray(input.activity) ? input.activity : existingTask.activity)
          ]
        },
        existingTask
      );
      await writeTasks(tasks.map((currentTask) => (currentTask.id === id ? task : currentTask)));
      if (input.notifyLine !== false) {
        await notifyTaskUpdate(task, "อัปเดตงานแล้ว", buildChangeSummary(existingTask, task));
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
      const task = normalizeTask(
        {
          ...existingTask,
          ...input,
          id,
          activity: [
            { id: `activity-${Date.now()}`, text: input.activityText || "อัปเดตงาน", time: "ตอนนี้" },
            ...existingTask.activity
          ]
        },
        existingTask
      );
      await writeTasks(tasks.map((currentTask) => (currentTask.id === id ? task : currentTask)));
      if (input.notifyLine !== false) {
        await notifyTaskUpdate(task, "อัปเดตงานแล้ว", buildChangeSummary(existingTask, task));
      }
      sendJson(response, 200, task);
      return;
    }

    if (request.method === "DELETE" && id) {
      const tasks = await readTasks();
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
});
