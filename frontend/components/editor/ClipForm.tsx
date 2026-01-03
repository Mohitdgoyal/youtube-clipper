import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, ArrowDown, Monitor, Smartphone, Square } from "lucide-react";
import { motion } from "motion/react";

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
    handleSubmit: (e: React.FormEvent) => void;
    cropRatio: "original" | "vertical" | "square";
    setCropRatio: (ratio: "original" | "vertical" | "square") => void;
    formats: { format_id: string; label: string }[];
    selectedFormat: string;
    setSelectedFormat: (format: string) => void;
}

const resolutionOptions = {
    original: { icon: <Monitor className="w-4 h-4" />, label: "Original" },
    vertical: { icon: <Smartphone className="w-4 h-4" />, label: "Vertical" },
    square: { icon: <Square className="w-4 h-4" />, label: "Square" },
} as const;

export default function ClipForm({
    url, setUrl, startTime, setStartTime, endTime, setEndTime,
    addSubs, setAddSubs, loading, handleSubmit,
    cropRatio, setCropRatio, formats, selectedFormat, setSelectedFormat
}: ClipFormProps) {
    return (
        <motion.form
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            onSubmit={handleSubmit}
            className="flex flex-col gap-12 border p-4 bg-card rounded-3xl"
        >
            <div className="flex items-center gap-2 w-full">
                <input
                    type="text"
                    id="url"
                    placeholder="Paste video url here..."
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    required
                    className="bg-transparent border-none outline-none w-full"
                />
                <Button type="submit" size="icon" disabled={loading}>
                    {loading ? (
                        <Loader2 className="w-6 h-6 animate-spin" />
                    ) : (
                        <ArrowDown className="w-6 h-6" />
                    )}
                </Button>
            </div>

            <div className="flex flex-col gap-2 w-full">
                <div className="flex gap-3 w-full items-center">
                    <div className="flex flex-col gap-2 w-full">
                        <Label htmlFor="startTime" className="sr-only">Start Time</Label>
                        <Input
                            type="text"
                            id="startTime"
                            value={startTime}
                            onChange={(e) => setStartTime(e.target.value)}
                            pattern="[0-9]{2}:[0-9]{2}:[0-9]{2}"
                            placeholder="00:00:00"
                            required
                            className="font-mono text-sm"
                        />
                    </div>
                    <span className="text-sm text-muted-foreground">to</span>
                    <div className="flex flex-col gap-2 w-full">
                        <Label htmlFor="endTime" className="sr-only">End Time</Label>
                        <Input
                            type="text"
                            id="endTime"
                            value={endTime}
                            onChange={(e) => setEndTime(e.target.value)}
                            pattern="[0-9]{2}:[0-9]{2}:[0-9]{2}"
                            placeholder="00:00:00"
                            required
                            className="font-mono text-sm"
                        />
                    </div>
                </div>

                <div className="flex flex-col gap-2 w-full">
                    <div className="flex items-center justify-between p-2 rounded-2xl border relative bg-white/5 backdrop-blur-md">
                        {Object.entries(resolutionOptions).map(([key, { icon, label }]) => (
                            <div
                                key={key}
                                onClick={() => setCropRatio(key as any)}
                                className="relative cursor-pointer w-full group text-center py-1.5 px-4"
                            >
                                {cropRatio === key && (
                                    <motion.div
                                        layoutId="hover"
                                        className="absolute inset-0 bg-primary rounded-md"
                                        transition={{ type: "spring", stiffness: 120, damping: 10, mass: 0.2 }}
                                    />
                                )}
                                <span className={`relative flex text-xs sm:text-sm items-center gap-2 justify-center ${cropRatio === key ? "text-primary-foreground" : "text-foreground"}`}>
                                    {icon}
                                    <span>{label}</span>
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 w-full">
                    <div className="flex flex-col gap-2 flex-1">
                        <Label htmlFor="quality">Quality</Label>
                        <select
                            id="quality"
                            value={selectedFormat}
                            onChange={(e) => setSelectedFormat(e.target.value)}
                            className="bg-transparent border rounded-md p-2 h-10 appearance-none pr-8"
                            disabled={formats.length === 0}
                        >
                            {formats.length === 0 ? (
                                <option value="">Loading formats...</option>
                            ) : (
                                formats.map((f) => <option key={f.format_id} value={f.format_id}>{f.label}</option>)
                            )}
                        </select>
                    </div>

                    <div className="flex flex-col gap-2 flex-1">
                        <Label htmlFor="subtitles-switch">Subtitles</Label>
                        <div className="flex items-center space-x-2 h-10">
                            <Switch id="subtitles-switch" checked={addSubs} onCheckedChange={setAddSubs} />
                            <Label htmlFor="subtitles-switch" className="text-sm text-muted-foreground">English only</Label>
                        </div>
                    </div>
                </div>
            </div>
        </motion.form>
    );
}
