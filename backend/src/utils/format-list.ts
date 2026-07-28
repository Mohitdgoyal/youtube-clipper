import { YtDlpOutput } from "../types/ytdlp";
import { sectionFormatForHeight } from "./yt-dlp-args";
import { CODEC_CONFIGS, CodecId } from "./codec-config";

export interface FormatInfo {
    format_id: string;
    label: string;
    tbr?: number; // total bitrate in kbps (video + audio combined estimate)
}

/** Build deduped height labels for the editor format picker from yt-dlp -j output for a target codec. */
export function buildFormatList(info: YtDlpOutput, codecId: CodecId = "h264"): FormatInfo[] {
    const MAX_PIXELS = 7680 * 4320;
    const codec = CODEC_CONFIGS[codecId] || CODEC_CONFIGS.h264;

    type Processed = {
        format_id: string;
        label: string;
        height: number;
        fps: number;
        tbr: number;
    };

    const vcodecRegex = new RegExp(codec.ytdlpVcodecFilter, "i");

    const videoFormats = info.formats
        .filter((f) => {
            if (f.vcodec === "none" || !f.height || !f.width) return false;
            if (f.width * f.height > MAX_PIXELS) return false;

            // Match codec filter (e.g. avc1/h264 for H.264, vp9/vp09 for VP9, av01 for AV1)
            return vcodecRegex.test(f.vcodec);
        })
        .map((f) => {
            const height = f.height || 0;
            const fps = f.fps && f.fps > 30 ? Math.round(f.fps) : 0;
            return {
                format_id: sectionFormatForHeight(height, fps || undefined, codecId),
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
            byLabel.set(current.label, current);
        }
    }

    return Array.from(byLabel.values()).map((f) => ({
        format_id: f.format_id,
        label: f.label,
        ...(f.tbr > 0 ? { tbr: Math.round(f.tbr) } : {}),
    }));
}

/** Build per-codec format maps for the frontend */
export function buildFormatsByCodec(info: YtDlpOutput): {
    formats: FormatInfo[];
    availableCodecs: CodecId[];
    formatsByCodec: Record<CodecId, FormatInfo[]>;
} {
    const codecs: CodecId[] = ["h264", "vp9", "av1"];
    const formatsByCodec: Record<CodecId, FormatInfo[]> = {
        h264: buildFormatList(info, "h264"),
        vp9: buildFormatList(info, "vp9"),
        av1: buildFormatList(info, "av1"),
    };

    const availableCodecs = codecs.filter((c) => formatsByCodec[c].length > 0);
    // If VP9 or AV1 has no formats detected, keep H.264 as minimum available
    if (availableCodecs.length === 0) availableCodecs.push("h264");

    return {
        formats: formatsByCodec.h264,
        availableCodecs,
        formatsByCodec,
    };
}
