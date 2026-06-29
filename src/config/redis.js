const Redis = require('ioredis');

const isTestEnvironment = process.env.NODE_ENV === 'test' || Boolean(process.env.JEST_WORKER_ID);
const useRedis = !isTestEnvironment && Boolean(process.env.REDIS_URL);
const client = useRedis ? new Redis(process.env.REDIS_URL, { lazyConnect: false }) : null;

const status = { available: false };

if (client) {
  client.on('ready', () => {
    console.log('Redis connected successfully');
    status.available = true;
  });

  client.on('error', (err) => {
    console.warn('Redis connection error:', err.message);
    status.available = false;
  });

  client.on('end', () => {
    status.available = false;
  });

  client.on('reconnecting', () => {
    status.available = false;
  });
}

module.exports = { client, get available() { return status.available; } };