export type JobStatusEvent = {
  status: string;
  stage?: string | null;
  progress?: number;
  error?: string | null;
  url?: string | null;
  storagePath?: string | null;
};

export class JobCancelledError extends Error {
  constructor(message = "Cancelled by user") {
    super(message);
    this.name = "JobCancelledError";
  }
}

function isTerminalSuccess(status: string) {
  return status === "ready";
}

function isTerminalFailure(status: string) {
  return status === "error";
}

function isCancelled(status: string) {
  return status === "cancelled";
}

/**
 * Wait for a clip job to finish via Server-Sent Events.
 * Falls back to exponential-backoff HTTP polling if EventSource is unavailable
 * or the stream closes unexpectedly.
 */
export function waitForJob(
  id: string,
  onUpdate: (data: JobStatusEvent) => void,
  options?: { signal?: AbortSignal }
): Promise<JobStatusEvent> {
  if (typeof EventSource === "undefined") {
    return pollForJob(id, onUpdate, options?.signal);
  }

  return new Promise((resolve, reject) => {
    const es = new EventSource(`/api/clip/${id}/events`);
    let settled = false;
    let reconnects = 0;
    const MAX_AUTO_RECONNECT_MS = 8_000;
    const openedAt = Date.now();

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      es.close();
      options?.signal?.removeEventListener("abort", onClientAbort);
      fn();
    };

    const onClientAbort = () => {
      settle(() => reject(new JobCancelledError("Cancelled by user")));
    };
    if (options?.signal) {
      if (options.signal.aborted) {
        settle(() => reject(new JobCancelledError("Cancelled by user")));
        return;
      }
      options.signal.addEventListener("abort", onClientAbort, { once: true });
    }

    es.onmessage = (event) => {
      let data: JobStatusEvent;
      try {
        data = JSON.parse(event.data) as JobStatusEvent;
      } catch {
        settle(() => reject(new Error("Invalid job status event")));
        return;
      }

      onUpdate(data);

      if (isTerminalSuccess(data.status)) {
        settle(() => resolve(data));
      } else if (isCancelled(data.status)) {
        settle(() => reject(new JobCancelledError(data.error || "Cancelled by user")));
      } else if (isTerminalFailure(data.status)) {
        settle(() => reject(new Error(data.error || "Processing failed")));
      }
    };

    es.onerror = () => {
      if (settled) return;
      if (es.readyState === EventSource.CONNECTING) {
        reconnects += 1;
        if (Date.now() - openedAt < MAX_AUTO_RECONNECT_MS && reconnects < 5) {
          return;
        }
      }
      if (es.readyState !== EventSource.CLOSED && es.readyState !== EventSource.CONNECTING) {
        return;
      }
      settle(() => {
        pollForJob(id, onUpdate, options?.signal).then(resolve, reject);
      });
    };
  });
}

async function pollForJob(
  id: string,
  onUpdate: (data: JobStatusEvent) => void,
  signal?: AbortSignal
): Promise<JobStatusEvent> {
  let delay = 1000;
  for (;;) {
    if (signal?.aborted) {
      throw new JobCancelledError("Cancelled by user");
    }
    const res = await fetch(`/api/clip/${id}`);
    if (!res.ok) {
      throw new Error("Failed to fetch job status");
    }
    const data = (await res.json()) as JobStatusEvent;
    onUpdate(data);
    if (isTerminalSuccess(data.status)) return data;
    if (isCancelled(data.status)) {
      throw new JobCancelledError(data.error || "Cancelled by user");
    }
    if (isTerminalFailure(data.status)) {
      throw new Error(data.error || "Processing failed");
    }
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 2, 5000);
  }
}
