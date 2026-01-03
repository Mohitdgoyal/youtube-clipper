import { useRef, useState, useEffect, useCallback, Suspense, lazy } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";
import { Timer, Scissors, Play, Pause } from "lucide-react";
import { getVideoId, timeToSeconds, secondsToTime } from "@/lib/utils";
import { TimelineSlider } from "@/components/editor/TimelineSlider";
import { KeyboardShortcutsInfo } from "@/components/editor/KeyboardShortcutsInfo";
import { Skeleton } from "@/components/ui/skeleton";

// Lazy load YouTube player for faster initial render
const YouTube = lazy(() => import("react-youtube"));

interface VideoPreviewProps {
    isLoading: boolean;
    thumbnailUrl: string | null;
    title?: string;
    url: string;
    // We add these props to control the slider
    startTime?: string;
    endTime?: string;
    onSetStartTime: (time: string, isSeek?: boolean) => void;
    onSetEndTime: (time: string) => void;
}

// Optimized animation variants with reduced complexity
const fadeVariants = {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 }
};

const transitionConfig = {
    duration: 0.2,
    ease: "easeOut"
};

// Loading skeleton for YouTube player
function YouTubeLoadingSkeleton() {
    return (
        <div className="w-full h-full bg-black flex items-center justify-center">
            <Skeleton className="absolute inset-0" />
            <div className="relative z-10 flex flex-col items-center gap-3 text-white/60">
                <div className="w-16 h-16 rounded-full border-4 border-white/20 border-t-white/60 animate-spin" />
                <span className="text-sm">Loading player...</span>
            </div>
        </div>
    );
}

export default function VideoPreview({
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
    const [playerReady, setPlayerReady] = useState(false);

    // Timer to track current time for finding "current playhead" if needed, 
    // though playerRef.current.getCurrentTime() is better for immediate actions.

    const videoId = getVideoId(url);

    const formatSeconds = (seconds: number) => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const handleCaptureStart = useCallback(() => {
        if (playerRef.current) {
            const currentTime = playerRef.current.getCurrentTime();
            onSetStartTime(formatSeconds(currentTime));
        }
    }, [onSetStartTime]);

    const handleCaptureEnd = useCallback(() => {
        if (playerRef.current) {
            const currentTime = playerRef.current.getCurrentTime();
            onSetEndTime(formatSeconds(currentTime));
        }
    }, [onSetEndTime]);

    const seekTo = (seconds: number) => {
        if (playerRef.current) {
            playerRef.current.seekTo(seconds, true);
        }
    };

    const handleTimelineChange = (newStart: string, newEnd: string) => {
        const s = timeToSeconds(newStart);
        const e = timeToSeconds(newEnd);

        // If start changed, verify it's valid
        if (newStart !== startTime) {
            onSetStartTime(newStart);
            // Optional: seek to start when dragging start handle for preview
            seekTo(s);
        }
        if (newEnd !== endTime) {
            onSetEndTime(newEnd);
        }
    };

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if typing in an input
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
                    const amount = e.shiftKey ? 0.05 : 5; // shift for fine tune, though seekTo might be coarse on yt
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
                <motion.h1
                    key="empty"
                    variants={fadeVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    transition={transitionConfig}
                    className="text-2xl lg:text-3xl font-medium tracking-tight text-center mx-auto"
                >
                    What do you wanna clip?
                </motion.h1>
            ) : (
                <motion.div
                    key="content"
                    variants={fadeVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    transition={transitionConfig}
                    className="flex flex-col gap-4 w-full"
                    style={{ willChange: 'opacity, transform' }}
                >
                    <div className="relative aspect-video w-full rounded-2xl overflow-hidden border bg-black shadow-2xl group">
                        <Suspense fallback={<YouTubeLoadingSkeleton />}>
                            <YouTube
                                videoId={videoId}
                                className="w-full h-full"
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
                                onReady={(event: { target: any }) => {
                                    playerRef.current = event.target;
                                    setDuration(event.target.getDuration());
                                    setPlayerReady(true);
                                }}
                                onStateChange={(e: { data: number }) => {
                                    setIsPlaying(e.data === 1); // 1 = playing
                                }}
                            />
                        </Suspense>
                        {isLoading && (
                            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-10">
                                <div
                                    className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"
                                />
                            </div>
                        )}
                    </div>

                    {/* Timeline & Controls */}
                    <div className="flex flex-col gap-4 px-1">
                        <div className="flex items-center justify-between">
                            <h3 className="font-medium text-lg line-clamp-1 flex-1 mr-4">
                                {title || "Untitled Video"}
                            </h3>
                            <KeyboardShortcutsInfo />
                        </div>

                        {/* Scrubber */}
                        <div className="px-2 pb-2 pt-1">
                            <TimelineSlider
                                duration={duration}
                                startTime={startTime}
                                endTime={endTime}
                                onValueChange={handleTimelineChange}
                            />
                            <div className="flex justify-between text-xs text-muted-foreground mt-2 font-mono">
                                <span>{startTime}</span>
                                <span>{endTime}</span>
                            </div>
                        </div>

                        {/* Quick Actions */}
                        <div className="grid grid-cols-2 gap-3">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleCaptureStart}
                                className="bg-background/50 backdrop-blur hover:bg-muted text-foreground border-border rounded-xl h-10"
                            >
                                <Timer className="w-4 h-4 mr-2" />
                                Set Start (I)
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleCaptureEnd}
                                className="bg-background/50 backdrop-blur hover:bg-muted text-foreground border-border rounded-xl h-10"
                            >
                                <Scissors className="w-4 h-4 mr-2" />
                                Set End (O)
                            </Button>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

