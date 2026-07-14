const mongoose = require('mongoose');
const config = require('./index');
const LoggerService = require('../services/LoggerService');

/**
 * Connect to MongoDB with retry logic.
 */
async function connectDatabase() {
  const maxRetries = 5;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      attempt++;
      LoggerService.info(`Connecting to MongoDB (attempt ${attempt}/${maxRetries})`, {
        uri: config.mongodb.uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@'), // hide credentials
      });

      await mongoose.connect(config.mongodb.uri, {
        serverSelectionTimeoutMS: 5000,
        heartbeatFrequencyMS: 10000,
      });

      LoggerService.success('MongoDB connected successfully');
      return;
    } catch (err) {
      LoggerService.error(`MongoDB connection attempt ${attempt} failed`, {
        error: err.message,
      });

      if (attempt >= maxRetries) {
        LoggerService.error('MongoDB connection failed after max retries');
        throw err;
      }

      const delay = Math.min(2000 * Math.pow(2, attempt - 1), 10000);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

mongoose.connection.on('disconnected', () => {
  LoggerService.warn('MongoDB disconnected');
});

mongoose.connection.on('error', (err) => {
  LoggerService.error('MongoDB connection error', { error: err.message });
});

process.on('SIGINT', async () => {
  await mongoose.connection.close();
  LoggerService.info('MongoDB connection closed due to app termination');
  process.exit(0);
});

module.exports = { connectDatabase };
