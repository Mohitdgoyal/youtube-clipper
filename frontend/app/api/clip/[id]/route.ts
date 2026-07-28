import { NextResponse } from "next/server";
import { backendFetch } from "@/lib/backend-client";

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const url = new URL(request.url);
  // Preserve query string
  const target = `/api/clip/${id}${url.search}`;

  const backendRes = await backendFetch(target);

  if (!backendRes.ok) {
    const text = await backendRes.text();
    try {
      const json = JSON.parse(text);
      return NextResponse.json(json, { status: backendRes.status });
    } catch {
      return NextResponse.json({ error: text || backendRes.statusText }, { status: backendRes.status });
    }
  }

  try {
    const json = await backendRes.json();
    return NextResponse.json({
      ...json,
      stage: json.stage
    }, { status: backendRes.status });
  } catch {
    return NextResponse.json({ error: "Invalid JSON from backend" }, { status: 502 });
  }
}
