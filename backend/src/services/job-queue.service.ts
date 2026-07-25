import { CLIP_JOB_CONCURRENCY } from "../constants";

type QueueItem = {
    run: () => Promise<void>;
};

/**
 * Simple in-process concurrency limiter for CPU/network-heavy clip jobs.
 * Default: 2 concurrent workers (override with CLIP_JOB_CONCURRENCY).
 */
class JobQueue {
    private readonly concurrency: number;
    private running = 0;
    private readonly queue: QueueItem[] = [];

    constructor(concurrency: number) {
        this.concurrency = Math.max(1, concurrency);
    }

    get pending(): number {
        return this.queue.length;
    }

    get active(): number {
        return this.running;
    }

    add<T>(fn: () => Promise<T>): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            this.queue.push({
                run: async () => {
                    try {
                        resolve(await fn());
                    } catch (err) {
                        reject(err);
                    }
                },
            });
            this.pump();
        });
    }

    private pump() {
        while (this.running < this.concurrency && this.queue.length > 0) {
            const item = this.queue.shift()!;
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
