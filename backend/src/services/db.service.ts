import Database from 'better-sqlite3';
import path from 'path';
import { JobUpdate } from '../types/job';

const dbPath = path.join(process.cwd(), '..', 'youtube-clipper.db');
const db = new Database(dbPath);

// Concurrent-friendly SQLite settings for progress writes + status reads
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

// Initialize table if not exists (Drizzle will also do this, but just to be safe if backend starts first)
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

function ensureUserExists(userId: string) {
    // Local/personal mode uses a stub user id; Drizzle jobs.user_id FK requires a row.
    const existing = db.prepare(`SELECT id FROM user WHERE id = ?`).get(userId);
    if (existing) return;

    const now = Date.now();
    db.prepare(
        `INSERT INTO user (id, name, email, email_verified, download_count, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
        userId,
        'Personal User',
        `${userId}@localhost`,
        1,
        '0',
        now,
        now
    );
}

export const dbService = {
    async createJob(id: string, userId: string) {
        ensureUserExists(userId);
        // Explicit created_at: existing DBs may lack DEFAULT CURRENT_TIMESTAMP on the column
        const createdAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
        const stmt = db.prepare(
            `INSERT INTO jobs (id, user_id, status, created_at) VALUES (?, ?, ?, ?)`
        );
        stmt.run(id, userId, 'processing', createdAt);
    },

    async updateJob(id: string, data: JobUpdate) {
        const sets: string[] = [];
        const values: any[] = [];
        
        if (data.status !== undefined) { sets.push('status = ?'); values.push(data.status); }
        if (data.stage !== undefined) { sets.push('stage = ?'); values.push(data.stage); }
        if (data.progress !== undefined) { sets.push('progress = ?'); values.push(data.progress); }
        if (data.error !== undefined) { sets.push('error = ?'); values.push(data.error); }
        if (data.public_url !== undefined) { sets.push('public_url = ?'); values.push(data.public_url); }
        if (data.storage_path !== undefined) { sets.push('storage_path = ?'); values.push(data.storage_path); }
        
        if (sets.length === 0) return;
        
        values.push(id);
        const stmt = db.prepare(`UPDATE jobs SET ${sets.join(', ')} WHERE id = ?`);
        stmt.run(...values);
    },

    async getJob(id: string) {
        const stmt = db.prepare(`SELECT * FROM jobs WHERE id = ?`);
        return stmt.get(id) as JobRow | undefined;
    },

    async deleteJob(id: string) {
        const stmt = db.prepare(`DELETE FROM jobs WHERE id = ?`);
        stmt.run(id);
    },

    /**
     * Deletes jobs older than cutoff and returns their rows so callers can remove files.
     * cutoff must be SQLite-comparable DATETIME: `YYYY-MM-DD HH:MM:SS`
     */
    async cleanupOldJobs(cutoff: string): Promise<Pick<JobRow, 'id' | 'storage_path'>[]> {
        const rows = db.prepare(
            `SELECT id, storage_path FROM jobs WHERE created_at < ?`
        ).all(cutoff) as Pick<JobRow, 'id' | 'storage_path'>[];

        if (rows.length > 0) {
            const stmt = db.prepare(`DELETE FROM jobs WHERE created_at < ?`);
            stmt.run(cutoff);
        }

        return rows;
    }
};
