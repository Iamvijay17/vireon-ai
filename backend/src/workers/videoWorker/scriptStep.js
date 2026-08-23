const LoggerService = require('../../services/common/LoggerService');
const ActivityLogService = require('../../services/common/ActivityLogService');
const ChunkedScriptService = require('../../services/video/ChunkedScriptService');
const ScriptParserService = require('../../services/video/ScriptParserService');
const VideoService = require('../../services/video/VideoService');
const SocketService = require('../../services/common/SocketService');
const { JOB_STATUS } = require('../../constants');
const { bailIfCancelled } = require('./shared');

/**
 * Step 1-3: script generation, only if starting fresh or restarting from
 * QUEUED - otherwise the existing script is reused untouched. Always pauses
 * the pipeline for manual approval when it does generate (returns the
 * BullMQ result the caller should return immediately); returns null when
 * skipped, so the caller keeps using videoJob.script and falls through to
 * the audio step.
 */
async function run(jobId, videoJob, currentStatus, ctx) {
  const script = videoJob.script;
  const needsScriptGeneration = !script?.scenes?.length || currentStatus === JOB_STATUS.QUEUED;

  if (!needsScriptGeneration) {
    LoggerService.info('Using existing script (skipping script generation)', {
      title: script.title,
      scenes: script.scenes.length,
      currentStatus,
    });
    return null;
  }

  ctx.currentStep = JOB_STATUS.SCRIPT_GENERATION;
  await VideoService.updateStatus(jobId, JOB_STATUS.SCRIPT_GENERATION, { progress: 10 });
  SocketService.emitJobProgress({ _id: jobId, progress: 10, status: JOB_STATUS.SCRIPT_GENERATION, currentStep: JOB_STATUS.SCRIPT_GENERATION, currentScene: 0 });

  LoggerService.info('Starting script generation', { topic: videoJob.topic, type: videoJob.type });
  await ActivityLogService.add(jobId, 'Script generation started');

  // Derive an exact scene count from the requested duration.
  const durationMinutes = videoJob.duration || 5;
  // Word budget for LM Studio, matching CourseVideoService's ~130
  // words/min spoken pace. Without a length target the model writes a
  // fixed-length script regardless of scene count, so total runtime
  // doesn't scale with the requested duration.
  //
  // Measured across real runs, the model consistently UNDERSHOOTS a
  // soft "about N words" instruction rather than hitting it - a
  // "small scenes, more of them" podcast script came in at ~78% of
  // its target, an aggregate-target podcast script at ~67%, and an
  // educational script at ~55%. A flat 1.5x buffer on the target fed
  // into the prompt compensates for the typical case without being
  // so aggressive it inflates the token/context budget (which scales
  // off this same number) past what's actually needed.
  //
  // Scene COUNT is derived from the unbuffered word count so it stays
  // anchored to the original ratios (podcast: ~20 scenes per 3min;
  // others: ~2 scenes/min) - only wordsPerScene picks up the buffer.
  // Buffering scene count too would have compounded with podcast's
  // "more, shorter scenes" mechanism (a 30min podcast would ask for
  // ~293 turns instead of ~195, blowing past the token budget again).
  const WORD_COUNT_UNDERSHOOT_BUFFER = 1.5;
  const baseWordCount = Math.round(durationMinutes * 130);
  const wordCount = Math.round(baseWordCount * WORD_COUNT_UNDERSHOOT_BUFFER);

  let sceneCount, wordsPerScene;
  if (videoJob.type === 'podcast') {
    // Podcast turns are cheap to add (every turn reuses the same
    // shared cover image - no extra image-gen cost per turn) and read
    // more naturally as many short back-and-forth exchanges than a
    // few long monologues. Scale duration by adding MORE turns at a
    // ~20 words/turn baseline (matching real measured TTS timing);
    // the buffer nudges that up moderately per turn rather than
    // adding even more turns.
    sceneCount = Math.max(3, Math.round(baseWordCount / 20));
    wordsPerScene = Math.round(wordCount / sceneCount);
  } else {
    // Other types render a unique background/image per scene, so
    // scene count stays modest (~2/min, matching CourseVideoService's
    // heuristic) and duration is scaled via longer narration per
    // scene instead, with a floor of 3 for an intro/content/summary
    // shape.
    sceneCount = Math.max(3, Math.round(durationMinutes * 2));
    wordsPerScene = Math.round(wordCount / sceneCount);
  }

  await bailIfCancelled(jobId);

  // Call LM Studio. Scene count scales directly with requested duration
  // for every video type, so a long video can ask for far more scenes
  // than a single local-model response reliably finishes generating
  // before it stops mid-JSON. Generate in bounded chunks instead (see
  // ChunkedScriptService) - each a small independent call the model can
  // actually complete; short scripts still resolve in one call.
  const rawScript = await ChunkedScriptService.generate({
    videoType: videoJob.type,
    topic: videoJob.topic,
    language: videoJob.language,
    sceneCount,
    wordCount,
    wordsPerScene,
    hostName: videoJob.hostName,
    guestName: videoJob.guestName,
    jobId,
    checkCancelled: () => bailIfCancelled(jobId),
    onProgress: async (chunkIndex, chunkCount, scenesGenerated) => {
      if (chunkCount <= 1) return;
      const progress = 10 + Math.round((chunkIndex / chunkCount) * 9); // 10-19%
      await ActivityLogService.add(jobId, `Script generation: ${scenesGenerated} scenes written (chunk ${chunkIndex}/${chunkCount})`);
      SocketService.emitJobProgress({ _id: jobId, progress, status: JOB_STATUS.SCRIPT_GENERATION, currentStep: JOB_STATUS.SCRIPT_GENERATION, currentScene: scenesGenerated });
    },
  });

  const validatedScript = ScriptParserService.validate(rawScript, videoJob.type, {
    hostVoice: videoJob.hostVoice,
    guestVoice: videoJob.guestVoice,
    hostName: videoJob.hostName,
    guestName: videoJob.guestName,
    seed: jobId,
  });

  // Save script to disk for the Remotion pipeline (backend/jobs/ is
  // scratch space). The script content itself is persisted via
  // updateScript below - not just held in a local var - since this
  // pipeline pauses for manual approval right after this step,
  // resuming in a later worker invocation that won't have this
  // variable.
  await ScriptParserService.saveScript(jobId, validatedScript);

  // Update job with script
  await VideoService.updateScript(jobId, validatedScript);

  LoggerService.success('Script generated and saved', {
    title: validatedScript.title,
    scenes: validatedScript.scenes.length,
  });

  // A stop request that arrived while the LM Studio call was in flight
  // wouldn't have been caught by the checkpoint before that call - check
  // again now, before writing AWAITING_APPROVAL, so a cancellation can't
  // get silently overwritten by this step's own success path.
  await bailIfCancelled(jobId);

  // Pause here: wait for explicit manual approval before spending
  // TTS/image/render resources on this script. The user reviews/edits
  // it (and can set manual scene image URLs) in the Studio Editor, then
  // POST /:id/approve re-enqueues this same job - at that point the
  // caller's needsScriptGeneration check will be false (script exists,
  // status isn't QUEUED) so it resumes straight into the audio step.
  await VideoService.updateStatus(jobId, JOB_STATUS.AWAITING_APPROVAL, { progress: 20 });
  SocketService.emitJobProgress({ _id: jobId, progress: 20, status: JOB_STATUS.AWAITING_APPROVAL, currentStep: JOB_STATUS.AWAITING_APPROVAL, currentScene: 0 });

  LoggerService.info('Script awaiting manual approval - pausing pipeline', { jobId });
  await ActivityLogService.add(jobId, 'Script generated successfully. Please review and approve.');

  return { success: true, jobId, awaitingApproval: true };
}

module.exports = { run };
