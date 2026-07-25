import { getBackendUrl } from "@/lib/backend-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BACKEND_SECRET = process.env.BACKEND_SECRET || "dev-secret";

/**
 * Proxies the backend SSE stream so the browser can use EventSource
 * without sending Authorization headers (EventSource cannot set them).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const backendUrl = getBackendUrl();

  let upstream: Response;
  try {
    upstream = await fetch(`${backendUrl}/api/clip/${id}/events`, {
      headers: {
        Authorization: `Bearer ${BACKEND_SECRET}`,
        Accept: "text/event-stream",
      },
      cache: "no-store",
    });
  } catch (error) {
    console.error("SSE proxy upstream error:", error);
    return new Response(JSON.stringify({ error: "Backend unreachable" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    return new Response(text || JSON.stringify({ error: "Job not found" }), {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
