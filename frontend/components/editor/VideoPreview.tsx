import { useRef, useState, useEffect, useCallback, Suspense, lazy, memo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";
import { Timer, Scissors } from "lucide-react";
import { getVideoId, timeToSeconds, secondsToTime } from "@/lib/utils";
import { TimelineSlider } from "@/components/editor/TimelineSlider";
import { KeyboardShortcutsInfo } from "@/components/editor/KeyboardShortcutsInfo";
import { Skeleton } from "@/components/ui/skeleton";

const YouTube = lazy(() => import("react-youtube"));

interface VideoPreviewProps {
    isLoading: boolean;
    title?: string;
    url: string;
    startTime?: string;
    endTime?: string;
    onSetStartTime: (time: string, isSeek?: boolean) => void;
    onSetEndTime: (time: string) => void;
}

const fadeVariants = {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -8 }
};

const transitionConfig = {
    duration: 0.28,
    ease: "easeOut" as const
};

function YouTubeLoadingSkeleton() {
    return (
        <div className="flex h-full w-full items-center justify-center bg-foreground/95">
            <Skeleton className="absolute inset-0 opacity-20" />
            <div className="relative z-10 flex flex-col items-center gap-3 text-background/70">
                <div className="h-12 w-12 animate-spin rounded-full border-[3px] border-background/20 border-t-background/70" />
                <span className="text-sm">Loading player…</span>
            </div>
        </div>
    );
}

function VideoPreview({
    isLoading,
    title,
    url,
    startTime = "00:00:00",
    endTime = "00:00:00",
    onSetStartTime,
    onSetEndTime
}: VideoPreviewProps) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const playerRef = useRef<any>(null);
    const [duration, setDuration] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);

    const videoId = getVideoId(url);

    const handleCaptureStart = useCallback(() => {
        if (playerRef.current) {
            const currentTime = playerRef.current.getCurrentTime();
            onSetStartTime(secondsToTime(currentTime));
        }
    }, [onSetStartTime]);

    const handleCaptureEnd = useCallback(() => {
        if (playerRef.current) {
            const currentTime = playerRef.current.getCurrentTime();
            onSetEndTime(secondsToTime(currentTime));
        }
    }, [onSetEndTime]);

    const seekTo = (seconds: number) => {
        if (playerRef.current) {
            playerRef.current.seekTo(seconds, true);
        }
    };

    const handleTimelineChange = (newStart: string, newEnd: string) => {
        const s = timeToSeconds(newStart);
        if (newStart !== startTime) {
            onSetStartTime(newStart);
            seekTo(s);
        }
        if (newEnd !== endTime) {
            onSetEndTime(newEnd);
        }
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
            if (!playerRef.current) return;

            switch (e.key.toLowerCase()) {
                case ' ':
                    e.preventDefault();
                    if (isPlaying) playerRef.current.pauseVideo();
                    else playerRef.current.playVideo();
                    setIsPlaying(!isPlaying);
                    break;
                case 'i':
                    handleCaptureStart();
                    break;
                case 'o':
                    handleCaptureEnd();
                    break;
                case 'arrowleft': {
                    e.preventDefault();
                    const cur = playerRef.current.getCurrentTime();
                    const amount = e.shiftKey ? 0.05 : 5;
                    seekTo(Math.max(0, cur - amount));
                    break;
                }
                case 'arrowright': {
                    e.preventDefault();
                    const cur = playerRef.current.getCurrentTime();
                    const amount = e.shiftKey ? 0.05 : 5;
                    seekTo(Math.min(duration, cur + amount));
                    break;
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [duration, isPlaying, handleCaptureStart, handleCaptureEnd]);

    return (
        <AnimatePresence mode="wait">
            {!videoId ? (
                <motion.div
                    key="empty"
                    variants={fadeVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    transition={transitionConfig}
                    className="flex flex-col items-center gap-4 py-6 text-center sm:py-10"
                >
                    <p className="font-display text-5xl font-semibold tracking-tight text-foreground sm:text-6xl">
                        Clippa
                    </p>
                    <p className="max-w-md text-balance text-base text-muted-foreground sm:text-lg">
                        Paste a YouTube link. Mark the moment. Download a clean HD clip.
                    </p>
                </motion.div>
            ) : (
                <motion.div
                    key="content"
                    variants={fadeVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    transition={transitionConfig}
                    className="flex w-full flex-col gap-5"
                >
                    <div className="group relative aspect-video w-full overflow-hidden rounded-3xl border border-border/80 bg-black shadow-[0_24px_60px_-28px_rgba(15,23,42,0.45)]">
                        <Suspense fallback={<YouTubeLoadingSkeleton />}>
                            <YouTube
                                videoId={videoId}
                                className="h-full w-full"
                                opts={{
                                    width: '100%',
                                    height: '100%',
                                    playerVars: {
                                        autoplay: 0,
                                        modestbranding: 1,
                                        rel: 0,
                                        fs: 0,
                                    },
                                }}
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                onReady={(event: { target: any }) => {
                                    playerRef.current = event.target;
                                    setDuration(event.target.getDuration());
                                }}
                                onStateChange={(e: { data: number }) => {
                                    setIsPlaying(e.data === 1);
                                }}
                            />
                        </Suspense>
                        {isLoading && (
                            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/55 backdrop-blur-[2px]">
                                <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-primary border-t-transparent" />
                            </div>
                        )}
                    </div>

                    <div className="flex flex-col gap-4">
                        <div className="flex items-start justify-between gap-3">
                            <h2 className="line-clamp-2 flex-1 text-lg font-semibold tracking-tight sm:text-xl">
                                {title || "Untitled video"}
                            </h2>
                            <KeyboardShortcutsInfo />
                        </div>

                        <div className="rounded-2xl border border-border/60 bg-muted/20 px-3 py-3">
                            <TimelineSlider
                                duration={duration}
                                startTime={startTime}
                                endTime={endTime}
                                onValueChange={handleTimelineChange}
                                videoId={videoId}
                            />
                            <div className="mt-2 flex justify-between font-mono text-xs text-muted-foreground">
                                <span>{startTime}</span>
                                <span>{endTime}</span>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleCaptureStart}
                                className="h-11 rounded-2xl border-border/80 bg-background/60"
                            >
                                <Timer className="mr-2 h-4 w-4" />
                                Set start
                                <kbd className="ml-auto hidden rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">I</kbd>
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleCaptureEnd}
                                className="h-11 rounded-2xl border-border/80 bg-background/60"
                            >
                                <Scissors className="mr-2 h-4 w-4" />
                                Set end
                                <kbd className="ml-auto hidden rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">O</kbd>
                            </Button>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

export default memo(VideoPreview);
