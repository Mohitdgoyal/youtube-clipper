import fs from "fs";
import path from "path";

export type CookiesHealth = {
    present: boolean;
    source: "file" | "browser" | "none";
    path: string | null;
    ageDays: number | null;
    expiresSoon: boolean;
    expired: boolean;
    ok: boolean;
    message: string;
};

function cookiesFilePath(): string {
    return (
        process.env.YTDLP_COOKIES ||
        path.join(__dirname, "../../cookies.txt")
    );
}

/** Parse Netscape cookie file expiry for youtube/google rows. */
function analyzeNetscapeExpiry(content: string): { expired: boolean; expiresSoon: boolean } {
    const now = Math.floor(Date.now() / 1000);
    const soon = now + 3 * 24 * 60 * 60;
    let sawExpiring = false;
    let sawValid = false;
    let allExpired = true;
    let anyRow = false;

    for (const line of content.split(/\r?\n/)) {
        if (!line || line.startsWith("#")) continue;
        const parts = line.split("\t");
        if (parts.length < 7) continue;
        const domain = parts[0].replace(/^#HttpOnly_/i, "").toLowerCase();
        if (!domain.includes("youtube.com") && !domain.includes("google.com")) continue;
        anyRow = true;
        const expiry = Number(parts[4]);
        if (!Number.isFinite(expiry) || expiry === 0) {
            // Session cookie — treat as valid while file is present
            sawValid = true;
            allExpired = false;
            continue;
        }
        if (expiry > now) {
            sawValid = true;
            allExpired = false;
            if (expiry <= soon) sawExpiring = true;
        }
    }

    if (!anyRow) {
        return { expired: false, expiresSoon: false };
    }
    return {
        expired: allExpired && !sawValid,
        expiresSoon: sawExpiring && sawValid,
    };
}

export function getCookiesHealth(): CookiesHealth {
    const filePath = cookiesFilePath();
    if (fs.existsSync(filePath)) {
        let ageDays: number | null = null;
        let expired = false;
        let expiresSoon = false;
        try {
            const stat = fs.statSync(filePath);
            ageDays = Math.max(0, (Date.now() - stat.mtimeMs) / (24 * 60 * 60 * 1000));
            const content = fs.readFileSync(filePath, "utf8");
            ({ expired, expiresSoon } = analyzeNetscapeExpiry(content));
            // Also flag very old exports even if expiry columns look ok
            if (ageDays >= 14) expiresSoon = true;
        } catch {
            // unreadable file → not ok
            return {
                present: false,
                source: "none",
                path: filePath,
                ageDays: null,
                expiresSoon: false,
                expired: true,
                ok: false,
                message: "Cookies file exists but could not be read.",
            };
        }

        const ok = !expired;
        let message = "Cookies file found.";
        if (expired) message = "YouTube cookies in file appear expired. Re-export cookies.txt.";
        else if (expiresSoon) message = "Cookies may be stale soon. Re-export if quality drops.";

        return {
            present: true,
            source: "file",
            path: filePath,
            ageDays: ageDays !== null ? Math.round(ageDays * 10) / 10 : null,
            expiresSoon,
            expired,
            ok,
            message,
        };
    }

    if (process.env.COOKIES_FROM_BROWSER) {
        return {
            present: true,
            source: "browser",
            path: null,
            ageDays: null,
            expiresSoon: false,
            expired: false,
            ok: true,
            message: `Using cookies from browser: ${process.env.COOKIES_FROM_BROWSER}`,
        };
    }

    return {
        present: false,
        source: "none",
        path: filePath,
        ageDays: null,
        expiresSoon: false,
        expired: false,
        ok: false,
        message: "No cookies configured. Higher qualities may be unavailable (often ~360p).",
    };
}
