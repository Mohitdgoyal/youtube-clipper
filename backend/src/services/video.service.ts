import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { UPLOADS_DIR, BUFFER_SIZE, ARIA2C_CONNECTIONS, CONCURRENT_FRAGMENTS } from "../constants";
import { timeToSeconds, secondsToTime } from "../utils/time";
import { resolveYtDlp, resolveFfmpeg, resolveAria2c } from "../utils/binaries";
import { getVideoEncoder } from "../utils/ffmpeg-encoder";
import { needsForcedKeyframes } from "../utils/time-precision";
import {
    buildCommonYtDlpArgs,
    useAria2cDownloader,
    SAFE_SECTION_FORMAT,
    isYoutubeForbiddenError,
} from "../utils/yt-dlp-args";

/** Lead-in pad so FFmpeg can re-trim to the exact user start after keyframe-aligned yt-dlp. */
const SUBTITLE_SECTION_PAD_SEC = 2;

export type ClipDownloadResult = {
    outputPath: string;
    /** Absolute source time where the downloaded section begins (for VTT shift). */
    sectionStartTime: string;
    /** Seconds into the downloaded file where the user cut starts. */
    cutStartSec: number;
    /** Exact output duration in seconds. */
    durationSec: number;
};

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

function parseFfmpegTimeSeconds(raw: string): number | null {
    const token = raw.trim();
    if (!token || token === "N/A") return null;
    if (token.includes(":")) {
        const parts = token.split(":").map(Number);
        if (parts.some((n) => Number.isNaN(n))) return null;
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        return null;
    }
    const sec = parseFloat(token);
    return Number.isFinite(sec) ? sec : null;
}

function parseDownloadProgress(str: string, sectionDurationSec: number, onProgress?: (n: number) => void) {
    if (!onProgress) return;

    // Native yt-dlp fragment progress (stdout or stderr) — maps to 0–50% overall
    const dlMatch = str.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
    if (dlMatch) {
        onProgress(Math.round(parseFloat(dlMatch[1]) / 2));
        return;
    }

    // ffmpeg section mux: time= + optional speed= (speed>1 means faster than realtime)
    if (sectionDurationSec > 0) {
        const timeMatch = str.match(/time=(\d+(?:\.\d+)?|\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?)/);
        if (timeMatch) {
            const seconds = parseFfmpegTimeSeconds(timeMatch[1]);
            if (seconds != null && seconds >= 0) {
                const pct = Math.min(100, Math.round((seconds / sectionDurationSec) * 100));
                onProgress(Math.round(pct / 2));
            }
        }
    }
}

/** Wall-clock estimate when ffmpeg emits no time= lines during long HTTP reads. */
function estimateDownloadProgress(elapsedMs: number, sectionDurationSec: number): number {
    // Typical section fetch: ~0.8–2× realtime; asymptotic curve avoids freezing at 49%
    const expectedMs = Math.max(3000, sectionDurationSec * 1200);
    const ratio = elapsedMs / expectedMs;
    if (ratio <= 1) {
        return Math.max(1, Math.min(48, Math.round(ratio * 48)));
    }
    // Past estimate: creep slowly toward 50 so UI shows life without claiming done
    const overSec = (elapsedMs - expectedMs) / 1000;
    return Math.min(50, 48 + Math.floor(overSec / 8));
}

function feedYtDlpOutput(
    chunk: string,
    sectionDurationSec: number,
    onProgress?: (n: number) => void
) {
    // ffmpeg progress is often \\r-delimited on a single line; split both separators
    for (const line of chunk.split(/\r|\n/)) {
        if (line.trim()) parseDownloadProgress(line, sectionDurationSec, onProgress);
    }
}

function runYtDlp(
    ytDlpPath: string,
    ytArgs: string[],
    options: {
        signal?: AbortSignal;
        onProgress?: (progress: number) => void;
        sectionDurationSec: number;
    }
): Promise<string> {
    const { signal, onProgress, sectionDurationSec } = options;

    return new Promise((resolve, reject) => {
        const yt = spawn(ytDlpPath, ytArgs);
        let stderrData = "";

        const onChunk = (data: Buffer | string) => {
            const str = data.toString();
            stderrData += str;
            feedYtDlpOutput(str, sectionDurationSec, onProgress);
        };

        // MUST drain stdout — unread pipes block yt-dlp once the buffer fills (~64 KiB)
        yt.stdout.on("data", onChunk);
        yt.stderr.on("data", onChunk);

        const onAbort = () => {
            yt.kill("SIGTERM");
            // Windows: ensure child ffmpeg dies with the tree
            try {
                yt.kill();
            } catch {
                /* ignore */
            }
        };

        if (signal) {
            if (signal.aborted) {
                onAbort();
            } else {
                signal.addEventListener("abort", onAbort, { once: true });
            }
        }

        yt.on("close", (code) => {
            if (signal) signal.removeEventListener("abort", onAbort);
            if (signal?.aborted) {
                reject(new Error("Aborted"));
                return;
            }
            if (code === 0) {
                resolve(stderrData);
            } else {
                reject(new Error(`yt-dlp exited with code ${code}: ${stderrData}`));
            }
        });
        yt.on("error", (err) => {
            console.error("yt-dlp subprocess error:", err);
            reject(err);
        });
    });
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
    }): Promise<ClipDownloadResult> {
        const outputPath = path.join(UPLOADS_DIR, `clip-${id}.mp4`);
        const { url, startTime, endTime, subtitles, formatId, signal, onProgress } = options;
        const ytDlpPath = resolveYtDlp();
        const startSec = timeToSeconds(startTime);
        const endSec = timeToSeconds(endTime);
        const durationSec = Math.max(0.001, endSec - startSec);

        // With subtitles: pad the download, then precise-cut in the single FFmpeg encode pass.
        let sectionStartSec = startSec;
        let sectionEndSec = endSec;
        let cutStartSec = 0;
        if (subtitles) {
            sectionStartSec = Math.max(0, startSec - SUBTITLE_SECTION_PAD_SEC);
            sectionEndSec = endSec + 0.25;
            cutStartSec = startSec - sectionStartSec;
        }

        const sectionStartTime = secondsToTime(sectionStartSec);
        const sectionEndTime = secondsToTime(sectionEndSec);
        const section = `*${sectionStartTime}-${sectionEndTime}`;
        const sectionDurationSec = Math.max(0.001, sectionEndSec - sectionStartSec);

        const buildArgs = (format: string) => {
            const ytArgs = buildCommonYtDlpArgs([
                url,
                "--download-sections", section,
                "-o", outputPath,
                "--merge-output-format", "mp4",
                "--concurrent-fragments", CONCURRENT_FRAGMENTS,
                "--buffer-size", BUFFER_SIZE,
                "-f", format,
            ]);

            if (needsForcedKeyframes(startTime, endTime, subtitles)) {
                ytArgs.push("--force-keyframes-at-cuts");
            }

            if (useAria2cDownloader()) {
                const aria2cPath = resolveAria2c();
                if (aria2cPath) {
                    ytArgs.push(
                        "--downloader",
                        aria2cPath,
                        "--downloader-args",
                        `aria2c:-x ${ARIA2C_CONNECTIONS} -k ${BUFFER_SIZE}`
                    );
                }
            }

            if (subtitles) {
                ytArgs.push("--write-subs", "--write-auto-subs", "--sub-lang", "en", "--sub-format", "vtt");
            }

            return ytArgs;
        };

        const primaryFormat = formatId?.trim() || SAFE_SECTION_FORMAT;

        let lastReported = 0;
        const reportProgress = (p: number) => {
            const next = Math.max(0, Math.min(100, Math.round(p)));
            if (next <= lastReported) return;
            lastReported = next;
            onProgress?.(next);
        };

        const downloadStarted = Date.now();
        const progressTicker = setInterval(() => {
            if (signal?.aborted) return;
            const estimate = estimateDownloadProgress(Date.now() - downloadStarted, sectionDurationSec);
            reportProgress(Math.max(lastReported, estimate));
        }, 1000);
        progressTicker.unref?.();

        const runOpts = { signal, onProgress: reportProgress, sectionDurationSec };

        try {
            reportProgress(1);
            await runYtDlp(ytDlpPath, buildArgs(primaryFormat), runOpts);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            const canRetry =
                primaryFormat !== SAFE_SECTION_FORMAT &&
                (isYoutubeForbiddenError(message) || /ffmpeg exited/i.test(message));

            if (!canRetry || signal?.aborted) throw err;

            console.warn(`[yt-dlp] format "${primaryFormat}" failed; retrying with safe H.264 default`);
            await fs.promises.unlink(outputPath).catch(() => undefined);
            await fs.promises.unlink(`${outputPath}.part`).catch(() => undefined);
            reportProgress(2);
            await runYtDlp(ytDlpPath, buildArgs(SAFE_SECTION_FORMAT), runOpts);
        } finally {
            clearInterval(progressTicker);
        }

        reportProgress(50);

        return {
            outputPath,
            sectionStartTime,
            cutStartSec,
            durationSec,
        };
    },

    async processWithFFmpeg(inputPath: string, outputPath: string, options: {
        subtitles?: boolean,
        subPath?: string,
        signal?: AbortSignal,
        onProgress?: (progress: number) => void,
        durationSeconds?: number,
        /** Precise cut into the (possibly padded) download; applied after -i for filter accuracy. */
        cutStartSec?: number,
    }) {
        const { subtitles, subPath, signal, onProgress, durationSeconds, cutStartSec = 0 } = options;
        if (signal?.aborted) {
            throw new Error("Aborted");
        }
        const ffmpegPath = resolveFfmpeg();
        // Decode first, then -ss/-t so subtitle burn-in timestamps stay aligned to the input timeline.
        const ffmpegArgs = ['-y', '-hwaccel', 'auto', '-i', inputPath];

        if (cutStartSec > 0) {
            ffmpegArgs.push('-ss', cutStartSec.toFixed(3));
        }
        if (durationSeconds && durationSeconds > 0) {
            ffmpegArgs.push('-t', durationSeconds.toFixed(3));
        }

        if (subtitles && subPath && fs.existsSync(subPath)) {
            // Escape path for FFmpeg subtitles filter (Windows backslashes / colons)
            const escapedSub = subPath
                .replace(/\\/g, '/')
                .replace(/:/g, '\\:')
                .replace(/'/g, "\\'");
            const { encoder, videoArgs } = getVideoEncoder();

            ffmpegArgs.push(
                '-vf', `subtitles='${escapedSub}'`,
                '-c:v', encoder,
                ...videoArgs,
                '-c:a', 'aac',
                '-b:a', '128k',
            );
        } else {
            // Stream copy is fastest when no burn-in is needed
            ffmpegArgs.push('-c:v', 'copy', '-c:a', 'copy', '-threads', '0');
        }

        ffmpegArgs.push('-movflags', '+faststart', outputPath);

        const ff = spawn(ffmpegPath, ffmpegArgs);

        if (onProgress) onProgress(50); // Start processing phase

        ff.stderr.on('data', (data) => {
            for (const line of data.toString().split(/\r|\n/)) {
                if (!line.trim() || !durationSeconds || !onProgress) continue;
                const timeMatch = line.match(/time=(\d+(?:\.\d+)?|\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?)/);
                if (!timeMatch) continue;
                const seconds = parseFfmpegTimeSeconds(timeMatch[1]);
                if (seconds == null) continue;
                const percent = Math.min(100, Math.round((seconds / durationSeconds) * 100));
                onProgress(50 + Math.round(percent / 2));
            }
        });

        const onAbort = () => {
            try {
                ff.kill();
            } catch {
                /* ignore */
            }
        };

        if (signal) {
            signal.addEventListener("abort", onAbort, { once: true });
        }

        await new Promise<void>((resolve, reject) => {
            ff.on('close', (code) => {
                if (signal) signal.removeEventListener("abort", onAbort);
                if (signal?.aborted) {
                    reject(new Error('Aborted'));
                    return;
                }
                code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}`));
            });
            ff.on('error', (err) => {
                if (signal) signal.removeEventListener("abort", onAbort);
                console.error('ffmpeg subprocess error:', err);
                reject(err);
            });
        });
    }
};
