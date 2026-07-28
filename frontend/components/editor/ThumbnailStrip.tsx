"use client";

import React, { useState, useEffect, useRef } from "react";
import { secondsToTime } from "@/lib/utils";

export interface StoryboardSpec {
    url: string;
    width?: number;
    height?: number;
    cols?: number;
    rows?: number;
    count?: number;
    interval?: number;
}

interface ThumbnailStripProps {
    duration: number;
    storyboards?: StoryboardSpec[] | Record<string, StoryboardSpec>;
    trackRef: React.RefObject<HTMLDivElement | null>;
}

export function ThumbnailStrip({ duration, storyboards, trackRef }: ThumbnailStripProps) {
    const [isHovering, setIsHovering] = useState(false);
    const isHoveringRef = useRef(false);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const bgRef = useRef<HTMLDivElement>(null);
    const timeRef = useRef<HTMLSpanElement>(null);

    if (!storyboards || duration <= 0) return null;

    const specList = Array.isArray(storyboards) ? storyboards : Object.values(storyboards);
    const bestSpec = specList[specList.length - 1];
    if (!bestSpec || !bestSpec.url) return null;

    useEffect(() => {
        const track = trackRef.current;
        if (!track) return;

        // Memoize values outside the high-frequency mousemove handler
        const width = bestSpec.width || 800;
        const height = bestSpec.height || 450;
        const cols = bestSpec.cols || 5;
        const rows = bestSpec.rows || 5;
        const count = bestSpec.count || 100;
        const interval = bestSpec.interval || (duration / count);
        
        const thumbW = Math.round(width / cols);
        const thumbH = Math.round(height / rows);
        const thumbsPerSheet = cols * rows;

        // Pre-compute URL template type
        let urlTemplateType = 0; // 0: no match, 1: $N, 2: %d, 3: (M)\d+(\.\w+)
        if (bestSpec.url.includes("$N")) urlTemplateType = 1;
        else if (bestSpec.url.includes("%d")) urlTemplateType = 2;
        else if (/(M)\d+(\.\w+)/i.test(bestSpec.url)) urlTemplateType = 3;

        const handleMouseMove = (e: MouseEvent) => {
            const rect = track.getBoundingClientRect();
            const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
            const pct = x / rect.width;
            const hoverTime = pct * duration;

            const thumbIndex = Math.floor(hoverTime / (interval || 5));
            const sheetIndex = Math.floor(thumbIndex / thumbsPerSheet);
            const localIndex = thumbIndex % thumbsPerSheet;

            const col = localIndex % cols;
            const row = Math.floor(localIndex / cols);

            let imgUrl = bestSpec.url;
            if (urlTemplateType === 1) {
                imgUrl = imgUrl.replace("$N", String(sheetIndex));
            } else if (urlTemplateType === 2) {
                imgUrl = imgUrl.replace("%d", String(sheetIndex));
            } else if (urlTemplateType === 3) {
                imgUrl = imgUrl.replace(/(M)\d+(\.\w+)/i, `$1${sheetIndex}$2`);
            }

            const bgPos = `-${col * thumbW}px -${row * thumbH}px`;
            const popoverWidth = 144;
            const safeX = Math.max(popoverWidth / 2, Math.min(rect.width - popoverWidth / 2, x));

            if (!isHoveringRef.current) {
                setIsHovering(true);
                isHoveringRef.current = true;
            }
            if (tooltipRef.current) {
                tooltipRef.current.style.left = `${safeX}px`;
            }
            if (bgRef.current) {
                bgRef.current.style.backgroundImage = `url(${imgUrl})`;
                bgRef.current.style.backgroundPosition = bgPos;
            }
            if (timeRef.current) {
                timeRef.current.innerText = secondsToTime(hoverTime).substring(0, 8);
            }
        };

        const handleMouseLeave = () => {
            setIsHovering(false);
            isHoveringRef.current = false;
        };

        track.addEventListener("mousemove", handleMouseMove);
        track.addEventListener("mouseleave", handleMouseLeave);

        return () => {
            track.removeEventListener("mousemove", handleMouseMove);
            track.removeEventListener("mouseleave", handleMouseLeave);
        };
    }, [trackRef, duration, bestSpec]);

    return (
        <div className="relative w-full pointer-events-none">
            <div
                ref={tooltipRef}
                style={{ display: isHovering ? "flex" : "none" }}
                className="pointer-events-none absolute -top-28 z-30 flex -translate-x-1/2 flex-col items-center rounded-2xl border border-border/80 bg-background/95 p-1.5 shadow-2xl backdrop-blur-md transition-opacity duration-150"
            >
                <div
                    ref={bgRef}
                    className="h-20 w-36 rounded-xl bg-no-repeat shadow-inner"
                    style={{
                        backgroundSize: "auto",
                    }}
                />
                <span ref={timeRef} className="mt-1 font-mono text-[11px] font-semibold text-foreground">
                </span>
            </div>
        </div>
    );
}
