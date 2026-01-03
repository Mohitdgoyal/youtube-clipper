import { Router } from "express";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { UPLOADS_DIR } from "../constants";

const router = Router();

function createJobId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

router.get("/formats", async (req, res) => {
    const { url } = req.query;
    if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: "url is required" });
    }

    try {
        const ytDlpPath = path.resolve(__dirname, '../../bin/yt-dlp');
        const ytArgs = [
            '-j',
            '--no-warnings',
            '--no-check-certificates',
            '--add-header', 'referer:youtube.com',
            '--add-header', 'user-agent:Mozilla/5.0',
            url
        ];

        const localCookiesPath = path.join(__dirname, "../../cookies.txt");
        if (fs.existsSync(localCookiesPath)) {
            ytArgs.push("--cookies", localCookiesPath)
        }

        const yt = spawn(ytDlpPath, ytArgs);
        let jsonData = '';
        yt.stdout.on('data', (data) => jsonData += data.toString());

        yt.on('close', (code) => {
            if (code !== 0) return res.status(500).json({ error: `yt-dlp exited with code ${code}` });

            try {
                const info = JSON.parse(jsonData);
                const MAX_PIXELS = 1920 * 1080;

                const videoFormats = info.formats
                    .filter((f: any) => f.vcodec !== 'none' && f.height && f.width && (f.width * f.height <= MAX_PIXELS) && (f.ext === 'mp4' || f.ext === 'webm'))
                    .map((f: any) => ({
                        format_id: f.format_id,
                        label: `${f.height}p${f.fps > 30 ? f.fps : ''}`,
                        height: f.height,
                        hasAudio: f.acodec !== 'none'
                    }))
                    .sort((a: any, b: any) => b.height - a.height);

                const uniqueFormats = videoFormats.reduce((acc: any[], current: any) => {
                    const existing = acc.find((item) => item.label === current.label);
                    if (!existing) acc.push(current);
                    else if (current.hasAudio && !existing.hasAudio) {
                        const index = acc.findIndex((item) => item.label === current.label);
                        acc[index] = current;
                    }
                    return acc;
                }, []);

                const formatsForUser = uniqueFormats.map((f: any) => ({
                    format_id: f.hasAudio ? f.format_id : `${f.format_id}+bestaudio`,
                    label: f.label
                }));

                return res.json({ formats: formatsForUser });
            } catch (e) {
                return res.status(500).json({ error: 'Failed to parse yt-dlp output' });
            }
        });

    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

export default router;
