import fs from "fs";
import path from "path";
import { resolveFfmpeg } from "./binaries";

/** Web-first avoids slow Android VR progressive URLs on section downloads. */
export const YT_CLIP_PLAYER_CLIENT =
    "youtube:player_client=web,default,-android_sdkless";

export const YT_METADATA_PLAYER_CLIENT =
    "youtube:player_client=default,-android_sdkless";

/** H.264/AAC mp4 — 720p30 is the speed/reliability sweet spot for --download-sections. */
export const SAFE_SECTION_FORMAT =
    "bv[ext=mp4][vcodec^=avc1][height<=?720][fps<=?30]+ba[ext=m4a]/best[ext=mp4][vcodec^=avc1][height<=?720]/best";

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

/**
 * Metadata fetch (-j): needs JS runtime on modern YouTube but skips clip-only flags.
 */
export function buildMetadataYtDlpArgs(extra: string[] = []): string[] {
    const args: string[] = [
        "--no-playlist",
        "--no-check-certificates",
        "--no-warnings",
        "--ffmpeg-location", resolveFfmpeg(),
        "--extractor-args", YT_METADATA_PLAYER_CLIENT,
        "--add-header", "Referer:https://www.youtube.com/",
        ...extra,
    ];
    appendJsRuntime(args);
    appendCookies(args);
    return args;
}

/**
 * Clip download (--download-sections): web-first client, no --newline (ffmpeg uses \\r progress).
 */
export function buildClipYtDlpArgs(extra: string[] = []): string[] {
    const args: string[] = [
        "--no-playlist",
        "--no-check-certificates",
        "--no-warnings",
        "--ffmpeg-location", resolveFfmpeg(),
        "--extractor-args", YT_CLIP_PLAYER_CLIENT,
        "--add-header", "Referer:https://www.youtube.com/",
        ...extra,
    ];
    appendJsRuntime(args);
    appendCookies(args);
    return args;
}

/** @deprecated use buildClipYtDlpArgs or buildMetadataYtDlpArgs */
export function buildCommonYtDlpArgs(extra: string[] = []): string[] {
    return buildClipYtDlpArgs(extra);
}

/** Aria2 was always-on pre-optimization; opt-out with USE_ARIA2C=0. */
export function useAria2cDownloader(): boolean {
    if (process.env.USE_ARIA2C === "0" || process.env.USE_ARIA2C === "false") {
        return false;
    }
    return true;
}

export function isYoutubeForbiddenError(stderr: string): boolean {
    return /403 Forbidden|HTTP error 403|DRM protected|No video formats found/i.test(stderr);
}
