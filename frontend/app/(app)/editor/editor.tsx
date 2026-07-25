"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "motion/react";
import { toast } from "sonner";
import VideoPreview from "@/components/editor/VideoPreview";
import ClipForm, { type BulkLineStatus } from "@/components/editor/ClipForm";
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

  const [formats, setFormats] = useState<{ format_id: string, label: string }[]>([]);
  const [selectedFormat, setSelectedFormat] = useState<string>('');
  const [isMetadataLoading, setIsMetadataLoading] = useState(false);
  const [isBulk, setIsBulk] = useState(false);
  const [bulkTimestamps, setBulkTimestamps] = useState("");
  const [bulkLineStatuses, setBulkLineStatuses] = useState<BulkLineStatus[]>([]);
  const [cookieWarning, setCookieWarning] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const progressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeJobIdRef = useRef<string | null>(null);
  const stopBulkRef = useRef(false);
  const waitAbortRef = useRef<AbortController | null>(null);

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

  useEffect(() => {
    return () => clearProgressTimer();
  }, [clearProgressTimer]);

  useEffect(() => {
    const videoId = getVideoId(url);
    if (!videoId) {
      const reset = () => {
        setMetadata({});
        setFormats([]);
        setSelectedFormat('');
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
          setMetadata({ title: data.title });
          setFormats(nextFormats);
          // Default Best available (backend: up to 1080p60 H.264). Picker uses height selectors, not raw itags.
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
  }, [url]);

  const handleCancel = useCallback(async () => {
    const id = activeJobIdRef.current;
    if (!id) {
      stopBulkRef.current = true;
      waitAbortRef.current?.abort();
      toast.message("Cancelled");
      return;
    }

    try {
      const res = await fetch(`/api/clip/${id}/cancel`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        status?: string;
        alreadyFinished?: boolean;
        message?: string;
      };

      // Cancel raced a finish — keep waiting so download can proceed
      if (data.alreadyFinished && data.status === "ready") {
        toast.message(data.message || "Clip already finished — download should start.");
        return;
      }
      if (data.alreadyFinished && data.status === "error") {
        stopBulkRef.current = true;
        waitAbortRef.current?.abort();
        toast.error(data.message || "Job already failed — nothing to cancel.");
        return;
      }
      if (data.alreadyFinished && data.status === "cancelled") {
        stopBulkRef.current = true;
        waitAbortRef.current?.abort();
        toast.message(data.message || "Job was already cancelled.");
        return;
      }

      // Genuine cancel in progress
      stopBulkRef.current = true;
      waitAbortRef.current?.abort();
      toast.message(data.message || "Cancelling — stopping download…");
    } catch (err) {
      console.warn("Cancel request failed:", err);
      stopBulkRef.current = true;
      waitAbortRef.current?.abort();
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
      for (let i = 0; i < jobsToProcess.length; i++) {
        if (stopBulkRef.current) {
          for (let j = i; j < jobsToProcess.length; j++) {
            patchLine(j, { status: "skipped" });
            cancelledCount++;
          }
          break;
        }

        const job = jobsToProcess[i];
        clearProgressTimer();
        setProgress(0);
        setStage("queued");
        patchLine(i, { status: "running", error: undefined });
        if (jobsToProcess.length > 1) {
          toast.info(`Processing clip ${i + 1}/${jobsToProcess.length}: ${job.start}–${job.end}`);
        }

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
          activeJobIdRef.current = id;

          const waitAbort = new AbortController();
          waitAbortRef.current = waitAbort;
          if (stopBulkRef.current) {
            await fetch(`/api/clip/${id}/cancel`, { method: "POST" }).catch(() => undefined);
            throw new JobCancelledError();
          }

          const ready = await waitForJob(id, onJobProgress, { signal: waitAbort.signal });

          const safeTitle = (metadata.title || "clip").replace(/[\\/:"*?<>|]/g, "_");
          const filename = `${safeTitle} - ${job.start.replace(/:/g, ".")}-${job.end.replace(/:/g, ".")}.mp4`;
          await triggerDownload(filename, ready.url, id);

          patchLine(i, { status: "ready" });
          readyCount++;

          if (jobsToProcess.length > 1) {
            await new Promise((r) => setTimeout(r, 500));
          }
        } catch (err: unknown) {
          if (err instanceof JobCancelledError || stopBulkRef.current) {
            patchLine(i, { status: "cancelled", error: "Cancelled" });
            cancelledCount++;
            for (let j = i + 1; j < jobsToProcess.length; j++) {
              patchLine(j, { status: "skipped" });
              cancelledCount++;
            }
            break;
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

          // Single-clip: stop. Bulk: continue-on-error.
          if (!isBulk) throw err;
        } finally {
          activeJobIdRef.current = null;
          waitAbortRef.current = null;
        }
      }

      if (jobsToProcess.length === 1 && readyCount === 1) {
        toast.success("Clip ready — download started");
      } else if (jobsToProcess.length > 1) {
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
      activeJobIdRef.current = null;
      waitAbortRef.current = null;
      stopBulkRef.current = false;
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
            isBulk={isBulk} setIsBulk={setIsBulk} bulkTimestamps={bulkTimestamps} setBulkTimestamps={setBulkTimestamps}
            bulkLineStatuses={bulkLineStatuses}
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
