import fs from "fs";
import path from "path";
import { resolveFfmpeg } from "./binaries";

/**
 * QUALITY: includes android_vr — often 720p/1080p, but section downloads can hang.
 * Use with a short file-growth stall timeout, then fall back to RELIABLE.
 */
export const YT_QUALITY_PLAYER_CLIENT =
    "youtube:player_client=default,-android_sdkless";

/**
 * RELIABLE: no android_vr. Works for --download-sections; may only expose progressive 360p
 * when YouTube gates DASH behind PO tokens.
 */
export const YT_RELIABLE_PLAYER_CLIENT =
    "youtube:player_client=web,mweb,tv,default,-android_sdkless,-android_vr";

/** Metadata lists what RELIABLE can actually fetch (honest picker). */
export const YT_METADATA_PLAYER_CLIENT = YT_RELIABLE_PLAYER_CLIENT;

/** Prefer DASH H.264 ≤1080p60, then progressive mp4, then anything. */
export const SAFE_SECTION_FORMAT =
    "bv[ext=mp4][vcodec^=avc1][height<=?1080][fps<=?60]+ba[ext=m4a]/" +
    "best[ext=mp4][height<=?1080]/" +
    "best[ext=mp4]/best";

export const FALLBACK_SECTION_FORMAT = "best[ext=mp4]/best";

export function sectionFormatForHeight(height: number, fps?: number): string {
    const h = Math.max(144, Math.min(2160, Math.round(height)));
    const f = fps && fps > 30 ? Math.min(60, Math.round(fps)) : undefined;
    const fpsFilter = f ? `[fps<=?${f}]` : "";
    return (
        `bv[ext=mp4][vcodec^=avc1][height<=?${h}]${fpsFilter}+ba[ext=m4a]/` +
        `best[ext=mp4][height<=?${h}]/` +
        `best[ext=mp4]/best`
    );
}

export type ClipAttempt = {
    label: string;
    playerClient: string;
    format: string;
    /** Only count .part/.mp4 byte growth — not stderr chatter */
    stallMs: number;
};

/**
 * Ordered attempts: quality first (short clips only), then reliable.
 * Long sections (≥90s) skip android_vr — hangs waste minutes and mid-download
 * stall kills are catastrophic on 4+ minute clips.
 */
export function buildClipAttempts(
    preferredFormat?: string,
    sectionDurationSec = 0
): ClipAttempt[] {
    const preferred = preferredFormat?.trim();
    const formats = [
        preferred,
        SAFE_SECTION_FORMAT,
        FALLBACK_SECTION_FORMAT,
    ].filter((f, i, arr): f is string => !!f && arr.indexOf(f) === i);

    const attempts: ClipAttempt[] = [];
    const allowQualityProbe = sectionDurationSec > 0 && sectionDurationSec < 90;

    if (allowQualityProbe) {
        for (const format of formats) {
            attempts.push({
                label: `quality:${format.slice(0, 40)}`,
                playerClient: YT_QUALITY_PLAYER_CLIENT,
                format,
                // Short leash only until first bytes; after growth use longer window in runYtDlp
                stallMs: Number(process.env.YTDLP_QUALITY_STALL_MS || 20_000),
            });
        }
    }

    for (const format of formats) {
        attempts.push({
            label: `reliable:${format.slice(0, 40)}`,
            playerClient: YT_RELIABLE_PLAYER_CLIENT,
            format,
            // Long clips can pause between fragments — do not kill at 45s
            stallMs: Number(process.env.YTDLP_STALL_TIMEOUT_MS || 120_000),
        });
    }
    return attempts;
}

function appendCookies(args: string[]): void {
    const cookiesPath =
        process.env.YTDLP_COOKIES ||
        path.join(__dirname, "../../cookies.txt");
    if (fs.existsSync(cookiesPath)) {
        args.push("--cookies", cookiesPath);
    } else if (process.env.COOKIES_FROM_BROWSER) {
        args.push("--cookies-from-browser", process.env.COOKIES_FROM_BROWSER);
    }
}

function appendJsRuntime(args: string[]): void {
    if (process.env.YTDLP_JS_RUNTIME === "0") return;
    args.push("--js-runtimes", process.env.YTDLP_JS_RUNTIME || "node");
}

function buildBaseArgs(playerClient: string, extra: string[] = []): string[] {
    const args: string[] = [
        "--no-playlist",
        "--no-check-certificates",
        "--no-warnings",
        "--ffmpeg-location", resolveFfmpeg(),
        "--extractor-args", playerClient,
        "--add-header", "Referer:https://www.youtube.com/",
        ...extra,
    ];
    appendJsRuntime(args);
    appendCookies(args);
    return args;
}

export function buildMetadataYtDlpArgs(extra: string[] = []): string[] {
    return buildBaseArgs(YT_METADATA_PLAYER_CLIENT, extra);
}

export function buildClipYtDlpArgs(
    extra: string[] = [],
    playerClient: string = YT_RELIABLE_PLAYER_CLIENT
): string[] {
    return buildBaseArgs(playerClient, extra);
}

/** @deprecated */
export function buildCommonYtDlpArgs(extra: string[] = []): string[] {
    return buildClipYtDlpArgs(extra);
}

export function useAria2cDownloader(): boolean {
    return process.env.USE_ARIA2C === "1" || process.env.USE_ARIA2C === "true";
}

export function isDrmProtectedError(stderr: string): boolean {
    return /DRM protected/i.test(stderr);
}

/** Errors worth trying the next client/format attempt. DRM is never retriable. */
export function isRetriableYtDlpError(stderr: string): boolean {
    if (isDrmProtectedError(stderr)) return false;
    return /403 Forbidden|HTTP error 403|No video formats found|Requested format is not available|stalled for|ffmpeg exited|Sign in to confirm|confirm you’re not a bot|confirm you're not a bot/i.test(
        stderr
    );
}

/** Short user-facing message from yt-dlp stderr. */
export function sanitizeYtDlpError(stderr: string): string {
    if (/DRM protected/i.test(stderr)) {
        return "This video is DRM-protected and can’t be clipped.";
    }
    if (/Sign in to confirm|not a bot/i.test(stderr)) {
        return "YouTube is blocking downloads. Add cookies (backend/cookies.txt) and retry.";
    }
    if (/Requested format is not available|No video formats found/i.test(stderr)) {
        return "No compatible format available for this video. Try Best available, or add cookies for higher quality.";
    }
    if (/stalled for/i.test(stderr)) {
        return "Download stalled (YouTube closed the media stream). Retrying with a safer method…";
    }
    if (/403 Forbidden|HTTP error 403/i.test(stderr)) {
        return "YouTube returned 403 Forbidden. Retry or add cookies.";
    }
    const line = stderr
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find((l) => /^ERROR:/i.test(l));
    if (line) return line.replace(/^ERROR:\s*/i, "").slice(0, 240);
    return "Clip download failed. Please retry.";
}
