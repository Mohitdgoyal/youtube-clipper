import { NextResponse } from "next/server";
import { backendFetch } from "@/lib/backend-client";
import { secondsToTime } from "@/lib/utils";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  try {
    const response = await backendFetch(`/api/video?url=${encodeURIComponent(url)}`);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({
        error: "Failed to fetch video info from backend",
      }));
      return NextResponse.json(errorData, { status: response.status });
    }

    const data = await response.json();

    return NextResponse.json(
      {
        title: data.title,
        description: "",
        image: data.thumbnail,
        duration: data.duration ? secondsToTime(data.duration) : null,
        formats: data.formats || [],
        availableCodecs: data.availableCodecs || ["h264"],
        formatsByCodec: data.formatsByCodec || { h264: data.formats || [], vp9: [], av1: [] },
        storyboards: data.storyboards || null,
      },
      {
        headers: {
          "Cache-Control": "private, max-age=60, stale-while-revalidate=300",
        },
      }
    );
  } catch (error) {
    console.error("Error fetching video info:", error);
    return NextResponse.json({ error: "Failed to fetch video info" }, { status: 500 });
  }
}
