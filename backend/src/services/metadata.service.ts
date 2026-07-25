import { spawn } from "child_process";
import { YtDlpOutput } from "../types/ytdlp";
import { metadataCache, createCacheKey } from "./cache.service";
import { resolveYtDlp } from "../utils/binaries";
import { buildMetadataYtDlpArgs } from "../utils/yt-dlp-args";

/** In-flight fetches keyed by cache key — collapses concurrent cold misses */
const inflight = new Map<string, Promise<YtDlpOutput>>();

const METADATA_TIMEOUT_MS = Number(process.env.YTDLP_METADATA_TIMEOUT_MS || 45_000);

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
        const ytArgs = buildMetadataYtDlpArgs(["-j", url]);

        return new Promise((resolve, reject) => {
            const yt = spawn(ytDlpPath, ytArgs);
            let jsonData = "";
            let errorData = "";
            let settled = false;

            const finish = (fn: () => void) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                fn();
            };

            const timer = setTimeout(() => {
                yt.kill();
                finish(() =>
                    reject(new Error(`yt-dlp metadata timed out after ${METADATA_TIMEOUT_MS}ms`))
                );
            }, METADATA_TIMEOUT_MS);

            yt.stdout.on("data", (data) => {
                jsonData += data.toString();
            });
            yt.stderr.on("data", (data) => {
                errorData += data.toString();
            });

            yt.on("close", (code) => {
                finish(() => {
                    if (code !== 0) {
                        return reject(new Error(`yt-dlp exited with code ${code}: ${errorData}`));
                    }
                    try {
                        resolve(JSON.parse(jsonData) as YtDlpOutput);
                    } catch {
                        reject(new Error("Failed to parse yt-dlp output"));
                    }
                });
            });

            yt.on("error", (err) => {
                finish(() => reject(err));
            });
        });
    },
};
