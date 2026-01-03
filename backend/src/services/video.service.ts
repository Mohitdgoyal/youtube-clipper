import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { UPLOADS_DIR } from "../constants";
import { timeToSeconds, secondsToTime } from "../utils/time";

export async function adjustSubtitleTimestamps(inputPath: string, outputPath: string, startTime: string): Promise<void> {
    const startSeconds = timeToSeconds(startTime);
    const content = await fs.promises.readFile(inputPath, 'utf-8');

    // Robust regex for VTT timestamps
    const timestampRegex = /(\d{1,2}:\d{2}:\d{2}\.\d{3}|\d{2}:\d{2}\.\d{3}) --> (\d{1,2}:\d{2}:\d{2}\.\d{3}|\d{2}:\d{2}\.\d{3})/g;

    const adjustedContent = content.replace(timestampRegex, (match, start, end) => {
        const startSec = timeToSeconds(start) - startSeconds;
        const endSec = timeToSeconds(end) - startSeconds;

        if (startSec < 0) return match;

        return `${secondsToTime(startSec)} --> ${secondsToTime(endSec)}`;
    });

    await fs.promises.writeFile(outputPath, adjustedContent, 'utf-8');
}

export const videoService = {
    async downloadAndClip(id: string, options: {
        url: string,
        startTime: string,
        endTime: string,
        subtitles?: boolean,
        formatId?: string
    }) {
        const outputPath = path.join(UPLOADS_DIR, `clip-${id}.mp4`);
        const { url, startTime, endTime, subtitles, formatId } = options;
        const section = `*${startTime}-${endTime}`;

        const ytDlpPath = path.resolve(__dirname, '../../bin/yt-dlp');
        const ytArgs = [url];

        if (formatId) {
            ytArgs.push("-f", formatId);
        } else {
            ytArgs.push("-f", "bv[ext=mp4][vcodec^=avc1][height<=?1080][fps<=?60]+ba[ext=m4a]/best[ext=mp4][vcodec^=avc1][height<=?1080]");
        }

        ytArgs.push(
            "--download-sections", section,
            "-o", outputPath,
            "--merge-output-format", "mp4",
            "--no-check-certificates",
            "--no-warnings",
            "--add-header", "referer:youtube.com",
            "--add-header", "user-agent:Mozilla/5.0"
        );

        if (subtitles) {
            ytArgs.push("--write-subs", "--write-auto-subs", "--sub-lang", "en", "--sub-format", "vtt");
        }

        const localCookiesPath = path.join(__dirname, "../../cookies.txt");
        if (fs.existsSync(localCookiesPath)) {
            ytArgs.push("--cookies", localCookiesPath);
        }

        const yt = spawn(ytDlpPath, ytArgs);

        await new Promise<void>((resolve, reject) => {
            yt.on('close', (code) => code === 0 ? resolve() : reject(new Error(`yt-dlp exited with code ${code}`)));
            yt.on('error', reject);
        });

        return outputPath;
    },

    async processWithFFmpeg(inputPath: string, outputPath: string, options: { subtitles?: boolean, subPath?: string }) {
        const { subtitles, subPath } = options;
        const ffmpegArgs = ['-y', '-i', inputPath];

        if (subtitles && subPath && fs.existsSync(subPath)) {
            ffmpegArgs.push(
                '-vf', `subtitles=${subPath}`,
                '-c:v', 'libx264',
                '-c:a', 'aac',
                '-b:a', '128k',
                '-preset', 'ultrafast',
                '-crf', '28'
            );
        } else {
            ffmpegArgs.push('-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k');
        }

        ffmpegArgs.push('-movflags', '+faststart', outputPath);

        const ff = spawn('ffmpeg', ffmpegArgs);

        await new Promise<void>((resolve, reject) => {
            ff.on('close', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}`)));
            ff.on('error', reject);
        });
    }
};
