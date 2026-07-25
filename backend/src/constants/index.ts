import path from "path";
import fs from "fs";

export const PORT = process.env.PORT || 3001;
export const NODE_ENV = process.env.NODE_ENV || "development";

export const ALLOWED_ORIGIN = NODE_ENV === "production"
    ? (process.env.ALLOWED_ORIGIN || "https://clippa.in")
    : (process.env.ALLOWED_ORIGIN || "http://localhost:3000");

export const UPLOADS_DIR = path.join(__dirname, "../../uploads");

// Ensure directories exist
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const rawSecret = process.env.BACKEND_SECRET;
if (NODE_ENV === "production") {
    if (!rawSecret || rawSecret === "dev-secret") {
        throw new Error(
            "BACKEND_SECRET must be set to a strong value in production (not 'dev-secret')."
        );
    }
}

export const BACKEND_SECRET = rawSecret || "dev-secret";

// FFmpeg — encoder auto-detected at runtime unless FFMPEG_ENCODER is set
export const FFMPEG_PRESET = process.env.FFMPEG_PRESET || "ultrafast";

// Download Optimizations
export const BUFFER_SIZE = process.env.BUFFER_SIZE || "4M";
export const ARIA2C_CONNECTIONS = process.env.ARIA2C_CONNECTIONS || "32";
export const CONCURRENT_FRAGMENTS = process.env.CONCURRENT_FRAGMENTS || "16";

// Clip job concurrency (Phase 2 queue)
export const CLIP_JOB_CONCURRENCY = Number(process.env.CLIP_JOB_CONCURRENCY || 2);

// Signed download URL lifetime
export const DOWNLOAD_URL_TTL_SECONDS = Number(process.env.DOWNLOAD_URL_TTL_SECONDS || 3600);
