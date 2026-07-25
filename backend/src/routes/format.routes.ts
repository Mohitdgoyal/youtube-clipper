import { Router } from "express";
import { metadataService } from "../services/metadata.service";
import { isAllowedYouTubeUrl } from "../utils/youtube-url";
import { rateLimit } from "../middleware/rate-limit.middleware";

const router = Router();

interface FormatInfo {
    format_id: string;
    label: string;
}

const metaRateLimit = rateLimit({ windowMs: 60_000, max: 30, name: "meta" });

router.get("/formats", metaRateLimit, async (req, res) => {
    const { url } = req.query;
    if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: "url is required" });
    }

    if (!isAllowedYouTubeUrl(url)) {
        return res.status(400).json({ error: "Only YouTube URLs are allowed" });
    }

    try {
        const info = await metadataService.getVideoInfo(url);

        // Supporting up to 8K pixels for personal use
        const MAX_PIXELS = 7680 * 4320;

        const videoFormats = info.formats
            .filter((f) => f.vcodec !== 'none' && f.height && f.width && (f.width * f.height <= MAX_PIXELS) && (f.ext === 'mp4' || f.ext === 'webm'))
            .map((f) => ({
                format_id: f.format_id,
                label: `${f.height}p${f.fps && f.fps > 30 ? f.fps : ''}${f.vcodec.includes('av01') ? ' (AV1)' : ''}`,
                height: f.height || 0,
                hasAudio: f.acodec !== 'none'
            }))
            .sort((a, b) => b.height - a.height);

        interface ProcessedFormat {
            format_id: string;
            label: string;
            height: number;
            hasAudio: boolean;
        }

        const uniqueFormats = videoFormats.reduce<ProcessedFormat[]>((acc, current) => {
            const existing = acc.find((item) => item.label === current.label);
            if (!existing) acc.push(current);
            else if (current.hasAudio && !existing.hasAudio) {
                const index = acc.findIndex((item) => item.label === current.label);
                acc[index] = current;
            }
            return acc;
        }, []);

        const formatsForUser: FormatInfo[] = uniqueFormats.map((f) => ({
            format_id: f.hasAudio ? f.format_id : `${f.format_id}+bestaudio`,
            label: f.label
        }));

        return res.json({ formats: formatsForUser });

    } catch (err: any) {
        console.error("Formats error:", err.message);
        return res.status(500).json({ error: err.message });
    }
});

router.get("/info", metaRateLimit, async (req, res) => {
    const { url } = req.query;
    if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: "url is required" });
    }

    if (!isAllowedYouTubeUrl(url)) {
        return res.status(400).json({ error: "Only YouTube URLs are allowed" });
    }

    try {
        const info = await metadataService.getVideoInfo(url);

        return res.json({
            title: info.title,
            thumbnail: info.thumbnail,
            duration: info.duration,
            webpage_url: info.webpage_url
        });
    } catch (err: any) {
        console.error("Info error:", err.message);
        return res.status(500).json({ error: err.message });
    }
});

export default router;
