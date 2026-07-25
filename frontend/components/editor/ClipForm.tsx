import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowRight, Scissors, Link2, ChevronDown } from "lucide-react";
import { timeToSeconds, secondsToTime } from "@/lib/utils";
import { motion, AnimatePresence } from "motion/react";
import { Progress } from "@/components/ui/progress";

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

    formats: { format_id: string; label: string }[];
    selectedFormat: string;
    setSelectedFormat: (format: string) => void;
    isBulk: boolean;
    setIsBulk: (bulk: boolean) => void;
    bulkTimestamps: string;
    setBulkTimestamps: (ts: string) => void;
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

export default function ClipForm({
    url, setUrl, startTime, setStartTime, endTime, setEndTime,
    addSubs, setAddSubs, loading, progress = 0, stage = "Processing", handleSubmit,
    formats, selectedFormat, setSelectedFormat,
    isBulk, setIsBulk, bulkTimestamps, setBulkTimestamps
}: ClipFormProps) {
    return (
        <motion.form
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            onSubmit={handleSubmit}
            className="surface-panel flex flex-col gap-6 rounded-3xl p-5 sm:p-6"
        >
            <div className="flex flex-col gap-3">
                <Label htmlFor="url" className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    YouTube URL
                </Label>
                <div className="flex items-center gap-2 rounded-2xl border border-border/80 bg-background/70 px-3 py-2 transition-colors focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/15">
                    <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <input
                        type="text"
                        id="url"
                        placeholder="Paste a YouTube link…"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        required
                        className="w-full bg-transparent px-1 py-2 text-sm outline-none placeholder:text-muted-foreground/70"
                    />
                </div>

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
                    <div className="flex w-full flex-col gap-2">
                        <Label htmlFor="bulkTimestamps" className="text-xs text-muted-foreground">
                            One range per line (start-end)
                        </Label>
                        <textarea
                            id="bulkTimestamps"
                            value={bulkTimestamps}
                            onChange={(e) => setBulkTimestamps(e.target.value)}
                            placeholder={"00:01:00-00:02:00\n00:05:30-00:06:15"}
                            className="min-h-[120px] w-full rounded-2xl border border-border/80 bg-background/70 p-4 font-mono text-sm outline-none transition-shadow focus:ring-2 focus:ring-primary/20"
                        />
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

                <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
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

            <Button
                type="submit"
                disabled={loading}
                size="lg"
                className="h-12 w-full rounded-2xl text-base font-semibold shadow-sm transition-transform active:scale-[0.99]"
            >
                {loading ? (
                    <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Clipping…
                    </>
                ) : (
                    <>
                        <Scissors className="h-5 w-5" />
                        Clip video
                    </>
                )}
            </Button>
        </motion.form>
    );
}
