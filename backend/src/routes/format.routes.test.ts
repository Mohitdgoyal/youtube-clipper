import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { metadataService } from "../services/metadata.service";
import { app } from "../app";

before(() => {
    metadataService.getVideoInfo = async () =>
        ({
            title: "Test Video",
            thumbnail: "https://example.com/thumb.jpg",
            duration: 120,
            webpage_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            formats: [
                {
                    format_id: "137",
                    ext: "mp4",
                    height: 1080,
                    width: 1920,
                    vcodec: "avc1.640028",
                    acodec: "none",
                    fps: 30,
                },
            ],
        }) as Awaited<ReturnType<typeof metadataService.getVideoInfo>>;
});

const AUTH_HEADER = { Authorization: "Bearer dev-secret" };

describe("Video route", () => {
    it("GET /api/video returns metadata and formats", async () => {
        const response = await request(app)
            .get("/api/video?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ")
            .set(AUTH_HEADER);

        assert.equal(response.status, 200);
        assert.equal(response.body.title, "Test Video");
        assert.ok(Array.isArray(response.body.formats));
    });

    it("GET /api/video requires url", async () => {
        const response = await request(app).get("/api/video").set(AUTH_HEADER);
        assert.equal(response.status, 400);
    });

    it("GET /api/video requires auth", async () => {
        const response = await request(app).get(
            "/api/video?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        );
        assert.equal(response.status, 401);
    });
});
