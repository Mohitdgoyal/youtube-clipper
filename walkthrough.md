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

Optional YouTube cookies (backend):
- `backend/cookies.txt`, or
- `COOKIES_FROM_BROWSER=chrome` (close the browser first on Windows)

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
- Quality default is **Best available** (safest for `--download-sections`).
- Aria2 is opt-in via `USE_ARIA2C=1`.
- Railway start uses Bun (`bun dist/index.js`) with software x264 (`DISABLE_HW_ENCODE=1`).
