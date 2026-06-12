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
  if (!isSupabaseConfigured(context.env)) return null;

  const { request } = context;
  if (request.method === "POST" && url.pathname === "/api/line/profile") {
    const verifiedProfile = await getVerifiedLineProfile(request, context.env);
    if (!verifiedProfile) {
      return jsonError("LINE ID token is required", 401);
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
  const clientId = String(env.LINE_LOGIN_CHANNEL_ID || (env.LINE_LIFF_ID || DEFAULT_LIFF_ID).split("-")[0] || "");
  if (!idToken || !clientId) return null;

  const response = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      id_token: idToken,
      client_id: clientId
    })
  });
  if (!response.ok) return null;

  const profile = await response.json();
  return profile?.sub ? profile : null;
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
