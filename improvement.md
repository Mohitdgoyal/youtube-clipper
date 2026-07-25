# Codebase Performance & Optimization Plan (`improvement.md`)

Revised 2026-07-25 after post-audit fixes, YouTube download hardening, and UI refresh.

---

## Executive summary

Original Phase 0–4 optimizations and the O1–O5 revision are **done**. Post-rehaul audit fixes (SSE race, download UX, DB ms timestamps, dead routes, Node route tests) and YouTube 403 hardening (`yt-dlp-args`, `--js-runtimes node`) are **done** in the working tree.

---

## Status of original modules

| Module | Status |
|--------|--------|
| SQLite WAL + progress throttle | Done |
| Job concurrency queue | Done |
| SSE job updates | Done |
| Signed / single-hop downloads | Done |
| GPU encoder probe | Done (disabled on Railway static ffmpeg) |
| Conditional force-keyframes | Done (+ fixed: never with subtitle burn-in) |

---

## Implemented in O1–O5 revision

1. **Single-encode subtitles** — no `--force-keyframes-at-cuts` when burning subs
2. **SSE `url` direct download** — skips Next status hop when signed URL present
3. **Combined `/api/video`** + backend in-flight yt-dlp dedupe
4. **Orphan `clip-*` cleanup** on failure + hourly sweep
5. **`trust proxy`**, `--no-playlist`, reject `list=` URLs
6. **Progress publish without SELECT**, SQLite `busy_timeout` + index, binary memo, no-sub rename skip
7. **Railway**: `DISABLE_HW_ENCODE`, `libx264`/`veryfast`, Bun start + Node on PATH for yt-dlp
8. **Frontend**: memo `VideoPreview`, throttled progress, poll-first, one poster timeline
9. **Drizzle** `db:migrate` script; baseline + drop auth-era tables; gitignore local `*.db*`
10. **Extension** options page for app base URL; narrower MutationObserver target
11. **Subtitle precise cut** — pad yt-dlp section, one FFmpeg pass with `-ss`/`-t` + burn-in
12. **Schema trim** — removed unused `session` / `account` / `verification` / `clips`

---

## Post-audit fixes (2026-07-25)

| Area | Change |
|------|--------|
| SSE pipeline | `terminalJobs` set; await `progressChain` before terminal publish; ignore late progress |
| Download UX | Blob/object-URL download with same-origin proxy fallback; custom filename preserved |
| Editor guards | Reject `start >= end`; immediate `queued` stage; progress timer cleanup; video fetch toasts |
| DB | `jobs.created_at` as unix ms; one-shot legacy normalize; seed `personal@clippa.in` |
| Auth | Timing-safe Bearer compare |
| Metadata | 45s yt-dlp timeout (`YTDLP_METADATA_TIMEOUT_MS`) |
| FFmpeg | Abort listener hygiene on yt-dlp and burn-in paths |
| Dead routes | Removed `/api/info`, `/api/formats`, `/api/clip/:id/url`; frontend metadata/formats proxies |
| Route group | `(auth)` → `(app)` (personal-use, no auth UI) |
| Tests | Route integration tests run under **Node** (`node --import tsx --test`); unit tests stay on Bun |
| CI | GitHub Actions: backend build/typecheck/test + frontend lint/typecheck/test |

---

## YouTube download operations

Shared args live in `backend/src/utils/yt-dlp-args.ts`:

- **`--js-runtimes node`** — required for YouTube n-challenge / EJS solving (2026+)
- **`player_client=default,-android_sdkless`** — avoids DRM-prone `tv`-only and broken Android URLs
- **Referer** + optional **`cookies.txt`** or **`COOKIES_FROM_BROWSER`**
- **`USE_ARIA2C=1`** — opt-in only; default downloader is safer for section clips
- **Safe H.264 retry** on 403; ffmpeg `time=` progress for section downloads
- **Quality default**: “Best available” (not first itag)

### Local dev

- Backend: `bun run build && bun run start` → runs **`node dist/index.js`** (Bun crashes on `better-sqlite3` NAPI on Windows)
- Node.js ≥ 20 must be on PATH for yt-dlp

### Railway

- Install includes Node 20 under `/root/.local/node/bin` (for `--js-runtimes node`)
- Start: `bun dist/index.js`; software x264 via env in `railway.json`

---

## Explicitly deferred

- VP9/AV1 as default (keep H.264 transmux path)
- Multi-instance SSE bus
- Aggressive aria2 on Railway without measurement
- Per-job authorization (shared Bearer secret only)

---

## Verify

```sh
cd backend && bun install && bun run build && bun run typecheck && bun run test
cd ../frontend && bun run lint && bun run typecheck && bun run test && bun run build
# with both servers up:
cd frontend && FRONTEND_URL=http://localhost:3000 bun run smoke:clip
```

Route tests only (Node):

```sh
cd backend && bun run test:routes
```
