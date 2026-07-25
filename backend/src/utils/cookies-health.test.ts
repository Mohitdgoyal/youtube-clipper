import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import fs from "fs";
import os from "os";
import path from "path";
import { getCookiesHealth } from "./cookies-health";

describe("getCookiesHealth", () => {
    const prevCookies = process.env.YTDLP_COOKIES;
    const prevBrowser = process.env.COOKIES_FROM_BROWSER;
    let tmpFile: string | null = null;

    beforeEach(() => {
        delete process.env.YTDLP_COOKIES;
        delete process.env.COOKIES_FROM_BROWSER;
    });

    afterEach(() => {
        if (prevCookies === undefined) delete process.env.YTDLP_COOKIES;
        else process.env.YTDLP_COOKIES = prevCookies;
        if (prevBrowser === undefined) delete process.env.COOKIES_FROM_BROWSER;
        else process.env.COOKIES_FROM_BROWSER = prevBrowser;
        if (tmpFile && fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
        tmpFile = null;
    });

    test("reports none when no cookies configured", () => {
        process.env.YTDLP_COOKIES = path.join(os.tmpdir(), `missing-cookies-${Date.now()}.txt`);
        const health = getCookiesHealth();
        expect(health.present).toBe(false);
        expect(health.source).toBe("none");
        expect(health.ok).toBe(false);
    });

    test("reports browser source when COOKIES_FROM_BROWSER set", () => {
        process.env.YTDLP_COOKIES = path.join(os.tmpdir(), `missing-cookies-${Date.now()}.txt`);
        process.env.COOKIES_FROM_BROWSER = "chrome";
        const health = getCookiesHealth();
        expect(health.present).toBe(true);
        expect(health.source).toBe("browser");
        expect(health.ok).toBe(true);
    });

    test("reports file ok for valid netscape cookies", () => {
        tmpFile = path.join(os.tmpdir(), `cookies-${Date.now()}.txt`);
        const farFuture = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;
        fs.writeFileSync(
            tmpFile,
            [
                "# Netscape HTTP Cookie File",
                `.youtube.com\tTRUE\t/\tTRUE\t${farFuture}\tLOGIN_INFO\tabc`,
            ].join("\n")
        );
        process.env.YTDLP_COOKIES = tmpFile;
        const health = getCookiesHealth();
        expect(health.present).toBe(true);
        expect(health.source).toBe("file");
        expect(health.ok).toBe(true);
        expect(health.expired).toBe(false);
    });
});
