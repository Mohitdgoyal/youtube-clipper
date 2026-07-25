import { Router } from "express";
import { metadataService } from "../services/metadata.service";
import { buildFormatList } from "../utils/format-list";
import { isAllowedYouTubeUrl } from "../utils/youtube-url";
import { rateLimit } from "../middleware/rate-limit.middleware";

const router = Router();

const metaRateLimit = rateLimit({ windowMs: 60_000, max: 30, name: "meta" });

/** Combined metadata + formats from a single yt-dlp fetch */
router.get("/video", metaRateLimit, async (req, res) => {
    const { url } = req.query;
    if (!url || typeof url !== "string") {
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
            webpage_url: info.webpage_url,
            formats: buildFormatList(info),
        });
    } catch (err: any) {
        console.error("Video info error:", err.message);
        return res.status(500).json({ error: err.message });
    }
});

export default router;
