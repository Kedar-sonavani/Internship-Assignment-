const mongoose = require('mongoose');

/**
 * Connect to MongoDB using the MONGODB_URI environment variable.
 * Logs success on connect; logs the error and exits with code 1 on failure.
 */
async function connectDB() {
  const uri = process.env.MONGODB_URI;

  try {
    await mongoose.connect(uri);
    console.log('MongoDB connected successfully');
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  }
}

/**
 * Cleanly disconnect from MongoDB.
 * Useful in test teardown to avoid open-handle warnings.
 */
async function disconnectDB() {
  await mongoose.disconnect();
}

module.exports = { connectDB, disconnectDB };
