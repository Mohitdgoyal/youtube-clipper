# YouTube Clipper

A personal-use tool to extract clips from YouTube videos by URL and start/end timestamps. Clips are processed locally/on your server and downloaded to your computer.

---

## Features

- **Frontend:** NextJS + TailwindCSS (with Shadcn/UI)
- **Backend:** Node.js (Express) with Bun runtime
- **Video Processing:** Uses `yt-dlp` and `ffmpeg` for efficient, compatible video clipping
- **No cloud storage required:** Clips are downloaded directly to your device

---

## Prerequisites

You must have the following installed on your system:

- **[Bun](https://bun.sh/):** `bun` (v1.2.7 or later)
- **[Node.js](https://nodejs.org/):** `node` **≥ 20.19** (required for Next 16 / ESLint 10)
- **[yt-dlp](https://github.com/yt-dlp/yt-dlp):** Command-line tool for downloading YouTube videos
- **[ffmpeg](https://ffmpeg.org/):** Command-line tool for video processing

### To check if you have these installed, run:

```sh
bun --version
node --version
npm --version
yt-dlp --version
ffmpeg -version
```

If any are missing, install them via your package manager (e.g., `brew install bun yt-dlp ffmpeg` on macOS).

---

## Getting Started

### 1. Clone the repository

```sh
git clone https://github.com/retrogtx/youtube-clipper
cd youtube-clipper
```

---

### 2. Install dependencies

#### Backend

```sh
cd backend
bun install
```

#### Frontend

```sh
cd ../frontend
bun install
```

---

### 3. Run the app

#### Start the backend

```sh
cd backend
bun run build
bun run start
```

- The backend will start on `http://localhost:3001` by default.
- `bun run start` runs `node dist/index.js` (recommended on Windows — Bun can crash on `better-sqlite3` NAPI). Railway uses `bun dist/index.js`.

#### Start the frontend

```sh
cd ../frontend
bun run dev
```

- The frontend will start on `http://localhost:3000` by default.

---

## Usage

1. Open the frontend in your browser (`http://localhost:3000`).
2. Enter a YouTube URL and the desired start/end timestamps (format: `HH:MM:SS`).
3. Click **Clip video**.
4. The processed clip downloads with a title-based filename.

---

## Required System Packages

- **yt-dlp**: Used for partial YouTube downloads.
- **ffmpeg**: Used for video/audio processing and re-encoding.
- **bun**: Used as the JavaScript/TypeScript runtime for both backend and frontend.
- **node** and **npm**: For compatibility and tooling.

---

## Project Structure

```
youtube-clipper/
  backend/
    src/
    uploads/
    package.json
    tsconfig.json
  frontend/
    app/
    public/
    components/
    package.json
    tsconfig.json
    next.config.ts
```

---

## Troubleshooting

- **yt-dlp or ffmpeg not found:**  
  Make sure both are installed and available in your system PATH.
- **Video fails to upload to Twitter:**  
  The backend re-encodes all clips for Twitter compatibility. If you still have issues, ensure your ffmpeg is up to date.
- **Port conflicts:**  
  Change the port in the backend or frontend config if needed.

---

## Development

### Stack (current majors)

- Frontend: Next.js 16, React 19.2, Lucide 1, ESLint 10 (`eslint-config-next` 16)
- Backend: Express 5.2, TypeScript 7, dotenv 17
- Package manager: **bun** (`bun.lock` — do not reintroduce `package-lock.json`)

### TypeScript 6 + 7 (frontend)

TypeScript 7 ships a native `tsc` but **not** the classic Compiler API yet. Next.js and `typescript-eslint` still need that API, so the frontend uses a side-by-side setup:

| Package | Role |
|---------|------|
| `@typescript/native` (`typescript@^7`) | Native **TS 7** `tsc` — used by `bun run typecheck` |
| `typescript` (`^6`) | Classic API for **Next.js** typechecking during `next build` and for **ESLint** |

Backend uses `typescript@^7` only (`bun run typecheck` / `bun run build`).

When Next / typescript-eslint support the TS 7 API, the frontend `typescript@6` pin can be removed.

### Scripts

```sh
# Frontend
cd frontend
bun run lint
bun run typecheck   # TS 7 via @typescript/native
bun run build
bun run smoke:clip  # create → poll → download against running servers

# Backend
cd backend
bun run typecheck
bun run build
bun run start
```

---

**Enjoy clipping YouTube videos!**

If you have any issues, please open an issue or PR.
