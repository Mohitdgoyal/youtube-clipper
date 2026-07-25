"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";

import { motion } from "motion/react";
import { toast } from "sonner";
import VideoPreview from "@/components/editor/VideoPreview";
import ClipForm from "@/components/editor/ClipForm";
import DownloadStatus from "@/components/editor/DownloadStatus";
import PingBackend from "@/components/ping-backend";
import { getVideoId } from "@/lib/utils";
import { waitForJob } from "@/lib/job-events";
import { ThemeToggle } from "@/components/ui/theme-toggle";

const SESSION_USER = { id: "personal-user", name: "Personal User" };

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

  const onJobProgress = useCallback((data: { stage?: string | null; progress?: number; status?: string }) => {
    setStage(data.stage || "processing");
    const next = Number(data.status === "ready" ? 100 : (data.progress || 0));
    if (progressTimer.current) clearTimeout(progressTimer.current);
    progressTimer.current = setTimeout(() => setProgress(next), 150);
  }, []);

  // Debounced combined video info fetch (400ms) with abort on URL change
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
          if (data.formats?.length > 0) setSelectedFormat(data.formats[0].format_id);
        }
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        console.error("Error fetching metadata:", error);
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
    setLoading(true);
    setProgress(0);

    const jobsToProcess = isBulk
      ? bulkTimestamps.split('\n').filter(line => line.includes('-')).map(line => {
        const [start, end] = line.split('-').map(t => t.trim());
        return { start, end };
      })
      : [{ start: startTime, end: endTime }];

    if (jobsToProcess.length === 0) {
      toast.error("No valid timestamps found");
      setLoading(false);
      return;
    }

    try {
      for (const job of jobsToProcess) {
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

        // Prefer signed URL from SSE/status (skips Next→backend status hop)
        const safeTitle = (metadata.title || "clip").replace(/[\\/:"*?<>|]/g, "_");
        const filename = `${safeTitle} - ${job.start.replace(/:/g, '.')}-${job.end.replace(/:/g, '.')}.mp4`;
        let downloadHref = `/api/clip/${id}/download?filename=${encodeURIComponent(filename)}`;
        if (ready.url) {
          try {
            const signed = new URL(ready.url);
            signed.searchParams.set("download", filename);
            downloadHref = signed.toString();
          } catch {
            // keep proxy fallback
          }
        }
        const anchor = document.createElement("a");
        anchor.href = downloadHref;
        anchor.download = filename;
        anchor.rel = "noopener";
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);

        await fetch("/api/user/download-count", { method: "POST" });
        setDownloadCount(prev => prev + 1);
        // File cleanup is scheduled server-side after signed URL TTL (avoids racing slow downloads)

        if (jobsToProcess.length > 1) {
          await new Promise((r) => setTimeout(r, 500));
        }
      }
      toast.success("All bangers clipped successfully!");
    } catch (err: unknown) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to clip banger");
    } finally {
      setLoading(false);
      setProgress(0);
    }
  };

  return (
    <main className="flex flex-col w-full h-full min-h-screen p-4 gap-4 max-w-3xl mx-auto items-center justify-center">
      <PingBackend active={loading} />
      <nav className="flex flex-col w-full gap-4 fixed top-0 left-0 right-0 z-20">
        <div className="flex justify-between items-center p-4">
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="font-medium rounded-full border py-2 bg-card px-4">
            👋 Welcome back!
          </motion.div>
          <ThemeToggle />
        </div>
      </nav>

      <section className="flex flex-col w-full gap-4 max-w-xl mx-auto">
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
          stage={stage}
        />
        <DownloadStatus count={downloadCount} />
      </section>
    </main>
  );
}
