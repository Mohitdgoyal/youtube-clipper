import fs from "fs";
import path from "path";
import { resolveFfmpeg } from "./binaries";

/**
 * Clip clients: avoid android_vr (section downloads hang on googlevideo).
 * Keep web/mweb/tv/default for progressive + non-VR dash when available.
 */
export const YT_CLIP_PLAYER_CLIENT =
    "youtube:player_client=web,mweb,tv,default,-android_sdkless,-android_vr";

/** Metadata must match clip clients so the picker doesn't list unavailable itags. */
export const YT_METADATA_PLAYER_CLIENT = YT_CLIP_PLAYER_CLIENT;

/**
 * Best available for sections.
 * Prefer DASH H.264, then progressive mp4 (itag 18 etc.), then any best.
 * Important: many videos only expose progressive mp4 on web clients.
 */
export const SAFE_SECTION_FORMAT =
    "bv[ext=mp4][vcodec^=avc1][height<=?1080][fps<=?60]+ba[ext=m4a]/" +
    "best[ext=mp4][height<=?1080]/" +
    "best[ext=mp4]/best";

/** Narrower fallback when the primary selector still fails. */
export const FALLBACK_SECTION_FORMAT =
    "best[ext=mp4]/best";

/** Build a height/fps selector with progressive fallback. */
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
    return /403 Forbidden|HTTP error 403|DRM protected|No video formats found|Requested format is not available/i.test(
        stderr
    );
}
