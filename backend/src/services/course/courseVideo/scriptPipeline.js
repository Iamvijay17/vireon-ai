const CourseVideo = require('../../../models/CourseVideo');
const LoggerService = require('../../common/LoggerService');
const SocketService = require('../../common/SocketService');
const ActivityLogService = require('../../common/ActivityLogService');
const AIDirectorService = require('../../director/AIDirectorService');
const { planScriptBudget } = require('../../director/scriptBudget');
const LocalAIService = require('../../localAI');
const Course = require('../../../models/Course');
const { bailIfCancelled } = require('./shared');
const ScriptParserService = require('../../video/ScriptParserService');
const { VIDEO_STATUS, STAGE_STATUS, VIDEO_TYPES } = require('../../../constants');
const { classifyError } = require('../../../utils/errorMessages');
const { NotFoundError, ValidationError } = require('../../../utils/errors');

/**
 * What the Director needs to write one course lesson, or the course's
 * promotional trailer (the isPromo lesson auto-generated alongside the
 * curriculum - a short sales pitch for the whole course, not a teaching
 * lesson). Returns the video type the shared prompt templates know plus the
 * lesson-specific rules those templates can't express, passed to the Director
 * as `extraInstructions`.
 */
function buildDirectorBrief(video) {
  const requested = String(video.style || 'educational');
  // Course videos are never podcasts (that type needs host/guest voices), and the
  // trailer is marketing copy whatever style the lessons use.
  const videoType = video.isPromo
    ? 'marketing'
    : (VIDEO_TYPES.includes(requested) && requested !== 'podcast' ? requested : 'educational');

  const rules = video.isPromo
    ? [
        `This is a PROMOTIONAL TRAILER for the whole course "${video.title}", not a teaching lesson - sell the course, do not teach its content. Hook the viewer, say who the course is for and what they will be able to do after finishing it. Do not teach any technical concept in depth.`,
        'Energetic, confident tone - this is marketing copy, not a lecture.',
        'End with a strong, direct call to action to enroll in the course.',
      ]
    : [
        'This is ONE lesson video from a larger course, not a full-course summary. Cover ONLY the specific topic given - do not introduce, preview, or teach content that belongs to other lessons.',
        'Make it beginner-friendly with concrete examples, and end with a call to action.',
      ];
  if (video.additionalInstructions) rules.push(`Additional: ${video.additionalInstructions}`);

  return { videoType, extraInstructions: rules.map((rule) => `- ${rule}`).join('\n') };
}

/**
 * Generate a lesson's script through the AI Director - the same story plan,
 * chunked scene writing and storyboard pass standalone videos get.
 */
async function generateScript(videoId) {
  const video = await CourseVideo.findById(videoId);
  if (!video) {
    throw new NotFoundError('Video not found');
  }

  // Update status
  video.status = VIDEO_STATUS.GENERATING_SCRIPT;
  video.scriptStatus = STAGE_STATUS.PROCESSING;
  await video.save();

  await ActivityLogService.add(videoId, 'Script generation started');
  SocketService.emitCourseVideoProgress(video, VIDEO_STATUS.GENERATING_SCRIPT, 10, 'Generating script...');

  try {
    const course = await Course.findById(video.courseId).select('language').lean();
    const { videoType, extraInstructions } = buildDirectorBrief(video);
    const budget = planScriptBudget({ type: videoType, durationMinutes: video.duration });

    // GPU-sequential, same as the standalone video pipeline's scriptStep.js. The
    // lesson keeps its curriculum title (titleOverride) rather than a
    // model-invented one.
    const rawScriptData = await LocalAIService.gpu.withGPU('llm', () =>
      AIDirectorService.direct({
        videoType,
        topic: video.topic,
        language: course?.language || 'english',
        ...budget,
        extraInstructions,
        titleOverride: video.title,
        jobId: String(video._id),
        checkCancelled: () => bailIfCancelled(videoId),
      })
    );

    // Parse and validate script to ensure scene_meta is generated and scene types are normalized.
    // Seed the template rotation with the video id so different lessons
    // in the same course don't all draw the identical template sequence.
    const scriptData = ScriptParserService.validate(rawScriptData, videoType, {
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

    const { friendly, detail } = classifyError(err, 'Script Generation');

    video.status = VIDEO_STATUS.FAILED;
    video.scriptStatus = STAGE_STATUS.FAILED;
    video.scriptError = { message: friendly, failedAt: new Date() };
    video.error = {
      message: friendly,
      detail,
      step: 'Script Generation',
      retryCount: (video.error?.retryCount || 0) + 1,
    };
    await video.save();

    await ActivityLogService.add(videoId, `Script generation failed: ${friendly}`);
    SocketService.emitCourseVideoFailed(video, friendly, 'Script Generation');

    throw err;
  }
}

/**
 * Approve a script so generation can continue.
 */
async function approveScript(videoId) {
  const video = await CourseVideo.findById(videoId);
  if (!video) {
    throw new NotFoundError('Video not found');
  }

  if (video.status !== VIDEO_STATUS.SCRIPT_GENERATED && video.status !== VIDEO_STATUS.WAITING_FOR_APPROVAL) {
    throw new ValidationError(`Script cannot be approved in ${video.status} state`);
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
    throw new ValidationError('script must be an object with a scenes array');
  }

  const video = await CourseVideo.findById(videoId);
  if (!video) {
    throw new NotFoundError('Video not found');
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
    throw new NotFoundError('Video not found');
  }

  video.script = { title: '', description: '', tags: [], thumbnailPrompt: '', brief: null, scenes: [] };
  video.scriptGeneratedAt = null;
  video.approved = false;
  video.approvedAt = null;
  await video.save();

  await ActivityLogService.add(videoId, 'Script regeneration started');

  return generateScript(videoId);
}

module.exports = {
  buildDirectorBrief,
  generateScript,
  approveScript,
  bulkApproveScripts,
  updateScript,
  regenerateScript,
};
