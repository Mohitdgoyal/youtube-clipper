import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";

const binDir = path.resolve(__dirname, "../../bin");

function exists(filePath: string): boolean {
    try {
        return fs.existsSync(filePath);
    } catch {
        return false;
    }
}

/** Resolve a command on PATH (`where` on Windows, `which` elsewhere). */
function which(cmd: string): string | null {
    const finder = process.platform === "win32" ? "where" : "which";
    const result = spawnSync(finder, [cmd], { encoding: "utf8" });
    if (result.status !== 0) return null;
    const first = result.stdout
        .split(/\r?\n/)
        .map((s) => s.trim())
        .find(Boolean);
    return first || null;
}

function resolveBinary(envKey: string, names: string[]): string {
    const fromEnv = process.env[envKey];
    if (fromEnv && exists(fromEnv)) return fromEnv;

    for (const name of names) {
        const local = path.join(binDir, name);
        if (exists(local)) return local;
    }

    for (const name of names) {
        // Strip extension for PATH lookup on Unix
        const cmd = name.replace(/\.exe$/i, "");
        const fromPath = which(cmd);
        if (fromPath) return fromPath;
    }

    // Last resort: bare command name (relies on PATH at spawn time)
    return names[0].replace(/\.exe$/i, "");
}

export function resolveYtDlp(): string {
    return resolveBinary("YTDLP_PATH", ["yt-dlp.exe", "yt-dlp"]);
}

export function resolveFfmpeg(): string {
    return resolveBinary("FFMPEG_PATH", ["ffmpeg.exe", "ffmpeg"]);
}

export function resolveAria2c(): string | null {
    const fromEnv = process.env.ARIA2C_PATH;
    if (fromEnv && exists(fromEnv)) return fromEnv;

    for (const name of ["aria2c.exe", "aria2c"]) {
        const local = path.join(binDir, name);
        if (exists(local)) return local;
    }

    return which("aria2c");
}
