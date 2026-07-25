import { CLIP_JOB_CONCURRENCY } from "../constants";

type QueueItem = {
    id: string;
    cancelled: boolean;
    run: () => Promise<void>;
    reject: (err: Error) => void;
};

/**
 * Simple in-process concurrency limiter for CPU/network-heavy clip jobs.
 * Supports cancel of queued (not yet started) items by id.
 */
class JobQueue {
    private readonly concurrency: number;
    private running = 0;
    private readonly queue: QueueItem[] = [];

    constructor(concurrency: number) {
        this.concurrency = Math.max(1, concurrency);
    }

    add(id: string, fn: () => Promise<void>): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const item: QueueItem = {
                id,
                cancelled: false,
                reject,
                run: async () => {
                    if (item.cancelled) {
                        reject(new Error("Cancelled"));
                        return;
                    }
                    try {
                        await fn();
                        resolve();
                    } catch (err) {
                        reject(err instanceof Error ? err : new Error(String(err)));
                    }
                },
            };
            this.queue.push(item);
            this.pump();
        });
    }

    /** Remove a queued job before it starts. Returns true if it was still waiting. */
    cancel(id: string): boolean {
        const idx = this.queue.findIndex((item) => item.id === id);
        if (idx < 0) return false;
        const [item] = this.queue.splice(idx, 1);
        item.cancelled = true;
        item.reject(new Error("Cancelled"));
        return true;
    }

    stats() {
        return { running: this.running, queued: this.queue.length };
    }

    private pump() {
        while (this.running < this.concurrency && this.queue.length > 0) {
            const item = this.queue.shift()!;
            if (item.cancelled) continue;
            this.running++;
            item.run().finally(() => {
                this.running--;
                this.pump();
            });
        }
    }
}

export const clipJobQueue = new JobQueue(
    Number.isFinite(CLIP_JOB_CONCURRENCY) ? CLIP_JOB_CONCURRENCY : 2
);
