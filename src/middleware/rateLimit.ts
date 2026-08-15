import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Minimal fixed-window rate limiter. Counts requests per key and answers 429
 * once a key exceeds `max` within `windowMs`.
 *
 * In-memory and therefore per-process: behind more than one instance each
 * process keeps its own counters, so a shared store is needed to make the
 * limit global.
 */
export interface RateLimitOptions {
  windowMs: number;
  max: number;
  keyOf: (req: Request) => string;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export function rateLimit(opts: RateLimitOptions): RequestHandler {
  const buckets = new Map<string, Bucket>();
  let nextSweepAt = 0;

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();

    // Drop expired buckets at most once per window so the map can't grow
    // without bound on a stream of one-off keys.
    if (now >= nextSweepAt) {
      for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(key);
      }
      nextSweepAt = now + opts.windowMs;
    }

    const key = opts.keyOf(req);
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + opts.windowMs };
      buckets.set(key, bucket);
    }

    if (bucket.count >= opts.max) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      res.status(429).json({ error: 'too many requests' });
      return;
    }

    bucket.count += 1;
    // A successful response clears the bucket, so a legitimate user is never
    // locked out by earlier failed attempts from the same key.
    res.on('finish', () => {
      if (res.statusCode < 400) buckets.delete(key);
    });

    next();
  };
}
