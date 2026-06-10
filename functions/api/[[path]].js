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

  return proxyToRender(context, "/api");
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
