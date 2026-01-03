import { Router } from "express";
import { dbService, storageService } from "../services/storage.service";
import { videoService, adjustSubtitleTimestamps } from "../services/video.service";
import { UPLOADS_DIR } from "../constants";
import path from "path";
import fs from "fs";

const router = Router();

function createJobId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

router.post("/clip", async (req, res) => {
    const { url, startTime, endTime, subtitles, formatId, userId } = req.body || {};
    if (!url || !startTime || !endTime || !userId) {
        return res.status(400).json({ error: "url, startTime, endTime and userId are required" });
    }

    const id = createJobId();

    try {
        await dbService.createJob(id, userId);
    } catch (error) {
        return res.status(500).json({ error: 'Failed to create job' });
    }

    // Process in background
    (async () => {
        let finalJobStatus: any = {};
        try {
            const inputPath = await videoService.downloadAndClip(id, { url, startTime, endTime, subtitles, formatId });
            const fastPath = path.join(UPLOADS_DIR, `clip-${id}-fast.mp4`);
            const subPath = inputPath.replace(/\.mp4$/, ".en.vtt");
            const subtitlesExist = fs.existsSync(subPath);

            if (subtitles && subtitlesExist) {
                const adjustedSubPath = path.join(UPLOADS_DIR, `clip-${id}-adjusted.vtt`);
                await adjustSubtitleTimestamps(subPath, adjustedSubPath, startTime);
                await fs.promises.rename(adjustedSubPath, subPath);
            }

            await videoService.processWithFFmpeg(inputPath, fastPath, { subtitles, subPath: subtitlesExist ? subPath : undefined });

            await fs.promises.unlink(inputPath).catch(() => { });
            const fileBuffer = await fs.promises.readFile(fastPath);
            const storagePath = `clip-${id}.mp4`;

            const publicUrl = await storageService.uploadFile(storagePath, fileBuffer);
            await fs.promises.unlink(fastPath).catch(() => { });

            finalJobStatus = {
                storage_path: storagePath,
                public_url: publicUrl,
                status: 'ready',
            };
        } catch (err: any) {
            finalJobStatus = { status: 'error', error: err.message };
        } finally {
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
        error: job.error,
        url: job.public_url,
        storagePath: job.storage_path
    });
});

router.delete("/clip/:id/cleanup", async (req, res) => {
    await dbService.deleteJob(req.params.id);
    return res.json({ success: true });
});

export default router;
