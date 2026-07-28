# Four Feature Enhancement Plan

## Overview

Four major enhancements to the YouTube Clipper app, ordered by implementation dependency — each feature is independent but listed from least to most complex.

---

## User Review Required

> [!IMPORTANT]
> **VP9/AV1 changes the output file format** — clips will be `.webm` (VP9) or `.mp4` (AV1) instead of always `.mp4`. This affects any downstream workflows that expect MP4.

> [!WARNING]
> **VP9/AV1 encoding is significantly slower** than H.264 (3–10× depending on content). The plan uses `libsvtav1` for AV1 which is the fastest available, but still notably slower. Users should be warned in the UI.

> [!IMPORTANT]
> **Thumbnail strip** uses YouTube's storyboard sprites (built into yt-dlp metadata) — no server-side frame extraction needed. However, storyboard availability varies by video. The UI gracefully falls back to the current poster overlay when unavailable.

## Open Questions

> [!IMPORTANT]
> **VP9/AV1 — default behavior**: Should the codec selector default to H.264 (current behavior, maximum compatibility) or auto-detect the best available codec from the video? Recommending default-to-H.264 with a manual codec picker.

> [!IMPORTANT]
> **Bulk queue — parallel vs sequential**: Currently bulk clips process sequentially. Should we submit all jobs in parallel (up to `MAX_CONCURRENT_JOBS=4`) for speed, or keep sequential to preserve order? Recommending **parallel submission** since the backend queue already handles concurrency limiting.

> [!IMPORTANT]
> **Thumbnail strip — hover vs always-visible**: Should the thumbnail preview only appear on hover (like YouTube's scrubber), or be a persistent filmstrip behind the slider? Recommending **hover tooltip** (less visual noise, more interactive feel).

---

## Feature 1: Drag-to-Select on Timeline

### Summary
Replace the current Radix dual-thumb slider with a custom timeline component that supports click-and-drag region selection directly on the track. Users can click on an empty point on the timeline and drag to define a start→end range, in addition to the existing thumb-drag behavior.

### Proposed Changes

---

#### Frontend — Timeline Component

#### [NEW] `frontend/components/editor/DragTimeline.tsx`

A new custom timeline component that replaces `TimelineSlider.tsx`. Built with standard DOM events (pointerdown/move/up) instead of Radix slider for full drag control.

**Behavior:**
- **Click on empty track** → sets the start point, enter drag mode
- **Drag to the right** → extends the selection, sets end point on release
- **Drag existing start/end handles** → adjusts that boundary (same as current)
- **Click inside the selected range** → drag the entire range left/right
- **Visual feedback**: selected range highlighted with `bg-primary`, handles with grab cursors, drag ghost with opacity
- **Snap**: maintains 50ms step precision (`0.05s`) matching current behavior
- **Keyboard**: Arrow keys move the nearest handle ±1s (±50ms with Shift), same as current `TimeField` buttons

**Props** — same interface as `TimelineSlider` so it's a drop-in replacement:
```ts
interface DragTimelineProps {
    duration: number;
    startTime: string;
    endTime: string;
    onValueChange: (start: string, end: string) => void;
    className?: string;
    videoId?: string;
}
```

**Implementation approach:**
- A `<div>` track container with `onPointerDown` for drag initiation
- Two absolutely-positioned handle elements at `left: (startSec/duration) * 100%` and `left: (endSec/duration) * 100%`
- A highlighted range `<div>` between the handles
- `useRef` + `useCallback` for pointer event math (clientX → seconds conversion)
- `motion/react` for smooth handle transitions when values change externally (e.g., from TimeField buttons)
- Poster overlay preserved from current implementation

#### [MODIFY] `frontend/components/editor/VideoPreview.tsx`

- Replace `<TimelineSlider>` import with `<DragTimeline>`
- No prop changes needed (same interface)

#### [MODIFY] `frontend/components/editor/TimelineSlider.tsx`

- Keep file for backward compatibility but mark as deprecated with a comment
- Alternatively, delete entirely if no other consumers

---

## Feature 2: Frame-by-Frame Thumbnail Preview

### Summary
Add a hover-activated thumbnail tooltip on the timeline that shows a preview frame at the cursor position, using YouTube's storyboard sprites (embedded in yt-dlp metadata). Also render a low-opacity filmstrip behind the slider track for visual context.

### Proposed Changes

---

#### Backend — Storyboard Data Extraction

#### [MODIFY] `backend/src/types/ytdlp.ts`

Add storyboard type to the `YtDlpOutput` interface:
```ts
interface StoryboardFragment {
    url: string;
    width: number;    // sprite sheet total width
    height: number;   // sprite sheet total height
    cols: number;     // thumbnails per row
    rows: number;     // rows in the sheet
    count: number;    // total thumbnails in this fragment
}

interface YtDlpOutput {
    // ... existing fields ...
    storyboard?: StoryboardFragment[];
}
```

yt-dlp's `-j` JSON output includes a `storyboards` array with sprite sheet URLs, dimensions, and grid layouts. Each sprite sheet contains a grid of small thumbnails covering sequential time intervals.

#### [MODIFY] `backend/src/routes/format.routes.ts`

Pass storyboard data through the `/api/video` response:
```ts
return res.json({
    title: info.title,
    thumbnail: info.thumbnail,
    duration: info.duration,
    webpage_url: info.webpage_url,
    formats: buildFormatList(info),
    storyboard: info.storyboard || null,  // NEW
});
```

#### Frontend — Storyboard Proxy & Components

#### [MODIFY] `frontend/app/api/video/route.ts`

Pass `storyboard` through the frontend API proxy response.

#### [NEW] `frontend/components/editor/ThumbnailStrip.tsx`

Two sub-features:

**A) Background filmstrip** — a row of evenly-spaced thumbnail frames behind the slider track:
- Uses CSS `background-image` + `background-position` on sprite sheets
- Renders ~10-15 frames across the track width, each showing the frame at that time position
- Low opacity (0.25) so it doesn't overpower the slider UI
- Falls back to the current poster image if no storyboard data available

**B) Hover tooltip** — a floating preview that follows the cursor:
- On `mousemove` over the timeline track, calculate the hovered timestamp
- Show a tooltip above the cursor with:
  - The thumbnail frame from the nearest storyboard position (CSS sprite cropping)
  - The timestamp in `HH:MM:SS` format below the thumbnail
- Uses `position: absolute` + `transform: translateX()` clamped to track bounds
- Thumbnail size: ~160×90px (16:9 aspect)
- Smooth show/hide with `motion/react` opacity transition
- On `mouseleave`: hide tooltip

**Sprite sheet math:**
```
thumbnailIndex = Math.floor(hoverSeconds / (videoDuration / totalThumbnailCount))
sheetIndex = Math.floor(thumbnailIndex / (cols * rows))
localIndex = thumbnailIndex % (cols * rows)
col = localIndex % cols
row = Math.floor(localIndex / cols)
backgroundPosition = `-${col * thumbWidth}px -${row * thumbHeight}px`
```

#### [MODIFY] `frontend/components/editor/DragTimeline.tsx` (or TimelineSlider.tsx)

- Accept optional `storyboard` prop
- Render `<ThumbnailStrip>` as a layer behind the track
- Attach mouse event handlers for the hover tooltip

#### [MODIFY] `frontend/components/editor/VideoPreview.tsx`

- Accept and pass through `storyboard` data from parent

#### [MODIFY] `frontend/app/(app)/editor/editor.tsx`

- Store `storyboard` data in state from the `/api/video` response
- Pass to `<VideoPreview>` → `<DragTimeline>`

---

## Feature 3: Bulk Clip Queue Dashboard

### Summary
Replace the current minimal bulk status list with a rich queue dashboard that shows per-clip progress bars, stage indicators, file size estimates, and individual actions. Submit all bulk jobs in parallel (limited by backend concurrency) instead of sequentially.

### Proposed Changes

---

#### Frontend — Enhanced Bulk Status Types & State

#### [MODIFY] `frontend/components/editor/ClipForm.tsx`

Extend `BulkLineStatus` with per-clip progress tracking:
```ts
export type BulkLineStatus = {
    start: string;
    end: string;
    status: "pending" | "queued" | "running" | "ready" | "error" | "cancelled" | "skipped";
    error?: string;
    progress?: number;      // NEW: 0-100
    stage?: string;         // NEW: "queued" | "downloading" | "processing" | "uploading"
    jobId?: string;         // NEW: backend job ID for cancel
    estimatedSize?: string; // NEW: from ClipInfoBanner logic
    clipDuration?: number;  // NEW: seconds
};
```

#### [NEW] `frontend/components/editor/BulkQueueDashboard.tsx`

A dedicated dashboard component replacing the current `<ul>` list. Features:

**Layout — card grid or stacked list:**
```
┌─────────────────────────────────────────────────┐
│  Bulk Queue                        3/5 complete │
│  ━━━━━━━━━━━━━━━━━━━━━━━ 60% overall            │
├─────────────────────────────────────────────────┤
│  ┌─ 00:01:00–00:02:30 ─────────── ✓ Ready ────┐ │
│  │  ██████████████████████████████ 100%  12MB  │ │
│  └────────────────────────────────────────────┘ │
│  ┌─ 00:05:30–00:06:15 ─────────── ↻ Encoding ┐ │
│  │  ████████████████░░░░░░░░░░░░░  62%   ~8MB │ │
│  └────────────────────────────────────────────┘ │
│  ┌─ 00:10:00–00:11:00 ─────────── ⏳ Queued ──┐ │
│  │  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░   0%  ~15MB │ │
│  └────────────────────────────────────────────┘ │
│  ┌─ 00:15:00–00:15:30 ─────────── ✕ Error ────┐ │
│  │  Format unavailable (403)           [Retry] │ │
│  └────────────────────────────────────────────┘ │
│  ┌─ 00:20:00–00:21:00 ─────────── ○ Pending ──┐ │
│  │  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░   —   ~18MB │ │
│  └──────────────────────────────── [Cancel] ───┘ │
│                                                 │
│              [Cancel All Remaining]             │
└─────────────────────────────────────────────────┘
```

**Per-clip card features:**
- Time range label (`00:01:00–00:02:30`)
- Status badge with color coding and icon (pending=gray, queued=blue, running=primary, ready=green, error=red, cancelled=muted)
- Progress bar (using existing `<Progress>` component) — animated, shows percentage
- Stage label (downloading → encoding → uploading)
- Estimated file size (reusing the `ClipInfoBanner` bitrate logic)
- Clip duration
- Individual cancel button (for queued/running clips)
- Retry button (for failed clips)
- Animated transitions with `motion/react` `AnimatePresence` for status changes

**Overall summary bar at top:**
- Total progress: `3/5 complete`
- Aggregate progress bar
- Cancel all button
- ETA estimate for remaining clips

#### [MODIFY] `frontend/app/(app)/editor/editor.tsx`

**Parallel job submission** — the biggest behavioral change:

```ts
// BEFORE: sequential for loop
for (let i = 0; i < jobsToProcess.length; i++) { ... }

// AFTER: submit all jobs, track individually
const jobPromises = jobsToProcess.map((job, i) => 
    submitAndTrackJob(job, i)
);
await Promise.allSettled(jobPromises);
```

Each `submitAndTrackJob`:
1. `POST /api/clip` → get job ID
2. Store job ID in `bulkLineStatuses[i].jobId`
3. `waitForJob(id, (data) => patchLine(i, { progress: data.progress, stage: data.stage }))` — per-job progress callback updates that specific line
4. On success: `patchLine(i, { status: "ready" })` + trigger download
5. On error: `patchLine(i, { status: "error", error: ... })`

**Individual cancel**: call `POST /api/clip/{jobId}/cancel` for a specific clip.

**Retry**: re-submit a single failed clip via `POST /api/clip` with same parameters.

Remove the global `progress`/`stage` state — each clip tracks its own. The overall progress bar computes from the sum.

#### [MODIFY] `frontend/components/editor/ClipForm.tsx`

- Replace the `<ul>` bulk status list with `<BulkQueueDashboard>` component
- Pass enhanced `bulkLineStatuses` with progress/stage data
- Pass callbacks: `onCancelClip(index)`, `onRetryClip(index)`, `onCancelAll()`

---

## Feature 4: VP9/AV1 Codec Support

### Summary
Allow users to select VP9 or AV1 output codecs in addition to H.264. This requires changes across the entire pipeline: format picker UI → format selection strings → yt-dlp download → ffmpeg encoding → output file handling.

### Proposed Changes

---

#### Codec Configuration Type

#### [NEW] `backend/src/utils/codec-config.ts`

Centralized codec configuration:
```ts
export type CodecId = "h264" | "vp9" | "av1";

export interface CodecConfig {
    id: CodecId;
    label: string;
    container: string;        // "mp4" | "webm"
    mimeType: string;
    ytdlpVcodecFilter: string; // e.g., "avc1|h264", "vp9|vp09", "av01"
    ytdlpExtFilter: string;    // "mp4" | "webm"
    ytdlpAudioExt: string;     // "m4a" | "webm"
    ffmpegEncoder: string;     // "libx264" | "libvpx-vp9" | "libsvtav1"
    ffmpegArgs: string[];      // encoder-specific quality args
    hwEncoders?: string[];     // optional HW encoder names to probe
}

export const CODEC_CONFIGS: Record<CodecId, CodecConfig> = {
    h264: {
        id: "h264", label: "H.264 (MP4)",
        container: "mp4", mimeType: "video/mp4",
        ytdlpVcodecFilter: "avc1|h264",
        ytdlpExtFilter: "mp4", ytdlpAudioExt: "m4a",
        ffmpegEncoder: "libx264",
        ffmpegArgs: ["-preset", "veryfast", "-crf", "28"],
        hwEncoders: ["h264_nvenc", "h264_qsv", "h264_amf"],
    },
    vp9: {
        id: "vp9", label: "VP9 (WebM)",
        container: "webm", mimeType: "video/webm",
        ytdlpVcodecFilter: "vp9|vp09",
        ytdlpExtFilter: "webm", ytdlpAudioExt: "webm",
        ffmpegEncoder: "libvpx-vp9",
        ffmpegArgs: ["-crf", "30", "-b:v", "0", "-cpu-used", "4", "-row-mt", "1"],
    },
    av1: {
        id: "av1", label: "AV1 (MP4)",
        container: "mp4", mimeType: "video/mp4",
        ytdlpVcodecFilter: "av01",
        ytdlpExtFilter: "mp4", ytdlpAudioExt: "m4a",
        ffmpegEncoder: "libsvtav1",
        ffmpegArgs: ["-crf", "30", "-preset", "8"],  // preset 8 = fast
    },
};

export const DEFAULT_CODEC: CodecId = "h264";
```

---

#### Backend — Download Pipeline

#### [MODIFY] `backend/src/utils/yt-dlp-args.ts`

- `sectionFormatForHeight()` → accept optional `codec: CodecConfig` parameter
- Generate format strings using `codec.ytdlpVcodecFilter` and `codec.ytdlpExtFilter` instead of hardcoded `avc1`/`mp4`
- Example for VP9: `bv[ext=webm][vcodec^=vp9][height<=?1080]+ba[ext=webm]`
- Example for AV1: `bv[ext=mp4][vcodec^=av01][height<=?1080]+ba[ext=m4a]`
- `buildClipAttempts()` → accept codec config, thread through to format strings
- `SAFE_SECTION_FORMAT` / `FALLBACK_SECTION_FORMAT` → parameterize per codec
- Add fallback chain: requested codec → H.264 fallback (not all videos have VP9/AV1)

#### [MODIFY] `backend/src/utils/ffmpeg-encoder.ts`

- `getVideoEncoder()` → accept optional `codec: CodecConfig` parameter
- Add encoder probing for VP9 and AV1:
  - VP9: `libvpx-vp9` (software only, widely available)
  - AV1: `libsvtav1` (fast software) → `av1_nvenc` (NVIDIA Ada+) → `av1_qsv` (Intel Arc+)
- Cache encoders per-codec (not just a single global cache)
- New function: `buildEncoderArgs(codec: CodecConfig): string[]`

#### [MODIFY] `backend/src/services/video.service.ts`

- `downloadAndClip()`: use `codec.container` for `--merge-output-format` instead of hardcoded `mp4`
- Output filename: `clip-{id}.${codec.container}` (`.mp4` or `.webm`)
- `processWithFFmpeg()`: use codec-specific encoder and args from `CodecConfig`
- Subtitle burn-in: use codec-appropriate encoder (`libvpx-vp9` / `libsvtav1` instead of `libx264`)
- Audio codec: `aac` for MP4 container, `libopus -b:a 128k` for WebM container

#### [MODIFY] `backend/src/utils/format-list.ts`

- `buildFormatList()` → accept optional `codec: CodecId` parameter
- Filter formats by the requested codec's vcodec pattern instead of hardcoded `avc1`
- Return formats available for each codec, or flag which codecs are available

#### [MODIFY] `backend/src/routes/format.routes.ts`

- `/api/video` response: include available codecs and per-codec format lists:
  ```json
  {
      "formats": [...],
      "availableCodecs": ["h264", "vp9", "av1"],
      "formatsByCodec": {
          "h264": [...],
          "vp9": [...],
          "av1": [...]
      }
  }
  ```

#### [MODIFY] `backend/src/routes/job.routes.ts`

- Accept `codec` field in POST body (default: `"h264"`)
- Pass codec config to `downloadAndClip()` and `processWithFFmpeg()`
- Update output filename extensions based on codec
- Update MIME type for download response

#### [MODIFY] `backend/src/types/job.ts`

- Add `codec` field to `JobRow` type

---

#### Frontend — Codec Picker UI

#### [MODIFY] `frontend/components/editor/ClipForm.tsx`

Add a codec selector alongside the existing quality picker:
- Dropdown or segmented control with three options: **H.264** (default), **VP9**, **AV1**
- Show a small info tooltip explaining tradeoffs:
  - H.264: "Fastest, most compatible"
  - VP9: "Better quality, smaller files, slower encoding"
  - AV1: "Best quality, smallest files, slowest encoding"
- Gray out unavailable codecs based on `availableCodecs` from the API
- When codec changes, update the format list to show resolutions available for that codec

New props:
```ts
availableCodecs: string[];
selectedCodec: string;
setSelectedCodec: (codec: string) => void;
```

#### [MODIFY] `frontend/app/(app)/editor/editor.tsx`

- Add `selectedCodec` state (default: `"h264"`)
- Store `availableCodecs` and `formatsByCodec` from API response
- When codec selection changes, swap the displayed format list
- Pass `codec` in the `POST /api/clip` request body

#### [MODIFY] `frontend/app/api/video/route.ts`

- Pass through `availableCodecs` and `formatsByCodec` from backend response

#### [MODIFY] `frontend/app/api/clip/route.ts` (POST handler)

- Forward `codec` field to the backend `POST /api/jobs` request

#### [MODIFY] ClipInfoBanner (inside `frontend/components/editor/ClipForm.tsx`)

- Adjust estimated file size based on codec (VP9 ~30% smaller than H.264, AV1 ~50% smaller)
- Adjust estimated download/encoding time (VP9 ~3× slower, AV1 ~5× slower)
- Show a warning badge when VP9/AV1 is selected: "Encoding will take longer"

---

#### Database Migration

#### [NEW] `backend/drizzle/add-codec-column.sql`

```sql
ALTER TABLE jobs ADD COLUMN codec TEXT DEFAULT 'h264';
```

---

## Verification Plan

### Automated Tests

#### Feature 1 (Drag-to-Select)
```sh
cd frontend && bun run typecheck && bun run build
```
- Verify `DragTimeline` renders and the click-drag interaction works via manual browser testing
- Unit test: pointer position → seconds conversion math

#### Feature 2 (Thumbnail Strip)
```sh
cd backend && bun run typecheck && bun run build && bun run test
cd frontend && bun run typecheck && bun run build
```
- Verify storyboard data flows through API (backend route test)
- Unit test: sprite sheet index calculation

#### Feature 3 (Bulk Queue Dashboard)
```sh
cd frontend && bun run typecheck && bun run build && bun run test
```
- Test parallel job submission with mock API
- Verify per-clip progress state updates independently
- Test cancel/retry individual clips

#### Feature 4 (VP9/AV1)
```sh
cd backend && bun run typecheck && bun run build && bun run test
cd frontend && bun run typecheck && bun run build
```
- Backend: test format string generation for each codec
- Backend: test encoder probing with mock ffmpeg
- Integration: clip a short video with each codec option
- Verify output file extension and MIME type correctness

### Manual Verification

- **Drag-to-Select**: open editor in browser, click and drag on timeline to create selection, verify start/end times update, verify seeking works
- **Thumbnails**: hover over timeline, verify thumbnail tooltip appears with correct frame, verify filmstrip behind slider
- **Bulk Queue**: enter 5+ timestamps in bulk mode, submit, verify parallel processing with individual progress bars, test cancel/retry
- **VP9/AV1**: select each codec, clip a short segment, verify correct output format and playback
