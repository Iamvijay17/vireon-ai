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

  lmStudio: {
    url: process.env.LM_STUDIO_URL || 'http://localhost:1234/v1/chat/completions',
    model: process.env.LM_STUDIO_MODEL || 'google/gemma-4-e4b',
    timeout: parseInt(process.env.LM_STUDIO_TIMEOUT, 10) || 60000,
    maxRetries: parseInt(process.env.LM_STUDIO_MAX_RETRIES, 10) || 3,
  },

  tts: {
    url: process.env.TTS_API_URL || 'http://localhost:7860',
    modelSize: process.env.TTS_MODEL_SIZE || '1.7B',
    // Smaller/faster model used when the caller opts into "fast generation"
    // (see AudioService.generateStandaloneAudio's fastMode param) - trades
    // some quality for speed.
    fastModelSize: process.env.TTS_FAST_MODEL_SIZE || '0.6B',
    timeout: parseInt(process.env.TTS_TIMEOUT, 10) || 120000,
    maxRetries: parseInt(process.env.TTS_MAX_RETRIES, 10) || 3,
  },

  avatar: {
    url: process.env.LIVEPORTRAIT_URL || 'http://127.0.0.1:8890',
    // Stock talking-head reference clip (bundled with the app) - drives the
    // motion applied to the default source portrait below. See
    // AvatarService.animatePortrait.
    drivingVideoPath: path.resolve(__dirname, '../../assets/avatar/stock-driving.mp4'),
    // No user-uploaded photo - the avatar's source portrait is always one of
    // these two bundled defaults, picked by the job's voice's gender (see
    // AvatarService.resolveDefaultSourceImage).
    defaultMaleImagePath: path.resolve(__dirname, '../../assets/avatar/default-male.jpg'),
    defaultFemaleImagePath: path.resolve(__dirname, '../../assets/avatar/default-female.jpg'),
    maxRetries: parseInt(process.env.AVATAR_MAX_RETRIES, 10) || 3,
  },

  remotion: {
    binary: process.env.REMOTION_BINARY || 'npx remotion',
    timeout: parseInt(process.env.REMOTION_TIMEOUT, 10) || 300000,
    maxRetries: parseInt(process.env.REMOTION_MAX_RETRIES, 10) || 2,
  },

  minio: {
    endpoint: process.env.MINIO_ENDPOINT || '127.0.0.1',
    port: parseInt(process.env.MINIO_PORT, 10) || 9000,
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ROOT_USER || '',
    secretKey: process.env.MINIO_ROOT_PASSWORD || '',
    // Two buckets instead of one flat namespace: scenes = scene-level data
    // (audio/avatar), video = final video-level output (render/thumbnail).
    // script.json/assets.json are local scratch only, never uploaded - the
    // script content lives in MongoDB. See MinioStorageProvider.
    scenesBucket: process.env.MINIO_SCENES_BUCKET || 'vireon-scenes',
    videoBucket: process.env.MINIO_VIDEO_BUCKET || 'vireon-video',
    // Base URL used to build public download links returned to callers
    // (e.g. http://127.0.0.1:9000). Override for LAN access or a reverse proxy.
    publicUrl:
      process.env.MINIO_PUBLIC_URL ||
      `http${process.env.MINIO_USE_SSL === 'true' ? 's' : ''}://${process.env.MINIO_ENDPOINT || '127.0.0.1'}:${process.env.MINIO_PORT || 9000}`,
    uploadRetries: parseInt(process.env.MINIO_UPLOAD_RETRIES, 10) || 3,
  },

  cors: {
    // CORS_ORIGIN accepts a comma-separated list (e.g. for LAN access from multiple hosts)
    origins: (process.env.CORS_ORIGIN || 'http://localhost:5173,http://172.24.0.1:5173,http://192.168.1.7:5173')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 600,
  },
});

module.exports = config;
