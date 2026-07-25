import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { dbService } from "../services/db.service";
import { storageService } from "../services/storage.service";
import { app } from "../app";

before(() => {
    dbService.createJob = async () => {};
    dbService.updateJob = async () => {};
    dbService.getJob = async (id: string) => {
        if (id === "existing-job") {
            return {
                id: "existing-job",
                status: "processing",
                progress: 50,
                stage: "processing",
                user_id: "test-user",
                error: null,
                public_url: null,
                storage_path: null,
                created_at: Date.now(),
            } as Awaited<ReturnType<typeof dbService.getJob>>;
        }
        if (id === "ready-job") {
            return {
                id: "ready-job",
                status: "ready",
                progress: 100,
                stage: "done",
                user_id: "test-user",
                error: null,
                public_url: "http://localhost:3001/uploads/clip.mp4",
                storage_path: "clip.mp4",
                created_at: Date.now(),
            } as Awaited<ReturnType<typeof dbService.getJob>>;
        }
        return undefined;
    };
    dbService.deleteJob = async () => {};
    storageService.deleteFile = async () => {};
});

const AUTH_HEADER = { Authorization: "Bearer dev-secret" };

describe("Job Routes", () => {
    it("POST /api/clip accepts valid request", async () => {
        const response = await request(app)
            .post("/api/clip")
            .set(AUTH_HEADER)
            .send({
                url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                startTime: "00:00:10",
                endTime: "00:00:20",
                userId: "test-user",
            });

        assert.equal(response.status, 202);
        assert.ok(response.body.id);
    });

    it("POST /api/clip validates input", async () => {
        const response = await request(app)
            .post("/api/clip")
            .set(AUTH_HEADER)
            .send({ url: "invalid-url" });

        assert.equal(response.status, 400);
    });

    it("GET /api/clip/:id returns job status", async () => {
        const response = await request(app)
            .get("/api/clip/existing-job")
            .set(AUTH_HEADER);

        assert.equal(response.status, 200);
        assert.equal(response.body.status, "processing");
        assert.equal(response.body.progress, 50);
    });

    it("DELETE /api/clip/:id/cleanup removes job", async () => {
        const response = await request(app)
            .delete("/api/clip/ready-job/cleanup")
            .set(AUTH_HEADER);

        assert.equal(response.status, 200);
        assert.equal(response.body.success, true);
    });

    it("POST /api/clip/:id/cancel cancels a processing job", async () => {
        const response = await request(app)
            .post("/api/clip/existing-job/cancel")
            .set(AUTH_HEADER);

        assert.equal(response.status, 200);
        assert.equal(response.body.success, true);
        assert.equal(response.body.status, "cancelled");
    });

    it("POST /api/clip/:id/cancel reports already finished for ready jobs", async () => {
        const response = await request(app)
            .post("/api/clip/ready-job/cancel")
            .set(AUTH_HEADER);

        assert.equal(response.status, 200);
        assert.equal(response.body.status, "ready");
        assert.equal(response.body.alreadyFinished, true);
        assert.match(response.body.message, /already finished/i);
    });
});
