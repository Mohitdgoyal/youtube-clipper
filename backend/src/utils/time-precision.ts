/**
 * True when a timestamp has non-zero fractional seconds (sub-second precision).
 * Examples: `00:01:02.5` → true, `00:01:02.000` → false, `00:01:02` → false
 */
export function hasSubSecondPrecision(time: string): boolean {
    return /\.\d*[1-9]\d*/.test(time);
}

/**
 * NEVER use --force-keyframes-at-cuts with --download-sections.
 * That forces ffmpeg to re-encode over HTTP from googlevideo and routinely hangs.
 *
 * Precise cuts: pad the section download (stream-copy), then trim with
 * `ffmpeg -ss/-t -c copy` (milliseconds) or one subtitle burn-in encode.
 */
export function needsForcedKeyframes(
    _startTime: string,
    _endTime: string,
    _subtitles?: boolean
): boolean {
    return false;
}

/** Pad section downloads when we need an accurate post-trim. */
export function needsPreciseCut(
    startTime: string,
    endTime: string,
    subtitles?: boolean
): boolean {
    if (subtitles) return true;
    return hasSubSecondPrecision(startTime) || hasSubSecondPrecision(endTime);
}
