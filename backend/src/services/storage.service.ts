import fs from "fs";
import path from "path";
import { UPLOADS_DIR, DOWNLOAD_URL_TTL_SECONDS } from "../constants";
import { buildSignedUploadUrl } from "../utils/signed-url";

// The server's base URL should be loaded from env or default to localhost
const BASE_URL = process.env.BACKEND_API_URL || "http://localhost:3001";

export const storageService = {
    /** Unsigned canonical URL (stored in DB; not for direct unauthenticated access). */
    getPublicUrl(filename: string) {
        return `${BASE_URL}/uploads/${filename}`;
    },

    /** Rename a temp file already on disk to its final name (no re-copy). */
    async finalizeLocalFile(tempFilename: string, finalFilename: string) {
        const tempPath = path.join(UPLOADS_DIR, tempFilename);
        const finalPath = path.join(UPLOADS_DIR, finalFilename);
        if (tempPath !== finalPath) {
            await fs.promises.rename(tempPath, finalPath);
        }
        return this.getPublicUrl(finalFilename);
    },

    async deleteFile(filename: string) {
        const filePath = path.join(UPLOADS_DIR, filename);
        try {
            await fs.promises.unlink(filePath);
        } catch (err: unknown) {
            const code = (err as NodeJS.ErrnoException)?.code;
            if (code !== 'ENOENT' && code !== 'EBUSY' && code !== 'EPERM') throw err;
        }
    },

    /** Sign an existing public/unsigned upload URL for client download. */
    signPublicUrl(publicUrl: string, downloadName?: string): string {
        try {
            const parsed = new URL(publicUrl);
            const filename = path.basename(parsed.pathname);
            return buildSignedUploadUrl(BASE_URL, filename, {
                downloadName,
                ttlSeconds: DOWNLOAD_URL_TTL_SECONDS,
            });
        } catch {
            return publicUrl;
        }
    },
};
