import { YtDlpOutput } from "../types/ytdlp";

export interface FormatInfo {
    format_id: string;
    label: string;
}

/** Build deduped height labels for the editor format picker from yt-dlp -j output. */
export function buildFormatList(info: YtDlpOutput): FormatInfo[] {
    const MAX_PIXELS = 7680 * 4320;

    type Processed = {
        format_id: string;
        label: string;
        height: number;
        hasAudio: boolean;
    };

    const videoFormats = info.formats
        .filter(
            (f) =>
                f.vcodec !== "none" &&
                f.height &&
                f.width &&
                f.width * f.height <= MAX_PIXELS &&
                (f.ext === "mp4" || f.ext === "webm")
        )
        .map((f) => ({
            format_id: f.format_id,
            label: `${f.height}p${f.fps && f.fps > 30 ? f.fps : ""}${f.vcodec.includes("av01") ? " (AV1)" : ""}`,
            height: f.height || 0,
            hasAudio: f.acodec !== "none",
        }))
        .sort((a, b) => b.height - a.height);

    const byLabel = new Map<string, Processed>();
    for (const current of videoFormats) {
        const existing = byLabel.get(current.label);
        if (!existing || (current.hasAudio && !existing.hasAudio)) {
            byLabel.set(current.label, current);
        }
    }

    return Array.from(byLabel.values()).map((f) => ({
        format_id: f.hasAudio ? f.format_id : `${f.format_id}+bestaudio`,
        label: f.label,
    }));
}
