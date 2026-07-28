export type CodecId = "h264" | "vp9" | "av1";

export interface CodecConfig {
    id: CodecId;
    label: string;
    container: "mp4" | "webm";
    mimeType: string;
    ytdlpVcodecFilter: string;
    ytdlpExtFilter: string;
    ytdlpAudioFilter: string;
    ffmpegVideoEncoder: string;
    ffmpegAudioEncoder: string;
    ffmpegVideoArgs: string[];
    ffmpegAudioArgs: string[];
}

export const CODEC_CONFIGS: Record<CodecId, CodecConfig> = {
    h264: {
        id: "h264",
        label: "H.264 (MP4)",
        container: "mp4",
        mimeType: "video/mp4",
        ytdlpVcodecFilter: "avc1|h264",
        ytdlpExtFilter: "mp4",
        ytdlpAudioFilter: "ba[ext=m4a]/ba",
        ffmpegVideoEncoder: "libx264",
        ffmpegAudioEncoder: "aac",
        ffmpegVideoArgs: ["-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p"],
        ffmpegAudioArgs: ["-b:a", "128k"],
    },
    vp9: {
        id: "vp9",
        label: "VP9 (WebM)",
        container: "webm",
        mimeType: "video/webm",
        ytdlpVcodecFilter: "vp9|vp09",
        ytdlpExtFilter: "webm",
        ytdlpAudioFilter: "ba[ext=webm]/ba",
        ffmpegVideoEncoder: "libvpx-vp9",
        ffmpegAudioEncoder: "libopus", // WebM strictly requires Opus or Vorbis!
        ffmpegVideoArgs: ["-crf", "30", "-b:v", "0", "-pix_fmt", "yuv420p", "-cpu-used", "4", "-row-mt", "1"],
        ffmpegAudioArgs: ["-b:a", "128k", "-ar", "48000"], // Opus requires 48kHz
    },
    av1: {
        id: "av1",
        label: "AV1 (MP4)",
        container: "mp4",
        mimeType: "video/mp4",
        ytdlpVcodecFilter: "av01",
        ytdlpExtFilter: "mp4",
        ytdlpAudioFilter: "ba[ext=m4a]/ba",
        ffmpegVideoEncoder: "libsvtav1",
        ffmpegAudioEncoder: "aac",
        ffmpegVideoArgs: ["-crf", "30", "-preset", "8", "-pix_fmt", "yuv420p"],
        ffmpegAudioArgs: ["-b:a", "128k"],
    },
};

export const DEFAULT_CODEC: CodecId = "h264";
