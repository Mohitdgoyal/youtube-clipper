import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { UPLOADS_DIR, BUFFER_SIZE, ARIA2C_CONNECTIONS, CONCURRENT_FRAGMENTS } from "../constants";
import { timeToSeconds, secondsToTime } from "../utils/time";
import { resolveYtDlp, resolveFfmpeg, resolveAria2c } from "../utils/binaries";
import { getVideoEncoder } from "../utils/ffmpeg-encoder";
import { needsPreciseCut } from "../utils/time-precision";
import {
    buildClipYtDlpArgs,
    useAria2cDownloader,
    SAFE_SECTION_FORMAT,
    FALLBACK_SECTION_FORMAT,
    isYoutubeForbiddenError,
} from "../utils/yt-dlp-args";

/** Lead-in so stream-copy trim / subtitle burn-in can hit the exact start. */
const SECTION_PAD_SEC = 2;

/** Abort if the .part file does not grow for this long (hung googlevideo read). */
const STALL_TIMEOUT_MS = Number(process.env.YTDLP_STALL_TIMEOUT_MS || 45_000);

export type ClipDownloadResult = {
    outputPath: string;
    /** Absolute source time where the downloaded section begins (for VTT shift). */
    sectionStartTime: string;
    /** Seconds into the downloaded file where the user cut starts. */
    cutStartSec: number;
    /** Exact output duration in seconds. */
    durationSec: number;
    /** True when caller must run ffmpeg trim (stream-copy or burn-in). */
    needsPostProcess: boolean;
};

export async function adjustSubtitleTimestamps(inputPath: string, outputPath: string, startTime: string): Promise<void> {
    const startSeconds = timeToSeconds(startTime);
    const content = await fs.promises.readFile(inputPath, "utf-8");

    const timestampRegex = /(\d{1,2}:\d{2}:\d{2}\.\d{3}|\d{2}:\d{2}\.\d{3}) --> (\d{1,2}:\d{2}:\d{2}\.\d{3}|\d{2}:\d{2}\.\d{3})/g;

    const adjustedContent = content.replace(timestampRegex, (match, start, end) => {
        const startSec = timeToSeconds(start) - startSeconds;
        const endSec = timeToSeconds(end) - startSeconds;

        if (startSec < 0) return match;

        return `${secondsToTime(startSec)} --> ${secondsToTime(endSec)}`;
    });

    await fs.promises.writeFile(outputPath, adjustedContent, "utf-8");
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

    const dlMatch = str.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
    if (dlMatch) {
        onProgress(Math.round(parseFloat(dlMatch[1]) / 2));
        return;
    }

    if (sectionDurationSec > 0) {
        const timeMatch = str.match(/time=(\d+(?:\.\d+)?|\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?)/);
        if (timeMatch) {
            const seconds = parseFfmpegTimeSeconds(timeMatch[1]);
            if (seconds != null && seconds >= 0) {
                const pct = Math.min(100, Math.round((seconds / sectionDurationSec) * 100));
                // Cap at 49 during download so UI only hits 50 when yt-dlp exits
                onProgress(Math.min(49, Math.round(pct / 2)));
            }
        }
    }
}

function feedYtDlpOutput(
    chunk: string,
    sectionDurationSec: number,
    onProgress?: (n: number) => void
) {
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
        outputPath: string;
    }
): Promise<string> {
    const { signal, onProgress, sectionDurationSec, outputPath } = options;
    const partPath = `${outputPath}.part`;

    return new Promise((resolve, reject) => {
        const yt = spawn(ytDlpPath, ytArgs);
        let stderrTail = "";
        let settled = false;
        let lastByteCount = -1;
        let lastGrowthAt = Date.now();

        const finish = (fn: () => void) => {
            if (settled) return;
            settled = true;
            clearInterval(stallTimer);
            if (signal) signal.removeEventListener("abort", onAbort);
            fn();
        };

        const onChunk = (data: Buffer | string) => {
            const str = data.toString();
            stderrTail = (stderrTail + str).slice(-12_000);
            lastGrowthAt = Date.now(); // stderr activity counts as life
            feedYtDlpOutput(str, sectionDurationSec, onProgress);
        };

        // MUST drain stdout — unread pipes block yt-dlp once the buffer fills (~64 KiB)
        yt.stdout.on("data", onChunk);
        yt.stderr.on("data", onChunk);

        const onAbort = () => {
            try {
                yt.kill("SIGTERM");
            } catch {
                /* ignore */
            }
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

        // Kill hung googlevideo reads (ANDROID_VR / expired URLs leave .part at 0 forever)
        const stallTimer = setInterval(() => {
            if (settled) return;
            let size = 0;
            try {
                if (fs.existsSync(partPath)) size = fs.statSync(partPath).size;
                else if (fs.existsSync(outputPath)) size = fs.statSync(outputPath).size;
            } catch {
                /* ignore */
            }

            if (size > lastByteCount) {
                lastByteCount = size;
                lastGrowthAt = Date.now();
                return;
            }

            if (Date.now() - lastGrowthAt >= STALL_TIMEOUT_MS) {
                onAbort();
                finish(() =>
                    reject(
                        new Error(
                            `yt-dlp stalled for ${Math.round(STALL_TIMEOUT_MS / 1000)}s with no file growth (likely hung googlevideo URL). Retry with Best available.`
                        )
                    )
                );
            }
        }, 2000);
        stallTimer.unref?.();

        yt.on("close", (code) => {
            finish(() => {
                if (signal?.aborted) {
                    reject(new Error("Aborted"));
                    return;
                }
                if (code === 0) {
                    resolve(stderrTail);
                } else {
                    reject(new Error(`yt-dlp exited with code ${code}: ${stderrTail}`));
                }
            });
        });
        yt.on("error", (err) => {
            finish(() => {
                console.error("yt-dlp subprocess error:", err);
                reject(err);
            });
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

        // Precise cuts / subtitles: pad download, NEVER --force-keyframes (that re-encodes over HTTP).
        const precise = needsPreciseCut(startTime, endTime, subtitles);
        let sectionStartSec = startSec;
        let sectionEndSec = endSec;
        let cutStartSec = 0;
        if (precise) {
            sectionStartSec = Math.max(0, startSec - SECTION_PAD_SEC);
            sectionEndSec = endSec + 0.25;
            cutStartSec = startSec - sectionStartSec;
        }

        const sectionStartTime = secondsToTime(sectionStartSec);
        const sectionEndTime = secondsToTime(sectionEndSec);
        const section = `*${sectionStartTime}-${sectionEndTime}`;
        const sectionDurationSec = Math.max(0.001, sectionEndSec - sectionStartSec);

        const buildArgs = (format: string) => {
            const ytArgs = buildClipYtDlpArgs([
                url,
                "--download-sections", section,
                "-o", outputPath,
                "--merge-output-format", "mp4",
                "--concurrent-fragments", CONCURRENT_FRAGMENTS,
                "--buffer-size", BUFFER_SIZE,
                "-f", format,
            ]);

            // Stream-copy section only. Do NOT add --force-keyframes-at-cuts.

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

        // Honor picker: empty = Best available (1080p60 H.264). Retry down on 403/stall.
        const primaryFormat = formatId?.trim() || SAFE_SECTION_FORMAT;
        const retryFormats = [SAFE_SECTION_FORMAT, FALLBACK_SECTION_FORMAT].filter(
            (f, i, arr) => f !== primaryFormat && arr.indexOf(f) === i
        );

        let lastReported = 0;
        const reportProgress = (p: number) => {
            const next = Math.max(0, Math.min(100, Math.round(p)));
            if (next <= lastReported) return;
            lastReported = next;
            onProgress?.(next);
        };

        const runOpts = {
            signal,
            onProgress: reportProgress,
            sectionDurationSec,
            outputPath,
        };

        const wipeOutputs = async () => {
            await fs.promises.unlink(outputPath).catch(() => undefined);
            await fs.promises.unlink(`${outputPath}.part`).catch(() => undefined);
        };

        reportProgress(1);
        try {
            await runYtDlp(ytDlpPath, buildArgs(primaryFormat), runOpts);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            const retriable =
                isYoutubeForbiddenError(message) || /ffmpeg exited|stalled/i.test(message);
            if (!retriable || signal?.aborted) throw err;

            let lastErr: unknown = err;
            for (const nextFormat of retryFormats) {
                console.warn(`[yt-dlp] format failed; retrying with ${nextFormat.slice(0, 48)}…`);
                await wipeOutputs();
                try {
                    await runYtDlp(ytDlpPath, buildArgs(nextFormat), runOpts);
                    lastErr = null;
                    break;
                } catch (retryErr) {
                    lastErr = retryErr;
                }
            }
            if (lastErr) throw lastErr;
        }

        reportProgress(50);

        return {
            outputPath,
            sectionStartTime,
            cutStartSec,
            durationSec,
            needsPostProcess: precise || !!subtitles,
        };
    },

    async processWithFFmpeg(inputPath: string, outputPath: string, options: {
        subtitles?: boolean,
        subPath?: string,
        signal?: AbortSignal,
        onProgress?: (progress: number) => void,
        durationSeconds?: number,
        cutStartSec?: number,
    }) {
        const { subtitles, subPath, signal, onProgress, durationSeconds, cutStartSec = 0 } = options;
        if (signal?.aborted) {
            throw new Error("Aborted");
        }
        const ffmpegPath = resolveFfmpeg();
        const burnSubs = !!(subtitles && subPath && fs.existsSync(subPath));
        const ffmpegArgs = ["-y", "-hwaccel", "auto"];

        // Input seek for stream-copy / burn-in (avoids decoding from t=0)
        if (cutStartSec > 0) {
            ffmpegArgs.push("-ss", cutStartSec.toFixed(3));
        }
        ffmpegArgs.push("-i", inputPath);

        if (durationSeconds && durationSeconds > 0) {
            ffmpegArgs.push("-t", durationSeconds.toFixed(3));
        }

        if (burnSubs) {
            const escapedSub = subPath!
                .replace(/\\/g, "/")
                .replace(/:/g, "\\:")
                .replace(/'/g, "\\'");
            const { encoder, videoArgs } = getVideoEncoder();

            ffmpegArgs.push(
                "-vf", `subtitles='${escapedSub}'`,
                "-c:v", encoder,
                ...videoArgs,
                "-c:a", "aac",
                "-b:a", "128k",
            );
        } else {
            // Stream copy trim — typically <200ms for a short clip
            ffmpegArgs.push("-c:v", "copy", "-c:a", "copy", "-threads", "0");
        }

        ffmpegArgs.push("-movflags", "+faststart", outputPath);

        const ff = spawn(ffmpegPath, ffmpegArgs);

        if (onProgress) onProgress(burnSubs ? 50 : 90);

        ff.stderr.on("data", (data) => {
            if (!burnSubs || !durationSeconds || !onProgress) return;
            for (const line of data.toString().split(/\r|\n/)) {
                if (!line.trim()) continue;
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
            ff.on("close", (code) => {
                if (signal) signal.removeEventListener("abort", onAbort);
                if (signal?.aborted) {
                    reject(new Error("Aborted"));
                    return;
                }
                code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}`));
            });
            ff.on("error", (err) => {
                if (signal) signal.removeEventListener("abort", onAbort);
                console.error("ffmpeg subprocess error:", err);
                reject(err);
            });
        });
    }
};
