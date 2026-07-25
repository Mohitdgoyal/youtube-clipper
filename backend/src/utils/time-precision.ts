/**
 * True when a timestamp has non-zero fractional seconds (sub-second precision).
 * Examples: `00:01:02.5` → true, `00:01:02.000` → false, `00:01:02` → false
 */
export function hasSubSecondPrecision(time: string): boolean {
    return /\.\d*[1-9]\d*/.test(time);
}

/**
 * Force keyframe cuts only for sub-second precision when NOT burning subtitles.
 * Subtitle burn-in already re-encodes in FFmpeg — forcing keyframes here would
 * double-encode. Prefer nearest-keyframe section download + one FFmpeg pass.
 */
export function needsForcedKeyframes(
    startTime: string,
    endTime: string,
    subtitles?: boolean
): boolean {
    if (subtitles) return false;
    return hasSubSecondPrecision(startTime) || hasSubSecondPrecision(endTime);
}
