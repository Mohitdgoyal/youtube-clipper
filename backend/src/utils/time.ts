export function timeToSeconds(timeStr: string): number {
    if (!timeStr) return 0;

    const parts = timeStr.split(':');

    if (parts.length === 3) {
        // HH:MM:SS
        return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
    } else if (parts.length === 2) {
        // MM:SS
        return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
    } else if (parts.length === 1) {
        // SS
        return parseFloat(parts[0]);
    }

    return parseFloat(timeStr) || 0;
}

export function secondsToTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toFixed(3).padStart(6, '0')}`;
}
