/**
 * True when a timestamp has non-zero fractional seconds (sub-second precision).
 * Examples: `00:01:02.5` → true, `00:01:02.000` → false, `00:01:02` → false
 */
export function hasSubSecondPrecision(time: string): boolean {
    return /\.\d*[1-9]\d*/.test(time);
}

/**
 * Force keyframe cuts only when burn-in or sub-second accuracy is needed.
 * Otherwise yt-dlp can cut at nearest keyframes (faster, less re-encode).
 */
export function needsForcedKeyframes(
    startTime: string,
    endTime: string,
    subtitles?: boolean
): boolean {
    if (subtitles) return true;
    return hasSubSecondPrecision(startTime) || hasSubSecondPrecision(endTime);
}
