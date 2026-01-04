import { describe, it, expect, mock } from "bun:test";
import request from "supertest";
import { app } from "../app";

// Mock metadataService
mock.module("../services/metadata.service", () => ({
    metadataService: {
        getVideoInfo: mock((url: string) => Promise.resolve({
            id: "test-video-id",
            title: "Test Video",
            formats: [
                { format_id: "137", ext: "mp4", height: 1080, width: 1920, vcodec: "avc1", acodec: "none", fps: 30 },
                { format_id: "140", ext: "m4a", height: 0, vcodec: "none", acodec: "mp4a" }
            ],
            thumbnail: "http://example.com/thumb.jpg",
            duration: 120,
            webpage_url: "http://youtube.com/watch?v=test"
        }))
    }
}));

const AUTH_HEADER = { Authorization: "Bearer dev-secret" };

describe("Format Routes", () => {
    it("GET /api/info returns metadata", async () => {
        const response = await request(app)
            .get("/api/info?url=http://youtube.com/watch?v=test")
            .set(AUTH_HEADER)
            .expect(200);

        expect(response.body).toEqual({
            title: "Test Video",
            thumbnail: "http://example.com/thumb.jpg",
            duration: 120,
            webpage_url: "http://youtube.com/watch?v=test"
        });
    });

    it("GET /api/formats returns processed formats", async () => {
        const response = await request(app)
            .get("/api/formats?url=http://youtube.com/watch?v=test")
            .set(AUTH_HEADER);

        console.log("Formats Body:", JSON.stringify(response.body, null, 2));
        console.log("Formats Status:", response.status);

        expect(response.status).toBe(200);

        expect(response.body.formats).toBeDefined();
        // 137 is video-only, 140 is audio-only. Logic combines them.
        expect(response.body.formats.length).toBeGreaterThan(0);
        const format = response.body.formats.find((f: any) => f.label.startsWith("1080p"));
        expect(format).toBeDefined();
        expect(format.format_id).toContain("+bestaudio");
    });

    it("GET /api/formats requires url", async () => {
        await request(app)
            .get("/api/formats")
            .set(AUTH_HEADER)
            .expect(400);
    });

    it("GET /api/formats requires auth", async () => {
        await request(app)
            .get("/api/formats?url=test")
            .expect(401);
    });
});
