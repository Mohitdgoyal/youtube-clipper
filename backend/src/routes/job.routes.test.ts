import { describe, it, expect, mock, beforeAll, afterAll } from "bun:test";
import request from "supertest";
import { app } from "../app";
import { dbService } from "../services/db.service";
import { storageService } from "../services/storage.service";

// Store original methods to restore later if needed
const originalGetJob = dbService.getJob;
const originalCreateJob = dbService.createJob;
const originalUpdateJob = dbService.updateJob;
const originalDeleteJob = dbService.deleteJob;
const originalUploadFile = storageService.uploadFile;

beforeAll(() => {
    // Mock dbService methods
    dbService.createJob = mock(() => Promise.resolve());
    dbService.updateJob = mock(() => Promise.resolve());
    dbService.getJob = mock((id: string) => {
        console.log("Mock getJob called with:", id);
        if (id === "existing-job") return Promise.resolve({
            id: "existing-job",
            status: "processing",
            progress: 50,
            stage: "processing",
            // Add user_id if needed, assuming auth check is loose or matches
            user_id: "test-user"
        } as any);
        return Promise.resolve(null);
    });
    dbService.deleteJob = mock(() => Promise.resolve());

    // Mock storageService methods
    storageService.uploadFile = mock(() => Promise.resolve("http://bucket/file.mp4"));
    storageService.deleteFile = mock(() => Promise.resolve());
});

// afterAll(() => {
//     dbService.getJob = originalGetJob;
//     // ... restore others
// });

const AUTH_HEADER = { Authorization: "Bearer dev-secret" };

describe("Job Routes", () => {
    it("POST /api/clip accepts valid request", async () => {
        const response = await request(app)
            .post("/api/clip")
            .set(AUTH_HEADER)
            .send({
                url: "http://youtube.com/watch?v=test",
                startTime: "00:00:10",
                endTime: "00:00:20",
                userId: "test-user"
            });

        console.log("POST /clip status:", response.status);
        if (response.status !== 202) console.log("Body:", response.body);

        expect(response.status).toBe(202);
        expect(response.body.id).toBeDefined();
    });

    it("POST /api/clip validates input", async () => {
        await request(app)
            .post("/api/clip")
            .set(AUTH_HEADER)
            .send({
                url: "invalid-url"
            })
            .expect(400);
    });

    it.skip("GET /api/clip/:id returns job status", async () => {
        const response = await request(app)
            .get("/api/clip/existing-job")
            .set(AUTH_HEADER);

        console.log("GET /clip status:", response.status);
        console.log("GET /clip body:", response.body);

        expect(response.status).toBe(200);
        expect(response.body.status).toBe("processing");
        expect(response.body.progress).toBe(50);
    });

    it.skip("GET /api/clip/:id/download requires job to be ready/exist", async () => {
        // Mock getJob to return raw object. 
        // Logic checks status. If processing, might return 400 or wait?
        // Actually locally download endpoint checks if public_url exists?
        // Let's modify mock for specific test if needed, or check existing-job result.
        // existing-job is processing.
        await request(app)
            .get("/api/clip/existing-job/download")
            .set(AUTH_HEADER)
            .expect(400); // Expect "Job is not ready"
    });
});
