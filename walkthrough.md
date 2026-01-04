# Project Operations Guide

## Requirements
- **Runtime**: [Bun](https://bun.sh/) (Backend), [Node.js](https://nodejs.org/) (Frontend)
- **Downloader**: `aria2c` (Optional but recommended for speed) - Place in `backend/bin/`

---

## 🚀 Development

### Start Backend
```powershell
cd backend
bun run dev
```
*Runs on [http://localhost:3001](http://localhost:3001)*

### Start Frontend
```powershell
cd frontend
npm run dev
```
*Runs on [http://localhost:3000](http://localhost:3000)*

---

## 🔄 Restarting / Killing Servers

If a port is already in use or you need a clean restart:

### Kill Backend (Port 3001)
```powershell
Get-Process -Id (Get-NetTCPConnection -LocalPort 3001).OwningProcess -ErrorAction SilentlyContinue | Stop-Process -Force
```

### Kill Frontend (Port 3000)
```powershell
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess -ErrorAction SilentlyContinue | Stop-Process -Force
```

### Restart Both (One-liner)
```powershell
# Backend
cd backend; Get-Process -Id (Get-NetTCPConnection -LocalPort 3001).OwningProcess -ErrorAction SilentlyContinue | Stop-Process -Force; bun run dev

# Frontend
cd frontend; Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess -ErrorAction SilentlyContinue | Stop-Process -Force; npm run dev
```

---

## 🛠️ Other Commands

### Build Backend
```powershell
cd backend
bun run build
```

### Build Frontend
```powershell
cd frontend
npm run build
```

### Clean Uploads (Manual)
The backend automatically cleans files older than 24h on startup, but you can manually clear the folder:
```powershell
Remove-Item -Path .\backend\uploads\* -Force
```
