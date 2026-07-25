export type JobStatusEvent = {
  status: string;
  stage?: string | null;
  progress?: number;
  error?: string | null;
  url?: string | null;
  storagePath?: string | null;
};

/**
 * Wait for a clip job to finish via Server-Sent Events.
 * Falls back to exponential-backoff HTTP polling if EventSource is unavailable
 * or the stream closes unexpectedly.
 */
export function waitForJob(
  id: string,
  onUpdate: (data: JobStatusEvent) => void
): Promise<JobStatusEvent> {
  if (typeof EventSource === "undefined") {
    return pollForJob(id, onUpdate);
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
      fn();
    };

    es.onmessage = (event) => {
      let data: JobStatusEvent;
      try {
        data = JSON.parse(event.data) as JobStatusEvent;
      } catch {
        settle(() => reject(new Error("Invalid job status event")));
        return;
      }

      onUpdate(data);

      if (data.status === "ready") {
        settle(() => resolve(data));
      } else if (data.status === "error") {
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
        pollForJob(id, onUpdate).then(resolve, reject);
      });
    };
  });
}

async function pollForJob(
  id: string,
  onUpdate: (data: JobStatusEvent) => void
): Promise<JobStatusEvent> {
  let delay = 1000;
  for (;;) {
    // Poll immediately first, then backoff between attempts
    const res = await fetch(`/api/clip/${id}`);
    if (!res.ok) {
      throw new Error("Failed to fetch job status");
    }
    const data = (await res.json()) as JobStatusEvent;
    onUpdate(data);
    if (data.status === "ready") return data;
    if (data.status === "error") {
      throw new Error(data.error || "Processing failed");
    }
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 2, 5000);
  }
}
