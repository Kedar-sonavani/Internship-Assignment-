const { client: redisClient, available: redisAvailable } = require('../config/redis');

// In-memory fallback: Map<userId, Array<timestamps>>
const inMemoryStore = new Map();
const WINDOW_SIZE_MS = 60 * 1000; // 60 seconds
const MAX_REQUESTS = 60;

/**
 * Get the current time in seconds (for Redis EXPIRE)
 */
function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

/**
 * Redis-based rate limiter using sliding window
 */
async function checkRateLimitRedis(userId) {
  const key = `rate-limit:${userId}`;
  const now = Date.now();
  const windowStart = now - WINDOW_SIZE_MS;

  try {
    // Remove old timestamps outside the window
    await redisClient.zremrangebyscore(key, '-inf', windowStart);

    // Count requests in the window
    const count = await redisClient.zcard(key);

    if (count >= MAX_REQUESTS) {
      // Get the oldest timestamp in the window
      const oldestTimestamp = await redisClient.zrange(key, 0, 0);
      const oldestTime = oldestTimestamp.length > 0 ? parseInt(oldestTimestamp[0], 10) : now;
      const retryAfterMs = Math.max(0, windowStart + WINDOW_SIZE_MS - oldestTime);
      const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);

      return {
        allowed: false,
        retryAfterSeconds
      };
    }

    // Add current timestamp
    await redisClient.zadd(key, now, now.toString());
    // Set expiration to clean up old keys
    await redisClient.expire(key, 120);

    return { allowed: true };
  } catch (err) {
    console.error('Redis rate limit check error:', err);
    // Fall back to in-memory on Redis error
    return checkRateLimitInMemory(userId);
  }
}

/**
 * In-memory rate limiter using sliding window
 */
function checkRateLimitInMemory(userId) {
  const now = Date.now();
  const windowStart = now - WINDOW_SIZE_MS;

  // Get or create timestamp array for this user
  if (!inMemoryStore.has(userId)) {
    inMemoryStore.set(userId, []);
  }

  const timestamps = inMemoryStore.get(userId);

  // Remove timestamps outside the window
  const validTimestamps = timestamps.filter(ts => ts > windowStart);
  inMemoryStore.set(userId, validTimestamps);

  if (validTimestamps.length >= MAX_REQUESTS) {
    // Calculate retry-after based on oldest timestamp
    const oldestTimestamp = validTimestamps[0];
    const retryAfterMs = Math.max(0, windowStart + WINDOW_SIZE_MS - oldestTimestamp);
    const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);

    return {
      allowed: false,
      retryAfterSeconds
    };
  }

  // Add current timestamp
  validTimestamps.push(now);

  return { allowed: true };
}

/**
 * Rate limiter middleware factory.
 * Only applies to POST /cart/items by default.
 */
function rateLimiterMiddleware(req, res, next) {
  // Only apply to POST /cart/items
  if (req.method !== 'POST' || req.path !== '/items') {
    return next();
  }

  const userId = req.userId;
  if (!userId) {
    // userId should have been extracted by earlier middleware
    return next();
  }

  // Check rate limit (use Redis if available, fallback to in-memory)
  const checkLimit = redisAvailable ? checkRateLimitRedis : checkRateLimitInMemory;

  Promise.resolve(checkLimit(userId)).then(result => {
    if (!result.allowed) {
      const retryAfterSeconds = result.retryAfterSeconds;
      return res.status(429).json({
        error: 'Rate limit exceeded',
        retryAfterSeconds
      }).set('Retry-After', retryAfterSeconds.toString());
    }
    next();
  }).catch(err => {
    console.error('Rate limiter error:', err);
    next();
  });
}

module.exports = rateLimiterMiddleware;
