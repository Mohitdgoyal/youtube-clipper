# Project Operations Guide

## Requirements
- **Runtime**: [Bun](https://bun.sh/) (backend + frontend tooling), [Node.js](https://nodejs.org/) ≥ 20.19 (Next 16)
- **Tools**: `yt-dlp`, `ffmpeg`, and **Node.js on PATH** (yt-dlp uses `--js-runtimes node` for YouTube challenges)
- **Optional**: `aria2c` — only if you set `USE_ARIA2C=1` (can break YouTube section downloads; off by default)

---

## Development

### Start Backend
```powershell
cd backend
bun run build
bun run start
```
Runs on [http://localhost:3001](http://localhost:3001)

### Start Frontend
```powershell
cd frontend
bun run dev
```
Runs on [http://localhost:3000](http://localhost:3000)

### Env (frontend `.env`)
```
DATABASE_URL=file:../youtube-clipper.db
BACKEND_API_URL=http://localhost:3001
BACKEND_SECRET=dev-secret
```

### Optional: YouTube cookies (higher quality on gated videos)

**Method A — `backend/cookies.txt` (recommended)**

1. In Chrome, open [https://www.youtube.com](https://www.youtube.com) and sign in.
2. Install a cookie export extension that supports **Netscape** format, e.g.  
   [Get cookies.txt LOCALLY](https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc)  
   (or any equivalent that exports Netscape `cookies.txt`).
3. On youtube.com, use the extension → **Export** / **Export as cookies.txt**.
4. Save/rename the file to exactly:  
   `c:\Users\Mohit\Documents\GitHub\youtube-clipper\backend\cookies.txt`
5. Confirm the file starts with something like `# Netscape HTTP Cookie File` and contains `youtube.com` / `.youtube.com` lines.
6. Restart the backend:
   ```powershell
   cd c:\Users\Mohit\Documents\GitHub\youtube-clipper\backend
   bun run build
   $env:PORT='3001'; node dist/index.js
   ```
7. Hard-refresh the frontend, paste a video, and clip again.

**Method B — read cookies from Chrome (no file)**

1. Sign in to youtube.com in Chrome.
2. **Fully quit Chrome** (all windows; check Task Manager that `chrome.exe` is gone).
3. Start backend with:
   ```powershell
   cd c:\Users\Mohit\Documents\GitHub\youtube-clipper\backend
   bun run build
   $env:COOKIES_FROM_BROWSER='chrome'
   $env:PORT='3001'; node dist/index.js
   ```
4. You can reopen Chrome after the backend has started.

Do **not** commit `cookies.txt` (it is gitignored). Treat it like a password.

---

## Restarting / Killing Servers

### Kill Backend (Port 3001)
```powershell
Get-Process -Id (Get-NetTCPConnection -LocalPort 3001).OwningProcess -ErrorAction SilentlyContinue | Stop-Process -Force
```

### Kill Frontend (Port 3000)
```powershell
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess -ErrorAction SilentlyContinue | Stop-Process -Force
```

---

## Smoke test
With both servers up:
```powershell
cd frontend
$env:FRONTEND_URL='http://localhost:3000'; bun run smoke:clip
```

---

## Notes
- Clip download: **short clips (&lt;90s)** try quality clients first, then reliable web/progressive. **Longer clips (e.g. 4 min)** skip the quality probe and go straight to the reliable path.
- Expect ~**1× realtime** for long section downloads (a 4‑minute clip often takes ~4–8 minutes). Job timeout scales with length (up to 30 min).
- **Cancel** stops the in-flight yt-dlp/ffmpeg process (header Cancel while clipping).
- **Cookie chip** in the header shows cookies ok / missing / stale (`GET /api/health/cookies`).
- Bulk mode continues after a failed line; Cancel stops the current job and skips the rest.
- Some videos only expose **360p** without cookies. For 720p/1080p: `backend/cookies.txt` or `COOKIES_FROM_BROWSER=chrome`.
- Aria2 is opt-in via `USE_ARIA2C=1` (usually worse for sections).
- Railway start uses Bun (`bun dist/index.js`) with software x264 (`DISABLE_HW_ENCODE=1`).

### Railway: cookies for higher quality

`railway.json` sets `YTDLP_COOKIES=/data/cookies.txt`. To enable it:

1. Create a Railway **Volume** mounted at `/data` (persistent).
2. Upload your Netscape `cookies.txt` to `/data/cookies.txt` on that volume  
   (SCP/SSH, one-off release command, or bake via a private deploy step — **never** commit cookies to git).
3. Redeploy so the backend process sees the file.
4. Rotate/re-export cookies when YouTube quality drops again (sessions expire).

Local still uses `backend/cookies.txt` automatically when present.
