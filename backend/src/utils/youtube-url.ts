const YOUTUBE_HOSTS = new Set([
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtu.be",
    "www.youtu.be",
    "youtube-nocookie.com",
    "www.youtube-nocookie.com",
]);

/**
 * Returns true only for http(s) YouTube watch / short / embed / youtu.be URLs.
 */
export function isAllowedYouTubeUrl(raw: string): boolean {
    let parsed: URL;
    try {
        parsed = new URL(raw);
    } catch {
        return false;
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return false;
    }

    const host = parsed.hostname.toLowerCase();
    if (!YOUTUBE_HOSTS.has(host)) {
        return false;
    }

    // Reject credentials / weird userinfo
    if (parsed.username || parsed.password) {
        return false;
    }

    // Reject playlist / mix URLs that would download more than one video
    if (parsed.searchParams.has("list")) {
        return false;
    }

    return true;
}
