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
    const response = await backendFetch(`/api/info?url=${encodeURIComponent(url)}`);

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to fetch metadata from backend" },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Map backend response to what frontend expects
    const metadata = {
      title: data.title,
      description: "",
      image: data.thumbnail,
      duration: data.duration ? secondsToTime(data.duration) : null,
    };

    return NextResponse.json(metadata);
  } catch (error) {
    console.error("Error fetching metadata:", error);
    return NextResponse.json(
      { error: "Failed to fetch metadata" },
      { status: 500 }
    );
  }
}
