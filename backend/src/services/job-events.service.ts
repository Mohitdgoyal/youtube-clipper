import { EventEmitter } from "events";

export type JobEventPayload = {
    status: string;
    stage?: string | null;
    progress: number;
    error?: string | null;
    url?: string | null;
    storagePath?: string | null;
};

/**
 * In-process pub/sub for SSE job status streams.
 * Single-server only (matches current deployment model).
 */
class JobEventBus {
    private readonly emitter = new EventEmitter();

    constructor() {
        this.emitter.setMaxListeners(200);
    }

    emit(jobId: string, payload: JobEventPayload) {
        this.emitter.emit(jobId, payload);
    }

    subscribe(jobId: string, listener: (payload: JobEventPayload) => void): () => void {
        this.emitter.on(jobId, listener);
        return () => {
            this.emitter.off(jobId, listener);
        };
    }
}

export const jobEvents = new JobEventBus();
