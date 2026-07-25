import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";

const binDir = path.resolve(__dirname, "../../bin");

const memo = new Map<string, string | null>();

function exists(filePath: string): boolean {
    try {
        return fs.existsSync(filePath);
    } catch {
        return false;
    }
}

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
    const memoKey = `${envKey}:${names.join(",")}`;
    if (memo.has(memoKey)) {
        return memo.get(memoKey) as string;
    }

    const fromEnv = process.env[envKey];
    if (fromEnv && exists(fromEnv)) {
        memo.set(memoKey, fromEnv);
        return fromEnv;
    }

    for (const name of names) {
        const local = path.join(binDir, name);
        if (exists(local)) {
            memo.set(memoKey, local);
            return local;
        }
    }

    for (const name of names) {
        const cmd = name.replace(/\.exe$/i, "");
        const fromPath = which(cmd);
        if (fromPath) {
            memo.set(memoKey, fromPath);
            return fromPath;
        }
    }

    const fallback = names[0].replace(/\.exe$/i, "");
    memo.set(memoKey, fallback);
    return fallback;
}

export function resolveYtDlp(): string {
    return resolveBinary("YTDLP_PATH", ["yt-dlp.exe", "yt-dlp"]);
}

export function resolveFfmpeg(): string {
    return resolveBinary("FFMPEG_PATH", ["ffmpeg.exe", "ffmpeg"]);
}

export function resolveAria2c(): string | null {
    const memoKey = "ARIA2C";
    if (memo.has(memoKey)) {
        return memo.get(memoKey) ?? null;
    }

    const fromEnv = process.env.ARIA2C_PATH;
    if (fromEnv && exists(fromEnv)) {
        memo.set(memoKey, fromEnv);
        return fromEnv;
    }

    for (const name of ["aria2c.exe", "aria2c"]) {
        const local = path.join(binDir, name);
        if (exists(local)) {
            memo.set(memoKey, local);
            return local;
        }
    }

    const fromPath = which("aria2c");
    memo.set(memoKey, fromPath);
    return fromPath;
}
