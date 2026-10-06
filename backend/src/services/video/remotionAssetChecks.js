const config = require('../../config');
const { getStorageProvider } = require('../storage/providers');
const { checkImageUrl, buildAllowedHosts } = require('../../utils/assetUrlGuard');

/**
 * Verify every scene that's expected to have audio (audio.duration > 0
 * in assets.json) actually made it to storage. Scenes with no audio text
 * legitimately have duration 0 and are skipped. Checks storage rather
 * than local disk since scene audio is uploaded (and backend/jobs/ may
 * already be cleaned up) well before rendering runs.
 */
async function verifySceneAudioFiles(jobId, scenes) {
  const provider = getStorageProvider();
  const missing = [];

  for (const scene of scenes) {
    if (!(scene.audio?.duration > 0)) continue;
    const exists = await provider.objectExists(jobId, 'audio', `scene${scene.sceneNumber}.mp3`);
    if (!exists) missing.push(scene.sceneNumber);
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing audio file(s) for scene(s) ${missing.join(', ')} - audio generation must complete before rendering`
    );
  }
}

/**
 * Pre-render validation: catches the cheap, structural failure modes
 * that would otherwise only surface as a wasted multi-minute Remotion
 * render (or a broken-looking output video) - missing/duplicate scene
 * numbers, a scene with no duration, narration text whose TTS pass
 * produced a 0-duration clip, an image prompt whose image never got
 * generated, or scene audio that was recorded but never made it to
 * storage. Collects every issue instead of failing on the first, so a
 * job with several broken scenes reports all of them in one pass.
 *
 * `scenes` should be the source script's scene array (job.script.scenes
 * or CourseVideo's equivalent) - not the transformed assets.json shape,
 * since prepareAssets strips scene.audio.text, which this needs to tell
 * "no narration expected" apart from "TTS produced an empty clip".
 */
async function validateAssets(jobId, scenes) {
  const issues = [];

  if (!Array.isArray(scenes) || scenes.length === 0) {
    throw new Error('Pre-render validation failed: script has no scenes');
  }

  const provider = getStorageProvider();
  const seenSceneNumbers = new Set();
  const imageRefs = [];

  for (const scene of scenes) {
    const sceneNum = scene.sceneNumber;
    const label = `Scene ${sceneNum ?? '?'}`;

    if (sceneNum == null) {
      issues.push(`${label}: missing sceneNumber`);
    } else if (seenSceneNumbers.has(sceneNum)) {
      issues.push(`${label}: duplicate sceneNumber`);
    } else {
      seenSceneNumbers.add(sceneNum);
    }

    if (!scene.templateId && !scene.sceneType) {
      issues.push(`${label}: missing templateId/sceneType`);
    }

    const duration = scene.audio?.duration || scene.duration;
    if (!(duration > 0)) {
      issues.push(`${label}: duration must be greater than 0`);
    }

    const narrationText = scene.audio?.text?.trim();
    if (narrationText) {
      if (!(scene.audio?.duration > 0)) {
        issues.push(`${label}: has narration text but audio duration is 0 - TTS likely produced an empty clip`);
      }
      if (sceneNum != null) {
        const exists = await provider.objectExists(jobId, 'audio', `scene${sceneNum}.mp3`);
        if (!exists) issues.push(`${label}: audio file is missing from storage`);
      }
    }

    // scene.imagePrompt is only ever set when the script generator chose
    // an image-bearing template for this scene (see TemplateCategories.js's
    // 'image'/'contentwithimage' categories) - a scene with no image
    // prompt legitimately has no image and isn't checked here.
    if (scene.imagePrompt && !scene.imageUrl) {
      issues.push(`${label}: image prompt set but no image was generated`);
    }

    for (const [field, url] of [
      ['imageUrl', scene.imageUrl],
      ['elements.image', scene.elements?.image],
      ['elements.hostImage', scene.elements?.hostImage],
    ]) {
      if (typeof url === 'string' && url.trim()) imageRefs.push({ label, field, url });
    }
  }

  // The render machine's Chromium fetches these - refuse private/internal
  // targets before spending a multi-minute render on them. Each distinct URL
  // is resolved once however many scenes share it (podcast turns all share
  // one cover image).
  const allowedHosts = buildAllowedHosts(config);
  const verdicts = new Map();
  for (const { url } of imageRefs) {
    if (!verdicts.has(url)) verdicts.set(url, checkImageUrl(url, { allowedHosts }));
  }
  await Promise.all(verdicts.values());
  for (const { label, field, url } of imageRefs) {
    const problem = await verdicts.get(url);
    if (problem) issues.push(`${label}: ${field} ${problem}`);
  }

  if (issues.length > 0) {
    throw new Error(`Pre-render validation failed:\n- ${issues.join('\n- ')}`);
  }
}

module.exports = { verifySceneAudioFiles, validateAssets };
