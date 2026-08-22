# Vireon AI - Backend

AI-powered video generation platform backend with clean architecture.

## Tech Stack

- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** MongoDB (Mongoose)
- **Queue:** BullMQ (Redis)
- **Realtime:** Socket.IO
- **AI:** LM Studio (Gemma) + Pinokio Qwen3-TTS
- **Rendering:** Remotion
- **Storage:** MinIO (local S3-compatible object storage)
- **Validation:** Zod
- **Logging:** Winston

## Architecture

```
src/
├── config/         # App configuration (env, DB, Redis)
├── constants/      # Enums & constants
├── controllers/    # Request handlers (thin)
├── middleware/      # Auth, error handling, rate limiting
├── models/         # Mongoose schemas (User, VideoJob)
├── queues/         # BullMQ queue definitions
├── routes/         # Express route definitions
├── services/       # Business logic (single responsibility)
│   ├── AuthService
│   ├── VideoService
│   ├── PromptService
│   ├── LMStudioService
│   ├── ScriptParserService
│   ├── AudioService (TTS)
│   ├── RemotionService
│   ├── StorageService      # local scratch dir helpers
│   ├── providers/          # StorageProvider (MinIO)
│   ├── LoggerService
│   └── SocketService
├── workers/        # BullMQ job processors
├── validators/     # Zod schemas
├── socket/         # Socket.IO handlers
├── utils/          # Shared utilities
└── constants/      # Enums
```

## Video Pipeline (8 Steps)

1. **QUEUED** → Job created, added to BullMQ queue
2. **SCRIPT_GENERATION** (10%) → Prompt template rendered with user input
3. **SCRIPT_COMPLETED** (20%) → LM Studio (Gemma) generates script, validated, saved & uploaded to MinIO
4. **GENERATING_AUDIO** (40%) → Qwen3-TTS generates audio per scene, each uploaded to MinIO immediately
5. **AUDIO_COMPLETED** (50%) → All scene audio generated and durably in MinIO
6. **PREPARING_ASSETS** (60%) → `assets.json` built for Remotion (audio/avatar URLs point at MinIO) and uploaded
7. **RENDERING** (80%) → Remotion renders video + thumbnail, fetching audio/avatar straight from MinIO
8. **UPLOADING** (90%) → Render output uploaded to MinIO
9. **COMPLETED** (100%) → URLs saved, local scratch directory wiped

Storage is split across three MinIO buckets: `vireon-jobs` (script/assets, keyed by jobId), `vireon-scenes` (audio/avatar, keyed by videoId), `vireon-video` (render output, keyed by videoId) - see `services/providers/MinioStorageProvider.js`.

## Quick Start

```bash
# Prerequisites: MongoDB, Redis running locally

# Install dependencies
cd backend && npm install

# Copy and configure environment
cp .env.example .env
# Edit .env with your settings

# Start the server
npm start          # or: npm run dev

# Start the worker (separate terminal)
npm run worker     # or: npm run worker:dev
```

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/health` | No | Health check |
| POST | `/api/auth/register` | No | Register user |
| POST | `/api/auth/login` | No | Login |
| GET | `/api/auth/me` | Yes | Profile |
| POST | `/api/videos` | Yes | Create video job |
| GET | `/api/videos` | Yes | List user's videos |
| GET | `/api/videos/:id` | Yes | Get video job details |
| DELETE | `/api/videos/:id` | Yes | Delete video job |

## Environment Variables

See `.env` file for all configurable variables. Key ones:

```
PORT=3000
MONGODB_URI=mongodb://localhost:27017/vireon-ai
JWT_SECRET=your-secret
LM_STUDIO_URL=http://localhost:1234/v1/chat/completions
TTS_API_URL=http://localhost:7860
GITHUB_TOKEN=your-token
GITHUB_REPO_OWNER=your-username
GITHUB_REPO_NAME=vireon-ai-storage
```
