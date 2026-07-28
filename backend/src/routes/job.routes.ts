import { Router } from "express";
import { storageService } from "../services/storage.service";
import { dbService } from "../services/db.service";
import { videoService, adjustSubtitleTimestamps } from "../services/video.service";
import { clipJobQueue } from "../services/job-queue.service";
import { jobRuntime } from "../services/job-runtime.service";
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
import { CODEC_CONFIGS, CodecId } from "../utils/codec-config";

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

function isTerminalStatus(status: string | undefined): boolean {
    return status === "ready" || status === "error" || status === "cancelled";
}

async function publishJobUpdate(id: string, data: JobUpdate): Promise<void> {
    const isTerminal = isTerminalStatus(data.status);
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

    // Progress ticks: SSE only — skip SQLite on every 1% (was a major I/O tax during long downloads)
    if (progressOnly) {
        const snap = terminalJobs.has(id) ? null : getOrCreateSnapshot(id);
        if (snap) {
            snap.progress = data.progress ?? snap.progress;
            jobEvents.emit(id, snapshotToPayload(snap));
        }
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

    if (isTerminalStatus(snap.status)) {
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
    const { url, startTime, endTime, subtitles, formatId, userId, codec: reqCodec } = req.body || {};
    if (!url || !startTime || !endTime || !userId) {
        return res.status(400).json({ error: "url, startTime, endTime and userId are required" });
    }

    const codec: CodecId = (reqCodec === "vp9" || reqCodec === "av1") ? reqCodec : "h264";
    const codecConfig = CODEC_CONFIGS[codec] || CODEC_CONFIGS.h264;
    const ext = codecConfig.container;

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
        await dbService.createJob(id, userId, codec);
        getOrCreateSnapshot(id);
        await publishJobUpdate(id, { stage: "queued" });
    } catch (error) {
        console.error("Job creation error:", error);
        return res.status(500).json({ error: "Failed to create job" });
    }

    const controller = new AbortController();
    jobRuntime.register(id, controller);

    clipJobQueue
        .add(id, async () => {
            let lastSentProgress = 0;
            let lastProgressWrite = 0;
            let progressChain: Promise<void> = Promise.resolve();
            const updateProgress = (p: number) => {
                if (terminalJobs.has(id)) return;
                const next = Math.max(0, Math.min(100, Math.round(p)));
                if (next < 100 && next <= lastSentProgress) return;
                const now = Date.now();
                if (next < 100 && next - lastSentProgress < 2 && now - lastProgressWrite < 1000) {
                    return;
                }
                lastSentProgress = next;
                lastProgressWrite = now;
                progressChain = progressChain
                    .then(() => publishJobUpdate(id, { progress: next }))
                    .catch((err) => console.warn(`Progress update failed for ${id}:`, err));
            };

            let finalJobStatus: JobUpdate = {};
            const clipSec = Math.max(1, endSec - startSec);
            const jobTimeoutMs = Math.min(
                30 * 60 * 1000,
                Math.max(10 * 60 * 1000, Math.round(clipSec * 2500) + 4 * 60 * 1000)
            );
            const timeoutId = setTimeout(() => {
                jobRuntime.abort(id, "timeout");
            }, jobTimeoutMs);

            try {
                if (controller.signal.aborted || jobRuntime.getReason(id) === "user") {
                    throw new Error("Cancelled");
                }

                const durationSeconds = endSec - startSec;

                await publishJobUpdate(id, { stage: "downloading" });
                const {
                    outputPath: inputPath,
                    sectionStartTime,
                    cutStartSec,
                    durationSec: clipDurationSec,
                    needsPostProcess,
                } = await videoService.downloadAndClip(id, {
                    url,
                    startTime,
                    endTime,
                    subtitles,
                    formatId,
                    codecId: codec,
                    signal: controller.signal,
                    onProgress: updateProgress,
                });

                const storagePath = `clip-${id}.${ext}`;
                let publicUrl: string;

                if (!needsPostProcess) {
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
                    const fastPath = path.join(UPLOADS_DIR, `clip-${id}-fast.${ext}`);
                    const subPath = inputPath.replace(new RegExp(`\\.${ext}$`), ".en.vtt");
                    const subtitlesExist = !!(subtitles && fs.existsSync(subPath));

                    if (subtitlesExist) {
                        const adjustedSubPath = path.join(UPLOADS_DIR, `clip-${id}-adjusted.vtt`);
                        await adjustSubtitleTimestamps(subPath, adjustedSubPath, sectionStartTime);
                        await fs.promises.rename(adjustedSubPath, subPath);
                    }

                    await publishJobUpdate(id, { stage: "processing" });
                    await videoService.processWithFFmpeg(inputPath, fastPath, {
                        subtitles: subtitlesExist,
                        subPath: subtitlesExist ? subPath : undefined,
                        codecId: codec,
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
                    publicUrl = await storageService.finalizeLocalFile(`clip-${id}-fast.${ext}`, storagePath);
                }

                finalJobStatus = {
                    storage_path: storagePath,
                    public_url: publicUrl,
                    status: "ready",
                    stage: "done",
                    progress: 100,
                };
            } catch (err: any) {
                const message = err?.message || String(err);
                const abortReason = jobRuntime.getReason(id);
                // Cancel raced a finish: another path already published ready/error
                if (terminalJobs.has(id)) {
                    finalJobStatus = {};
                } else if (abortReason === "user" || message === "Cancelled") {
                    finalJobStatus = {
                        status: "cancelled",
                        error: "Cancelled by user",
                    };
                } else if (abortReason === "timeout" || message === "Aborted") {
                    const limitMins = Math.max(1, Math.round(jobTimeoutMs / 60_000));
                    finalJobStatus = {
                        status: "error",
                        error: `Job timed out (limit: ${limitMins} min)`,
                    };
                } else {
                    finalJobStatus = { status: "error", error: message };
                }
                if (finalJobStatus.status) {
                    await deleteJobArtifacts(id);
                }
            } finally {
                clearTimeout(timeoutId);
                jobRuntime.unregister(id);
                // Drain in-flight progress before terminal publish so SSE cannot flicker
                await progressChain.catch(() => undefined);
                // Skip if cancel/finish already published a terminal status
                if (!terminalJobs.has(id) && finalJobStatus.status) {
                    await publishJobUpdate(id, finalJobStatus);
                }
                if (finalJobStatus.status === "ready") {
                    scheduleJobCleanup(id, DOWNLOAD_URL_TTL_SECONDS * 1000);
                }
                // Allow snapshot reuse if the same id is ever recycled (unlikely)
                setTimeout(() => terminalJobs.delete(id), DOWNLOAD_URL_TTL_SECONDS * 1000 + 60_000).unref?.();
            }
        })
        .catch(async (err) => {
            // Queued job removed via cancel — ensure terminal status if cancel route raced
            if (err instanceof Error && err.message === "Cancelled") {
                jobRuntime.unregister(id);
                if (!terminalJobs.has(id)) {
                    await deleteJobArtifacts(id);
                    await publishJobUpdate(id, {
                        status: "cancelled",
                        error: "Cancelled by user",
                    });
                }
                return;
            }
            console.error(`Unhandled clip job queue error for ${id}:`, err);
            jobRuntime.unregister(id);
        });

    return res.status(202).json({ id });
});

router.post("/clip/:id/cancel", async (req, res) => {
    const id = req.params.id;
    const job = await dbService.getJob(id);
    if (!job) return res.status(404).json({ error: "job not found" });

    // Also honor in-memory snapshot (may be ahead of a slow DB read race)
    const snapStatus = jobSnapshots.get(id)?.status ?? job.status;
    if (isTerminalStatus(snapStatus) || isTerminalStatus(job.status)) {
        const status = isTerminalStatus(snapStatus) ? snapStatus : job.status;
        if (status === "ready") {
            return res.json({
                success: true,
                status: "ready",
                alreadyFinished: true,
                message: "Clip already finished — nothing to cancel.",
            });
        }
        if (status === "cancelled") {
            return res.json({
                success: true,
                status: "cancelled",
                alreadyFinished: true,
                message: "Job was already cancelled.",
            });
        }
        return res.json({
            success: true,
            status: "error",
            alreadyFinished: true,
            message: job.error || "Job already failed — nothing to cancel.",
        });
    }

    const removedFromQueue = clipJobQueue.cancel(id);
    const abortedRunning = jobRuntime.abort(id, "user");

    if (removedFromQueue || !abortedRunning) {
        // Still queued, or nothing running: publish cancelled now
        await deleteJobArtifacts(id);
        await publishJobUpdate(id, {
            status: "cancelled",
            error: "Cancelled by user",
        });
        jobRuntime.unregister(id);
    }
    // If abortedRunning: worker catch publishes cancelled after process tree kill

    return res.json({
        success: true,
        status: "cancelled",
        message: "Cancelling — stopping download.",
    });
});

function mergeJobPayload(id: string, job: NonNullable<Awaited<ReturnType<typeof dbService.getJob>>>): JobEventPayload {
    const snap = jobSnapshots.get(id);
    return {
        status: snap?.status ?? job.status,
        stage: snap?.stage ?? job.stage,
        progress: snap?.progress ?? job.progress ?? 0,
        error: snap?.error ?? job.error,
        url: clientDownloadUrl(snap?.public_url ?? job.public_url),
        storagePath: snap?.storage_path ?? job.storage_path,
    };
}

router.get("/clip/:id", async (req, res) => {
    const job = await dbService.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: "job not found" });

    const payload = mergeJobPayload(req.params.id, job);
    return res.json({
        status: payload.status,
        stage: payload.stage,
        progress: payload.progress,
        error: payload.error,
        url: payload.url,
        storagePath: payload.storagePath,
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

    send(mergeJobPayload(req.params.id, job));

    if (isTerminalStatus(job.status)) {
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
        if (isTerminalStatus(payload.status)) {
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
