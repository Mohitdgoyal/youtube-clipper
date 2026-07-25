"use client";

import { useEffect, useState } from "react";
import { Cookie } from "lucide-react";

type CookiesHealth = {
  present: boolean;
  source: "file" | "browser" | "none";
  ok: boolean;
  expiresSoon?: boolean;
  expired?: boolean;
  message: string;
};

export function CookieHealthChip() {
  const [health, setHealth] = useState<CookiesHealth | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/health/cookies");
        if (!res.ok) return;
        const data = (await res.json()) as CookiesHealth;
        if (!cancelled) setHealth(data);
      } catch {
        // ignore — chip stays hidden
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!health) return null;

  const tone = !health.ok
    ? "text-destructive border-destructive/30 bg-destructive/10"
    : health.expiresSoon
      ? "text-amber-700 dark:text-amber-300 border-amber-500/30 bg-amber-500/10"
      : "text-muted-foreground border-border/60 bg-muted/40";

  const label = !health.ok
    ? "No cookies"
    : health.expiresSoon
      ? "Cookies stale?"
      : "Cookies ok";

  return (
    <span
      title={health.message}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-medium ${tone}`}
    >
      <Cookie className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

export async function fetchCookiesHealth(): Promise<CookiesHealth | null> {
  try {
    const res = await fetch("/api/health/cookies");
    if (!res.ok) return null;
    return (await res.json()) as CookiesHealth;
  } catch {
    return null;
  }
}

/** True when format labels suggest nothing above 360p. */
export function formatsLookLowRes(formats: { label: string }[]): boolean {
  if (formats.length === 0) return false;
  return !formats.some((f) => /^(720|1080|1440|2160)p/.test(f.label));
}
