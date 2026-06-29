const Redis = require('ioredis');

// Initialize Redis client
const client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// Use an object to track availability so it can be passed by reference
const status = { available: false };

// Connection event listeners to track availability
client.on('ready', () => {
  console.log('Redis connected successfully');
  status.available = true;
});

client.on('error', (err) => {
  console.warn('Redis connection error:', err.message);
  status.available = false;
});

client.on('end', () => {
  console.warn('Redis connection ended');
  status.available = false;
});

client.on('connect', () => {
  // Connection established but not necessarily ready yet
  console.log('Redis socket connection established');
});

client.on('reconnecting', () => {
  console.log('Redis reconnecting...');
  status.available = false;
});

// Test initial connection with timeout
const connectionTimeout = setTimeout(() => {
  if (!status.available) {
    console.warn('Redis connection timeout - proceeding with in-memory fallback');
  }
}, 5000);

client.ping().catch(() => {}).finally(() => {
  clearTimeout(connectionTimeout);
});

module.exports = { client, get available() { return status.available; } };