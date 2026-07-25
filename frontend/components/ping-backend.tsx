'use client';

import { useEffect } from 'react';

/**
 * Keep the backend warm only while a clip job is active.
 * Idle pages no longer ping every 5s.
 */
export default function PingBackend({ active = false }: { active?: boolean }) {
  useEffect(() => {
    if (!active) return;

    // Immediate wake + sparse keep-alive during the job
    fetch('/api/ping').catch(() => { /* ignore */ });
    const interval = setInterval(() => {
      fetch('/api/ping').catch(() => { /* ignore */ });
    }, 30_000);

    return () => clearInterval(interval);
  }, [active]);

  return null;
}
