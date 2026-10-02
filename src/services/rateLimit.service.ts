import { Redis, type Redis as RedisClient } from 'ioredis';
import { getEnv } from '../config/env.js';
import { auditLogger, logger } from '../utils/logger.js';

export class RateLimitService {
  private redis: RedisClient | null = null;
  private memoryFallback = new Map<string, { count: number; expiresAt: number }>();

  constructor() {
    this.initRedis();
  }

  private initRedis() {
    try {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      this.redis = new Redis(redisUrl, {
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        retryStrategy: () => null, // Don't crash on initial connect failure, fallback to memory
      });

      this.redis.on('connect', () => {
        logger.info('Connected to Redis for rate limiting');
      });

      this.redis.on('error', (err: Error) => {
        logger.warn(
          { err: err.message },
          'Redis connection warning. Utilizing in-memory rate limiting fallback.'
        );
      });
    } catch (err) {
      logger.warn({ err }, 'Failed to initialize Redis. Using in-memory rate limiting fallback.');
    }
  }

  /**
   * Checks whether an action should be rate limited.
   * Default: 10 messages / 10 seconds.
   */
  async isRateLimited(
    targetType: 'user' | 'chat',
    targetId: string | number | bigint,
    customLimit?: number,
    customWindowSec?: number
  ): Promise<boolean> {
    const env = getEnv();
    const limit = customLimit ?? env.RATE_LIMIT_USER_MESSAGES;
    const windowSec = customWindowSec ?? env.RATE_LIMIT_WINDOW_SECONDS;
    const key = `ratelimit:${targetType}:${targetId.toString()}`;

    // Try Redis first
    if (this.redis && this.redis.status === 'ready') {
      try {
        const count = await this.redis.incr(key);
        if (count === 1) {
          await this.redis.expire(key, windowSec);
        }
        if (count > limit) {
          auditLogger.rateLimited(targetType, targetId.toString());
          return true;
        }
        return false;
      } catch (err) {
        logger.warn({ err }, 'Redis rate limit error, falling back to memory');
      }
    }

    // In-memory fallback
    const now = Date.now();
    const entry = this.memoryFallback.get(key);

    if (!entry || now > entry.expiresAt) {
      this.memoryFallback.set(key, { count: 1, expiresAt: now + windowSec * 1000 });
      return false;
    }

    entry.count++;
    if (entry.count > limit) {
      auditLogger.rateLimited(targetType, targetId.toString());
      return true;
    }

    return false;
  }

  async close(): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.quit();
      } catch {
        // ignore on shutdown
      }
    }
  }
}

export const rateLimitService = new RateLimitService();
