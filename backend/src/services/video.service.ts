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
        subtitles?: boolean;
        formatId?: string;
        signal?: AbortSignal;
        onProgress?: (progress: number) => void;
    }) {
        const outputPath = path.join(UPLOADS_DIR, `clip-${id}.mp4`);
        const { url, startTime, endTime, subtitles, formatId, signal, onProgress } = options;
        const binDir = path.resolve(__dirname, '../../bin');
        const ytDlpPath = fs.existsSync(path.join(binDir, 'yt-dlp.exe'))
            ? path.join(binDir, 'yt-dlp.exe')
            : path.join(binDir, 'yt-dlp');
        const ytArgs = [url];
        const section = `*${startTime}-${endTime}`;

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
            "--add-header", "user-agent:Mozilla/5.0",
            "--concurrent-fragments", "8",
            "--downloader", "ffmpeg",
            "--buffer-size", "16K",
            "--force-keyframes-at-cuts"
        );

        if (subtitles) {
            ytArgs.push("--write-subs", "--write-auto-subs", "--sub-lang", "en", "--sub-format", "vtt");
        }

        const localCookiesPath = path.join(__dirname, "../../cookies.txt");
        if (fs.existsSync(localCookiesPath)) {
            ytArgs.push("--cookies", localCookiesPath);
        }

        const yt = spawn(ytDlpPath, ytArgs);

        let stderrData = '';
        yt.stderr.on('data', (data) => {
            const str = data.toString();
            stderrData += str;

            // Expected output: [download]  12.3% of 10.00MiB at 1.23MiB/s ETA 00:05
            const match = str.match(/\[download\]\s+(\d+\.\d+)%/);
            if (match && onProgress) {
                const percent = parseFloat(match[1]);
                // Map 0-100% download to 0-50% overall
                onProgress(Math.round(percent / 2));
            }
        });

        if (signal) {
            signal.addEventListener('abort', () => {
                yt.kill();
            });
        }

        await new Promise<void>((resolve, reject) => {
            yt.on('close', (code) => {
                if (signal?.aborted) {
                    reject(new Error('Aborted'));
                    return;
                }
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`yt-dlp exited with code ${code}: ${stderrData}`));
                }
            });
            yt.on('error', (err) => {
                console.error('yt-dlp subprocess error:', err);
                reject(err);
            });
        });

        return outputPath;
    },

    async processWithFFmpeg(inputPath: string, outputPath: string, options: {
        subtitles?: boolean,
        subPath?: string,
        signal?: AbortSignal,
        onProgress?: (progress: number) => void,
        durationSeconds?: number
    }) {
        const { subtitles, subPath, signal, onProgress, durationSeconds } = options;
        const ffmpegArgs = ['-y', '-hwaccel', 'auto', '-i', inputPath];

        if (subtitles && subPath && fs.existsSync(subPath)) {
            ffmpegArgs.push(
                '-vf', `subtitles=${subPath}`,
                '-c:v', 'libx264',
                '-c:a', 'aac',
                '-b:a', '128k',
                '-preset', 'ultrafast',
                '-crf', '28',
                '-threads', '0'
            );
        } else {
            ffmpegArgs.push('-c:v', 'copy', '-c:a', 'copy', '-threads', '0');
        }

        ffmpegArgs.push('-movflags', '+faststart', outputPath);

        const ff = spawn('ffmpeg', ffmpegArgs);

        if (onProgress) onProgress(50); // Start processing phase

        ff.stderr.on('data', (data) => {
            const str = data.toString();
            // Parse time=00:00:05.12
            const match = str.match(/time=(\d{2}:\d{2}:\d{2}\.\d{2})/);
            if (match && durationSeconds && onProgress) {
                const timeStr = match[1];
                const parts = timeStr.split(':');
                const seconds = (+parts[0]) * 3600 + (+parts[1]) * 60 + (+parts[2]);
                const percent = Math.min(100, Math.round((seconds / durationSeconds) * 100));
                // Map 0-100% of processing to 50-100% overall
                onProgress(50 + Math.round(percent / 2));
            }
        });

        if (signal) {
            signal.addEventListener('abort', () => {
                ff.kill();
            });
        }

        await new Promise<void>((resolve, reject) => {
            ff.on('close', (code) => {
                if (signal?.aborted) {
                    reject(new Error('Aborted'));
                    return;
                }
                code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}`));
            });
            ff.on('error', (err) => {
                console.error('ffmpeg subprocess error:', err);
                reject(err);
            });
        });
    }
};
