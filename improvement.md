# Codebase Performance & Optimization Plan (`improvement.md`)

Revised 2026-07-25 after dependency upgrade + full re-audit.

---

## Executive summary

Original Phase 1–3 items (WAL, progress throttle, job queue, SSE, signed downloads, GPU probe) are **done**. Remaining work focused on single-encode subtitle path, hop reduction, orphan cleanup, and hygiene — implemented in the same revision.

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

## Implemented in this revision (O1–O5 + soft gaps)

1. **Single-encode subtitles** — no `--force-keyframes-at-cuts` when burning subs
2. **SSE `url` direct download** — skips Next status hop when signed URL present
3. **Combined `/api/video`** + backend in-flight yt-dlp dedupe
4. **Orphan `clip-*` cleanup** on failure + hourly sweep
5. **`trust proxy`**, `--no-playlist`, reject `list=` URLs
6. **Progress publish without SELECT**, SQLite `busy_timeout` + index, binary memo, no-sub rename skip
7. **Railway**: `DISABLE_HW_ENCODE`, `libx264`/`veryfast`, `bun run start`
8. **Frontend**: memo `VideoPreview`, throttled progress, CSS gradient, poll-first, one poster timeline, dead UI prune, server `page.tsx`
9. **Drizzle** `db:migrate` script; baseline + drop auth-era tables; gitignore local `*.db*`
10. **Extension** options page for app base URL; narrower MutationObserver target
11. **Subtitle precise cut** — pad yt-dlp section, one FFmpeg pass with `-ss`/`-t` + burn-in
12. **Schema trim** — removed unused `session` / `account` / `verification` / `clips`

---

## Explicitly deferred

- VP9/AV1 as default (keep H.264 transmux path)
- Multi-instance SSE bus
- Aggressive aria2 on Railway without measurement

---

## Verify

```sh
cd backend && bun run build
cd ../frontend && bun run lint && bun run build
# with both servers up:
FRONTEND_URL=http://localhost:3000 bun run smoke:clip
```
