const DEFAULT_RENDER_ORIGIN = "https://bossboard-line-task.onrender.com";

export async function onRequest({ request, env }) {
  const origin = (env.RENDER_ORIGIN || DEFAULT_RENDER_ORIGIN).replace(/\/$/, "");
  const sourceUrl = new URL(request.url);
  const targetUrl = new URL(`${origin}${sourceUrl.pathname}${sourceUrl.search}`);

  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: request.headers,
      redirect: "manual"
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
  }
}
