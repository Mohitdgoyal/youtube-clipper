import fs from "fs";
import path from "path";
import { resolveFfmpeg } from "./binaries";

/**
 * Prefer default clients minus broken android_sdkless.
 * Avoid forcing `tv` alone — YouTube DRM experiments can mark all tv formats DRM.
 * Node is required as a JS runtime for n-challenge / EJS solving (yt-dlp wiki).
 */
export const YT_PLAYER_CLIENT_ARGS =
    "youtube:player_client=default,-android_sdkless";

/** Safer default for section downloads (H.264/AAC mp4). */
export const SAFE_SECTION_FORMAT =
    "bv[ext=mp4][vcodec^=avc1][height<=?1080][fps<=?60]+ba[ext=m4a]/best[ext=mp4][vcodec^=avc1][height<=?1080]/best";

/**
 * Shared yt-dlp flags that reduce YouTube 403s on googlevideo URLs.
 */
export function buildCommonYtDlpArgs(extra: string[] = []): string[] {
    const args: string[] = [
        "--no-playlist",
        "--no-check-certificates",
        "--no-warnings",
        "--ffmpeg-location", resolveFfmpeg(),
        // Solve YouTube JS challenges (needed for many formats in 2026+)
        "--js-runtimes", "node",
        "--extractor-args", YT_PLAYER_CLIENT_ARGS,
        "--add-header", "Referer:https://www.youtube.com/",
        ...extra,
    ];

    const cookiesPath =
        process.env.YTDLP_COOKIES ||
        path.join(__dirname, "../../cookies.txt");
    if (fs.existsSync(cookiesPath)) {
        args.push("--cookies", cookiesPath);
    } else if (process.env.COOKIES_FROM_BROWSER) {
        // e.g. chrome | edge | firefox — browser must be closed on Windows
        args.push("--cookies-from-browser", process.env.COOKIES_FROM_BROWSER);
    }

    return args;
}

/** Aria2 often breaks YouTube signed URLs / section downloads; opt-in only. */
export function useAria2cDownloader(): boolean {
    return process.env.USE_ARIA2C === "1" || process.env.USE_ARIA2C === "true";
}

export function isYoutubeForbiddenError(stderr: string): boolean {
    return /403 Forbidden|HTTP error 403|DRM protected|No video formats found/i.test(stderr);
}
