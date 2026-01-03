import { NextResponse } from "next/server";
import db from "@/lib/db";
import { clips } from "@/lib/schema";
import { eq, desc } from "drizzle-orm";

export async function GET() {
    const userId = "personal-user";

    try {
        const userClips = await db
            .select()
            .from(clips)
            .where(eq(clips.userId, userId))
            .orderBy(desc(clips.createdAt));

        return NextResponse.json({ clips: userClips });
    } catch (error) {
        console.error("Error fetching clips:", error);
        return NextResponse.json({ error: "Failed to fetch clips" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    // SECURITY: Authentication bypassed for personal use.
    const userId = "personal-user";

    try {
        const body = await req.json();
        const { id, url, title, startTime, endTime, publicUrl, thumbnail } = body;

        if (!id || !url || !title || !startTime || !endTime || !publicUrl) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        await db.insert(clips).values({
            id,
            userId,
            url,
            title,
            startTime,
            endTime,
            publicUrl,
            thumbnail,
            createdAt: new Date(),
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error saving clip:", error);
        return NextResponse.json({ error: "Failed to save clip" }, { status: 500 });
    }
}
