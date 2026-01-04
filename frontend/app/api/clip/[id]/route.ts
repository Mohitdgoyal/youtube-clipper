import { NextResponse } from "next/server";
import { getBackendUrl } from "@/lib/backend-client";

const BACKEND_SECRET = process.env.BACKEND_SECRET || 'dev-secret';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const backendUrl = getBackendUrl();
  const backendBase = `${backendUrl}/api/clip/${id}`;
  const url = new URL(request.url);
  // Preserve query string (e.g. ?download=1)
  const target = backendBase + url.search;

  const backendRes = await fetch(target, {
    headers: {
      "Authorization": `Bearer ${BACKEND_SECRET}`
    }
  });

  // If this is the download request (?download=1) we need to pipe the stream & headers
  if (url.searchParams.get("download") === "1") {
    const headers = new Headers();
    backendRes.headers.forEach((value, key) => {
      if ([
        "content-type",
        "content-length",
        "content-disposition",
        "cache-control",
      ].includes(key.toLowerCase())) {
        headers.set(key, value);
      }
    });
    return new NextResponse(backendRes.body, {
      status: backendRes.status,
      headers,
    });
  }

  // Otherwise it's a polling request; just forward the JSON status
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
