import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, ArrowDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowRight } from "lucide-react";
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

export default function ClipForm({
    url, setUrl, startTime, setStartTime, endTime, setEndTime,
    addSubs, setAddSubs, loading, progress = 0, stage = "Processing", handleSubmit,
    formats, selectedFormat, setSelectedFormat,

    isBulk, setIsBulk, bulkTimestamps, setBulkTimestamps
}: ClipFormProps) {
    return (
        <motion.form
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            onSubmit={handleSubmit}
            className="flex flex-col gap-10 border p-4 bg-card rounded-3xl"
            style={{ willChange: 'opacity, transform' }}
        >
            <div className="flex flex-col gap-4 w-full">
                <div className="flex items-center gap-2 w-full">
                    <input
                        type="text"
                        id="url"
                        placeholder="Paste video url here..."
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        required
                        className="bg-transparent border-none outline-none w-full px-2"
                    />
                    <Button type="submit" size="icon" disabled={loading} className="rounded-xl shrink-0">
                        {loading ? (
                            <Loader2 className="w-6 h-6 animate-spin" />
                        ) : (
                            <ArrowDown className="w-6 h-6" />
                        )}
                    </Button>
                </div>

                <AnimatePresence>
                    {loading && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.15, ease: "easeOut" }}
                            className="w-full px-2 py-4 bg-muted/20 rounded-2xl border border-primary/20"
                        >
                            <div className="flex justify-between items-center mb-3">
                                <span className="text-sm font-semibold capitalize bg-primary/10 text-primary px-3 py-1 rounded-full animate-pulse">
                                    {stage}...
                                </span>
                                <span className="text-sm font-bold text-primary">{progress}%</span>
                            </div>
                            <Progress value={progress} className="h-3 rounded-full" />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <div className="flex flex-col gap-6 w-full">
                <div className="flex items-center justify-between px-1">
                    <Label className="text-sm font-medium">Bulk Mode</Label>
                    <Switch checked={isBulk} onCheckedChange={setIsBulk} />
                </div>

                {isBulk ? (
                    <div className="flex flex-col gap-2 w-full">
                        <Label htmlFor="bulkTimestamps" className="text-xs text-muted-foreground mb-1">
                            Enter ranges (e.g., 00:01:00-00:02:00) one per line
                        </Label>
                        <textarea
                            id="bulkTimestamps"
                            value={bulkTimestamps}
                            onChange={(e) => setBulkTimestamps(e.target.value)}
                            placeholder={"00:01:00-00:02:00\n00:05:30-00:06:15"}
                            className="w-full bg-background border rounded-2xl p-4 min-h-[120px] font-mono text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                        />
                    </div>
                ) : (
                    <div className="flex gap-4 w-full items-end">
                        <div className="flex flex-col gap-2 w-full">
                            <Label htmlFor="startTime" className="text-xs font-medium text-muted-foreground ml-1">Start Time</Label>
                            <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-2xl border">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 hover:bg-background rounded-xl text-muted-foreground"
                                    onClick={() => {
                                        const s = timeToSeconds(startTime);
                                        setStartTime(secondsToTime(Math.max(0, s - 1)));
                                    }}
                                    title="-1s"
                                >
                                    <ChevronsLeft className="w-4 h-4" />
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 hover:bg-background rounded-xl text-muted-foreground hidden sm:flex"
                                    onClick={() => {
                                        const s = timeToSeconds(startTime);
                                        setStartTime(secondsToTime(Math.max(0, s - 0.05)));
                                    }}
                                    title="-0.05s"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </Button>

                                <Input
                                    type="text"
                                    id="startTime"
                                    value={startTime}
                                    onChange={(e) => setStartTime(e.target.value)}
                                    // pattern="[0-9]{2}:[0-9]{2}:[0-9]{2}"
                                    placeholder="00:00:00"
                                    required={!isBulk}
                                    className="font-mono text-center text-sm h-10 border-none shadow-none bg-transparent focus-visible:ring-0 px-0"
                                />

                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 hover:bg-background rounded-xl text-muted-foreground hidden sm:flex"
                                    onClick={() => {
                                        const s = timeToSeconds(startTime);
                                        setStartTime(secondsToTime(s + 0.05));
                                    }}
                                    title="+0.05s"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 hover:bg-background rounded-xl text-muted-foreground"
                                    onClick={() => {
                                        const s = timeToSeconds(startTime);
                                        setStartTime(secondsToTime(s + 1));
                                    }}
                                    title="+1s"
                                >
                                    <ChevronsRight className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>

                        <div className="pb-4 text-muted-foreground/30">
                            <ArrowRight className="w-5 h-5" />
                        </div>

                        <div className="flex flex-col gap-2 w-full">
                            <Label htmlFor="endTime" className="text-xs font-medium text-muted-foreground ml-1">End Time</Label>
                            <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-2xl border">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 hover:bg-background rounded-xl text-muted-foreground"
                                    onClick={() => {
                                        const s = timeToSeconds(endTime);
                                        setEndTime(secondsToTime(Math.max(0, s - 1)));
                                    }}
                                    title="-1s"
                                >
                                    <ChevronsLeft className="w-4 h-4" />
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 hover:bg-background rounded-xl text-muted-foreground hidden sm:flex"
                                    onClick={() => {
                                        const s = timeToSeconds(endTime);
                                        setEndTime(secondsToTime(Math.max(0, s - 0.05)));
                                    }}
                                    title="-0.05s"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </Button>

                                <Input
                                    type="text"
                                    id="endTime"
                                    value={endTime}
                                    onChange={(e) => setEndTime(e.target.value)}
                                    // pattern="[0-9]{2}:[0-9]{2}:[0-9]{2}"
                                    placeholder="00:00:00"
                                    required={!isBulk}
                                    className="font-mono text-center text-sm h-10 border-none shadow-none bg-transparent focus-visible:ring-0 px-0"
                                />

                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 hover:bg-background rounded-xl text-muted-foreground hidden sm:flex"
                                    onClick={() => {
                                        const s = timeToSeconds(endTime);
                                        setEndTime(secondsToTime(s + 0.05));
                                    }}
                                    title="+0.05s"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 hover:bg-background rounded-xl text-muted-foreground"
                                    onClick={() => {
                                        const s = timeToSeconds(endTime);
                                        setEndTime(secondsToTime(s + 1));
                                    }}
                                    title="+1s"
                                >
                                    <ChevronsRight className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    </div>
                )}



                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="quality">Video Quality</Label>
                        <div className="relative group">
                            <select
                                id="quality"
                                value={selectedFormat}
                                onChange={(e) => setSelectedFormat(e.target.value)}
                                className="w-full bg-background border rounded-2xl p-2.5 h-12 appearance-none pr-10 focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer"
                                disabled={formats.length === 0}
                            >
                                {formats.length === 0 ? (
                                    <option value="">Fetching formats...</option>
                                ) : (
                                    <>
                                        <optgroup label="Optimized">
                                            <option value="">Best available</option>
                                        </optgroup>
                                        <optgroup label="Specific Resolutions">
                                            {formats.map((f) => (
                                                <option key={f.format_id} value={f.format_id}>
                                                    {f.label}
                                                </option>
                                            ))}
                                        </optgroup>
                                    </>
                                )}
                            </select>
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
                                <ArrowDown className="w-4 h-4" />
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-2">
                        <Label htmlFor="subtitles-switch">Subtitles</Label>
                        <div className="flex items-center justify-between bg-muted/30 border rounded-2xl px-4 h-12">
                            <span className="text-xs text-muted-foreground font-medium">English (Auto)</span>
                            <Switch id="subtitles-switch" checked={addSubs} onCheckedChange={setAddSubs} />
                        </div>
                    </div>
                </div>
            </div>
        </motion.form>
    );
}
