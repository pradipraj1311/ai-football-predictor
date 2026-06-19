import { Redis } from '@upstash/redis';

const redisUrl = process.env.KV_REDIS_URL || process.env.UPSTASH_REDIS_REST_URL || '';
// Prioritize write-enabled tokens for full functionality (like setting maintenance mode).
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || process.env.KV_KV_REST_API_READ_ONLY_TOKEN || process.env.KV_REST_API_READ_ONLY_TOKEN || '';

let redis: Redis | null = null;
try {
    if (redisUrl && redisToken) {
        redis = new Redis({ url: redisUrl, token: redisToken });
    }
} catch (err) {
    console.warn('Failed to initialize Upstash Redis client:', err);
    redis = null;
}

export async function getCache(key: string) {
    try {
        if (!redis) return null;
        const raw = await redis.get(key);
        if (!raw) return null;
        try {
            return JSON.parse(raw as string);
        } catch (e) {
            return raw;
        }
    } catch (err) {
        console.warn('Redis get error for', key, err);
        return null;
    }
}

export async function setCache(key: string, value: any, ttlMs?: number) {
    try {
        if (!redis) return;
        const payload = typeof value === 'string' ? value : JSON.stringify(value);
        if (ttlMs && ttlMs > 0) {
            const ex = Math.max(1, Math.floor(ttlMs / 1000));
            await redis.set(key, payload, { ex });
        } else {
            await redis.set(key, payload);
        }
    } catch (err) {
        console.warn('Redis set error for', key, err);
    }
}

export function hasRedis() {
    return !!redis;
}
