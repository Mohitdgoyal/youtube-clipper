import Image from "next/image";
import { motion, AnimatePresence } from "motion/react";

interface VideoPreviewProps {
    isLoading: boolean;
    thumbnailUrl: string | null;
    title?: string;
}

export default function VideoPreview({ isLoading, thumbnailUrl, title }: VideoPreviewProps) {
    return (
        <AnimatePresence mode="wait">
            {!isLoading && thumbnailUrl === null ? (
                <motion.h1
                    key="empty"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="text-2xl lg:text-3xl font-medium tracking-tight text-center mx-auto"
                >
                    What do you wanna clip?
                </motion.h1>
            ) : isLoading ? (
                <motion.div
                    key="loading"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="flex flex-col gap-6 h-full w-fit mx-auto"
                >
                    <div className="flex flex-col md:flex-row gap-4 bg-muted/50 p-2 rounded-lg items-center">
                        <div className="w-20 h-[45px] bg-muted animate-pulse rounded-md" />
                        <div className="flex flex-col gap-2">
                            <div className="h-6 w-48 bg-muted animate-pulse rounded-md" />
                        </div>
                    </div>
                </motion.div>
            ) : (
                <motion.div
                    key="content"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="flex flex-col gap-6 h-full w-fit mx-auto"
                >
                    <div className="flex flex-col md:flex-row gap-4 bg-muted/50 p-2 rounded-lg md:items-center">
                        {thumbnailUrl && (
                            <Image
                                unoptimized
                                width={1280}
                                height={720}
                                src={thumbnailUrl}
                                alt="Video thumbnail"
                                className="w-20 object-cover aspect-video rounded-md"
                                onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    if (target.src.includes("maxresdefault")) {
                                        target.src = target.src.replace("maxresdefault", "hqdefault");
                                    }
                                }}
                            />
                        )}
                        <div className="flex flex-col gap-2">
                            <h3 className="font-medium text-lg line-clamp-1">
                                {title}
                            </h3>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
