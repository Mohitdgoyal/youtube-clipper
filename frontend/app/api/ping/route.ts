import { NextResponse } from "next/server";
import { backendFetch } from "@/lib/backend-client";

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const res = await backendFetch('/api/ping', { cache: "no-store" });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("[ping] backend request failed", err);
    return NextResponse.json({ success: false }, { status: 502 });
  }
}
