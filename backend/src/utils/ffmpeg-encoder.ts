import { spawnSync } from "child_process";
import { FFMPEG_PRESET } from "../constants";
import { resolveFfmpeg } from "./binaries";

export type EncoderConfig = {
    encoder: string;
    /** Extra args after `-c:v <encoder>` (preset/quality), excluding audio */
    videoArgs: string[];
};

let cached: EncoderConfig | null = null;

/**
 * Detect a working H.264 encoder via a tiny probe encode.
 * Env `FFMPEG_ENCODER` always wins when set (still probed once for logging).
 */
export function getVideoEncoder(): EncoderConfig {
    if (cached) return cached;

    const ffmpeg = resolveFfmpeg();
    const envEncoder = process.env.FFMPEG_ENCODER;
    if (envEncoder) {
        const cfg: EncoderConfig = {
            encoder: envEncoder,
            videoArgs: buildSoftwareOrGenericArgs(envEncoder, process.env.FFMPEG_PRESET || FFMPEG_PRESET),
        };
        if (!probeEncoder(ffmpeg, cfg)) {
            console.warn(`FFMPEG_ENCODER=${envEncoder} failed probe; falling back to auto-detect`);
        } else {
            cached = cfg;
            console.log(`FFmpeg encoder: ${envEncoder} (from env)`);
            return cached;
        }
    }

    const candidates: EncoderConfig[] = [
        {
            encoder: "h264_nvenc",
            videoArgs: ["-preset", process.env.FFMPEG_PRESET || "p4", "-cq", "28", "-b:v", "0"],
        },
        {
            encoder: "h264_qsv",
            videoArgs: ["-preset", process.env.FFMPEG_PRESET || "veryfast", "-global_quality", "28"],
        },
        {
            encoder: "h264_amf",
            videoArgs: ["-quality", "speed", "-rc", "cqp", "-qp_i", "28"],
        },
        {
            encoder: "libx264",
            videoArgs: ["-preset", process.env.FFMPEG_PRESET || "ultrafast", "-crf", "28", "-threads", "0"],
        },
    ];

    // Only try HW candidates if they appear in the encoder list (fast reject)
    const listing = getEncoderListing(ffmpeg);

    for (const candidate of candidates) {
        if (candidate.encoder !== "libx264" && !listing.includes(candidate.encoder)) {
            continue;
        }
        if (probeEncoder(ffmpeg, candidate)) {
            cached = candidate;
            console.log(`FFmpeg encoder: ${candidate.encoder} (probe ok)`);
            return cached;
        }
        console.warn(`FFmpeg encoder probe failed: ${candidate.encoder}`);
    }

    // Absolute last resort — return libx264 even if probe failed (ffmpeg missing etc.)
    cached = candidates[candidates.length - 1];
    console.warn("FFmpeg encoder: libx264 (fallback without successful probe)");
    return cached;
}

function getEncoderListing(ffmpeg: string): string {
    const result = spawnSync(ffmpeg, ["-hide_banner", "-encoders"], {
        encoding: "utf8",
        timeout: 10_000,
    });
    return `${result.stdout || ""}\n${result.stderr || ""}`;
}

/** Encode one tiny black frame to verify the encoder actually works. */
function probeEncoder(ffmpeg: string, config: EncoderConfig): boolean {
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
        return ["-preset", preset || "p4", "-cq", "28", "-b:v", "0"];
    }
    if (encoder === "h264_qsv") {
        return ["-preset", preset || "veryfast", "-global_quality", "28"];
    }
    if (encoder === "h264_amf") {
        return ["-quality", "speed", "-rc", "cqp", "-qp_i", "28"];
    }
    return ["-preset", preset || "ultrafast", "-crf", "28", "-threads", "0"];
}
