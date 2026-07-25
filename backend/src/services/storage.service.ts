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

    async uploadFile(filename: string, bufferOrStream: Buffer | NodeJS.ReadableStream) {
        const filePath = path.join(UPLOADS_DIR, filename);

        if (Buffer.isBuffer(bufferOrStream)) {
            await fs.promises.writeFile(filePath, bufferOrStream);
        } else {
            const writeStream = fs.createWriteStream(filePath);
            bufferOrStream.pipe(writeStream);
            await new Promise<void>((resolve, reject) => {
                writeStream.on("finish", () => resolve());
                writeStream.on("error", reject);
            });
        }

        return this.getPublicUrl(filename);
    },

    async deleteFile(filename: string) {
        const filePath = path.join(UPLOADS_DIR, filename);
        if (fs.existsSync(filePath)) {
            await fs.promises.unlink(filePath);
        }
    },

    async listFiles() {
        if (!fs.existsSync(UPLOADS_DIR)) return [];
        const files = await fs.promises.readdir(UPLOADS_DIR);
        return files.map((f) => ({ name: f }));
    },

    /** Time-limited HMAC-signed download URL. */
    async getSignedDownloadUrl(filename: string, downloadName: string) {
        return buildSignedUploadUrl(BASE_URL, filename, {
            downloadName,
            ttlSeconds: DOWNLOAD_URL_TTL_SECONDS,
        });
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
