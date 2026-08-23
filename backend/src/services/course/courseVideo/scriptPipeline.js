const CourseVideo = require('../../../models/CourseVideo');
const LoggerService = require('../../common/LoggerService');
const SocketService = require('../../common/SocketService');
const ActivityLogService = require('../../common/ActivityLogService');
const LMStudioService = require('../../common/LMStudioService');
const ScriptParserService = require('../../video/ScriptParserService');
const { VIDEO_STATUS, STAGE_STATUS } = require('../../../constants');

/**
 * Build the prompt for a course's promotional trailer video (the
 * isPromo lesson auto-generated alongside the curriculum) - a short sales
 * pitch for the whole course rather than a teaching lesson. Reuses the
 * same scene-type/JSON contract as buildScriptPrompt so it flows through
 * the identical ScriptParserService validation and render pipeline.
 */
function buildPromoScriptPrompt(video, { sceneCount, contentSceneCount, contentWithImageCount, avgSceneSeconds, wordsPerScene, wordCount }) {
  return `Create a ${video.duration}min promotional trailer video script for a course titled "${video.title}", about "${video.topic}".

Return ONLY valid JSON with this structure:
{
  "title": "${video.title}",
  "description": "Brief description",
  "tags": ["tag1", "tag2"],
  "thumbnailPrompt": "image generation prompt",
  "scenes": [
    {
      "sceneNumber": 1,
      "sceneType": "title|content|contentwithimage",
      "title": "Scene title",
      "subtitle": "Supporting text",
      "backgroundColor": "#1a1a2e",
      "transition": "fade",
      "cameraMotion": "static",
      "animation": "",
      "imagePrompt": "",
      "scene_meta": { "content": ["", "", ""] },
      "audio": { "text": "Narration text here (~${wordsPerScene} words per scene)" }
    }
  ]
}

Rules:
- This is a PROMOTIONAL TRAILER for the whole course, not a teaching lesson - sell the course, don't teach its content. Hook the viewer, describe who the course is for, what they'll be able to do after finishing, and why they should enroll now. Do NOT teach actual technical material.
- Total narration: ~${wordCount} words across all scenes
- Exactly ${sceneCount} scenes total: 1 title, ${contentSceneCount} content, ${contentWithImageCount} contentwithimage
- Scene duration: about ${avgSceneSeconds} seconds each
- sceneType must be one of: "title", "content", or "contentwithimage"
- Use "title" ONLY for scene 1, the opening title card
- Use "content" for most of the remaining scenes - main promotional narration, text only
- Use "contentwithimage" sparingly (only ${contentWithImageCount} scene${contentWithImageCount === 1 ? '' : 's'} total) - the most exciting/visual moments, paired with a supporting AI-generated image
- Only include "imagePrompt" when sceneType is "contentwithimage"; leave it as empty string for other scene types
- For every scene with sceneType "content" or "contentwithimage", include a scene_meta object with a "content" array containing the narration text split into individual sentences
- Energetic, confident tone - this is marketing copy, not a lecture
- End with a strong, direct call to action to enroll in the course
- ${video.additionalInstructions ? `Additional: ${video.additionalInstructions}` : ''}
- Return ONLY valid JSON, no markdown, no code blocks`;
}

/**
 * Build the prompt for LM Studio script generation.
 * Uses a concise prompt to reduce generation time on slower models.
 */
function buildScriptPrompt(video) {
  const durationMinutes = video.duration;
  const wordCount = durationMinutes * 130;
  // Scale scene count with video length - roughly 2 scenes per minute
  // (5min -> 10 scenes, 15min -> 30 scenes) so there's enough scenes to
  // cycle through many different templates instead of repeating a few,
  // with a floor of 3 so short videos still get an intro/content/summary
  // shape.
  const sceneCount = Math.max(3, Math.round(durationMinutes * 2));
  // Scene 1 is always the title card. Of the remaining scenes, only a
  // sparing number get "contentwithimage" - roughly 1 per 8 scenes (5
  // scenes -> 1, 10 scenes -> 2, 20 scenes -> 3), not a flat percentage,
  // so most of the video stays plain "content" and images are used
  // sparingly rather than on every other scene.
  const remainingSceneCount = sceneCount - 1;
  const contentWithImageCount = Math.min(remainingSceneCount, Math.max(1, Math.ceil(sceneCount / 8)));
  const contentSceneCount = remainingSceneCount - contentWithImageCount;
  const avgSceneSeconds = Math.round((durationMinutes * 60) / sceneCount);
  const wordsPerScene = Math.round(wordCount / sceneCount);

  if (video.isPromo) {
    return buildPromoScriptPrompt(video, {
      sceneCount, contentSceneCount, contentWithImageCount, avgSceneSeconds, wordsPerScene, wordCount,
    });
  }

  return `Create a ${durationMinutes}min educational video script about "${video.topic}".

Return ONLY valid JSON with this structure:
{
  "title": "${video.title}",
  "description": "Brief description",
  "tags": ["tag1", "tag2"],
  "thumbnailPrompt": "image generation prompt",
  "scenes": [
    {
      "sceneNumber": 1,
      "sceneType": "title|content|contentwithimage",
      "title": "Scene title",
      "subtitle": "Supporting text",
      "backgroundColor": "#1a1a2e",
      "transition": "fade",
      "cameraMotion": "static",
      "animation": "",
      "imagePrompt": "",
      "scene_meta": { "content": ["", "", ""] },
      "audio": { "text": "Narration text here (~${wordsPerScene} words per scene)" }
    }
  ]
}

Rules:
- This is ONE lesson video from a larger course, not a full-course summary. Cover ONLY the specific topic given above - do not introduce, preview, or teach content that belongs to other lessons in the course.
- Total narration: ~${wordCount} words across all scenes
- Exactly ${sceneCount} scenes total: 1 title, ${contentSceneCount} content, ${contentWithImageCount} contentwithimage
- Scene duration: about ${avgSceneSeconds} seconds each
- sceneType must be one of: "title", "content", or "contentwithimage"
- Use "title" ONLY for scene 1, the opening title card
- Use "content" for most of the remaining scenes - main educational content, text only
- Use "contentwithimage" sparingly (only ${contentWithImageCount} scene${contentWithImageCount === 1 ? '' : 's'} total) - main content paired with a supporting AI-generated image, reserved for the most visual moments
- Only include "imagePrompt" when sceneType is "contentwithimage"; leave it as empty string for other scene types
- For every scene with sceneType "content" or "contentwithimage", include a scene_meta object with a "content" array containing the narration text split into individual sentences
- Make it beginner-friendly with examples
- End with a call to action
- ${video.additionalInstructions ? `Additional: ${video.additionalInstructions}` : ''}
- Return ONLY valid JSON, no markdown, no code blocks`;
}

/**
 * Generate script for a video using LM Studio.
 */
async function generateScript(videoId) {
  const video = await CourseVideo.findById(videoId);
  if (!video) {
    throw { status: 404, message: 'Video not found' };
  }

  // Update status
  video.status = VIDEO_STATUS.GENERATING_SCRIPT;
  video.scriptStatus = STAGE_STATUS.PROCESSING;
  await video.save();

  await ActivityLogService.add(videoId, 'Script generation started');
  SocketService.emitCourseVideoProgress(video, VIDEO_STATUS.GENERATING_SCRIPT, 10, 'Generating script...');

  try {
    // Build prompt for LM Studio
    const prompt = buildScriptPrompt(video);

    // Call LM Studio
    const rawScriptData = await LMStudioService.generateScript(prompt);

    // Parse and validate script to ensure scene_meta is generated and scene types are normalized.
    // Seed the template rotation with the video id so different lessons
    // in the same course don't all draw the identical template sequence.
    const scriptData = ScriptParserService.validate(rawScriptData, video.style || 'educational', {
      seed: video._id.toString(),
      disableCaptions: true,
    });

    // Store the generated script
    video.script = scriptData;
    video.status = VIDEO_STATUS.SCRIPT_GENERATED;
    video.scriptStatus = STAGE_STATUS.COMPLETED;
    video.scriptGeneratedAt = new Date();

    // Save script to disk for Remotion pipeline - backend/jobs/ is scratch
    // space, the Mongo doc (saved below) is the durable copy.
    await ScriptParserService.saveScript(video._id.toString(), scriptData);
    await video.save();

    LoggerService.info('Course video script generated', {
      videoId,
      courseId: video.courseId,
      title: video.title,
      scenes: scriptData.scenes.length,
    });

    await ActivityLogService.add(videoId, 'Script generated successfully. Please review and approve.', video.scriptGeneratedAt);
    // Emit socket event
    SocketService.emitCourseVideoScriptReady(video, 'Script generated successfully. Please review and approve.');

    return video;
  } catch (err) {
    if (err.cancelled) {
      await ActivityLogService.add(videoId, 'Script generation stopped by user');
      throw err;
    }

    video.status = VIDEO_STATUS.FAILED;
    video.scriptStatus = STAGE_STATUS.FAILED;
    video.scriptError = { message: err.message, failedAt: new Date() };
    video.error = {
      message: err.message,
      step: 'Script Generation',
      retryCount: (video.error?.retryCount || 0) + 1,
    };
    await video.save();

    await ActivityLogService.add(videoId, `Script generation failed: ${err.message}`);
    SocketService.emitCourseVideoFailed(video, err.message, 'Script Generation');

    throw err;
  }
}

/**
 * Approve a script so generation can continue.
 */
async function approveScript(videoId) {
  const video = await CourseVideo.findById(videoId);
  if (!video) {
    throw { status: 404, message: 'Video not found' };
  }

  if (video.status !== VIDEO_STATUS.SCRIPT_GENERATED && video.status !== VIDEO_STATUS.WAITING_FOR_APPROVAL) {
    throw { status: 400, message: `Script cannot be approved in ${video.status} state` };
  }

  video.approved = true;
  video.approvedAt = new Date();
  video.status = VIDEO_STATUS.APPROVED;
  await video.save();

  await ActivityLogService.add(videoId, 'Script approved');

  LoggerService.info('Course video script approved', {
    videoId,
    courseId: video.courseId,
  });

  return video;
}

/**
 * Approve scripts for a batch of videos in one call. Used by the course
 * detail page's bulk action bar - a single video is just a 1-element
 * videoIds array. Videos not currently eligible (script not generated
 * yet, or already approved) are skipped rather than failing the whole
 * batch, so one stale row can't block approving the rest.
 */
async function bulkApproveScripts(videoIds) {
  const approved = [];
  const skipped = [];

  for (const videoId of videoIds) {
    const video = await CourseVideo.findById(videoId);
    if (!video) {
      skipped.push({ videoId, reason: 'Video not found' });
      continue;
    }
    if (video.status !== VIDEO_STATUS.SCRIPT_GENERATED && video.status !== VIDEO_STATUS.WAITING_FOR_APPROVAL) {
      skipped.push({ videoId, reason: `Cannot approve in ${video.status} state` });
      continue;
    }

    video.approved = true;
    video.approvedAt = new Date();
    video.status = VIDEO_STATUS.APPROVED;
    await video.save();

    await ActivityLogService.add(videoId, 'Script approved');
    SocketService.emitCourseVideoUpdated(video, 'Script approved');
    approved.push(videoId);
  }

  LoggerService.info('Bulk course video script approval', {
    requested: videoIds.length,
    approved: approved.length,
    skipped: skipped.length,
  });

  return { approved, skipped };
}

/**
 * Update the script (editing). `script` must be a { title, description,
 * tags, thumbnailPrompt, scenes } object matching ScriptParserService's
 * output shape - the caller (frontend's raw-JSON editor) parses its text
 * before sending, so this never receives a JSON string.
 */
async function updateScript(videoId, script) {
  if (!script || typeof script !== 'object' || !Array.isArray(script.scenes)) {
    throw { status: 400, message: 'script must be an object with a scenes array' };
  }

  const video = await CourseVideo.findById(videoId);
  if (!video) {
    throw { status: 404, message: 'Video not found' };
  }

  video.script = script;
  video.status = VIDEO_STATUS.WAITING_FOR_APPROVAL;
  // An edit invalidates any prior approval - without this, a script that
  // was approved and then edited ends up with status WAITING_FOR_APPROVAL
  // but approved still true, which videoCanApprove() (frontend) reads as
  // "not eligible to approve" while the status badge still says it's
  // waiting, showing a permanently-disabled Approve button.
  video.approved = false;
  video.approvedAt = null;
  await video.save();

  await ActivityLogService.add(videoId, 'Script edited and saved');

  return video;
}

/**
 * Regenerate the script.
 */
async function regenerateScript(videoId) {
  // Reset script data and re-generate
  const video = await CourseVideo.findById(videoId);
  if (!video) {
    throw { status: 404, message: 'Video not found' };
  }

  video.script = { title: '', description: '', tags: [], thumbnailPrompt: '', scenes: [] };
  video.scriptGeneratedAt = null;
  video.approved = false;
  video.approvedAt = null;
  await video.save();

  await ActivityLogService.add(videoId, 'Script regeneration started');

  return generateScript(videoId);
}

module.exports = {
  buildScriptPrompt,
  buildPromoScriptPrompt,
  generateScript,
  approveScript,
  bulkApproveScripts,
  updateScript,
  regenerateScript,
};
