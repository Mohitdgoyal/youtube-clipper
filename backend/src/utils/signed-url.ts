import { createHmac, timingSafeEqual } from "crypto";
import { BACKEND_SECRET } from "../constants";

const DEFAULT_TTL_SECONDS = 60 * 60; // 1 hour

export function createDownloadSignature(filename: string, expires: number): string {
    return createHmac("sha256", BACKEND_SECRET)
        .update(`${filename}:${expires}`)
        .digest("hex");
}

export function buildSignedUploadUrl(
    baseUrl: string,
    filename: string,
    options?: { downloadName?: string; ttlSeconds?: number }
): string {
    const expires = Math.floor(Date.now() / 1000) + (options?.ttlSeconds ?? DEFAULT_TTL_SECONDS);
    const sig = createDownloadSignature(filename, expires);
    const url = new URL(`${baseUrl}/uploads/${filename}`);
    url.searchParams.set("expires", String(expires));
    url.searchParams.set("sig", sig);
    if (options?.downloadName) {
        url.searchParams.set("download", options.downloadName);
    }
    return url.toString();
}

export function verifyDownloadSignature(
    filename: string,
    expiresRaw: unknown,
    sigRaw: unknown
): { ok: true } | { ok: false; status: number; error: string } {
    if (typeof expiresRaw !== "string" || typeof sigRaw !== "string") {
        return { ok: false, status: 401, error: "Missing download signature" };
    }

    const expires = Number(expiresRaw);
    if (!Number.isFinite(expires)) {
        return { ok: false, status: 401, error: "Invalid expires" };
    }
    if (Math.floor(Date.now() / 1000) > expires) {
        return { ok: false, status: 401, error: "Download link expired" };
    }

    const expected = createDownloadSignature(filename, expires);
    try {
        const a = Buffer.from(expected, "utf8");
        const b = Buffer.from(sigRaw, "utf8");
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
            return { ok: false, status: 401, error: "Invalid download signature" };
        }
    } catch {
        return { ok: false, status: 401, error: "Invalid download signature" };
    }

    return { ok: true };
}
