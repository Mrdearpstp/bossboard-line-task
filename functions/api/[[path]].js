const DEFAULT_RENDER_ORIGIN = "https://bossboard-line-task.onrender.com";

export async function onRequest(context) {
  return proxyToRender(context, "/api");
}

async function proxyToRender({ request, env }, mountPath) {
  const origin = (env.RENDER_ORIGIN || DEFAULT_RENDER_ORIGIN).replace(/\/$/, "");
  const sourceUrl = new URL(request.url);
  const targetUrl = new URL(`${origin}${sourceUrl.pathname}${sourceUrl.search}`);

  const headers = new Headers(request.headers);
  headers.set("host", targetUrl.host);

  const init = {
    method: request.method,
    headers,
    redirect: "manual"
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
        message: error.message
      },
      { status: 502 }
    );
  }
}
