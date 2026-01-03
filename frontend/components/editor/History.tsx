import { useEffect, useState } from "react";
import Image from "next/image";
import { Download, ExternalLink, Calendar, Clock } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Clip {
    id: string;
    url: string;
    title: string;
    startTime: string;
    endTime: string;
    publicUrl: string;
    thumbnail: string | null;
    createdAt: string;
}

export default function History() {
    const [clips, setClips] = useState<Clip[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchClips = async () => {
        try {
            const res = await fetch("/api/clips");
            if (res.ok) {
                const data = await res.json();
                setClips(data.clips);
            }
        } catch (err) {
            console.error("Error fetching clips:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchClips();
    }, []);

    const handleDownload = async (url: string, title: string) => {
        try {
            const res = await fetch(url);
            const blob = await res.blob();
            const dUrl = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = dUrl;
            a.download = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_clip.mp4`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(dUrl);
            a.remove();
        } catch {
            toast.error("Failed to download clip");
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center p-12">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                    className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full"
                />
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6 w-full max-w-2xl mx-auto mt-12 mb-24">
            <h2 className="text-xl font-semibold flex items-center gap-2 px-4">
                📚 Your Banger Library
            </h2>

            <div className="grid grid-cols-1 gap-4 px-4">
                <AnimatePresence mode="popLayout">
                    {clips.length === 0 ? (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-3xl"
                        >
                            No clips yet. Start clipping some bangers!
                        </motion.div>
                    ) : (
                        clips.map((clip) => (
                            <motion.div
                                key={clip.id}
                                layout
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="bg-card border rounded-2xl overflow-hidden flex flex-col sm:flex-row shadow-sm hover:shadow-md transition-shadow"
                            >
                                <div className="relative w-full sm:w-48 aspect-video sm:aspect-auto">
                                    {clip.thumbnail ? (
                                        <Image
                                            src={clip.thumbnail}
                                            alt={clip.title}
                                            fill
                                            unoptimized
                                            className="object-cover"
                                        />
                                    ) : (
                                        <div className="w-full h-full bg-muted flex items-center justify-center">
                                            <Clock className="w-8 h-8 text-muted-foreground/50" />
                                        </div>
                                    )}
                                    <div className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded font-mono">
                                        {clip.startTime}-{clip.endTime}
                                    </div>
                                </div>

                                <div className="flex flex-col flex-1 p-4 gap-2 justify-between">
                                    <div>
                                        <h3 className="font-medium text-sm line-clamp-2 leading-snug">
                                            {clip.title}
                                        </h3>
                                        <div className="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground">
                                            <div className="flex items-center gap-1">
                                                <Calendar className="w-3 h-3" />
                                                {new Date(clip.createdAt).toLocaleDateString()}
                                            </div>
                                            <a
                                                href={clip.url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="flex items-center gap-1 hover:text-primary transition-colors"
                                            >
                                                <ExternalLink className="w-3 h-3" />
                                                Original
                                            </a>
                                        </div>
                                    </div>

                                    <div className="flex gap-2 mt-2">
                                        <Button
                                            size="sm"
                                            onClick={() => handleDownload(clip.publicUrl, clip.title)}
                                            className="flex-1 h-8 text-xs gap-1.5"
                                        >
                                            <Download className="w-3 h-3" />
                                            Download
                                        </Button>
                                    </div>
                                </div>
                            </motion.div>
                        ))
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
