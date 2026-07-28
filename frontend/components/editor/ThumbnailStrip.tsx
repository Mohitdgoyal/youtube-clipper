"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { secondsToTime } from "@/lib/utils";

interface ThumbnailStripProps {
    duration: number;
    storyboards?: any;
    trackRef: React.RefObject<HTMLDivElement | null>;
}

export function ThumbnailStrip({ duration, storyboards, trackRef }: ThumbnailStripProps) {
    const [hoverInfo, setHoverInfo] = useState<{
        x: number;
        time: number;
        bgPos: string;
        imgUrl: string;
        thumbW: number;
        thumbH: number;
    } | null>(null);

    if (!storyboards || duration <= 0) return null;

    const specList = Array.isArray(storyboards) ? storyboards : Object.values(storyboards);
    const bestSpec = specList[specList.length - 1];
    if (!bestSpec || !bestSpec.url) return null;

    useEffect(() => {
        const track = trackRef.current;
        if (!track) return;

        const handleMouseMove = (e: MouseEvent) => {
            const rect = track.getBoundingClientRect();
            const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
            const pct = x / rect.width;
            const hoverTime = pct * duration;

            const width = bestSpec.width || 800;
            const height = bestSpec.height || 450;
            const cols = bestSpec.cols || 5;
            const rows = bestSpec.rows || 5;
            const count = bestSpec.count || 100;
            const interval = bestSpec.interval || (duration / count);

            const thumbIndex = Math.floor(hoverTime / (interval || 5));
            const thumbsPerSheet = cols * rows;
            const sheetIndex = Math.floor(thumbIndex / thumbsPerSheet);
            const localIndex = thumbIndex % thumbsPerSheet;

            const col = localIndex % cols;
            const row = Math.floor(localIndex / cols);

            const thumbW = Math.round(width / cols);
            const thumbH = Math.round(height / rows);

            let imgUrl = bestSpec.url;
            if (imgUrl.includes("$N")) {
                imgUrl = imgUrl.replace("$N", String(sheetIndex));
            } else if (imgUrl.includes("%d")) {
                imgUrl = imgUrl.replace("%d", String(sheetIndex));
            } else {
                imgUrl = imgUrl.replace(/(M)\d+(\.\w+)/i, `$1${sheetIndex}$2`);
            }

            const bgPos = `-${col * thumbW}px -${row * thumbH}px`;
            const popoverWidth = 144;
            const safeX = Math.max(popoverWidth / 2, Math.min(rect.width - popoverWidth / 2, x));

            setHoverInfo({ x: safeX, time: hoverTime, bgPos, imgUrl, thumbW, thumbH });
        };

        const handleMouseLeave = () => setHoverInfo(null);

        track.addEventListener("mousemove", handleMouseMove);
        track.addEventListener("mouseleave", handleMouseLeave);

        return () => {
            track.removeEventListener("mousemove", handleMouseMove);
            track.removeEventListener("mouseleave", handleMouseLeave);
        };
    }, [trackRef, duration, bestSpec]);

    return (
        <div className="relative w-full pointer-events-none">
            <AnimatePresence>
                {hoverInfo && (
                    <motion.div
                        initial={{ opacity: 0, y: 4, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 4, scale: 0.95 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        className="pointer-events-none absolute -top-28 z-30 flex -translate-x-1/2 flex-col items-center rounded-2xl border border-border/80 bg-background/95 p-1.5 shadow-2xl backdrop-blur-md"
                        style={{ left: hoverInfo.x }}
                    >
                        <div
                            className="h-20 w-36 rounded-xl bg-no-repeat shadow-inner"
                            style={{
                                backgroundImage: `url(${hoverInfo.imgUrl})`,
                                backgroundPosition: hoverInfo.bgPos,
                                backgroundSize: "auto",
                            }}
                        />
                        <span className="mt-1 font-mono text-[11px] font-semibold text-foreground">
                            {secondsToTime(hoverInfo.time).substring(0, 8)}
                        </span>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
