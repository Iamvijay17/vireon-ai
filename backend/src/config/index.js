const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const config = Object.freeze({
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: (process.env.NODE_ENV || 'development') === 'development',
  isProd: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',

  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/vireon-ai',
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'fallback-secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  lmStudio: {
    url: process.env.LM_STUDIO_URL || 'http://localhost:1234/v1/chat/completions',
    model: process.env.LM_STUDIO_MODEL || 'gemma',
    timeout: parseInt(process.env.LM_STUDIO_TIMEOUT, 10) || 60000,
    maxRetries: parseInt(process.env.LM_STUDIO_MAX_RETRIES, 10) || 3,
  },

  tts: {
    url: process.env.TTS_API_URL || 'http://localhost:8000/generate',
    timeout: parseInt(process.env.TTS_TIMEOUT, 10) || 120000,
    maxRetries: parseInt(process.env.TTS_MAX_RETRIES, 10) || 3,
  },

  remotion: {
    binary: process.env.REMOTION_BINARY || 'npx remotion',
    timeout: parseInt(process.env.REMOTION_TIMEOUT, 10) || 300000,
    maxRetries: parseInt(process.env.REMOTION_MAX_RETRIES, 10) || 2,
  },

  github: {
    token: process.env.GITHUB_TOKEN || '',
    owner: process.env.GITHUB_REPO_OWNER || '',
    repo: process.env.GITHUB_REPO_NAME || 'vireon-ai-storage',
    branch: process.env.GITHUB_BRANCH || 'main',
    uploadRetries: parseInt(process.env.GITHUB_UPLOAD_RETRIES, 10) || 3,
  },

  comfyui: {
    url: process.env.COMFYUI_URL || 'http://localhost:8188',
    timeout: parseInt(process.env.COMFYUI_TIMEOUT, 10) || 120000,
    maxRetries: parseInt(process.env.COMFYUI_MAX_RETRIES, 10) || 3,
  },

  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
  },
});

module.exports = config;
