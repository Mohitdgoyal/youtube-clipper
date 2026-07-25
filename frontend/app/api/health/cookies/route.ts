import { NextResponse } from "next/server";
import { backendFetch } from "@/lib/backend-client";

export async function GET() {
  const backendRes = await backendFetch("/api/health/cookies");
  const data = await backendRes.json().catch(() => ({
    ok: false,
    present: false,
    source: "none",
    message: "Could not check cookies",
  }));
  if (!backendRes.ok) {
    return NextResponse.json(data, { status: backendRes.status });
  }
  return NextResponse.json(data);
}
