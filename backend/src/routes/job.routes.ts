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
import { rateLimit } from "../middleware/rate-limit.middleware";
import { JobUpdate } from "../types/job";

const router = Router();

function clientDownloadUrl(publicUrl: string | null | undefined): string | null {
    if (!publicUrl) return null;
    return storageService.signPublicUrl(publicUrl);
}

/** Delete job row + file after signed URL TTL so slow downloads aren't raced. */
function scheduleJobCleanup(id: string, delayMs: number) {
    const timer = setTimeout(async () => {
        try {
            const job = await dbService.getJob(id);
            if (!job) return;
            if (job.storage_path) {
                await storageService.deleteFile(job.storage_path);
            }
            await dbService.deleteJob(id);
            console.log(`Auto-cleaned job ${id} after ${Math.round(delayMs / 1000)}s TTL`);
        } catch (err) {
            console.warn(`Auto-cleanup failed for ${id}:`, err);
        }
    }, delayMs);
    timer.unref?.();
}

async function publishJobUpdate(id: string, data: JobUpdate): Promise<void> {
    await dbService.updateJob(id, data);
    const job = await dbService.getJob(id);
    if (!job) return;

    const payload: JobEventPayload = {
        status: job.status,
        stage: job.stage,
        progress: job.progress ?? 0,
        error: job.error,
        url: clientDownloadUrl(job.public_url),
        storagePath: job.storage_path,
    };
    jobEvents.emit(id, payload);
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
        await publishJobUpdate(id, { stage: 'queued' });
    } catch (error) {
        console.error('Job creation error:', error);
        return res.status(500).json({ error: 'Failed to create job' });
    }

    // Process via concurrency-limited queue (default 2 workers)
    clipJobQueue.add(async () => {
        let finalJobStatus: JobUpdate = {};
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            controller.abort();
        }, 10 * 60 * 1000); // 10 minutes

        try {
            const durationSeconds = endSec - startSec;

            // Throttle progress DB writes (~500ms); always flush 0/100 immediately
            let lastProgressWrite = 0;
            const updateProgress = async (p: number) => {
                const now = Date.now();
                if (p <= 0 || p >= 100 || now - lastProgressWrite >= 500) {
                    lastProgressWrite = now;
                    await publishJobUpdate(id, { progress: p });
                }
            };

            await publishJobUpdate(id, { stage: 'downloading' });
            const inputPath = await videoService.downloadAndClip(id, {
                url,
                startTime,
                endTime,
                subtitles,
                formatId,
                signal: controller.signal,
                onProgress: updateProgress
            });
            const fastPath = path.join(UPLOADS_DIR, `clip-${id}-fast.mp4`);

            // Optimization: If no subtitles are needed, we can skip the FFmpeg re-processing entirely
            // yt-dlp has already downloaded the clip in the correct format (mp4) thanks to our args.
            if (!subtitles) {
                await publishJobUpdate(id, { stage: 'processing' });
                // Just rename directly to fastPath
                await fs.promises.rename(inputPath, fastPath);
                await updateProgress(100);
            } else {
                // Subtitles processing path
                const subPath = inputPath.replace(/\.mp4$/, ".en.vtt");
                const subtitlesExist = fs.existsSync(subPath);

                if (subtitlesExist) {
                    const adjustedSubPath = path.join(UPLOADS_DIR, `clip-${id}-adjusted.vtt`);
                    await adjustSubtitleTimestamps(subPath, adjustedSubPath, startTime);
                    await fs.promises.rename(adjustedSubPath, subPath);
                }

                await publishJobUpdate(id, { stage: 'processing' });
                await videoService.processWithFFmpeg(inputPath, fastPath, {
                    subtitles,
                    subPath: subtitlesExist ? subPath : undefined,
                    signal: controller.signal,
                    onProgress: updateProgress,
                    durationSeconds
                });

                await fs.promises.unlink(inputPath).catch((err) => {
                    console.warn(`Failed to cleanup input file ${inputPath}:`, err.message);
                });
                if (subtitlesExist) {
                    await fs.promises.unlink(subPath).catch((err) => {
                        console.warn(`Failed to cleanup subtitle file ${subPath}:`, err.message);
                    });
                }
            }

            // Finalize in place — rename avoids a full-disk re-copy of the clip
            const storagePath = `clip-${id}.mp4`;
            await publishJobUpdate(id, { stage: 'uploading' });
            const publicUrl = await storageService.finalizeLocalFile(`clip-${id}-fast.mp4`, storagePath);

            finalJobStatus = {
                storage_path: storagePath,
                public_url: publicUrl,
                status: 'ready',
                stage: 'done',
                progress: 100
            };
        } catch (err: any) {
            if (err.message === 'Aborted') {
                finalJobStatus = { status: 'error', error: 'Job timed out (limit: 10 mins)' };
            } else {
                finalJobStatus = { status: 'error', error: err.message };
            }
        } finally {
            clearTimeout(timeoutId);
            await publishJobUpdate(id, finalJobStatus);
            // Keep file until signed URL expires (default 1h) — avoids racing slow downloads
            if (finalJobStatus.status === 'ready') {
                scheduleJobCleanup(id, DOWNLOAD_URL_TTL_SECONDS * 1000);
            }
        }
    }).catch((err) => {
        console.error(`Unhandled clip job queue error for ${id}:`, err);
    });

    return res.status(202).json({ id });
});

router.get("/clip/:id", async (req, res) => {
    const job = await dbService.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'job not found' });

    return res.json({
        status: job.status,
        stage: job.stage,
        progress: job.progress ?? 0,
        error: job.error,
        url: clientDownloadUrl(job.public_url),
        storagePath: job.storage_path
    });
});

/** Server-Sent Events stream for real-time job status / progress */
router.get("/clip/:id/events", async (req, res) => {
    const job = await dbService.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'job not found' });

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof (res as any).flushHeaders === 'function') {
        (res as any).flushHeaders();
    }

    const send = (payload: JobEventPayload) => {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    // Immediate snapshot so clients don't wait for the next write
    send(toEventPayload(job));

    if (job.status === 'ready' || job.status === 'error') {
        res.write('event: end\ndata: {}\n\n');
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
        if (payload.status === 'ready' || payload.status === 'error') {
            res.write('event: end\ndata: {}\n\n');
            cleanup();
            res.end();
        }
    });

    const heartbeat = setInterval(() => {
        if (!closed) {
            res.write(': heartbeat\n\n');
        }
    }, 15_000);

    req.on('close', cleanup);
});

router.get("/clip/:id/url", async (req, res) => {
    const { id } = req.params;
    const { filename } = req.query;

    if (!filename) {
        return res.status(400).json({ error: "filename query parameter is required" });
    }

    const job = await dbService.getJob(id);
    if (!job || !job.storage_path) {
        return res.status(404).json({ error: "Job or file not found" });
    }

    try {
        const signedUrl = await storageService.getSignedDownloadUrl(job.storage_path, filename as string);
        return res.json({ url: signedUrl });
    } catch (error: any) {
        console.error('Error generating signed URL:', error);
        return res.status(500).json({ error: error.message });
    }
});

router.delete("/clip/:id/cleanup", async (req, res) => {
    const job = await dbService.getJob(req.params.id);
    if (job && job.storage_path) {
        await storageService.deleteFile(job.storage_path);
    }
    await dbService.deleteJob(req.params.id);
    return res.json({ success: true });
});

export default router;
