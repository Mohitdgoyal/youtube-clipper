"use client";

import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, AlertCircle, Loader2, XCircle, RefreshCw, Download, Clock } from "lucide-react";
import { type BulkLineStatus } from "@/components/editor/ClipForm";

interface BulkQueueDashboardProps {
    statuses: BulkLineStatus[];
    onCancelClip?: (index: number) => void;
    onRetryClip?: (index: number) => void;
    onDownloadClip?: (index: number) => void;
}

export function BulkQueueDashboard({
    statuses,
    onCancelClip,
    onRetryClip,
    onDownloadClip,
}: BulkQueueDashboardProps) {
    if (!statuses || statuses.length === 0) return null;

    const completedCount = statuses.filter((s) => s.status === "ready").length;
    const totalCount = statuses.length;
    const overallProgress = Math.round(
        statuses.reduce((acc, s) => acc + (s.status === "ready" ? 100 : (s.progress || 0)), 0) / totalCount
    );

    return (
        <div className="flex w-full flex-col gap-3 rounded-2xl border border-border/80 bg-muted/20 p-4">
            {/* Header / Summary Bar */}
            <div className="flex items-center justify-between font-mono text-xs">
                <span className="font-semibold text-foreground">
                    Bulk Queue ({completedCount}/{totalCount} complete)
                </span>
                <span className="text-muted-foreground">{overallProgress}% total</span>
            </div>
            <Progress value={overallProgress} className="h-2" />

            {/* Clip Cards List */}
            <div className="mt-1 flex flex-col gap-2.5 max-h-[320px] overflow-y-auto pr-1">
                <AnimatePresence mode="popLayout">
                    {statuses.map((item, index) => {
                        const isPending = item.status === "pending";
                        const isRunning = item.status === "running" || item.status === "queued";
                        const isReady = item.status === "ready";
                        const isError = item.status === "error";
                        const isCancelled = item.status === "cancelled" || item.status === "skipped";

                        return (
                            <motion.div
                                key={`${item.start}-${item.end}-${index}`}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="flex flex-col gap-2 rounded-xl border border-border/60 bg-background/80 p-3 shadow-sm"
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 font-mono text-xs font-semibold">
                                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                                        <span>{item.start} – {item.end}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span
                                            className={
                                                isReady
                                                    ? "inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400"
                                                    : isError
                                                      ? "inline-flex items-center gap-1 text-xs font-medium text-destructive"
                                                      : isRunning
                                                        ? "inline-flex items-center gap-1 text-xs font-medium text-primary"
                                                        : "inline-flex items-center gap-1 text-xs font-medium text-muted-foreground"
                                            }
                                        >
                                            {isReady && <CheckCircle2 className="h-3.5 w-3.5" />}
                                            {isError && <AlertCircle className="h-3.5 w-3.5" />}
                                            {isRunning && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                            {isCancelled && <XCircle className="h-3.5 w-3.5" />}
                                            <span className="capitalize">{item.stage || item.status}</span>
                                        </span>

                                        {/* Per-Clip Actions */}
                                        {isReady && onDownloadClip && (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => onDownloadClip(index)}
                                                className="h-7 px-2 text-xs rounded-lg"
                                                title="Save clip file"
                                            >
                                                <Download className="h-3.5 w-3.5 mr-1" />
                                                Save
                                            </Button>
                                        )}
                                        {isError && onRetryClip && (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => onRetryClip(index)}
                                                className="h-7 w-7 rounded-lg text-muted-foreground hover:bg-muted"
                                                title="Retry clip"
                                            >
                                                <RefreshCw className="h-3.5 w-3.5" />
                                            </Button>
                                        )}
                                        {isRunning && onCancelClip && (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => onCancelClip(index)}
                                                className="h-7 w-7 rounded-lg text-muted-foreground hover:bg-muted"
                                                title="Cancel clip"
                                            >
                                                <XCircle className="h-3.5 w-3.5 text-destructive" />
                                            </Button>
                                        )}
                                    </div>
                                </div>

                                {isRunning && (
                                    <Progress value={item.progress || 0} className="h-1.5" />
                                )}

                                {item.error && (
                                    <p className="text-[11px] leading-snug text-destructive">
                                        {item.error}
                                    </p>
                                )}
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </div>
        </div>
    );
}
