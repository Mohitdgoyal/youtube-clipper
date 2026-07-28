# Microscopic Repository Code Audit (Revised)

**Date:** 2026-07-28
**Scope:** Full Repository (Frontend, Backend, Extension, Dependencies)
**Orchestration:** 10+ Parallel Sub-Agents (Plus 2 Review Agents)

This document consolidates the findings of a deep, microscopic code audit across the entire `youtube-clipper` repository, refined after a secondary meta-audit for architectural accuracy.

---

## 1. Critical Hidden Bugs & Cascading Failures

> [!CAUTION]
> **Severe Memory Bomb & Redirect Auth Risk (`frontend/app/(app)/editor/editor.tsx`)**
> If a user downloads a clip via the frontend, the `triggerDownload` function attempts to fetch the *entire video* into memory as a `Blob` before creating an Object URL. For 1080p clips or long videos, this silently consumes gigabytes of RAM, causing tab crashes or Out-Of-Memory errors.
> *Fix*: Replace the blob fetch with a native 307 redirect using `Content-Disposition: attachment`. 
> *Warning*: If the endpoint requires an `Authorization` header, the redirect will fail since browsers don't send headers on native navigation. Authentication must rely on cookies for this fix to work.

> [!CAUTION]
> **Path Traversal Vulnerability in Download Endpoint (`backend/src/routes/job.routes.ts`)**
> The `GET /api/clip/:id/download` route checks `fs.existsSync(job.storage_path)` resolving against the CWD instead of `UPLOADS_DIR`, leading to a 404. Simply joining `UPLOADS_DIR` with `job.storage_path` introduces a severe **Path Traversal Vulnerability** (e.g., `../../../etc/passwd`).
> *Fix*: Sanitize the input by extracting the filename using `path.basename(job.storage_path)` before joining it with `UPLOADS_DIR`. (Also ensure the save path isn't similarly flawed).

> [!CAUTION]
> **Regex ReDoS Security Vulnerability (`frontend/lib/utils.ts`)**
> The `getVideoId` regex uses `^.*((youtu.be\/)...)`. The leading `^.*` forces catastrophic backtracking on invalid strings. If used on the backend for validation, this is a Denial of Service (DoS) vulnerability.
> *Fix*: Remove `^.*` and let the engine search for the substring natively.

> [!WARNING]
> **Self-Inflicted DDoS via Infinite Polling (`job-events.ts` & `video.service.ts`)**
> If a backend job crashes silently (e.g. due to the FFmpeg Time Format Crash below), the job never reaches a terminal state. Because `pollForJob` relies on an infinite `for (;;)` loop without a maximum timeout, the frontend will permanently spam the backend status endpoint, overwhelming the server.

> [!WARNING]
> **VP9/AV1 FFmpeg Fallback Container Crash (`backend/src/utils/ffmpeg-encoder.ts`)**
> If the system probe for VP9/AV1 fails, `getCodecEncoder()` falls back to an **H.264** configuration. However, the rest of the pipeline still assumes a `.webm` container. FFmpeg crashes fatally when attempting to multiplex H.264 video into a WebM container.
> *Fix*: Dynamically couple the codec and container; if falling back to `libx264`, swap the container to `.mp4` or `.mkv`.

---

## 2. Severe Functional Flaws

> [!WARNING]
> **A/V Desync & Frozen Frames (`video.service.ts`)**
> `needsPreciseCut` adds a 2-second padding during yt-dlp download. However, if `burnSubs` is false, it falls back to `-c:v copy`. FFmpeg cannot perform frame-accurate cuts without transcoding; it snaps the video to the nearest keyframe while cutting the audio precisely, causing severe A/V desync or a frozen video frame.

> [!WARNING]
> **FFmpeg Time Format Crash (`frontend/lib/utils.ts`)**
> When `seconds` is `59.999`, `.toFixed(3)` rounds it to `"60.000"`. However, minutes are calculated using `Math.floor`, leading to `"00:00:60.000"`. If this malformed timestamp is passed to FFmpeg as `-ss` or `-to`, FFmpeg will crash.

> [!WARNING]
> **String Concatenation in `downloadCount` (`frontend/lib/schema.ts`)**
> The `user` table defines `downloadCount` as `text`. If incremented via `count + 1` without casting, it performs string concatenation (1 + 1 = 11). It must be an `integer`.

---

## 3. Performance Bottlenecks & Memory Leaks

> [!TIP]
> **YouTube API Flooding & Shadowbanning (`DragTimeline.tsx` & `VideoPreview.tsx`)**
> Scrubbing the timeline handle triggers React re-renders and `seekTo(s)` on the YouTube IFrame API up to 120 times per second. This causes UI lockups and risks Google shadowbanning the IP for API abuse.
> *Fix*: Throttle/debounce the `seekTo(s)` call (e.g. 150ms) to provide smooth live visual feedback without flooding the API.

> [!TIP]
> **File Descriptor Exhaustion (`backend/src/index.ts`)**
> The `cleanupTempUploads()` cron job sequentially reads files. Blindly using `Promise.all()` to speed it up will exhaust OS file descriptors (`EMFILE`). 
> *Fix*: Use `fs.promises.opendir()` to iterate via `Dirent` objects (which know their file type without `stat`), coupled with a concurrency limiter (`p-map` with concurrency of 10) for any required `mtime` checks.

> [!TIP]
> **Unbounded Cache Leak (`backend/src/services/cache.service.ts`)**
> `MemoryCache` uses a raw `Map` that grows without limits, risking an OOM crash.
> *Fix*: Replace the `Map` with an industry-standard LRU cache package (e.g. `lru-cache`) with strict `maxSize` and `ttl`.

> [!WARNING]
> **MutationObserver Leak & LocalStorage Collisions (`extension/content.js`)**
> The extension permanently leaks a `MutationObserver` on the YouTube SPA. Additionally, it carelessly modifies `window.localStorage` on the host page, risking overwriting YouTube's own internal keys and breaking the site.

---

## 4. Architecture & Dependency Smells

### A. Bun vs Node Identity Crisis
- **Fragmented Workspaces**: Frontend and backend are separated with disjoint `bun.lock` files but share the exact same `youtube-clipper.db` SQLite file. This prevents native schema/type sharing. A root `package.json` with `workspaces` is recommended.
- **Redundant Compilation**: The backend `dev` script runs `tsc` to compile TypeScript to disk before executing it with Node (`node dist/index.js`). Since Bun is installed, running `bun --watch src/index.ts` natively would be astronomically faster.

### B. Outdated Configurations
- **TypeScript Targets**: `frontend/tsconfig.json` targets `ES2017`. Next.js apps should target `ES2022` or `ESNext`. `backend/tsconfig.json` targets `CommonJS`, causing modern module interoperability headaches.

### C. Synchronous Database Boot Block
- **Database Migrations (`db.service.ts`)**: `db.prepare(...).all()` runs synchronously on boot for legacy data normalization. This should be extracted into a formal database migration script (`drizzle-kit`) or an asynchronous background task.

---

## 5. Dead Code & Minor React Anti-Patterns

*   **`TimelineSlider.tsx` & `core-ui/`**: Dead code, safe to delete.
*   **Streaming Logic in `/api/clip/[id]/route.ts`**: The branch checking `?download=1` is dead code.
*   **Unstable Keyboard Listeners (`VideoPreview.tsx`)**: The global `keydown` event listener includes `isPlaying` as a dependency, unbinding and rebinding constantly. 
*   **Accessibility (`progress.tsx`)**: The hand-rolled progress bar lacks ARIA attributes (`role="progressbar"`), rendering it invisible to screen readers.
*   **TOCTOU Race in Storage (`storage.service.ts`)**: `deleteFile` uses `fs.existsSync` before `fs.promises.unlink`. It's safer (EAFP pattern) to attempt the `unlink` directly and catch the `ENOENT` error.
