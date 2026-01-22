/**
 * Rate Limiting Utility
 * 
 * Uses Upstash Redis for rate limiting API endpoints.
 * Gracefully skips rate limiting if Redis is not configured (for personal projects).
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Lazily create rate limiter to avoid initialization errors
let rateLimiter: Ratelimit | null = null;
let rateLimiterInitialized = false;

function getRateLimiter(): Ratelimit | null {
    if (rateLimiterInitialized) {
        return rateLimiter;
    }

    rateLimiterInitialized = true;

    try {
        if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
            rateLimiter = new Ratelimit({
                redis: Redis.fromEnv(),
                limiter: Ratelimit.slidingWindow(30, "1 m"), // 30 requests per minute
                analytics: false, // Disable analytics to reduce complexity
            });
        }
    } catch (error) {
        console.warn('[Rate Limit] Failed to initialize Upstash Redis:', error);
        rateLimiter = null;
    }

    return rateLimiter;
}

/**
 * Check rate limit for an identifier (IP, API key, etc.)
 * 
 * If Upstash is not configured, rate limiting is SKIPPED (allows all requests).
 * This is acceptable for personal projects where abuse is unlikely.
 */
export async function checkRateLimit(identifier: string): Promise<{
    success: boolean;
    remaining: number;
    reset: number;
}> {
    const limiter = getRateLimiter();

    // If no rate limiter configured, allow all requests
    // This is safe for personal projects - rate limiting is a nice-to-have
    if (!limiter) {
        return { success: true, remaining: 999, reset: Date.now() + 60000 };
    }

    try {
        const result = await limiter.limit(identifier);
        return {
            success: result.success,
            remaining: result.remaining,
            reset: result.reset,
        };
    } catch (error) {
        // On any Redis error, allow the request (fail open for availability)
        console.warn('[Rate Limit] Redis error, allowing request:', error);
        return { success: true, remaining: 999, reset: Date.now() + 60000 };
    }
}

/**
 * Get client identifier from request
 * Tries to get IP from various headers, falls back to 'anonymous'
 */
export function getClientIdentifier(request: Request): string {
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }

    const realIp = request.headers.get('x-real-ip');
    if (realIp) {
        return realIp;
    }

    // Fallback for development
    return 'anonymous';
}
