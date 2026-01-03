"use client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";
import VideoPreview from "@/components/editor/VideoPreview";
import ClipForm from "@/components/editor/ClipForm";
import DownloadStatus from "@/components/editor/DownloadStatus";

export default function Editor() {
  const [url, setUrl] = useState("");
  const [startTime, setStartTime] = useState("00:00:00");
  const [endTime, setEndTime] = useState("00:00:00");
  const [addSubs, setAddSubs] = useState(false);
  const [loading, setLoading] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<{ title?: string }>({});
  const [cropRatio, setCropRatio] = useState<"original" | "vertical" | "square">("original");
  const [formats, setFormats] = useState<{ format_id: string, label: string }[]>([]);
  const [selectedFormat, setSelectedFormat] = useState<string>('');
  const [isMetadataLoading, setIsMetadataLoading] = useState(false);
  const sessionUser = { id: "personal-user", name: "Personal User" };
  const [downloadCount, setDownloadCount] = useState(0);

  const getVideoId = (url: string) => {
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = url.match(regExp);
    return match && match[7].length === 11 ? match[7] : null;
  };

  const fetchVideoMetadata = async (videoId: string) => {
    setIsMetadataLoading(true);
    try {
      const vUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const [metaRes, formatsRes] = await Promise.all([
        fetch(`/api/metadata?url=${encodeURIComponent(vUrl)}`),
        fetch(`/api/formats?url=${encodeURIComponent(vUrl)}`)
      ]);

      if (metaRes.ok) {
        const meta = await metaRes.json();
        setMetadata({ title: meta.title });
        setThumbnailUrl(meta.image || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`);
      }
      if (formatsRes.ok) {
        const fData = await formatsRes.json();
        setFormats(fData.formats || []);
        if (fData.formats?.length > 0) setSelectedFormat(fData.formats[0].format_id);
      }
    } catch (error) {
      console.error("Error fetching metadata:", error);
      setThumbnailUrl(`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`);
    } finally {
      setIsMetadataLoading(false);
    }
  };

  useEffect(() => {
    const videoId = getVideoId(url);
    if (videoId) {
      setThumbnailUrl("loading");
      fetchVideoMetadata(videoId);
    } else {
      setThumbnailUrl(null);
      setMetadata({});
      setFormats([]);
      setSelectedFormat('');
    }
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
    if (sessionUser.id) fetchDownloadCount();
  }, [sessionUser.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const kickoff = await fetch("/api/clip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, startTime, endTime, cropRatio, subtitles: addSubs, formatId: selectedFormat, userId: sessionUser.id }),
      });

      if (!kickoff.ok) throw new Error((await kickoff.json()).error || "Failed to start processing");
      const { id } = await kickoff.json();

      let status = "processing";
      while (status === "processing") {
        await new Promise((r) => setTimeout(r, 3000));
        const poll = await fetch(`/api/clip/${id}`);
        const pollJson = await poll.json();
        status = pollJson.status;
        if (status === "error") throw new Error(pollJson.error || "Processing failed");
      }

      const downloadRes = await fetch(`/api/clip/${id}/download`);
      if (!downloadRes.ok) throw new Error("Failed to download clip");

      const blob = await downloadRes.blob();
      const dUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = dUrl;
      a.download = "clip.mp4";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(dUrl);
      a.remove();

      await fetch("/api/user/download-count", { method: "POST" });
      setDownloadCount(prev => prev + 1);
      toast.success("Banger clipped successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to process clip");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex flex-col w-full h-full min-h-screen p-4 gap-4 max-w-3xl mx-auto items-center justify-center">
      <nav className="flex flex-col w-full gap-4 fixed top-0 left-0 right-0 z-20">
        <div className="flex justify-between items-start p-4">
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="font-medium rounded-full border py-2 bg-card px-4">
            👋 Welcome back!
          </motion.div>
        </div>
      </nav>

      <section className="flex flex-col w-full gap-4 max-w-xl mx-auto">
        <VideoPreview isLoading={isMetadataLoading} thumbnailUrl={thumbnailUrl} title={metadata.title} />
        <ClipForm
          url={url} setUrl={setUrl}
          startTime={startTime} setStartTime={setStartTime}
          endTime={endTime} setEndTime={setEndTime}
          addSubs={addSubs} setAddSubs={setAddSubs}
          loading={loading} handleSubmit={handleSubmit}
          cropRatio={cropRatio} setCropRatio={setCropRatio}
          formats={formats} selectedFormat={selectedFormat} setSelectedFormat={setSelectedFormat}
        />
        <DownloadStatus count={downloadCount} />
      </section>
    </main>
  );
}
