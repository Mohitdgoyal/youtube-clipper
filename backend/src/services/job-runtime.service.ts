export type JobAbortReason = "user" | "timeout";

type RuntimeEntry = {
    controller: AbortController;
    reason?: JobAbortReason;
};

/** In-flight AbortControllers keyed by job id (timeout + user cancel). */
const runtimes = new Map<string, RuntimeEntry>();

export const jobRuntime = {
    register(id: string, controller: AbortController): void {
        runtimes.set(id, { controller });
    },

    unregister(id: string): void {
        runtimes.delete(id);
    },

    /** Abort a registered job. Returns true if a live controller was aborted. */
    abort(id: string, reason: JobAbortReason): boolean {
        const entry = runtimes.get(id);
        if (!entry) return false;
        entry.reason = reason;
        if (!entry.controller.signal.aborted) {
            entry.controller.abort();
            return true;
        }
        return false;
    },

    getReason(id: string): JobAbortReason | undefined {
        return runtimes.get(id)?.reason;
    },
};
