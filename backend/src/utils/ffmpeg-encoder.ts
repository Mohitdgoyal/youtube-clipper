import { spawnSync } from "child_process";
import { FFMPEG_PRESET } from "../constants";
import { resolveFfmpeg } from "./binaries";
import { CODEC_CONFIGS, CodecId } from "./codec-config";

export type EncoderConfig = {
    encoder: string;
    /** Extra args after `-c:v <encoder>` (preset/quality), excluding audio */
    videoArgs: string[];
    audioEncoder: string;
    audioArgs: string[];
};

const codecCache = new Map<string, EncoderConfig>();
let cachedH264: EncoderConfig | null = null;

/**
 * Detect a working H.264 encoder via a tiny probe encode.
 * Env `FFMPEG_ENCODER` always wins when set (still probed once for logging).
 */
export function getVideoEncoder(): EncoderConfig {
    if (cachedH264) return cachedH264;

    const ffmpeg = resolveFfmpeg();
    const preset = process.env.FFMPEG_PRESET || FFMPEG_PRESET;
    const disableHw =
        process.env.DISABLE_HW_ENCODE === "1" ||
        process.env.DISABLE_HW_ENCODE === "true";

    const envEncoder = process.env.FFMPEG_ENCODER;
    if (envEncoder) {
        const cfg: EncoderConfig = {
            encoder: envEncoder,
            videoArgs: buildSoftwareOrGenericArgs(envEncoder, preset),
            audioEncoder: "aac",
            audioArgs: ["-b:a", "128k"],
        };
        if (!probeEncoder(ffmpeg, cfg)) {
            console.warn(`FFMPEG_ENCODER=${envEncoder} failed probe; falling back to auto-detect`);
        } else {
            cachedH264 = cfg;
            console.log(`FFmpeg encoder: ${envEncoder} (from env)`);
            return cachedH264;
        }
    }

    if (disableHw || envEncoder === "libx264") {
        cachedH264 = {
            encoder: "libx264",
            videoArgs: ["-preset", preset || "veryfast", "-crf", "28", "-pix_fmt", "yuv420p", "-threads", "0"],
            audioEncoder: "aac",
            audioArgs: ["-b:a", "128k"],
        };
        console.log("FFmpeg encoder: libx264 (DISABLE_HW_ENCODE or forced software)");
        return cachedH264;
    }

    const candidates: EncoderConfig[] = [
        {
            encoder: "h264_nvenc",
            videoArgs: ["-preset", process.env.FFMPEG_PRESET || "p4", "-cq", "28", "-b:v", "0", "-pix_fmt", "yuv420p"],
            audioEncoder: "aac",
            audioArgs: ["-b:a", "128k"],
        },
        {
            encoder: "h264_qsv",
            videoArgs: ["-preset", process.env.FFMPEG_PRESET || "veryfast", "-global_quality", "28", "-pix_fmt", "yuv420p"],
            audioEncoder: "aac",
            audioArgs: ["-b:a", "128k"],
        },
        {
            encoder: "h264_amf",
            videoArgs: ["-quality", "speed", "-rc", "cqp", "-qp_i", "28", "-pix_fmt", "yuv420p"],
            audioEncoder: "aac",
            audioArgs: ["-b:a", "128k"],
        },
        {
            encoder: "libx264",
            videoArgs: ["-preset", preset || "veryfast", "-crf", "28", "-pix_fmt", "yuv420p", "-threads", "0"],
            audioEncoder: "aac",
            audioArgs: ["-b:a", "128k"],
        },
    ];

    const listing = getEncoderListing(ffmpeg);

    for (const candidate of candidates) {
        if (candidate.encoder !== "libx264" && !listing.includes(candidate.encoder)) {
            continue;
        }
        if (probeEncoder(ffmpeg, candidate)) {
            cachedH264 = candidate;
            console.log(`FFmpeg encoder: ${candidate.encoder} (probe ok)`);
            return cachedH264;
        }
        console.warn(`FFmpeg encoder probe failed: ${candidate.encoder}`);
    }

    cachedH264 = candidates[candidates.length - 1];
    console.warn("FFmpeg encoder: libx264 (fallback without successful probe)");
    return cachedH264;
}

/** Get probed video/audio encoder configuration for a specific codec (H.264, VP9, or AV1) */
export function getCodecEncoder(codecId: CodecId = "h264"): EncoderConfig {
    if (codecId === "h264") return getVideoEncoder();

    if (codecCache.has(codecId)) return codecCache.get(codecId)!;

    const ffmpeg = resolveFfmpeg();
    const config = CODEC_CONFIGS[codecId] || CODEC_CONFIGS.h264;

    const targetCfg: EncoderConfig = {
        encoder: config.ffmpegVideoEncoder,
        videoArgs: config.ffmpegVideoArgs,
        audioEncoder: config.ffmpegAudioEncoder,
        audioArgs: config.ffmpegAudioArgs,
    };

    if (probeEncoder(ffmpeg, targetCfg)) {
        console.log(`FFmpeg ${codecId} encoder: ${targetCfg.encoder} (probe ok)`);
        codecCache.set(codecId, targetCfg);
        return targetCfg;
    }

    console.warn(`FFmpeg ${codecId} encoder ${targetCfg.encoder} failed probe; falling back to H.264`);
    const fallback = getVideoEncoder();
    codecCache.set(codecId, fallback);
    return fallback;
}

function getEncoderListing(ffmpeg: string): string {
    const result = spawnSync(ffmpeg, ["-hide_banner", "-encoders"], {
        encoding: "utf8",
        timeout: 10_000,
    });
    return `${result.stdout || ""}\n${result.stderr || ""}`;
}

/** Encode one tiny black frame to verify the encoder actually works. */
export function probeEncoder(ffmpeg: string, config: EncoderConfig): boolean {
    const args = [
        "-hide_banner",
        "-loglevel", "error",
        "-f", "lavfi",
        "-i", "color=c=black:s=64x64:d=0.1",
        "-frames:v", "1",
        "-c:v", config.encoder,
        ...config.videoArgs,
        "-f", "null",
        "-",
    ];
    const result = spawnSync(ffmpeg, args, {
        encoding: "utf8",
        timeout: 20_000,
    });
    return result.status === 0;
}

function buildSoftwareOrGenericArgs(encoder: string, preset: string): string[] {
    if (encoder === "h264_nvenc") {
        return ["-preset", preset || "p4", "-cq", "28", "-b:v", "0", "-pix_fmt", "yuv420p"];
    }
    if (encoder === "h264_qsv") {
        return ["-preset", preset || "veryfast", "-global_quality", "28", "-pix_fmt", "yuv420p"];
    }
    if (encoder === "h264_amf") {
        return ["-quality", "speed", "-rc", "cqp", "-qp_i", "28", "-pix_fmt", "yuv420p"];
    }
    return ["-preset", preset || "ultrafast", "-crf", "28", "-pix_fmt", "yuv420p", "-threads", "0"];
}
