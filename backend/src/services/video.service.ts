import { spawn, execFile } from "child_process";
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
    buildClipAttempts,
    isRetriableYtDlpError,
    isDrmProtectedError,
    sanitizeYtDlpError,
    type ClipAttempt,
} from "../utils/yt-dlp-args";

/** Lead-in so stream-copy trim / subtitle burn-in can hit the exact start. */
const SECTION_PAD_SEC = 2;

export type ClipDownloadResult = {
    outputPath: string;
    sectionStartTime: string;
    cutStartSec: number;
    durationSec: number;
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
        onProgress(Math.min(49, Math.round(parseFloat(dlMatch[1]) / 2)));
        return;
    }

    if (sectionDurationSec > 0) {
        const timeMatch = str.match(/time=(\d+(?:\.\d+)?|\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?)/);
        if (timeMatch) {
            const seconds = parseFfmpegTimeSeconds(timeMatch[1]);
            if (seconds != null && seconds >= 0) {
                const pct = Math.min(100, Math.round((seconds / sectionDurationSec) * 100));
                onProgress(Math.min(49, Math.round(pct / 2)));
            }
        }
    }
}

function feedYtDlpOutput(chunk: string, sectionDurationSec: number, onProgress?: (n: number) => void) {
    for (const line of chunk.split(/\r|\n/)) {
        if (line.trim()) parseDownloadProgress(line, sectionDurationSec, onProgress);
    }
}

function killProcessTree(pid: number | undefined) {
    if (!pid) return;
    if (process.platform === "win32") {
        execFile("taskkill", ["/pid", String(pid), "/T", "/F"], () => undefined);
        return;
    }
    try {
        process.kill(-pid, "SIGTERM");
    } catch {
        try {
            process.kill(pid, "SIGTERM");
        } catch {
            /* ignore */
        }
    }
}

function fileSize(p: string): number {
    try {
        return fs.existsSync(p) ? fs.statSync(p).size : 0;
    } catch {
        return 0;
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
        stallMs: number;
    }
): Promise<string> {
    const { signal, onProgress, sectionDurationSec, outputPath, stallMs } = options;
    const partPath = `${outputPath}.part`;

    return new Promise((resolve, reject) => {
        const yt = spawn(ytDlpPath, ytArgs, {
            // New process group on Unix so we can kill children
            detached: process.platform !== "win32",
        });
        let stderrTail = "";
        let settled = false;
        let lastByteCount = 0;
        let lastGrowthAt = Date.now();
        let sawAnyBytes = false;

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
            // Progress only — do NOT reset stall timer on stderr (ffmpeg spam while hung)
            feedYtDlpOutput(str, sectionDurationSec, onProgress);
        };

        yt.stdout.on("data", onChunk);
        yt.stderr.on("data", onChunk);

        const onAbort = () => killProcessTree(yt.pid);

        if (signal) {
            if (signal.aborted) onAbort();
            else signal.addEventListener("abort", onAbort, { once: true });
        }

        const stallTimer = setInterval(() => {
            if (settled) return;
            const size = Math.max(fileSize(partPath), fileSize(outputPath));
            if (size > lastByteCount) {
                lastByteCount = size;
                lastGrowthAt = Date.now();
                sawAnyBytes = true;
                return;
            }
            // Before first byte: honor attempt stallMs (quality ~20s fail-fast).
            // After bytes flow: allow longer pauses (fragment gaps on long clips).
            const grace = sawAnyBytes ? Math.max(stallMs, 90_000) : stallMs;
            if (Date.now() - lastGrowthAt >= grace) {
                onAbort();
                finish(() =>
                    reject(
                        new Error(
                            `yt-dlp stalled for ${Math.round(grace / 1000)}s with no file growth`
                        )
                    )
                );
            }
        }, 1500);
        stallTimer.unref?.();

        yt.on("close", (code) => {
            finish(() => {
                if (signal?.aborted) {
                    reject(new Error("Aborted"));
                    return;
                }
                if (code === 0) resolve(stderrTail);
                else reject(new Error(`yt-dlp exited with code ${code}: ${stderrTail}`));
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

        const buildArgs = (attempt: ClipAttempt) => {
            const ytArgs = buildClipYtDlpArgs(
                [
                    url,
                    "--download-sections", section,
                    "-o", outputPath,
                    "--merge-output-format", "mp4",
                    "--concurrent-fragments", CONCURRENT_FRAGMENTS,
                    "--buffer-size", BUFFER_SIZE,
                    "-f", attempt.format,
                    "--force-overwrites",
                ],
                attempt.playerClient
            );

            // Never --force-keyframes-at-cuts (HTTP re-encode hangs).

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

        let lastReported = 0;
        const reportProgress = (p: number) => {
            const next = Math.max(0, Math.min(100, Math.round(p)));
            if (next <= lastReported) return;
            lastReported = next;
            onProgress?.(next);
        };

        const wipeOutputs = async () => {
            await fs.promises.unlink(outputPath).catch(() => undefined);
            await fs.promises.unlink(`${outputPath}.part`).catch(() => undefined);
        };

        const attempts = buildClipAttempts(formatId, sectionDurationSec);
        reportProgress(1);

        let lastErr: unknown;
        for (let i = 0; i < attempts.length; i++) {
            const attempt = attempts[i];
            if (signal?.aborted) throw new Error("Aborted");

            await wipeOutputs();
            console.log(`[yt-dlp] attempt ${i + 1}/${attempts.length}: ${attempt.label}`);

            try {
                await runYtDlp(ytDlpPath, buildArgs(attempt), {
                    signal,
                    onProgress: reportProgress,
                    sectionDurationSec,
                    outputPath,
                    stallMs: attempt.stallMs,
                });
                lastErr = null;
                break;
            } catch (err) {
                lastErr = err;
                const message = err instanceof Error ? err.message : String(err);
                console.warn(`[yt-dlp] attempt failed: ${sanitizeYtDlpError(message)}`);
                // DRM never succeeds on retry — fail the job immediately
                if (isDrmProtectedError(message)) break;
                const retriable = isRetriableYtDlpError(message) || /stalled for/i.test(message);
                if (!retriable || i === attempts.length - 1) break;
            }
        }

        if (lastErr) {
            const message = lastErr instanceof Error ? lastErr.message : String(lastErr);
            throw new Error(sanitizeYtDlpError(message));
        }

        if (!fs.existsSync(outputPath) || fileSize(outputPath) < 1024) {
            throw new Error("Download finished but output file is missing or empty. Please retry.");
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
        if (signal?.aborted) throw new Error("Aborted");

        const ffmpegPath = resolveFfmpeg();
        const burnSubs = !!(subtitles && subPath && fs.existsSync(subPath));
        const ffmpegArgs = ["-y", "-hwaccel", "auto"];

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

        const onAbort = () => killProcessTree(ff.pid);
        if (signal) signal.addEventListener("abort", onAbort, { once: true });

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
