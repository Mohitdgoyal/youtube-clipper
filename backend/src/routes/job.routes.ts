import { Router } from "express";
import { storageService } from "../services/storage.service";
import { dbService } from "../services/db.service";
import { videoService, adjustSubtitleTimestamps } from "../services/video.service";
import { clipJobQueue } from "../services/job-queue.service";
import { jobEvents, JobEventPayload } from "../services/job-events.service";
import { UPLOADS_DIR, DOWNLOAD_URL_TTL_SECONDS } from "../constants";
import path from "path";
import fs from "fs";

import { createJobId } from "../utils/ids";
import { timeToSeconds } from "../utils/time";
import { isAllowedYouTubeUrl } from "../utils/youtube-url";
import { deleteJobArtifacts } from "../utils/job-files";
import { rateLimit } from "../middleware/rate-limit.middleware";
import { JobUpdate } from "../types/job";

const router = Router();

function clientDownloadUrl(publicUrl: string | null | undefined): string | null {
    if (!publicUrl) return null;
    return storageService.signPublicUrl(publicUrl);
}

function scheduleJobCleanup(id: string, delayMs: number) {
    const timer = setTimeout(async () => {
        try {
            const job = await dbService.getJob(id);
            if (!job) return;
            if (job.storage_path) {
                await storageService.deleteFile(job.storage_path);
            }
            await deleteJobArtifacts(id);
            await dbService.deleteJob(id);
            console.log(`Auto-cleaned job ${id} after ${Math.round(delayMs / 1000)}s TTL`);
        } catch (err) {
            console.warn(`Auto-cleanup failed for ${id}:`, err);
        }
    }, delayMs);
    timer.unref?.();
}

type JobSnapshot = {
    status: string;
    stage: string | null;
    progress: number;
    error: string | null;
    public_url: string | null;
    storage_path: string | null;
};

const jobSnapshots = new Map<string, JobSnapshot>();
/** Jobs that already emitted ready/error — ignore late progress-only publishes */
const terminalJobs = new Set<string>();

function getOrCreateSnapshot(id: string): JobSnapshot | null {
    if (terminalJobs.has(id)) return null;
    let snap = jobSnapshots.get(id);
    if (!snap) {
        snap = {
            status: "processing",
            stage: null,
            progress: 0,
            error: null,
            public_url: null,
            storage_path: null,
        };
        jobSnapshots.set(id, snap);
    }
    return snap;
}

function snapshotToPayload(snap: JobSnapshot): JobEventPayload {
    return {
        status: snap.status,
        stage: snap.stage,
        progress: snap.progress,
        error: snap.error,
        url: clientDownloadUrl(snap.public_url),
        storagePath: snap.storage_path,
    };
}

async function publishJobUpdate(id: string, data: JobUpdate): Promise<void> {
    const isTerminal =
        data.status === "ready" || data.status === "error";
    const progressOnly =
        data.progress !== undefined &&
        data.status === undefined &&
        data.stage === undefined &&
        data.error === undefined &&
        data.public_url === undefined &&
        data.storage_path === undefined;

    // Late throttled progress must not resurrect a finished job as "processing"
    if (progressOnly && terminalJobs.has(id)) {
        return;
    }

    await dbService.updateJob(id, data);

    // Merge into snapshot before marking terminal (getOrCreateSnapshot nulls after terminal)
    const snap = terminalJobs.has(id) ? null : getOrCreateSnapshot(id);
    if (!snap) {
        if (isTerminal) {
            terminalJobs.add(id);
            jobEvents.emit(id, {
                status: data.status!,
                stage: data.stage ?? null,
                progress: data.progress ?? (data.status === "ready" ? 100 : 0),
                error: data.error ?? null,
                url: clientDownloadUrl(data.public_url),
                storagePath: data.storage_path ?? null,
            });
        }
        return;
    }

    if (data.status !== undefined) snap.status = data.status;
    if (data.stage !== undefined) snap.stage = data.stage ?? null;
    if (data.progress !== undefined) snap.progress = data.progress ?? 0;
    if (data.error !== undefined) snap.error = data.error ?? null;
    if (data.public_url !== undefined) snap.public_url = data.public_url ?? null;
    if (data.storage_path !== undefined) snap.storage_path = data.storage_path ?? null;
    jobEvents.emit(id, snapshotToPayload(snap));

    if (snap.status === "ready" || snap.status === "error") {
        terminalJobs.add(id);
        jobSnapshots.delete(id);
    }
}

function toEventPayload(job: NonNullable<Awaited<ReturnType<typeof dbService.getJob>>>): JobEventPayload {
    return {
        status: job.status,
        stage: job.stage,
        progress: job.progress ?? 0,
        error: job.error,
        url: clientDownloadUrl(job.public_url),
        storagePath: job.storage_path,
    };
}

router.post("/clip", rateLimit({ windowMs: 60_000, max: 10, name: "clip" }), async (req, res) => {
    const { url, startTime, endTime, subtitles, formatId, userId } = req.body || {};
    if (!url || !startTime || !endTime || !userId) {
        return res.status(400).json({ error: "url, startTime, endTime and userId are required" });
    }

    const startSec = timeToSeconds(startTime);
    const endSec = timeToSeconds(endTime);

    if (isNaN(startSec) || isNaN(endSec) || startSec >= endSec) {
        return res.status(400).json({ error: "Invalid timestamps: endTime must be greater than startTime" });
    }

    if (!isAllowedYouTubeUrl(url)) {
        return res.status(400).json({ error: "Only YouTube URLs are allowed" });
    }

    const id = createJobId();

    try {
        await dbService.createJob(id, userId);
        getOrCreateSnapshot(id);
        await publishJobUpdate(id, { stage: "queued" });
    } catch (error) {
        console.error("Job creation error:", error);
        return res.status(500).json({ error: "Failed to create job" });
    }

    clipJobQueue.add(async () => {
        let finalJobStatus: JobUpdate = {};
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            controller.abort();
        }, 10 * 60 * 1000);

        let lastProgressWrite = 0;
        let lastSentProgress = 0;
        let progressChain: Promise<void> = Promise.resolve();
        const updateProgress = (p: number) => {
            if (terminalJobs.has(id)) return;
            const next = Math.max(0, Math.min(100, Math.round(p)));
            const now = Date.now();
            // Never throttle backwards or terminal 100; allow any forward jump ≥2 or after 500ms
            if (next < 100 && next <= lastSentProgress) return;
            if (
                next < 100 &&
                next - lastSentProgress < 1 &&
                now - lastProgressWrite < 300
            ) {
                return;
            }
            lastSentProgress = next;
            lastProgressWrite = now;
            progressChain = progressChain
                .then(() => publishJobUpdate(id, { progress: next }))
                .catch((err) => console.warn(`Progress update failed for ${id}:`, err));
        };

        try {
            const durationSeconds = endSec - startSec;

            await publishJobUpdate(id, { stage: "downloading" });
            const {
                outputPath: inputPath,
                sectionStartTime,
                cutStartSec,
                durationSec: clipDurationSec,
            } = await videoService.downloadAndClip(id, {
                url,
                startTime,
                endTime,
                subtitles,
                formatId,
                signal: controller.signal,
                onProgress: updateProgress,
            });

            const storagePath = `clip-${id}.mp4`;
            let publicUrl: string;

            if (!subtitles) {
                // yt-dlp already wrote the final clip — skip FFmpeg and -fast rename hop
                await publishJobUpdate(id, { stage: "processing" });
                const finalPath = path.join(UPLOADS_DIR, storagePath);
                if (inputPath !== finalPath && fs.existsSync(inputPath)) {
                    await fs.promises.rename(inputPath, finalPath);
                }
                lastProgressWrite = 0;
                updateProgress(100);
                await progressChain;
                publicUrl = storageService.getPublicUrl(storagePath);
            } else {
                const fastPath = path.join(UPLOADS_DIR, `clip-${id}-fast.mp4`);
                const subPath = inputPath.replace(/\.mp4$/, ".en.vtt");
                const subtitlesExist = fs.existsSync(subPath);

                if (subtitlesExist) {
                    const adjustedSubPath = path.join(UPLOADS_DIR, `clip-${id}-adjusted.vtt`);
                    // Align VTT to the padded section file, then FFmpeg -ss/-t precise-cuts.
                    await adjustSubtitleTimestamps(subPath, adjustedSubPath, sectionStartTime);
                    await fs.promises.rename(adjustedSubPath, subPath);
                }

                await publishJobUpdate(id, { stage: "processing" });
                await videoService.processWithFFmpeg(inputPath, fastPath, {
                    subtitles,
                    subPath: subtitlesExist ? subPath : undefined,
                    signal: controller.signal,
                    onProgress: updateProgress,
                    durationSeconds: clipDurationSec || durationSeconds,
                    cutStartSec,
                });

                await fs.promises.unlink(inputPath).catch((err) => {
                    console.warn(`Failed to cleanup input file ${inputPath}:`, err.message);
                });
                if (subtitlesExist) {
                    await fs.promises.unlink(subPath).catch((err) => {
                        console.warn(`Failed to cleanup subtitle file ${subPath}:`, err.message);
                    });
                }

                await progressChain;
                await publishJobUpdate(id, { stage: "uploading" });
                publicUrl = await storageService.finalizeLocalFile(`clip-${id}-fast.mp4`, storagePath);
            }

            finalJobStatus = {
                storage_path: storagePath,
                public_url: publicUrl,
                status: "ready",
                stage: "done",
                progress: 100,
            };
        } catch (err: any) {
            if (err.message === "Aborted") {
                finalJobStatus = { status: "error", error: "Job timed out (limit: 10 mins)" };
            } else {
                finalJobStatus = { status: "error", error: err.message };
            }
            await deleteJobArtifacts(id);
        } finally {
            clearTimeout(timeoutId);
            // Drain in-flight progress before terminal publish so SSE cannot flicker
            await progressChain.catch(() => undefined);
            await publishJobUpdate(id, finalJobStatus);
            if (finalJobStatus.status === "ready") {
                scheduleJobCleanup(id, DOWNLOAD_URL_TTL_SECONDS * 1000);
            }
            // Allow snapshot reuse if the same id is ever recycled (unlikely)
            setTimeout(() => terminalJobs.delete(id), DOWNLOAD_URL_TTL_SECONDS * 1000 + 60_000).unref?.();
        }
    }).catch((err) => {
        console.error(`Unhandled clip job queue error for ${id}:`, err);
    });

    return res.status(202).json({ id });
});

router.get("/clip/:id", async (req, res) => {
    const job = await dbService.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: "job not found" });

    return res.json({
        status: job.status,
        stage: job.stage,
        progress: job.progress ?? 0,
        error: job.error,
        url: clientDownloadUrl(job.public_url),
        storagePath: job.storage_path,
    });
});

router.get("/clip/:id/events", async (req, res) => {
    const job = await dbService.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: "job not found" });

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    if (typeof (res as any).flushHeaders === "function") {
        (res as any).flushHeaders();
    }

    const send = (payload: JobEventPayload) => {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    send(toEventPayload(job));

    if (job.status === "ready" || job.status === "error") {
        res.write("event: end\ndata: {}\n\n");
        return res.end();
    }

    let closed = false;
    const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
    };

    const unsubscribe = jobEvents.subscribe(req.params.id, (payload) => {
        if (closed) return;
        send(payload);
        if (payload.status === "ready" || payload.status === "error") {
            res.write("event: end\ndata: {}\n\n");
            cleanup();
            res.end();
        }
    });

    const heartbeat = setInterval(() => {
        if (!closed) {
            res.write(": heartbeat\n\n");
        }
    }, 15_000);

    req.on("close", cleanup);
});

router.delete("/clip/:id/cleanup", async (req, res) => {
    const job = await dbService.getJob(req.params.id);
    if (job && job.storage_path) {
        await storageService.deleteFile(job.storage_path);
    }
    await deleteJobArtifacts(req.params.id);
    await dbService.deleteJob(req.params.id);
    return res.json({ success: true });
});

export default router;
