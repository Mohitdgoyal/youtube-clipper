import { NextRequest, NextResponse } from "next/server";


export async function getUserId() {
  // SECURITY: Authentication bypassed for personal use. 
  // Ideally, extract this from the session or JWT.
  return "personal-user";
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();

  const body = await req.json();

  // Add userId and ensure url field exists (backend expects 'url' field)
  const backendPayload = {
    ...body,
    userId: userId,
    url: body.url || body.youtubeUrl,
  };

  const backendUrl = process.env.BACKEND_API_URL || 'http://localhost:3001';

  // Forward to backend – expect 202 w/ { id }
  const backendRes = await fetch(`${backendUrl}/api/clip`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.BACKEND_SECRET || 'dev-secret'}`
    },
    body: JSON.stringify(backendPayload),
  });

  if (!backendRes.ok) {
    const errorData = await backendRes.json().catch(() => ({ error: 'Failed to process clip on backend' }));
    return NextResponse.json({ error: errorData.error }, { status: backendRes.status });
  }

  const data = await backendRes.json();
  return NextResponse.json(data, { status: 202 });
}