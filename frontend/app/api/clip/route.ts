import { NextRequest, NextResponse } from "next/server";
import { backendFetch } from "@/lib/backend-client";
import { getUserId } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const userId = await getUserId();

  const body = await req.json();

  // Add userId and ensure url field exists (backend expects 'url' field)
  const backendPayload = {
    ...body,
    userId: userId,
    url: body.url || body.youtubeUrl,
  };

  // Forward to backend – expect 202 w/ { id }
  const backendRes = await backendFetch('/api/clip', {
    method: "POST",
    body: JSON.stringify(backendPayload),
  });

  if (!backendRes.ok) {
    const errorData = await backendRes.json().catch(() => ({ error: 'Failed to process clip on backend' }));
    return NextResponse.json({ error: errorData.error }, { status: backendRes.status });
  }

  const data = await backendRes.json();
  return NextResponse.json(data, { status: 202 });
}
