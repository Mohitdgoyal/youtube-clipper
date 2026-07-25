import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { YtDlpOutput } from "../types/ytdlp";
import { metadataCache, createCacheKey } from "./cache.service";
import { resolveYtDlp } from "../utils/binaries";

/** In-flight fetches keyed by cache key — collapses concurrent cold misses */
const inflight = new Map<string, Promise<YtDlpOutput>>();

export const metadataService = {
    async getVideoInfo(url: string): Promise<YtDlpOutput> {
        const cacheKey = createCacheKey(url);
        const cached = metadataCache.get<YtDlpOutput>(cacheKey);

        if (cached && cached.formats && Array.isArray(cached.formats)) {
            return cached;
        }

        const existing = inflight.get(cacheKey);
        if (existing) return existing;

        const promise = this.fetchInfo(url)
            .then((info) => {
                metadataCache.set(cacheKey, info);
                return info;
            })
            .finally(() => {
                inflight.delete(cacheKey);
            });

        inflight.set(cacheKey, promise);
        return promise;
    },

    async fetchInfo(url: string): Promise<YtDlpOutput> {
        const ytDlpPath = resolveYtDlp();

        const ytArgs = [
            "-j",
            "--no-playlist",
            "--no-warnings",
            "--no-check-certificates",
            "--add-header", "referer:youtube.com",
            "--add-header", "user-agent:Mozilla/5.0",
            url,
        ];

        const localCookiesPath = path.join(__dirname, "../../cookies.txt");
        if (fs.existsSync(localCookiesPath)) {
            ytArgs.push("--cookies", localCookiesPath);
        }

        return new Promise((resolve, reject) => {
            const yt = spawn(ytDlpPath, ytArgs);
            let jsonData = "";
            let errorData = "";

            yt.stdout.on("data", (data) => {
                jsonData += data.toString();
            });
            yt.stderr.on("data", (data) => {
                errorData += data.toString();
            });

            yt.on("close", (code) => {
                if (code !== 0) {
                    return reject(new Error(`yt-dlp exited with code ${code}: ${errorData}`));
                }

                try {
                    const data = JSON.parse(jsonData) as YtDlpOutput;
                    resolve(data);
                } catch {
                    reject(new Error("Failed to parse yt-dlp output"));
                }
            });
        });
    },
};
