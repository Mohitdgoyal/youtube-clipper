/**
 * Simple in-memory cache with TTL for YouTube metadata
 * Reduces repeated API calls for the same video within a short window
 */

interface CacheEntry<T> {
    data: T;
    expiresAt: number;
}

class MemoryCache {
    private cache: Map<string, CacheEntry<any>> = new Map();
    private readonly defaultTTL: number;

    constructor(defaultTTLSeconds: number = 300) { // 5 minutes default
        this.defaultTTL = defaultTTLSeconds * 1000;

        // Cleanup expired entries every minute
        setInterval(() => this.cleanup(), 60 * 1000);
    }

    get<T>(key: string): T | null {
        const entry = this.cache.get(key);
        if (!entry) return null;

        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            return null;
        }

        return entry.data as T;
    }

    set<T>(key: string, data: T, ttlSeconds?: number): void {
        const ttl = ttlSeconds ? ttlSeconds * 1000 : this.defaultTTL;
        this.cache.set(key, {
            data,
            expiresAt: Date.now() + ttl
        });
    }

    has(key: string): boolean {
        return this.get(key) !== null;
    }

    delete(key: string): void {
        this.cache.delete(key);
    }

    clear(): void {
        this.cache.clear();
    }

    private cleanup(): void {
        const now = Date.now();
        for (const [key, entry] of this.cache.entries()) {
            if (now > entry.expiresAt) {
                this.cache.delete(key);
            }
        }
    }

    get size(): number {
        return this.cache.size;
    }
}

// Export singleton instance for metadata caching
export const metadataCache = new MemoryCache(300); // 5 minute TTL

// Helper to create cache key from URL
export function createCacheKey(url: string): string {
    // Extract video ID from YouTube URL for consistent caching
    try {
        const urlObj = new URL(url);
        const videoId = urlObj.searchParams.get('v') || urlObj.pathname.split('/').pop();
        return `metadata:${videoId}`;
    } catch {
        // Fallback to full URL if parsing fails
        return `metadata:${url}`;
    }
}
