import fs from "fs";
import path from "path";
import { resolveFfmpeg } from "./binaries";

/**
 * Prefer web clients for --download-sections.
 * `default` alone often picks ANDROID_VR progressive URLs that hang under ffmpeg.
 */
export const YT_CLIP_PLAYER_CLIENT =
    "youtube:player_client=web,mweb,tv,default,-android_sdkless,-android_vr";

export const YT_METADATA_PLAYER_CLIENT =
    "youtube:player_client=web,default,-android_sdkless";

/** H.264/AAC mp4 — 720p30 is fastest reliable section download. */
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

/**
 * Aria2 breaks ffmpeg --download-sections (signed googlevideo URLs).
 * Keep OFF unless explicitly enabled.
 */
export function useAria2cDownloader(): boolean {
    return process.env.USE_ARIA2C === "1" || process.env.USE_ARIA2C === "true";
}

export function isYoutubeForbiddenError(stderr: string): boolean {
    return /403 Forbidden|HTTP error 403|DRM protected|No video formats found/i.test(stderr);
}
