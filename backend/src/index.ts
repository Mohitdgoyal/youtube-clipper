import fs from "fs";
import path from "path";
import { app } from "./app";
import { PORT, UPLOADS_DIR } from "./constants";
import { dbService } from "./services/db.service";
import { storageService } from "./services/storage.service";

async function cleanupOldJobsAndFiles() {
  const cutoffMs = Date.now() - 24 * 60 * 60 * 1000;
  const removed = await dbService.cleanupOldJobs(cutoffMs);
  for (const job of removed) {
    if (job.storage_path) {
      await storageService.deleteFile(job.storage_path).catch((err) => {
        console.warn(`Failed to delete orphan file ${job.storage_path}:`, err.message);
      });
    }
  }
  if (removed.length > 0) {
    console.log(`Cleaned up ${removed.length} old job(s)`);
  }
}

/**
 * Remove stale temps and orphan clip-*.mp4 files older than 24h
 * (including failed jobs that never set storage_path).
 */
async function cleanupTempUploads() {
  if (!fs.existsSync(UPLOADS_DIR)) return;
  const cutoffMs = Date.now() - 24 * 60 * 60 * 1000;
  const files = await fs.promises.readdir(UPLOADS_DIR);
  const knownPaths = new Set(await dbService.listStoragePaths());
  let removed = 0;

  for (const name of files) {
    const isTemp =
      name.endsWith(".vtt") ||
      name.includes("-fast.mp4") ||
      name.includes("-fast.webm") ||
      name.includes("-adjusted.vtt") ||
      name.endsWith(".part") ||
      /\.f\d+\./.test(name);

    const isOrphanClip =
      /^clip-[a-f0-9]+\.(mp4|webm)$/i.test(name) && !knownPaths.has(name);

    if (!isTemp && !isOrphanClip) continue;

    const full = path.join(UPLOADS_DIR, name);
    try {
      const stat = await fs.promises.stat(full);
      if (stat.mtimeMs < cutoffMs) {
        await fs.promises.unlink(full);
        removed++;
      }
    } catch {
      // ignore
    }
  }

  if (removed > 0) {
    console.log(`Cleaned up ${removed} temp/orphan upload file(s)`);
  }
}

async function cleanupTask() {
  try {
    await cleanupOldJobsAndFiles();
    await cleanupTempUploads();
  } catch (err) {
    console.error("Cleanup failed:", err);
  }
}

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  cleanupTask();
  setInterval(cleanupTask, 60 * 60 * 1000).unref?.();
});
