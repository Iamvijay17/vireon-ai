const fs = require('fs').promises;
const path = require('path');
const { getStorageProvider } = require('../storage/providers');
const { concatWavFiles } = require('../../utils/wavAudio');

/**
 * Rebuilds one continuous narration track for a job's lip-sync input.
 * Scene audio is per-scene (script.scenes[i].audio.file), uploaded to MinIO
 * during audioStep and then deleted from local scratch space (see
 * sceneSynthesis.js) - by the time avatarStep runs, there's nothing left on
 * disk, so each scene's bytes are re-fetched from MinIO via the same
 * public-GET URL AudioService already publishes them under.
 *
 * Files are named .mp3 but are raw WAV bytes (see utils/wavAudio.js's doc
 * comment) - concatWavFiles handles that directly, no ffmpeg needed.
 *
 * Returns null if the job has no scene audio yet (nothing to sync to).
 */
async function buildNarrationTrack(jobId, scenes) {
  const scenesWithAudio = (scenes || []).filter((s) => s.audio?.file);
  if (scenesWithAudio.length === 0) return null;

  const avatarDir = path.resolve(__dirname, '../../../jobs', jobId, 'avatar');
  await fs.mkdir(avatarDir, { recursive: true });

  const storage = getStorageProvider();
  const sceneFiles = [];
  try {
    for (const scene of scenesWithAudio) {
      const url = storage.getPublicUrl(jobId, 'audio', scene.audio.file);
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Failed to fetch scene ${scene.sceneNumber} audio: ${res.status} ${res.statusText}`);
      }
      const localPath = path.join(avatarDir, `narration-scene${scene.sceneNumber}.wav`);
      await fs.writeFile(localPath, Buffer.from(await res.arrayBuffer()));
      sceneFiles.push(localPath);
    }

    // No gap between scenes - this track only drives lip-sync motion, it's
    // never played back itself (see AvatarOverlay's `muted` in
    // VideoComposition.jsx), so matching the timeline's own per-scene
    // padding/silence isn't necessary.
    const { buffer } = await concatWavFiles(sceneFiles, () => 0);
    const narrationPath = path.join(avatarDir, 'narration.wav');
    await fs.writeFile(narrationPath, buffer);

    return narrationPath;
  } finally {
    await Promise.all(sceneFiles.map((f) => fs.unlink(f).catch(() => {})));
  }
}

module.exports = { buildNarrationTrack };
