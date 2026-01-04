# Project Operations Guide

## Requirements
- **Runtime**: [Bun](https://bun.sh/) (Backend), [Node.js](https://nodejs.org/) (Frontend)
- **Downloader**: `aria2c` (Optional but recommended for speed) - Place in `backend/bin/`

---

## 🚀 Development

### Start Backend
**PowerShell:**
```powershell
cd backend
bun run dev
```
**CMD:**
```cmd
cd backend
bun run dev
```
*Runs on [http://localhost:3001](http://localhost:3001)*

### Start Frontend
**PowerShell:**
```powershell
cd frontend
npm run dev
```
**CMD:**
```cmd
cd frontend
npm run dev
```
*Runs on [http://localhost:3000](http://localhost:3000)*

---

## 🔄 Restarting / Killing Servers

### Kill Backend (Port 3001)
**PowerShell:**
```powershell
Get-Process -Id (Get-NetTCPConnection -LocalPort 3001).OwningProcess -ErrorAction SilentlyContinue | Stop-Process -Force
```
**CMD:**
```cmd
for /f "tokens=5" %a in ('netstat -aon ^| findstr :3001') do taskkill /f /pid %a
```

### Kill Frontend (Port 3000)
**PowerShell:**
```powershell
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess -ErrorAction SilentlyContinue | Stop-Process -Force
```
**CMD:**
```cmd
for /f "tokens=5" %a in ('netstat -aon ^| findstr :3000') do taskkill /f /pid %a
```

---

## 🛠️ Other Commands

### Build Project
**PowerShell / CMD:**
```batch
cd backend; bun run build
cd frontend; npm run build
```

### Clean Uploads (Manual)
**PowerShell:**
```powershell
Remove-Item -Path .\backend\uploads\* -Force
```
**CMD:**
```cmd
del /q backend\uploads\*
```
