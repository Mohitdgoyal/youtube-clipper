import Database from "better-sqlite3";
import path from "path";
import { JobUpdate } from "../types/job";

const dbPath = path.join(process.cwd(), "..", "youtube-clipper.db");
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");
db.pragma("busy_timeout = 5000");

db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'processing',
    stage TEXT,
    progress INTEGER DEFAULT 0,
    error TEXT,
    public_url TEXT,
    storage_path TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);
`);

export type JobRow = {
    id: string;
    user_id: string;
    status: string;
    stage: string | null;
    progress: number | null;
    error: string | null;
    public_url: string | null;
    storage_path: string | null;
    created_at: string;
};

const seededUsers = new Set<string>();

const stmtSelectUser = (() => {
    try {
        return db.prepare(`SELECT id FROM user WHERE id = ?`);
    } catch {
        return null;
    }
})();

const stmtInsertUser = (() => {
    try {
        return db.prepare(
            `INSERT INTO user (id, name, email, email_verified, download_count, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
        );
    } catch {
        return null;
    }
})();

const stmtInsertJob = db.prepare(
    `INSERT INTO jobs (id, user_id, status, created_at) VALUES (?, ?, ?, ?)`
);
const stmtGetJob = db.prepare(`SELECT * FROM jobs WHERE id = ?`);
const stmtDeleteJob = db.prepare(`DELETE FROM jobs WHERE id = ?`);
const stmtSelectOldJobs = db.prepare(
    `SELECT id, storage_path FROM jobs WHERE created_at < ?`
);
const stmtDeleteOldJobs = db.prepare(`DELETE FROM jobs WHERE created_at < ?`);
const stmtListStoragePaths = db.prepare(
    `SELECT storage_path FROM jobs WHERE storage_path IS NOT NULL`
);

function ensureUserExists(userId: string) {
    if (seededUsers.has(userId)) return;
    if (!stmtSelectUser || !stmtInsertUser) {
        seededUsers.add(userId);
        return;
    }

    const existing = stmtSelectUser.get(userId);
    if (!existing) {
        const now = Date.now();
        try {
            stmtInsertUser.run(
                userId,
                "Personal User",
                `${userId}@localhost`,
                1,
                "0",
                now,
                now
            );
        } catch {
            // race or missing table — ignore
        }
    }
    seededUsers.add(userId);
}

export const dbService = {
    async createJob(id: string, userId: string) {
        ensureUserExists(userId);
        const createdAt = new Date().toISOString().slice(0, 19).replace("T", " ");
        stmtInsertJob.run(id, userId, "processing", createdAt);
    },

    async updateJob(id: string, data: JobUpdate) {
        const sets: string[] = [];
        const values: unknown[] = [];

        if (data.status !== undefined) {
            sets.push("status = ?");
            values.push(data.status);
        }
        if (data.stage !== undefined) {
            sets.push("stage = ?");
            values.push(data.stage);
        }
        if (data.progress !== undefined) {
            sets.push("progress = ?");
            values.push(data.progress);
        }
        if (data.error !== undefined) {
            sets.push("error = ?");
            values.push(data.error);
        }
        if (data.public_url !== undefined) {
            sets.push("public_url = ?");
            values.push(data.public_url);
        }
        if (data.storage_path !== undefined) {
            sets.push("storage_path = ?");
            values.push(data.storage_path);
        }

        if (sets.length === 0) return;

        values.push(id);
        db.prepare(`UPDATE jobs SET ${sets.join(", ")} WHERE id = ?`).run(...values);
    },

    async getJob(id: string) {
        return stmtGetJob.get(id) as JobRow | undefined;
    },

    async deleteJob(id: string) {
        stmtDeleteJob.run(id);
    },

    async listStoragePaths(): Promise<string[]> {
        const rows = stmtListStoragePaths.all() as { storage_path: string }[];
        return rows.map((r) => r.storage_path).filter(Boolean);
    },

    async cleanupOldJobs(cutoff: string): Promise<Pick<JobRow, "id" | "storage_path">[]> {
        const rows = stmtSelectOldJobs.all(cutoff) as Pick<JobRow, "id" | "storage_path">[];
        if (rows.length > 0) {
            stmtDeleteOldJobs.run(cutoff);
        }
        return rows;
    },
};
