"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "motion/react";
import { toast } from "sonner";
import VideoPreview from "@/components/editor/VideoPreview";
import ClipForm from "@/components/editor/ClipForm";
import DownloadStatus from "@/components/editor/DownloadStatus";
import PingBackend from "@/components/ping-backend";
import { getVideoId, timeToSeconds } from "@/lib/utils";
import { waitForJob } from "@/lib/job-events";
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
  const [downloadCount, setDownloadCount] = useState(0);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const progressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
          setMetadata({ title: data.title });
          setFormats(data.formats || []);
          // Default Best available (backend: up to 1080p60 H.264). Picker uses height selectors, not raw itags.
          setSelectedFormat("");
        } else {
          toast.error("Could not load video info. Check the URL and try again.");
          setFormats([]);
          setSelectedFormat("");
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

  useEffect(() => {
    const fetchDownloadCount = async () => {
      try {
        const res = await fetch("/api/user/download-count");
        if (res.ok) {
          const data = await res.json();
          setDownloadCount(data.downloadCount);
        }
      } catch (error) {
        console.error("Error fetching download count:", error);
      }
    };
    fetchDownloadCount();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const jobsToProcess = isBulk
      ? bulkTimestamps.split('\n').filter(line => line.includes('-')).map(line => {
        const [start, end] = line.split('-').map(t => t.trim());
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

    setLoading(true);
    clearProgressTimer();
    setProgress(0);
    setStage("queued");

    try {
      for (const job of jobsToProcess) {
        clearProgressTimer();
        setProgress(0);
        setStage("queued");
        toast.info(`Processing clip: ${job.start} to ${job.end}`);

        const kickoff = await fetch("/api/clip", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url,
            startTime: job.start,
            endTime: job.end,
            subtitles: addSubs,
            formatId: selectedFormat,
            userId: SESSION_USER.id
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

        const kickoffJson = await kickoff.json();
        const { id } = kickoffJson;

        const ready = await waitForJob(id, onJobProgress);

        const safeTitle = (metadata.title || "clip").replace(/[\\/:"*?<>|]/g, "_");
        const filename = `${safeTitle} - ${job.start.replace(/:/g, '.')}-${job.end.replace(/:/g, '.')}.mp4`;
        await triggerDownload(filename, ready.url, id);

        await fetch("/api/user/download-count", { method: "POST" });
        setDownloadCount(prev => prev + 1);

        if (jobsToProcess.length > 1) {
          await new Promise((r) => setTimeout(r, 500));
        }
      }
      toast.success("Clip ready — download started");
    } catch (err: unknown) {
      console.error(err);
      const raw = err instanceof Error ? err.message : "Failed to create clip";
      // Prefer short actionable toasts (backend already sanitizes; strip leftover yt-dlp dumps)
      const friendly = raw.includes("ERROR:")
        ? raw.split("ERROR:").pop()!.trim().slice(0, 180)
        : raw.length > 220
          ? `${raw.slice(0, 200)}…`
          : raw;
      toast.error(friendly);
    } finally {
      clearProgressTimer();
      setLoading(false);
      setProgress(0);
      setStage("");
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
          <div className="flex items-center gap-1">
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
            loading={loading} handleSubmit={handleSubmit}
            formats={formats} selectedFormat={selectedFormat} setSelectedFormat={setSelectedFormat}
            isBulk={isBulk} setIsBulk={setIsBulk} bulkTimestamps={bulkTimestamps} setBulkTimestamps={setBulkTimestamps}
            progress={progress}
            stage={stage || undefined}
          />
          <DownloadStatus count={downloadCount} />
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
