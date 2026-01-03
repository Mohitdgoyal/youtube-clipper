import { NextResponse } from "next/server";
import db from "@/lib/db";
import { user } from "@/lib/schema";
import { eq, sql } from "drizzle-orm";

export async function GET() {
    const userId = "personal-user";

    const userData = await db
        .select({ downloadCount: user.downloadCount })
        .from(user)
        .where(eq(user.id, userId))
        .limit(1);

    return NextResponse.json({ downloadCount: parseInt(userData[0]?.downloadCount || '0') });
}

export async function POST() {
    const userId = "personal-user";

    // Ensure user exists (personal-user might not exist in a fresh DB)
    const existingUser = await db.select().from(user).where(eq(user.id, userId)).limit(1);

    if (existingUser.length === 0) {
        await db.insert(user).values({
            id: userId,
            name: "Personal User",
            email: "personal@clippa.in",
            emailVerified: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            downloadCount: "1"
        });
    } else {
        await db
            .update(user)
            .set({
                downloadCount: sql`CAST(COALESCE(CAST(${user.downloadCount} AS INTEGER), 0) + 1 AS TEXT)`
            })
            .where(eq(user.id, userId));
    }

    return NextResponse.json({ success: true });
}
