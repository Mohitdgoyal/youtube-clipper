"use client";

import * as React from "react";
import { useState, useRef, useCallback, useEffect } from "react";
import { cn, timeToSeconds, secondsToTime } from "@/lib/utils";
import { ThumbnailStrip, type StoryboardSpec } from "@/components/editor/ThumbnailStrip";

interface DragTimelineProps {
    duration: number;
    startTime: string;
    endTime: string;
    onValueChange: (start: string, end: string) => void;
    className?: string;
    videoId?: string;
    storyboards?: StoryboardSpec[] | Record<string, StoryboardSpec>;
}

export function DragTimeline({
    duration,
    startTime,
    endTime,
    onValueChange,
    className,
    videoId,
    storyboards,
}: DragTimelineProps) {
    const trackRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState<"start" | "end" | "create" | null>(null);
    const dragAnchorRef = useRef<number>(0);

    const safeDuration = duration > 0 ? duration : 100;
    const step = safeDuration < 5 ? 0.01 : 0.05;

    const startSec = Math.min(timeToSeconds(startTime), safeDuration);
    const endSec = Math.min(Math.max(timeToSeconds(endTime), startSec + step), safeDuration);

    const getTimeFromPointer = useCallback(
        (clientX: number): number => {
            if (!trackRef.current) return 0;
            const rect = trackRef.current.getBoundingClientRect();
            const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
            const rawSec = pct * safeDuration;
            return Math.round(rawSec / step) * step;
        },
        [safeDuration, step]
    );

    const handleStartHandlePointerDown = (e: React.PointerEvent) => {
        e.stopPropagation();
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        setIsDragging("start");
    };

    const handleEndHandlePointerDown = (e: React.PointerEvent) => {
        e.stopPropagation();
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        setIsDragging("end");
    };

    const handleTrackPointerDown = (e: React.PointerEvent) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        const time = getTimeFromPointer(e.clientX);
        dragAnchorRef.current = time;
        setIsDragging("create");

        let targetEnd = Math.min(safeDuration, time + 1.0);
        let targetStart = time;
        if (targetEnd === safeDuration && safeDuration > 1.0) {
            targetStart = Math.max(0, safeDuration - 1.0);
        }

        onValueChange(secondsToTime(targetStart), secondsToTime(targetEnd));
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDragging) return;
        const time = getTimeFromPointer(e.clientX);

        if (isDragging === "start") {
            const nextStart = Math.min(time, endSec - step);
            onValueChange(secondsToTime(nextStart), secondsToTime(endSec));
        } else if (isDragging === "end") {
            const nextEnd = Math.max(time, startSec + step);
            onValueChange(secondsToTime(startSec), secondsToTime(nextEnd));
        } else if (isDragging === "create") {
            const anchor = dragAnchorRef.current;
            if (time >= anchor) {
                onValueChange(secondsToTime(anchor), secondsToTime(time));
            } else {
                onValueChange(secondsToTime(time), secondsToTime(anchor));
            }
        }
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        try {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                e.currentTarget.releasePointerCapture(e.pointerId);
            }
        } catch {
            // Ignore capture release errors
        }
        setIsDragging(null);
    };

    const handleKeyDown = (e: React.KeyboardEvent, target: "start" | "end") => {
        let keyStep = e.shiftKey ? 1.0 : step;
        let nextStart = startSec;
        let nextEnd = endSec;

        if (e.key === "ArrowLeft") {
            if (target === "start") nextStart = Math.max(0, startSec - keyStep);
            else nextEnd = Math.max(startSec + step, endSec - keyStep);
        } else if (e.key === "ArrowRight") {
            if (target === "start") nextStart = Math.min(endSec - step, startSec + keyStep);
            else nextEnd = Math.min(safeDuration, endSec + keyStep);
        } else if (e.key === "Home") {
            if (target === "start") nextStart = 0;
            else nextEnd = startSec + step;
        } else if (e.key === "End") {
            if (target === "start") nextStart = endSec - step;
            else nextEnd = safeDuration;
        } else {
            return;
        }

        e.preventDefault();
        onValueChange(secondsToTime(nextStart), secondsToTime(nextEnd));
    };

    const posterUrl = videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null;
    const startPct = (startSec / safeDuration) * 100;
    const endPct = (endSec / safeDuration) * 100;

    return (
        <div className={cn("relative w-full select-none touch-none py-3", className)}>
            {/* Background Poster Overlay (Fallback when no storyboards) */}
            {posterUrl && !storyboards && (
                <div
                    className="absolute inset-0 -top-1 h-10 overflow-hidden rounded-lg opacity-30 pointer-events-none bg-cover bg-center"
                    style={{ backgroundImage: `url(${posterUrl})` }}
                >
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/50 to-background" />
                </div>
            )}

            {/* Frame-by-Frame Thumbnail Strip & Hover Tooltip */}
            <ThumbnailStrip duration={duration} storyboards={storyboards} trackRef={trackRef} />

            {/* Slider Track */}
            <div
                ref={trackRef}
                onPointerDown={handleTrackPointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                className="relative h-3 w-full cursor-pointer rounded-full bg-secondary/70"
                style={{ touchAction: "none" }}
            >
                {/* Selected Range Highlight */}
                <div
                    className="absolute h-full rounded-full bg-primary transition-all"
                    style={{ left: `${startPct}%`, width: `${Math.max(0.5, endPct - startPct)}%` }}
                />

                {/* Start Handle */}
                <div
                    role="slider"
                    tabIndex={0}
                    aria-label="Start time"
                    aria-valuemin={0}
                    aria-valuemax={endSec}
                    aria-valuenow={startSec}
                    onPointerDown={handleStartHandlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onKeyDown={(e) => handleKeyDown(e, "start")}
                    className="absolute top-1/2 z-20 h-5 w-3.5 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-md border border-primary/40 bg-background shadow-md transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-ring active:cursor-grabbing"
                    style={{ left: `${startPct}%`, touchAction: "none" }}
                />

                {/* End Handle */}
                <div
                    role="slider"
                    tabIndex={0}
                    aria-label="End time"
                    aria-valuemin={startSec}
                    aria-valuemax={safeDuration}
                    aria-valuenow={endSec}
                    onPointerDown={handleEndHandlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onKeyDown={(e) => handleKeyDown(e, "end")}
                    className="absolute top-1/2 z-20 h-5 w-3.5 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-md border border-primary/40 bg-background shadow-md transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-ring active:cursor-grabbing"
                    style={{ left: `${endPct}%`, touchAction: "none" }}
                />
            </div>
        </div>
    );
}
