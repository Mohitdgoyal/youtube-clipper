import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowRight, Scissors, Link2, ChevronDown, X, Clock, HardDriveDownload } from "lucide-react";
import { timeToSeconds, secondsToTime } from "@/lib/utils";
import { motion, AnimatePresence } from "motion/react";
import { Progress } from "@/components/ui/progress";
import { useMemo } from "react";

import { BulkQueueDashboard } from "@/components/editor/BulkQueueDashboard";

export type BulkLineStatus = {
    start: string;
    end: string;
    status: "pending" | "queued" | "running" | "ready" | "error" | "cancelled" | "skipped";
    error?: string;
    progress?: number;
    stage?: string;
    jobId?: string;
    estimatedSize?: string;
    clipDuration?: number;
};

interface ClipFormProps {
    url: string;
    setUrl: (url: string) => void;
    startTime: string;
    setStartTime: (time: string) => void;
    endTime: string;
    setEndTime: (time: string) => void;
    addSubs: boolean;
    setAddSubs: (subs: boolean) => void;
    loading: boolean;
    progress?: number;
    stage?: string;
    handleSubmit: (e: React.FormEvent) => void;
    onCancel?: () => void;

    formats: { format_id: string; label: string; tbr?: number }[];
    selectedFormat: string;
    setSelectedFormat: (format: string) => void;
    selectedCodec?: string;
    setSelectedCodec?: (codec: string) => void;
    availableCodecs?: string[];
    isBulk: boolean;
    setIsBulk: (bulk: boolean) => void;
    bulkTimestamps: string;
    setBulkTimestamps: (ts: string) => void;
    bulkLineStatuses?: BulkLineStatus[];
    onCancelBulkClip?: (index: number) => void;
    onRetryBulkClip?: (index: number) => void;
    onDownloadBulkClip?: (index: number) => void;
    cookieWarning?: string | null;
}

function TimeField({
    id,
    label,
    value,
    onChange,
    required,
}: {
    id: string;
    label: string;
    value: string;
    onChange: (v: string) => void;
    required?: boolean;
}) {
    return (
        <div className="flex w-full flex-col gap-2">
            <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
                {label}
            </Label>
            <div className="flex items-center gap-0.5 rounded-2xl border border-border/80 bg-muted/40 p-1">
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-xl text-muted-foreground hover:bg-background"
                    onClick={() => onChange(secondsToTime(Math.max(0, timeToSeconds(value) - 1)))}
                    title="-1s"
                >
                    <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="hidden h-8 w-8 rounded-xl text-muted-foreground hover:bg-background sm:flex"
                    onClick={() => onChange(secondsToTime(Math.max(0, timeToSeconds(value) - 0.05)))}
                    title="-0.05s"
                >
                    <ChevronLeft className="h-4 w-4" />
                </Button>
                <Input
                    type="text"
                    id={id}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="00:00:00"
                    required={required}
                    className="h-10 border-none bg-transparent px-0 text-center font-mono text-sm shadow-none focus-visible:ring-0"
                />
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="hidden h-8 w-8 rounded-xl text-muted-foreground hover:bg-background sm:flex"
                    onClick={() => onChange(secondsToTime(timeToSeconds(value) + 0.05))}
                    title="+0.05s"
                >
                    <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-xl text-muted-foreground hover:bg-background"
                    onClick={() => onChange(secondsToTime(timeToSeconds(value) + 1))}
                    title="+1s"
                >
                    <ChevronsRight className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
}

/** Fallback bitrate estimates (kbps) when yt-dlp tbr is unavailable */
const FALLBACK_BITRATES: Record<string, number> = {
    "2160p60": 20000, "2160p": 15000,
    "1440p60": 12000, "1440p": 9000,
    "1080p60": 8000,  "1080p": 5000,
    "720p60":  5000,  "720p":  2500,
    "480p":    1500,  "360p":  800,
    "240p":    500,   "144p":  300,
};

/** Audio adds roughly 128 kbps when muxed */
const AUDIO_BITRATE_KBPS = 128;

function formatDuration(totalSeconds: number): string {
    if (totalSeconds <= 0) return "0s";
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = Math.floor(totalSeconds % 60);
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDownloadTime(bytes: number): string {
    // Assume a conservative 10 Mbps effective download speed
    const speedBps = 10 * 1024 * 1024 / 8; // 10 Mbps in bytes/s
    const seconds = bytes / speedBps;
    if (seconds < 2) return "instant";
    if (seconds < 60) return `~${Math.ceil(seconds)}s`;
    const m = Math.floor(seconds / 60);
    const s = Math.ceil(seconds % 60);
    return `~${m}m ${s}s`;
}

function ClipInfoBanner({
    startTime,
    endTime,
    formats,
    selectedFormat,
    isBulk,
}: {
    startTime: string;
    endTime: string;
    formats: { format_id: string; label: string; tbr?: number }[];
    selectedFormat: string;
    isBulk: boolean;
}) {
    const info = useMemo(() => {
        const startSec = timeToSeconds(startTime);
        const endSec = timeToSeconds(endTime);
        const clipDuration = endSec - startSec;

        if (clipDuration <= 0) return null;

        // Find the selected format's bitrate
        let bitrateKbps: number | null = null;
        let qualityLabel = "Best available";

        if (selectedFormat) {
            const fmt = formats.find((f) => f.format_id === selectedFormat);
            if (fmt) {
                qualityLabel = fmt.label;
                bitrateKbps = fmt.tbr || FALLBACK_BITRATES[fmt.label] || null;
            }
        } else {
            // "Best available" — use the highest resolution format
            const best = formats[0];
            if (best) {
                qualityLabel = best.label;
                bitrateKbps = best.tbr || FALLBACK_BITRATES[best.label] || null;
            }
        }

        // Add audio bitrate estimate
        const totalBitrateKbps = bitrateKbps ? bitrateKbps + AUDIO_BITRATE_KBPS : null;
        const estimatedBytes = totalBitrateKbps
            ? (totalBitrateKbps * 1000 / 8) * clipDuration
            : null;

        return {
            clipDuration,
            durationFormatted: formatDuration(clipDuration),
            estimatedSize: estimatedBytes ? formatFileSize(estimatedBytes) : null,
            estimatedTime: estimatedBytes ? formatDownloadTime(estimatedBytes) : null,
            qualityLabel,
        };
    }, [startTime, endTime, formats, selectedFormat]);

    if (!info || isBulk) return null;

    return (
        <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
        >
            <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-muted/25 px-4 py-2.5">
                <div className="flex flex-1 items-center gap-2">
                    <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="text-sm font-medium tabular-nums text-foreground">
                        {info.durationFormatted}
                    </span>
                </div>
                {info.estimatedSize && (
                    <div className="flex items-center gap-2 border-l border-border/50 pl-3">
                        <HardDriveDownload className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="text-sm tabular-nums text-muted-foreground">
                            {info.estimatedSize}
                        </span>
                        <span className="text-xs text-muted-foreground/70">·</span>
                        <span className="text-xs text-muted-foreground/70">
                            {info.estimatedTime}
                        </span>
                    </div>
                )}
            </div>
        </motion.div>
    );
}

export default function ClipForm({
    url, setUrl, startTime, setStartTime, endTime, setEndTime,
    addSubs, setAddSubs, loading, progress = 0, stage = "Processing", handleSubmit, onCancel,
    formats, selectedFormat, setSelectedFormat,
    selectedCodec = "h264", setSelectedCodec, availableCodecs = ["h264", "vp9", "av1"],
    isBulk, setIsBulk, bulkTimestamps, setBulkTimestamps,
    bulkLineStatuses = [],
    onCancelBulkClip,
    onRetryBulkClip,
    onDownloadBulkClip,
    cookieWarning = null,
}: ClipFormProps) {
    return (
        <motion.form
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            onSubmit={handleSubmit}
            className="flex w-full flex-col gap-6 rounded-3xl border border-border/80 bg-background/85 p-6 shadow-2xl backdrop-blur-xl sm:p-8"
        >
            <div className="flex flex-col gap-3">
                <Label htmlFor="videoUrl" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    YouTube URL
                </Label>
                <div className="group flex h-14 items-center gap-3 rounded-2xl border border-border/80 bg-background/70 px-4 transition-all focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
                    <Link2 className="h-5 w-5 shrink-0 text-muted-foreground transition-colors group-focus-within:text-primary" />
                    <input
                        id="videoUrl"
                        type="url"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://www.youtube.com/watch?v=..."
                        required
                        disabled={loading}
                        className="w-full bg-transparent px-1 py-2 text-sm outline-none placeholder:text-muted-foreground/70"
                    />
                </div>

                {cookieWarning && (
                    <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] leading-snug text-amber-800 dark:text-amber-200">
                        {cookieWarning}
                    </p>
                )}

                <AnimatePresence>
                    {loading && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.15, ease: "easeOut" }}
                            className="overflow-hidden"
                        >
                            <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
                                <div className="mb-2 flex items-center justify-between gap-3">
                                    <span className="text-sm font-medium capitalize text-primary">
                                        {stage}…
                                    </span>
                                    <span className="font-mono text-sm font-semibold tabular-nums text-primary">
                                        {progress}%
                                    </span>
                                </div>
                                <Progress value={progress} className="h-2" />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <div className="flex flex-col gap-5">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm font-medium">Bulk mode</p>
                        <p className="text-xs text-muted-foreground">Clip multiple ranges at once</p>
                    </div>
                    <Switch checked={isBulk} onCheckedChange={setIsBulk} />
                </div>

                {isBulk ? (
                    <div className="flex w-full flex-col gap-3">
                        <Label htmlFor="bulkTimestamps" className="text-xs text-muted-foreground">
                            One range per line (start-end)
                        </Label>
                        <textarea
                            id="bulkTimestamps"
                            value={bulkTimestamps}
                            onChange={(e) => setBulkTimestamps(e.target.value)}
                            placeholder={"00:01:00-00:02:00\n00:05:30-00:06:15"}
                            disabled={loading}
                            className="min-h-[120px] w-full rounded-2xl border border-border/80 bg-background/70 p-4 font-mono text-sm outline-none transition-shadow focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                        />
                        {bulkLineStatuses.length > 0 && (
                            <BulkQueueDashboard
                                statuses={bulkLineStatuses}
                                onCancelClip={onCancelBulkClip}
                                onRetryClip={onRetryBulkClip}
                                onDownloadClip={onDownloadBulkClip}
                            />
                        )}
                    </div>
                ) : (
                    <div className="flex w-full items-end gap-3">
                        <TimeField
                            id="startTime"
                            label="Start"
                            value={startTime}
                            onChange={setStartTime}
                            required={!isBulk}
                        />
                        <div className="hidden pb-3 text-muted-foreground/40 sm:block">
                            <ArrowRight className="h-4 w-4" />
                        </div>
                        <TimeField
                            id="endTime"
                            label="End"
                            value={endTime}
                            onChange={setEndTime}
                            required={!isBulk}
                        />
                    </div>
                )}

                <AnimatePresence>
                    <ClipInfoBanner
                        startTime={startTime}
                        endTime={endTime}
                        formats={formats}
                        selectedFormat={selectedFormat}
                        isBulk={isBulk}
                    />
                </AnimatePresence>

                <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
                    {/* Codec Selector */}
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="codec" className="text-xs font-medium text-muted-foreground">
                            Codec Format
                        </Label>
                        <div className="relative">
                            <select
                                id="codec"
                                value={selectedCodec}
                                onChange={(e) => setSelectedCodec?.(e.target.value)}
                                className="h-12 w-full cursor-pointer appearance-none rounded-2xl border border-border/80 bg-background/70 px-4 pr-10 text-sm outline-none transition-shadow focus:ring-2 focus:ring-primary/20"
                            >
                                <option value="h264">H.264 (MP4) — Fastest, Compatible</option>
                                <option value="vp9">VP9 (WebM) — High Quality</option>
                                <option value="av1">AV1 (MP4) — Best Quality</option>
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        </div>
                    </div>

                    {/* Quality Selector */}
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="quality" className="text-xs font-medium text-muted-foreground">
                            Quality
                        </Label>
                        <div className="relative">
                            <select
                                id="quality"
                                value={selectedFormat}
                                onChange={(e) => setSelectedFormat(e.target.value)}
                                className="h-12 w-full cursor-pointer appearance-none rounded-2xl border border-border/80 bg-background/70 px-4 pr-10 text-sm outline-none transition-shadow focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                                disabled={formats.length === 0}
                            >
                                {formats.length === 0 ? (
                                    <option value="">Waiting for video…</option>
                                ) : (
                                    <>
                                        <optgroup label="Optimized">
                                            <option value="">Best available</option>
                                        </optgroup>
                                        <optgroup label="Resolutions">
                                            {formats.map((f) => (
                                                <option key={f.format_id} value={f.format_id}>
                                                    {f.label}
                                                </option>
                                            ))}
                                        </optgroup>
                                    </>
                                )}
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        </div>
                        {formats.length > 0 && !formats.some((f) => /^(720|1080|1440|2160)p/.test(f.label)) && (
                            <p className="text-[11px] leading-snug text-muted-foreground">
                                Only low-res formats available for this video without cookies.
                            </p>
                        )}
                    </div>

                    <div className="flex flex-col gap-2">
                        <Label htmlFor="subtitles-switch" className="text-xs font-medium text-muted-foreground">
                            Subtitles
                        </Label>
                        <div className="flex h-12 items-center justify-between rounded-2xl border border-border/80 bg-muted/30 px-4">
                            <span className="text-sm text-muted-foreground">English (auto)</span>
                            <Switch id="subtitles-switch" checked={addSubs} onCheckedChange={setAddSubs} />
                        </div>
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="flex w-full gap-2">
                    <Button
                        type="button"
                        disabled
                        size="lg"
                        className="h-12 flex-1 rounded-2xl text-base font-semibold"
                    >
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Clipping…
                    </Button>
                    {onCancel && (
                        <Button
                            type="button"
                            variant="outline"
                            size="lg"
                            onClick={onCancel}
                            className="h-12 shrink-0 rounded-2xl px-4"
                        >
                            <X className="h-5 w-5" />
                            Cancel
                        </Button>
                    )}
                </div>
            ) : (
                <Button
                    type="submit"
                    size="lg"
                    className="h-12 w-full rounded-2xl text-base font-semibold shadow-sm transition-transform active:scale-[0.99]"
                >
                    <Scissors className="h-5 w-5" />
                    Clip video
                </Button>
            )}
        </motion.form>
    );
}
