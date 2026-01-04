import { Router } from "express";
import { storageService } from "../services/storage.service";
import { dbService } from "../services/db.service";
import { videoService, adjustSubtitleTimestamps } from "../services/video.service";
import { UPLOADS_DIR } from "../constants";
import path from "path";
import fs from "fs";

import { createJobId } from "../utils/ids";
import { timeToSeconds } from "../utils/time";
import { JobUpdate } from "../types/job";

const router = Router();

router.post("/clip", async (req, res) => {
    const { url, startTime, endTime, subtitles, formatId, userId } = req.body || {};
    if (!url || !startTime || !endTime || !userId) {
        return res.status(400).json({ error: "url, startTime, endTime and userId are required" });
    }

    const startSec = timeToSeconds(startTime);
    const endSec = timeToSeconds(endTime);

    if (isNaN(startSec) || isNaN(endSec) || startSec >= endSec) {
        return res.status(400).json({ error: "Invalid timestamps: endTime must be greater than startTime" });
    }

    // Basic URL validation
    try {
        new URL(url);
    } catch (e) {
        return res.status(400).json({ error: "Invalid URL format" });
    }

    const id = createJobId();

    try {
        await dbService.createJob(id, userId);
    } catch (error) {
        console.error('Job creation error:', error);
        return res.status(500).json({ error: 'Failed to create job' });
    }

    // Process in background
    (async () => {
        let finalJobStatus: JobUpdate = {};
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            controller.abort();
        }, 10 * 60 * 1000); // 10 minutes

        try {
            const durationSeconds = endSec - startSec;

            const updateProgress = async (p: number) => {
                await dbService.updateJob(id, { progress: p });
            };

            await dbService.updateJob(id, { stage: 'downloading' });
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
                await dbService.updateJob(id, { stage: 'processing' });
                // Just rename directly to fastPath
                await fs.promises.rename(inputPath, fastPath);
                // Fake a progress update
                if (updateProgress) updateProgress(100);
            } else {
                // Subtitles processing path
                const subPath = inputPath.replace(/\.mp4$/, ".en.vtt");
                const subtitlesExist = fs.existsSync(subPath);

                if (subtitlesExist) {
                    const adjustedSubPath = path.join(UPLOADS_DIR, `clip-${id}-adjusted.vtt`);
                    await adjustSubtitleTimestamps(subPath, adjustedSubPath, startTime);
                    await fs.promises.rename(adjustedSubPath, subPath);
                }

                await dbService.updateJob(id, { stage: 'processing' });
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
            }

            const storagePath = `clip-${id}.mp4`;
            const fileStream = fs.createReadStream(fastPath);

            await dbService.updateJob(id, { stage: 'uploading' });
            const publicUrl = await storageService.uploadFile(storagePath, fileStream);
            await fs.promises.unlink(fastPath).catch((err) => {
                console.warn(`Failed to cleanup processed file ${fastPath}:`, err.message);
            });

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
            await dbService.updateJob(id, finalJobStatus);
        }
    })();

    return res.status(202).json({ id });
});

router.get("/clip/:id", async (req, res) => {
    const job = await dbService.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'job not found' });

    return res.json({
        status: job.status,
        stage: job.stage,
        error: job.error,
        url: job.public_url,
        storagePath: job.storage_path
    });
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
    await dbService.deleteJob(req.params.id);
    return res.json({ success: true });
});

export default router;
