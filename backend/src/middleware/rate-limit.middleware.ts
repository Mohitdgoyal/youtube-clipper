import { Request, Response, NextFunction } from "express";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

type RateLimitOptions = {
    windowMs: number;
    max: number;
    /** Extra key segment (e.g. route name) */
    name?: string;
};

/**
 * Simple in-memory IP rate limiter (single-process).
 */
export function rateLimit({ windowMs, max, name = "default" }: RateLimitOptions) {
    return (req: Request, res: Response, next: NextFunction) => {
        const ip = req.ip || req.socket.remoteAddress || "unknown";
        const key = `${name}:${ip}`;
        const now = Date.now();
        let bucket = buckets.get(key);

        if (!bucket || now >= bucket.resetAt) {
            bucket = { count: 0, resetAt: now + windowMs };
            buckets.set(key, bucket);
        }

        bucket.count += 1;

        res.setHeader("X-RateLimit-Limit", String(max));
        res.setHeader("X-RateLimit-Remaining", String(Math.max(0, max - bucket.count)));
        res.setHeader("X-RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));

        if (bucket.count > max) {
            return res.status(429).json({ error: "Too many requests. Please try again later." });
        }

        next();
    };
}

// Opportunistic cleanup of stale buckets
setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
        if (now >= bucket.resetAt) buckets.delete(key);
    }
}, 60_000).unref?.();
