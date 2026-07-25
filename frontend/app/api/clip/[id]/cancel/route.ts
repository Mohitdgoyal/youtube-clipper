import { NextRequest, NextResponse } from "next/server";
import { backendFetch } from "@/lib/backend-client";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const backendRes = await backendFetch(`/api/clip/${id}/cancel`, {
    method: "POST",
  });

  const data = await backendRes.json().catch(() => ({ error: "Cancel failed" }));
  if (!backendRes.ok) {
    return NextResponse.json(
      { error: data.error || "Cancel failed" },
      { status: backendRes.status }
    );
  }
  return NextResponse.json(data);
}
