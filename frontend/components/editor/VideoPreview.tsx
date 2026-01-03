import { useRef } from "react";
import YouTube from "react-youtube";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";
import { Timer, Scissors } from "lucide-react";
import { getVideoId } from "@/lib/utils";

interface VideoPreviewProps {
    isLoading: boolean;
    thumbnailUrl: string | null;
    title?: string;
    url: string;
    onSetStartTime: (time: string) => void;
    onSetEndTime: (time: string) => void;
}

export default function VideoPreview({
    isLoading,
    // thumbnailUrl,
    title,
    url,
    onSetStartTime,
    onSetEndTime
}: VideoPreviewProps) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const playerRef = useRef<any>(null);



    // const getVideoId = (url: string) => {
    //     const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    //     const match = url.match(regExp);
    //     return match && match[7].length === 11 ? match[7] : null;
    // };

    const videoId = getVideoId(url);

    const formatSeconds = (seconds: number) => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const handleCaptureStart = () => {
        if (playerRef.current) {
            const currentTime = playerRef.current.getCurrentTime();
            onSetStartTime(formatSeconds(currentTime));
        }
    };

    const handleCaptureEnd = () => {
        if (playerRef.current) {
            const currentTime = playerRef.current.getCurrentTime();
            onSetEndTime(formatSeconds(currentTime));
        }
    };

    return (
        <AnimatePresence mode="wait">
            {!videoId ? (
                <motion.h1
                    key="empty"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="text-2xl lg:text-3xl font-medium tracking-tight text-center mx-auto"
                >
                    What do you wanna clip?
                </motion.h1>
            ) : (
                <motion.div
                    key="content"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="flex flex-col gap-4 w-full"
                >
                    <div className="relative aspect-video w-full rounded-2xl overflow-hidden border bg-black shadow-2xl">
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
                                },
                            }}
                            onReady={(event) => {
                                playerRef.current = event.target;
                            }}
                        />
                        {isLoading && (
                            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center">
                                <motion.div
                                    animate={{ rotate: 360 }}
                                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                                    className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full"
                                />
                            </div>
                        )}
                    </div>

                    <div className="flex flex-col gap-3">
                        <h3 className="font-medium text-lg line-clamp-1 px-1">
                            {title || "Loading video details..."}
                        </h3>

                        <div className="flex gap-2">
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={handleCaptureStart}
                                className="flex-1 bg-primary/10 hover:bg-primary/20 text-primary border-primary/20 rounded-xl"
                            >
                                <Timer className="w-4 h-4 mr-2" />
                                Set Start
                            </Button>
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={handleCaptureEnd}
                                className="flex-1 bg-primary/10 hover:bg-primary/20 text-primary border-primary/20 rounded-xl"
                            >
                                <Scissors className="w-4 h-4 mr-2" />
                                Set End
                            </Button>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
