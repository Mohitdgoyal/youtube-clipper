# Four Feature Enhancement Plan (`improvement.md`)

*Audited & Senior-Engineer Refined 2026-07-28*

## Overview

Four major enhancements to the YouTube Clipper app:
1. **Drag-to-Select Timeline** — Custom timeline component replacing Radix dual-thumb slider with click-and-drag range selection, WAI-ARIA 1.2 keyboard controls on individual handles, and `touch-action: none` mobile support.
2. **Frame-by-Frame Thumbnail Preview (Storyboards)** — Hover-activated thumbnail tooltip using YouTube's `storyboards` sprite sheets with multi-sheet `sheetIndex` calculation, robust query param regex, and clamped hover tooltip bounds.
3. **Bulk Clip Queue Dashboard** — Rich per-clip progress cards, stage indicators, file size estimates, parallel job queueing, and manual/staggered file downloads.
4. **VP9/AV1 Codec Support** — Pipeline support for VP9 (WebM) and AV1 (MP4), with dynamic audio encoder selection (`libopus -ar 48000` for WebM, `aac` for MP4), forced `-pix_fmt yuv420p` for browser HTML5 video playback, conditional `-movflags +faststart` (MP4 only), dynamic FFmpeg encoder probing, auto-migration for SQLite `codec` column, and dynamic disk file cleanups.

---

## Technical Audits & Senior Engineering Refinements

During two rounds of deep architectural and systems code review, **16 critical technical issues** were identified and resolved:

### Critical Pipeline & Media Fixes
1. **FFmpeg VP9 Pixel Format (`-pix_fmt yuv420p`)**: `libvpx-vp9` without `-pix_fmt yuv420p` outputs YUV444P which fails HTML5 video playback in Chrome, Edge, Firefox, and Safari. Now explicitly forced to `yuv420p`.
2. **WebM Opus Audio Resampling (`-ar 48000`)**: WebM Opus audio requires 48 kHz sampling. Added `-ar 48000` to prevent FFmpeg errors or audio pitch distortion on 44.1 kHz YouTube source audio.
3. **WebM Stream Copy Pass Audio Mismatch**: When `subtitles` is false, FFmpeg stream-copies audio. Muxing source AAC audio into WebM fails in FFmpeg. When `container === 'webm'`, audio is now explicitly re-encoded to Opus even during video stream-copy passes.
4. **FFmpeg WebM `-movflags +faststart` Crash**: `-movflags +faststart` is an MP4-only flag and causes fatal errors on `.webm` outputs. Now conditionally applied ONLY when `container === 'mp4'`.
5. **yt-dlp JSON Schema**: yt-dlp returns `storyboards` (plural array/object), not `storyboard`. Corrected schema extraction in `metadata.service.ts`.
6. **FFmpeg Encoder Probing**: Included `-pix_fmt yuv420p` in `probeEncoder()` for SVT-AV1 and VP9 with automatic fallback to H.264 if host FFmpeg lacks SVT-AV1 / VP9 libraries.
7. **Dynamic File Extensions**: Replaced hardcoded `.mp4` paths in `editor.tsx` and `job.routes.ts` with dynamic extensions based on job codec (`.webm` vs `.mp4`).
8. **SQLite Column Migration**: Added inline startup migration (`ALTER TABLE jobs ADD COLUMN codec TEXT DEFAULT 'h264'`) & updated `INSERT INTO jobs` in `db.service.ts`.
9. **Dynamic Disk Cleanup**: Updated cleanup routines in `video.service.ts` and `job.routes.ts` to unlinks `.webm` temp files dynamically.

### Frontend UI & Accessibility Fixes
10. **WAI-ARIA 1.2 Dual-Thumb Slider**: Moved `role="slider"`, `tabIndex={0}`, `aria-valuenow`, and keyboard listeners directly onto start/end handle `div`s with `aria-label="Start time"` and `aria-label="End time"`.
11. **Storyboard Regex & Query Params**: Multi-sheet replacement regex updated to `/(M)\d+(\.\w+)/i` and `$N` / `%d` template matching to preserve query params (`?sqp=...`).
12. **Tooltip Bounds Clamping**: Clamped popover horizontal position `safeX = Math.max(72, Math.min(trackWidth - 72, x))` so tooltip never overflows container bounds.
13. **Format Picker Auto-Reset**: Switching `selectedCodec` automatically resets `selectedFormat` to `""` ("Best available") to avoid stale itag/format mismatch errors.

---

## Feature 1: Drag-to-Select on Timeline

### Proposed Changes

#### [NEW] `frontend/components/editor/DragTimeline.tsx`

Custom timeline component replacing `TimelineSlider.tsx`:
- Click on empty track: sets initial point, enters range drag mode (clamping start backward if near track end to guarantee minimum 1.0s clip)
- Drag handle: adjusts start or end boundary
- Sets `touchAction: "none"` and uses pointer capture (`setPointerCapture`) for mobile support
- WAI-ARIA 1.2 keyboard control (`ArrowLeft`, `ArrowRight`, `Shift+Arrow`) directly on thumb handle elements

#### [MODIFY] `frontend/components/editor/VideoPreview.tsx`

Replace `<TimelineSlider>` import with `<DragTimeline>`.

---

## Feature 2: Frame-by-Frame Thumbnail Preview (Storyboards)

### Proposed Changes

#### [MODIFY] `backend/src/types/ytdlp.ts` & `backend/src/routes/format.routes.ts`

Extract `info.storyboards` (plural) from yt-dlp `-j` JSON and pass through `/api/video` response.

#### [NEW] `frontend/components/editor/ThumbnailStrip.tsx`

Floating preview tooltip following cursor:
- Computes `hoverTime = (cursorX / trackWidth) * duration`
- Calculates `thumbIndex`, `sheetIndex` (`M0.jpg`, `M1.jpg`), `col`, and `row`
- Updates `background-image` URL dynamically with query param preservation
- Clamps popover X coordinate `safeX` so tooltip never overflows container bounds
- Renders timestamp formatted as `HH:MM:SS` in a frosted glass tooltip

#### [MODIFY] `frontend/components/editor/DragTimeline.tsx` & `VideoPreview.tsx`

Integrate `<ThumbnailStrip>` behind slider track and attach cursor move handlers.

---

## Feature 3: Bulk Clip Queue Dashboard

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

Dashboard card list component with individual progress bars, stage tags (downloading/encoding/uploading), retry buttons, aggregate progress bar, and individual "Save Clip" file download actions.

#### [MODIFY] `frontend/app/(app)/editor/editor.tsx`

Submit all bulk jobs in parallel to backend queue, tracking individual progress and providing per-item file downloads.

---

## Feature 4: VP9/AV1 Codec Support

### Proposed Changes

#### [NEW] `backend/src/utils/codec-config.ts`

Centralized codec configuration map defining container (`mp4`/`webm`), MIME types, yt-dlp format filters, FFmpeg video encoders (`libx264`, `libvpx-vp9`, `libsvtav1`), video args (`-pix_fmt yuv420p`), and audio encoders (`aac` for MP4, `libopus -ar 48000` for WebM).

#### [MODIFY] `backend/src/utils/ffmpeg-encoder.ts`

- Add `getCodecEncoder(codecId)` with dynamic `probeEncoder()` checks for `libsvtav1` / `libvpx-vp9`.
- Include `-pix_fmt yuv420p` in probe encodes.
- Fall back gracefully to `libx264` if requested encoder is unavailable on system FFmpeg build.

#### [MODIFY] `backend/src/services/video.service.ts`

- Generate output filename with matching extension (`.mp4` or `.webm`).
- Conditionally apply `-movflags +faststart` ONLY when `container === "mp4"`.
- Force `libopus -b:a 128k -ar 48000` audio encoding when outputting to WebM containers (even during video stream-copy passes).

#### [MODIFY] `backend/src/routes/job.routes.ts` & `backend/src/services/db.service.ts`

- Perform inline startup migration (`ALTER TABLE jobs ADD COLUMN codec TEXT DEFAULT 'h264'`).
- Dynamically unlink `.webm` or `.mp4` temp files during cleanup.
- Look up output file dynamically by job ID and codec in `GET /api/jobs/:id/download`.
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
1. **DragTimeline**: Click-and-drag range creation, handle keyboard controls, touch interaction.
2. **Thumbnails**: Hover over timeline, verify thumbnail tooltip appears with correct frame and multi-sheet image loading.
3. **Bulk Queue**: Submit 5 clips simultaneously, verify parallel job processing and per-item file downloads.
4. **VP9 & AV1 Exports**: Export clips in WebM (VP9) and MP4 (AV1/H264), verify FFmpeg succeeds without `-movflags` crashes, verify audio playback, and verify browser HTML5 video playback compatibility (`yuv420p`).
