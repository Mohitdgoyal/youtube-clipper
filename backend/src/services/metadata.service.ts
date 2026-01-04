import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { YtDlpOutput } from "../types/ytdlp";
import { metadataCache, createCacheKey } from "./cache.service";

export const metadataService = {
    async getVideoInfo(url: string): Promise<YtDlpOutput> {
        const cacheKey = createCacheKey(url);
        const cached = metadataCache.get<YtDlpOutput>(cacheKey);

        // Check if the cached object looks like YtDlpOutput (has 'formats') 
        // to avoid conflicts if we had different data stored previously
        if (cached && cached.formats && Array.isArray(cached.formats)) {
            return cached;
        }

        const info = await this.fetchInfo(url);
        metadataCache.set(cacheKey, info);
        return info;
    },

    async fetchInfo(url: string): Promise<YtDlpOutput> {
        const binDir = path.resolve(__dirname, '../../bin');
        const ytDlpPath = fs.existsSync(path.join(binDir, 'yt-dlp.exe'))
            ? path.join(binDir, 'yt-dlp.exe')
            : path.join(binDir, 'yt-dlp');

        const ytArgs = [
            '-j',
            '--no-warnings',
            '--no-check-certificates',
            '--add-header', 'referer:youtube.com',
            '--add-header', 'user-agent:Mozilla/5.0',
            url
        ];

        const localCookiesPath = path.join(__dirname, "../../cookies.txt");
        if (fs.existsSync(localCookiesPath)) {
            ytArgs.push("--cookies", localCookiesPath)
        }

        return new Promise((resolve, reject) => {
            const yt = spawn(ytDlpPath, ytArgs);
            let jsonData = '';
            let errorData = '';

            yt.stdout.on('data', (data) => jsonData += data.toString());
            yt.stderr.on('data', (data) => errorData += data.toString());

            yt.on('close', (code) => {
                if (code !== 0) {
                    return reject(new Error(`yt-dlp exited with code ${code}: ${errorData}`));
                }

                try {
                    const data = JSON.parse(jsonData) as YtDlpOutput;
                    resolve(data);
                } catch (e) {
                    reject(new Error('Failed to parse yt-dlp output'));
                }
            });
        });
    }
};
