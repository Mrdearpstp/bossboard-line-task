const DEFAULT_RENDER_ORIGIN = "https://bossboard-line-task.onrender.com";
const PROXY_TIMEOUT_MS = 12000;

export async function onRequest({ request, env }) {
  const origin = (env.RENDER_ORIGIN || DEFAULT_RENDER_ORIGIN).replace(/\/$/, "");
  const sourceUrl = new URL(request.url);
  const targetUrl = new URL(`${origin}${sourceUrl.pathname}${sourceUrl.search}`);

  const headers = new Headers(request.headers);
  stripHopByHopHeaders(headers);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("Render origin timeout"), PROXY_TIMEOUT_MS);

  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      redirect: "manual",
      signal: controller.signal
    });
    const headers = new Headers(response.headers);
    headers.set("x-bossboard-proxy", "cloudflare-pages:brand");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  } catch (error) {
    return Response.json(
      {
        error: "Cloudflare brand proxy failed",
        message: error.message
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
