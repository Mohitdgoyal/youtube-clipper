# Codebase Performance & Optimization Plan (`improvement.md`)

This document details the comprehensive audit results, architectural bottlenecks, and step-by-step optimization plan for the **YouTube Clipper** application.

---

## 📊 Executive Summary

While the project works well for single-clip generation, several critical bottlenecks currently cap its maximum performance:
1. **CPU-bound FFmpeg re-encoding** when subtitles are enabled.
2. **Synchronous, unthrottled SQLite updates** on every progress event.
3. **Lack of background job queuing**, causing resource contention when multiple clips are requested simultaneously.
4. **Multiple HTTP proxy hops** in Next.js before initiating file downloads.
5. **Polled HTTP requests** (`setInterval` / `setTimeout` loops) instead of real-time server events.

Implementing the optimizations below will result in **3x–5x faster clip generation** and significantly smoother UI feedback.

---

## 🛠 Detailed Optimization Modules

### Module 1: Video Downloading & FFmpeg Acceleration

#### 1.1 Hardware-Accelerated Video Encoding
* **Current State**: `video.service.ts` uses `libx264` (CPU-based software encoding).
* **Optimization**: Detect available GPU hardware acceleration (`nvenc` for NVIDIA, `qsv` for Intel, `amf` for AMD) and pass the appropriate codec to FFmpeg.
* **Fallback**: Fall back to `libx264` with `-preset ultrafast` only if hardware acceleration is unavailable.
* **Code Location**: `backend/src/services/video.service.ts`

#### 1.2 Optimized `yt-dlp` Download Arguments
* **Current State**: Uses `--force-keyframes-at-cuts` and a strict format filter restricting to H.264/AAC.
* **Optimization**:
  - Make keyframe forcing conditional (only when sub-second cut precision is required).
  - Streamline format selection to fetch optimal VP9/AV1 streams when available and transmux directly.
* **Code Location**: `backend/src/services/video.service.ts`

---

### Module 2: Database & File I/O Optimizations

#### 2.1 SQLite Write-Ahead Logging (WAL Mode)
* **Current State**: Standard rollback journal mode with default synchronous disk writes.
* **Optimization**: Enable WAL mode in SQLite connection initialization:
  ```typescript
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  ```
* **Impact**: Eliminates database lock contention between progress writes and frontend read queries.
* **Code Location**: `backend/src/services/db.service.ts`

#### 2.2 Progress Update Throttling
* **Current State**: `yt-dlp` and `ffmpeg` progress callbacks fire multiple times per second, triggering SQLite `UPDATE` queries on every tick.
* **Optimization**: Wrap progress updates in a 500ms throttle/debounce mechanism to reduce disk write cycles by up to 90%.
* **Code Location**: `backend/src/routes/job.routes.ts`

---

### Module 3: Queue & Concurrency Management

#### 3.1 Job Concurrency Queue
* **Current State**: Jobs execute immediately in detached async IIFEs (`(async () => { ... })()`).
* **Optimization**: Implement a task queue (using `p-queue` or a lightweight array queue) limited to 2–3 concurrent video processing tasks.
* **Impact**: Prevents CPU and network bandwidth saturation when multiple clips are generated at once.
* **Code Location**: `backend/src/routes/job.routes.ts`

---

### Module 4: Frontend & Network Performance

#### 4.1 Server-Sent Events (SSE) for Real-Time Status Updates
* **Current State**: Frontend editor polls `GET /api/clip/${id}` every 1000ms.
* **Optimization**: Implement an SSE endpoint (`/api/clip/${id}/events`) for pushing stage and progress updates instantly without client polling overhead.
* **Code Location**: `backend/src/routes/job.routes.ts`, `frontend/app/(auth)/editor/editor.tsx`

#### 4.2 Streamlined Direct Download Delivery
* **Current State**: Frontend calls `/api/clip/${id}`, then `/api/clip/${id}/url`, then issues a 302 redirect.
* **Optimization**: When job status transitions to `ready`, return the static `/uploads/clip-${id}.mp4` URL directly in the payload to initiate immediate download.
* **Code Location**: `frontend/app/api/clip/[id]/download/route.ts`

---

## 📈 Implementation Priority Matrix

| Phase | Task | Estimated Speedup / Benefit | Complexity |
| :--- | :--- | :--- | :--- |
| **Phase 1** | Enable SQLite WAL mode & throttle progress DB updates | 90% reduction in DB disk I/O | Low |
| **Phase 1** | Streamline download redirects & remove duplicate fetches | Instant download trigger | Low |
| **Phase 2** | Add Hardware Acceleration (`nvenc` / `qsv`) to FFmpeg | 3x–5x faster subtitle processing | Medium |
| **Phase 2** | Implement background Job Concurrency Queue (`p-queue`) | Prevents system slowdown on batch jobs | Medium |
| **Phase 3** | Replace HTTP polling in Frontend with SSE / Realtime push | Zero polling overhead, real-time UI updates | Medium |

---

*Plan generated on 2026-07-25.*
