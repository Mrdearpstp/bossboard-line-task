const DEFAULT_RENDER_ORIGIN = "https://bossboard-line-task.onrender.com";
const DEFAULT_LIFF_ID = "2010109340-Oj89MY4l";
const PROXY_TIMEOUT_MS = 12000;

export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (context.request.method === "GET" && url.pathname === "/api/line/config") {
    return Response.json(
      {
        liffId: context.env.LINE_LIFF_ID || DEFAULT_LIFF_ID,
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
  if (request.method !== "GET" || !nativeTeamPaths.has(url.pathname)) return null;

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

  const tasks = await readState(context.env, "tasks", []);
  return nativeJson(calculateUserKpi(currentUser, getVisibleTasksForUser(currentUser, tasks, await readTeamState(context.env))));
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
