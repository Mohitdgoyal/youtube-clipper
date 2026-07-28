import { YtDlpOutput } from "../types/ytdlp";
import { sectionFormatForHeight } from "./yt-dlp-args";

export interface FormatInfo {
    format_id: string;
    label: string;
    tbr?: number; // total bitrate in kbps (video + audio combined estimate)
}

/** Build deduped height labels for the editor format picker from yt-dlp -j output. */
export function buildFormatList(info: YtDlpOutput): FormatInfo[] {
    const MAX_PIXELS = 7680 * 4320;

    type Processed = {
        format_id: string;
        label: string;
        height: number;
        fps: number;
        tbr: number;
    };

    const videoFormats = info.formats
        .filter(
            (f) =>
                f.vcodec !== "none" &&
                f.height &&
                f.width &&
                f.width * f.height <= MAX_PIXELS &&
                // mp4 H.264 only (DASH or progressive) — match clip-download clients
                f.ext === "mp4" &&
                (f.vcodec.includes("avc1") || f.vcodec.includes("h264"))
        )
        .map((f) => {
            const height = f.height || 0;
            const fps = f.fps && f.fps > 30 ? Math.round(f.fps) : 0;
            return {
                // Height/fps selector — not raw itag (299 etc. often 403/hang with sections)
                format_id: sectionFormatForHeight(height, fps || undefined),
                label: `${height}p${fps || ""}`,
                height,
                fps,
                tbr: f.tbr || 0,
            };
        })
        .sort((a, b) => b.height - a.height || b.fps - a.fps);

    const byLabel = new Map<string, Processed>();
    for (const current of videoFormats) {
        const existing = byLabel.get(current.label);
        if (!existing) {
            byLabel.set(current.label, current);
        } else if (current.tbr > existing.tbr) {
            // Keep the highest bitrate variant for better estimation
            byLabel.set(current.label, current);
        }
    }

    return Array.from(byLabel.values()).map((f) => ({
        format_id: f.format_id,
        label: f.label,
        ...(f.tbr > 0 ? { tbr: Math.round(f.tbr) } : {}),
    }));
}
