"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "motion/react";
import { toast } from "sonner";
import VideoPreview from "@/components/editor/VideoPreview";
import ClipForm, { type BulkLineStatus } from "@/components/editor/ClipForm";
import { type StoryboardSpec } from "@/components/editor/ThumbnailStrip";
import PingBackend from "@/components/ping-backend";
import {
  CookieHealthChip,
  fetchCookiesHealth,
  formatsLookLowRes,
} from "@/components/editor/CookieHealthChip";
import { getVideoId, timeToSeconds } from "@/lib/utils";
import { JobCancelledError, waitForJob } from "@/lib/job-events";
import { ThemeToggle } from "@/components/ui/theme-toggle";

const SESSION_USER = { id: "personal-user", name: "Personal User" };

async function triggerDownload(filename: string, signedUrl: string | null | undefined, jobId: string) {
  const proxyHref = `/api/clip/${jobId}/download?filename=${encodeURIComponent(filename)}`;

  if (signedUrl) {
    try {
      const res = await fetch(signedUrl);
      if (res.ok) {
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(objectUrl);
        return;
      }
    } catch {
      // fall through to same-origin proxy
    }
  }

  const anchor = document.createElement("a");
  anchor.href = proxyHref;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

export default function Editor() {
  const searchParams = useSearchParams();
  const [url, setUrl] = useState(() => searchParams.get("url") ?? "");
  const [startTime, setStartTime] = useState("00:00:00");
  const [endTime, setEndTime] = useState("00:00:00");
  const [addSubs, setAddSubs] = useState(false);
  const [loading, setLoading] = useState(false);
  const [metadata, setMetadata] = useState<{ title?: string }>({});

  const [formatsByCodec, setFormatsByCodec] = useState<Record<string, { format_id: string; label: string; tbr?: number }[]>>({
    h264: [],
    vp9: [],
    av1: [],
  });
  const [availableCodecs, setAvailableCodecs] = useState<string[]>(["h264", "vp9", "av1"]);
  const [selectedCodec, setSelectedCodec] = useState<string>("h264");
  const [formats, setFormats] = useState<{ format_id: string; label: string; tbr?: number }[]>([]);
  const [selectedFormat, setSelectedFormat] = useState<string>("");
  const [storyboards, setStoryboards] = useState<StoryboardSpec[] | Record<string, StoryboardSpec> | null>(null);

  const [isMetadataLoading, setIsMetadataLoading] = useState(false);
  const [isBulk, setIsBulk] = useState(false);
  const [bulkTimestamps, setBulkTimestamps] = useState("");
  const [bulkLineStatuses, setBulkLineStatuses] = useState<BulkLineStatus[]>([]);
  const [cookieWarning, setCookieWarning] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const progressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeJobIdsRef = useRef<Set<string>>(new Set());
  const stopBulkRef = useRef(false);
  const waitAbortRefs = useRef<Map<number, AbortController>>(new Map());

  const clearProgressTimer = useCallback(() => {
    if (progressTimer.current) {
      clearTimeout(progressTimer.current);
      progressTimer.current = null;
    }
  }, []);

  const onJobProgress = useCallback((data: { stage?: string | null; progress?: number; status?: string }) => {
    setStage(data.stage || "processing");
    const next = Number(data.status === "ready" ? 100 : (data.progress || 0));
    clearProgressTimer();
    progressTimer.current = setTimeout(() => setProgress(next), 150);
  }, [clearProgressTimer]);

  const handleCodecChange = (newCodec: string) => {
    setSelectedCodec(newCodec);
    setSelectedFormat(""); // Reset format to "Best available" on codec switch
    const codecFormats = formatsByCodec[newCodec] || formatsByCodec.h264 || [];
    setFormats(codecFormats);
  };

  useEffect(() => {
    return () => clearProgressTimer();
  }, [clearProgressTimer]);

  useEffect(() => {
    const videoId = getVideoId(url);
    if (!videoId) {
      const reset = () => {
        setMetadata({});
        setFormats([]);
        setFormatsByCodec({ h264: [], vp9: [], av1: [] });
        setAvailableCodecs(["h264", "vp9", "av1"]);
        setSelectedFormat("");
        setStoryboards(null);
        setIsMetadataLoading(false);
      };
      const id = setTimeout(reset, 0);
      return () => clearTimeout(id);
    }

    const controller = new AbortController();
    const startId = setTimeout(() => setIsMetadataLoading(true), 0);

    const timer = setTimeout(async () => {
      try {
        const vUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const res = await fetch(`/api/video?url=${encodeURIComponent(vUrl)}`, {
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        if (res.ok) {
          const data = await res.json();
          const nextFormats = data.formats || [];
          const byCodec = data.formatsByCodec || { h264: nextFormats, vp9: [], av1: [] };
          const avail = data.availableCodecs || ["h264"];

          setMetadata({ title: data.title });
          setFormatsByCodec(byCodec);
          setAvailableCodecs(avail);
          setStoryboards(data.storyboards || null);

          // Default formats to selected codec
          const currentCodecFormats = byCodec[selectedCodec] || nextFormats;
          setFormats(currentCodecFormats);
          setSelectedFormat("");

          if (formatsLookLowRes(nextFormats)) {
            const cookies = await fetchCookiesHealth();
            if (cookies && !cookies.ok) {
              setCookieWarning(
                "Only low-res formats available — cookies missing or stale. Add backend/cookies.txt for higher quality."
              );
            } else {
              setCookieWarning(null);
            }
          } else {
            setCookieWarning(null);
          }
        } else {
          toast.error("Could not load video info. Check the URL and try again.");
          setFormats([]);
          setSelectedFormat("");
          setStoryboards(null);
          setCookieWarning(null);
        }
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        console.error("Error fetching metadata:", error);
        toast.error("Could not load video info.");
      } finally {
        if (!controller.signal.aborted) setIsMetadataLoading(false);
      }
    }, 400);

    return () => {
      clearTimeout(startId);
      clearTimeout(timer);
      controller.abort();
    };
  }, [url, selectedCodec]);

  const handleCancel = useCallback(async () => {
    stopBulkRef.current = true;
    for (const controller of waitAbortRefs.current.values()) {
        controller.abort();
    }
    waitAbortRefs.current.clear();
    
    const ids = Array.from(activeJobIdsRef.current);
    if (ids.length === 0) {
      toast.message("Cancelled");
      return;
    }

    try {
      toast.message("Cancelling...");
      await Promise.all(ids.map(id => fetch(`/api/clip/${id}/cancel`, { method: "POST" })));
    } catch (err) {
      console.warn("Cancel request failed:", err);
      toast.error("Could not cancel — check connection and try again.");
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const jobsToProcess = isBulk
      ? bulkTimestamps.split("\n").filter((line) => line.includes("-")).map((line) => {
          const [start, end] = line.split("-").map((t) => t.trim());
          return { start, end };
        })
      : [{ start: startTime, end: endTime }];

    if (jobsToProcess.length === 0) {
      toast.error("No valid timestamps found");
      return;
    }

    for (const job of jobsToProcess) {
      if (timeToSeconds(job.end) <= timeToSeconds(job.start)) {
        toast.error("End time must be after start time");
        return;
      }
    }

    stopBulkRef.current = false;
    setLoading(true);
    clearProgressTimer();
    setProgress(0);
    setStage("queued");
    activeJobIdsRef.current.clear();
    waitAbortRefs.current.clear();

    const ext = selectedCodec === "vp9" ? "webm" : "mp4";

    const lineStatuses: BulkLineStatus[] = jobsToProcess.map((j) => ({
      start: j.start,
      end: j.end,
      status: "pending" as const,
    }));
    if (isBulk) setBulkLineStatuses(lineStatuses);

    let readyCount = 0;
    let errorCount = 0;
    let cancelledCount = 0;

    const patchLine = (index: number, patch: Partial<BulkLineStatus>) => {
      if (!isBulk) return;
      setBulkLineStatuses((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], ...patch };
        return next;
      });
    };

    try {
      const CONCURRENCY = 5;
      let jobIndex = 0;

      const processWorker = async () => {
        while (jobIndex < jobsToProcess.length) {
          const i = jobIndex++;
          const job = jobsToProcess[i];

          if (stopBulkRef.current) {
            patchLine(i, { status: "skipped" });
            cancelledCount++;
            continue;
          }

          if (!isBulk) {
              clearProgressTimer();
              setProgress(0);
              setStage("queued");
          }
          patchLine(i, { status: "running", error: undefined });
          if (jobsToProcess.length > 1) {
            toast.info(`Processing clip ${i + 1}/${jobsToProcess.length}: ${job.start}–${job.end}`);
          }

          let currentId: string | null = null;
          try {
            const kickoff = await fetch("/api/clip", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                url,
                startTime: job.start,
                endTime: job.end,
                subtitles: addSubs,
                formatId: selectedFormat,
                codec: selectedCodec,
                userId: SESSION_USER.id,
              }),
            });

            if (!kickoff.ok) {
              const errorText = await kickoff.text();
              let errorMsg = "Failed to start processing";
              try {
                const errorJson = JSON.parse(errorText);
                errorMsg = errorJson.error || errorMsg;
              } catch {
                if (errorText.length > 0) errorMsg = errorText;
              }
              throw new Error(errorMsg);
            }

            const { id } = await kickoff.json();
            currentId = id;
            activeJobIdsRef.current.add(id);
            patchLine(i, { jobId: id });

            const waitAbort = new AbortController();
            waitAbortRefs.current.set(i, waitAbort);
            
            if (stopBulkRef.current) {
              await fetch(`/api/clip/${id}/cancel`, { method: "POST" }).catch(() => undefined);
              throw new JobCancelledError();
            }

            const ready = await waitForJob(id, (pData) => {
              if (!isBulk) onJobProgress(pData);
              patchLine(i, { progress: pData.progress, stage: pData.stage || undefined });
            }, { signal: waitAbort.signal });

            const safeTitle = (metadata.title || "clip").replace(/[\\/:"*?<>|]/g, "_");
            const filename = `${safeTitle} - ${job.start.replace(/:/g, ".")}-${job.end.replace(/:/g, ".")}.${ext}`;
            
            patchLine(i, { status: "ready", progress: 100 });
            readyCount++;

            if (!isBulk) {
              await triggerDownload(filename, ready.url, id);
            } else {
              setTimeout(() => {
                triggerDownload(filename, ready.url, id);
              }, i * 800);
            }

          } catch (err: unknown) {
            if (err instanceof JobCancelledError || stopBulkRef.current) {
              patchLine(i, { status: "cancelled", error: "Cancelled" });
              cancelledCount++;
              continue;
            }

            const raw = err instanceof Error ? err.message : "Failed to create clip";
            const friendly = raw.includes("ERROR:")
              ? raw.split("ERROR:").pop()!.trim().slice(0, 180)
              : raw.length > 220
                ? `${raw.slice(0, 200)}…`
                : raw;

            patchLine(i, { status: "error", error: friendly });
            errorCount++;
            toast.error(`${job.start}–${job.end}: ${friendly}`);

            if (!isBulk) throw err;
          } finally {
            if (currentId) activeJobIdsRef.current.delete(currentId);
            waitAbortRefs.current.delete(i);
          }
        }
      };

      const workers = Array.from({ length: Math.min(CONCURRENCY, jobsToProcess.length) }, processWorker);
      await Promise.all(workers);

      if (jobsToProcess.length === 1 && readyCount === 1 && !isBulk) {
        toast.success("Clip ready — download started");
      } else if (jobsToProcess.length > 1 || (isBulk && jobsToProcess.length === 1)) {
        toast.success(
          `Bulk done — ${readyCount} ready` +
            (errorCount ? `, ${errorCount} failed` : "") +
            (cancelledCount ? `, ${cancelledCount} cancelled` : "")
        );
      } else if (cancelledCount > 0 && readyCount === 0) {
        toast.message("Cancelled");
      }
    } catch (err: unknown) {
      if (!(err instanceof JobCancelledError)) {
        console.error(err);
        const raw = err instanceof Error ? err.message : "Failed to create clip";
        const friendly = raw.includes("ERROR:")
          ? raw.split("ERROR:").pop()!.trim().slice(0, 180)
          : raw.length > 220
            ? `${raw.slice(0, 200)}…`
            : raw;
        toast.error(friendly);
      } else {
        toast.message("Cancelled");
      }
    } finally {
      clearProgressTimer();
      setLoading(false);
      setProgress(0);
      setStage("");
      activeJobIdsRef.current.clear();
      waitAbortRefs.current.clear();
      stopBulkRef.current = false;
    }
  };

  const handleDownloadBulkClip = (index: number) => {
    const item = bulkLineStatuses[index];
    if (!item || !item.jobId) return;
    const safeTitle = (metadata.title || "clip").replace(/[\\/:"*?<>|]/g, "_");
    const ext = selectedCodec === "vp9" ? "webm" : "mp4";
    const filename = `${safeTitle} - ${item.start.replace(/:/g, ".")}-${item.end.replace(/:/g, ".")}.${ext}`;
    triggerDownload(filename, null, item.jobId);
  };

  const handleCancelBulkClip = async (index: number) => {
    waitAbortRefs.current.get(index)?.abort();
    const item = bulkLineStatuses[index];
    if (item && item.jobId) {
      await fetch(`/api/clip/${item.jobId}/cancel`, { method: "POST" }).catch(() => undefined);
      setBulkLineStatuses((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], status: "cancelled", error: "Cancelled" };
        return next;
      });
    }
  };

  return (
    <main className="relative flex min-h-screen w-full flex-col">
      <PingBackend active={loading} />

      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="group flex items-baseline gap-2">
            <motion.span
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="font-display text-2xl font-semibold tracking-tight text-foreground"
            >
              Clippa
            </motion.span>
            <span className="hidden text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground sm:inline">
              studio
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <CookieHealthChip />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-8 px-4 py-10 sm:px-6 sm:py-14">
        <section className="mx-auto flex w-full max-w-xl flex-col gap-6">
          <VideoPreview
            isLoading={isMetadataLoading}
            title={metadata.title}
            url={url}
            startTime={startTime}
            endTime={endTime}
            storyboards={storyboards}
            onSetStartTime={setStartTime}
            onSetEndTime={setEndTime}
          />
          <ClipForm
            url={url} setUrl={setUrl}
            startTime={startTime} setStartTime={setStartTime}
            endTime={endTime} setEndTime={setEndTime}
            addSubs={addSubs} setAddSubs={setAddSubs}
            loading={loading} handleSubmit={handleSubmit} onCancel={handleCancel}
            formats={formats} selectedFormat={selectedFormat} setSelectedFormat={setSelectedFormat}
            selectedCodec={selectedCodec} setSelectedCodec={handleCodecChange} availableCodecs={availableCodecs}
            isBulk={isBulk} setIsBulk={setIsBulk} bulkTimestamps={bulkTimestamps} setBulkTimestamps={setBulkTimestamps}
            bulkLineStatuses={bulkLineStatuses}
            onCancelBulkClip={handleCancelBulkClip}
            onDownloadBulkClip={handleDownloadBulkClip}
            cookieWarning={cookieWarning}
            progress={progress}
            stage={stage || undefined}
          />
        </section>
      </div>

      <footer className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 pb-8 text-xs text-muted-foreground sm:px-6">
        <p>Precise YouTube clips. No ads.</p>
        <nav className="flex gap-4">
          <Link href="/privacy" className="transition-colors hover:text-foreground">Privacy</Link>
          <Link href="/terms" className="transition-colors hover:text-foreground">Terms</Link>
        </nav>
      </footer>
    </main>
  );
}
