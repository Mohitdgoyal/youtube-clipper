# Four Feature Enhancement Plan (`improvement.md`)

*Audited & Revised 2026-07-28*

## Overview

Four major enhancements to the YouTube Clipper app:
1. **Drag-to-Select Timeline** — Custom timeline component replacing Radix dual-thumb slider with click-and-drag range selection, handle adjustment, and `touch-action: none` mobile support.
2. **Frame-by-Frame Thumbnail Preview (Storyboards)** — Hover-activated thumbnail tooltip using YouTube's `storyboards` sprite sheets with multi-sheet `sheetIndex` calculation and aspect ratio preservation.
3. **Bulk Clip Queue Dashboard** — Rich per-clip progress cards, stage indicators, file size estimates, parallel job queueing, and staggered sequential file downloads (preventing browser download pop-up blocks).
4. **VP9/AV1 Codec Support** — Pipeline support for VP9 (WebM) and AV1 (MP4), with dynamic audio encoder selection (`libopus` for WebM, `aac` for MP4), conditional `-movflags +faststart` (MP4 only), dynamic FFmpeg encoder probing, auto-migration for SQLite `codec` column, and dynamic file download route extensions.

---

## Technical Audit & Critical Fixes Applied

During architectural audit, **9 critical flaws** were identified and corrected in this plan:

1. **FFmpeg WebM `-movflags +faststart` Crash**: `-movflags +faststart` is an MP4-only flag and causes fatal errors on `.webm` outputs. Now conditionally applied ONLY when `container === 'mp4'`.
2. **WebM Audio Codec Incompatibility**: WebM containers reject AAC audio. Audio encoder is now explicitly set to `libopus -b:a 128k` when `container === 'webm'`.
3. **yt-dlp JSON Schema**: yt-dlp returns `storyboards` (plural array/object), not `storyboard`. Corrected schema extraction in `metadata.service.ts`.
4. **FFmpeg Encoder Probing**: Added `probeEncoder()` for `libsvtav1` and `libvpx-vp9` with automatic fallback to H.264 if host FFmpeg lacks SVT-AV1 / VP9 libraries.
5. **Dynamic File Extensions**: Replaced hardcoded `.mp4` paths in `editor.tsx` and `job.routes.ts` with dynamic extensions based on job codec (`.webm` vs `.mp4`).
6. **SQLite Column Migration**: Added inline startup migration (`ALTER TABLE jobs ADD COLUMN codec TEXT DEFAULT 'h264'`) and updated `INSERT INTO jobs` in `db.service.ts`.
7. **Browser Bulk Download Blocking**: Staggered programmatic file downloads sequentially (800ms delay) to prevent modern browsers from blocking multiple file downloads as popups.
8. **Multi-Sheet Sprite Math**: Hover math dynamically updates both `sheetIndex` (`M0.jpg`, `M1.jpg`) and `background-position` in `ThumbnailStrip.tsx`.
9. **Format Picker Reset**: Switching `selectedCodec` automatically resets `selectedFormat` to `""` ("Best available") to avoid stale itag/format mismatch errors.

---

## Feature 1: Drag-to-Select on Timeline

### Summary
Replace Radix dual-thumb slider with a custom timeline component supporting click-and-drag region creation directly on the track, touch pointer capture (`touch-action: none`), keyboard accessibility, and 50ms snapping.

### Proposed Changes

#### [NEW] `frontend/components/editor/DragTimeline.tsx`

Custom timeline component replacing `TimelineSlider.tsx`:
- Click on empty track: sets initial point, enters range drag mode
- Drag right/left: extends selection, sets end/start point on release
- Drag handle: adjusts start or end boundary
- Maintains 50ms step precision (`0.05s`)
- Sets `touchAction: "none"` and uses pointer capture (`setPointerCapture`) for touch devices

#### [MODIFY] `frontend/components/editor/VideoPreview.tsx`

Replace `<TimelineSlider>` import with `<DragTimeline>`.

---

## Feature 2: Frame-by-Frame Thumbnail Preview (Storyboards)

### Summary
Hover-activated thumbnail preview tooltip using YouTube's `storyboards` sprite sheets.

### Proposed Changes

#### [MODIFY] `backend/src/types/ytdlp.ts` & `backend/src/routes/format.routes.ts`

Extract `info.storyboards` (plural) from yt-dlp `-j` JSON and pass through `/api/video` response.

#### [NEW] `frontend/components/editor/ThumbnailStrip.tsx`

Floating preview tooltip following the cursor:
- Computes `hoverTime = (cursorX / trackWidth) * duration`
- Calculates `thumbIndex`, `sheetIndex` (`M0.jpg`, `M1.jpg`), `col`, and `row`
- Updates `background-image` URL dynamically to `imgUrl.replace(/M\d+\.jpg/, \`M${sheetIndex}.jpg\`)`
- Renders timestamp formatted as `HH:MM:SS` in a frosted glass tooltip

#### [MODIFY] `frontend/components/editor/DragTimeline.tsx` & `VideoPreview.tsx`

Integrate `<ThumbnailStrip>` behind the slider track and attach cursor move handlers.

---

## Feature 3: Bulk Clip Queue Dashboard

### Summary
Rich queue dashboard with per-clip progress bars, stage indicators, file size estimates, individual retry/cancel controls, and staggered browser file downloads.

### Proposed Changes

#### [MODIFY] `frontend/components/editor/ClipForm.tsx`

Extend `BulkLineStatus` type:
```ts
export type BulkLineStatus = {
    start: string;
    end: string;
    status: "pending" | "queued" | "running" | "ready" | "error" | "cancelled" | "skipped";
    error?: string;
    progress?: number;
    stage?: string;
    jobId?: string;
    estimatedSize?: string;
    clipDuration?: number;
};
```

#### [NEW] `frontend/components/editor/BulkQueueDashboard.tsx`

Dashboard card list component with individual progress bars, stage tags (downloading/encoding/uploading), retry buttons, and aggregate progress bar.

#### [MODIFY] `frontend/app/(app)/editor/editor.tsx`

Submit all bulk jobs in parallel to the backend queue, then trigger file downloads sequentially with 800ms spacing to prevent browser popup download blocks.

---

## Feature 4: VP9/AV1 Codec Support

### Summary
Full pipeline support for VP9 (WebM) and AV1 (MP4).

### Proposed Changes

#### [NEW] `backend/src/utils/codec-config.ts`

Centralized codec configuration map defining container (`mp4`/`webm`), MIME types, yt-dlp format filters, FFmpeg video encoders (`libx264`, `libvpx-vp9`, `libsvtav1`), and audio encoders (`aac` for MP4, `libopus` for WebM).

#### [MODIFY] `backend/src/utils/ffmpeg-encoder.ts`

- Add `getCodecEncoder(codecId)` with dynamic `probeEncoder()` checks for `libsvtav1` / `libvpx-vp9`.
- Fall back gracefully to `libx264` if requested encoder is unavailable on system FFmpeg build.

#### [MODIFY] `backend/src/services/video.service.ts`

- Generate output filename with matching extension (`.mp4` or `.webm`).
- Conditionally apply `-movflags +faststart` ONLY when `container === "mp4"`.
- Use `libopus` audio encoding when outputting to WebM containers.

#### [MODIFY] `backend/src/routes/job.routes.ts` & `backend/src/services/db.service.ts`

- Perform inline startup migration (`ALTER TABLE jobs ADD COLUMN codec TEXT DEFAULT 'h264'`).
- Look up output file dynamically by job ID and codec in `GET /api/jobs/:id/download` (`clip-${id}.webm` or `clip-${id}.mp4`).
- Set matching `Content-Type` header (`video/webm` or `video/mp4`).

#### [MODIFY] `frontend/components/editor/ClipForm.tsx` & `editor.tsx`

- Add Codec Selector dropdown (H.264 default, VP9, AV1).
- Automatically reset `selectedFormat` to `""` ("Best available") when codec changes.
- Build dynamic download filename with `.webm` or `.mp4` extension in `editor.tsx`.

---

## Verification Plan

### Automated Tests
```sh
cd backend && bun run typecheck && bun run test:routes
cd frontend && bun run typecheck && bun run build
```

### Manual End-to-End Verification
1. **DragTimeline**: Click-and-drag range creation, boundary handle drag, touch interaction.
2. **Thumbnails**: Hover over timeline, verify thumbnail tooltip appears with correct frame and multi-sheet image loading.
3. **Bulk Queue**: Submit 5 clips simultaneously, verify parallel job processing and staggered clean file downloads.
4. **VP9 & AV1 Exports**: Export clips in WebM (VP9) and MP4 (AV1/H264), verify FFmpeg succeeds without `-movflags` crashes, and verify playability in browser/VLC.
