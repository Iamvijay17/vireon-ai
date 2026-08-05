Place the default talking-avatar reference clip here as `default.mp4`.

MuseTalk animates the mouth region of an existing video rather than generating
motion from a still photo, so this needs to be a short (3-6s) idle loop of the
character - subtle blinking/breathing, facing roughly camera-forward, no
existing mouth movement required since MuseTalk replaces that. A single
looping clip is enough; `AvatarService` reuses it for every scene, synced
against that scene's own narration audio.

Path is configurable via `AVATAR_REFERENCE_VIDEO` in `backend/.env` if you'd
rather keep it elsewhere; defaults to `default.mp4` in this directory
(see `config.avatar.referenceVideoPath` in `backend/src/config/index.js`).
