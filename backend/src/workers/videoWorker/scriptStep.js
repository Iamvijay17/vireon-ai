const LoggerService = require('../../services/common/LoggerService');
const ActivityLogService = require('../../services/common/ActivityLogService');
const AIDirectorService = require('../../services/director/AIDirectorService');
const { planScriptBudget } = require('../../services/director/scriptBudget');
const LocalAIService = require('../../services/localAI');
const ScriptParserService = require('../../services/video/ScriptParserService');
const VideoService = require('../../services/video/VideoService');
const SocketService = require('../../services/common/SocketService');
const { JOB_STATUS } = require('../../constants');
const { bailIfCancelled, renderConfigFor } = require('./shared');
const { checkSceneGraph } = require('../../services/video/sceneGraphCheck');

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

  const stageStartedAt = Date.now();
  ctx.currentStep = JOB_STATUS.SCRIPT_GENERATION;
  await VideoService.updateStatus(jobId, JOB_STATUS.SCRIPT_GENERATION, { progress: 10 });
  SocketService.emitJobProgress({ _id: jobId, progress: 10, status: JOB_STATUS.SCRIPT_GENERATION, currentStep: JOB_STATUS.SCRIPT_GENERATION, currentScene: 0 });

  LoggerService.info('[LLM] Script generation started', { stage: 'script', topic: videoJob.topic, type: videoJob.type });
  await ActivityLogService.add(jobId, 'Script generation started');

  // Scene count and word budget from the requested duration (see
  // director/scriptBudget.js for the pacing and undershoot-buffer reasoning).
  const { durationMinutes, sceneCount, wordCount, wordsPerScene } = planScriptBudget({
    type: videoJob.type,
    durationMinutes: videoJob.duration || 5,
  });

  await bailIfCancelled(jobId);

  // Call Ollama via the AI Director pipeline: it plans the narrative
  // arc/style guide first (StoryStructureService), then writes scene
  // narration anchored to that plan in bounded chunks (ScenePlanningService)
  // - each chunk a small independent call the model can actually complete,
  // since scene count scales directly with requested duration and a long
  // video can ask for far more scenes than a single local-model response
  // reliably finishes generating before it stops mid-JSON. Short scripts
  // still resolve in one call.
  // GPU-sequential: this dev machine's 6GB card can't hold Ollama and
  // Qwen3-TTS/ComfyUI loaded at once, so claim the GPU for Ollama here
  // and hold it across every call the Director makes, releasing only once
  // the whole script is generated - the audio step right after this one
  // will then need to wait/evict to get its turn.
  const rawScript = await LocalAIService.gpu.withGPU('llm', () =>
    AIDirectorService.direct({
      videoType: videoJob.type,
      topic: videoJob.topic,
      language: videoJob.language,
      sceneCount,
      wordCount,
      wordsPerScene,
      hostName: videoJob.hostName,
      guestName: videoJob.guestName,
      hostVoice: videoJob.hostVoice,
      guestVoice: videoJob.guestVoice,
      durationMinutes,
      jobId,
      checkCancelled: () => bailIfCancelled(jobId),
      onProgress: async (chunkIndex, chunkCount, scenesGenerated) => {
        if (chunkCount <= 1) return;
        const progress = 10 + Math.round((chunkIndex / chunkCount) * 9); // 10-19%
        await ActivityLogService.add(jobId, `Script generation: ${scenesGenerated} scenes written (chunk ${chunkIndex}/${chunkCount})`);
        SocketService.emitJobProgress({ _id: jobId, progress, status: JOB_STATUS.SCRIPT_GENERATION, currentStep: JOB_STATUS.SCRIPT_GENERATION, currentScene: scenesGenerated });
      },
    })
  );

  const validatedScript = ScriptParserService.validate(rawScript, videoJob.type, {
    hostVoice: videoJob.hostVoice,
    guestVoice: videoJob.guestVoice,
    hostName: videoJob.hostName,
    guestName: videoJob.guestName,
    seed: jobId,
  });

  // Earliest point a template/props mismatch can be caught - before the
  // script is persisted and long before any TTS or GPU time is spent on
  // it. In authoritative mode this throws and fails the job here.
  await checkSceneGraph({
    jobId,
    script: validatedScript,
    jobConfig: renderConfigFor(videoJob),
    stage: 'script',
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

  LoggerService.success('[LLM] Script generation completed', {
    stage: 'script',
    title: validatedScript.title,
    scenes: validatedScript.scenes.length,
    durationMs: Date.now() - stageStartedAt,
  });

  // A stop request that arrived while the Ollama call was in flight
  // wouldn't have been caught by the checkpoint before that call - check
  // again now, before writing AWAITING_APPROVAL, so a cancellation can't
  // get silently overwritten by this step's own success path.
  await bailIfCancelled(jobId);

  // Auto-approve (fast generation only): no review pause - fall through to
  // the audio step, exactly as if the user had clicked Approve straight away.
  if (videoJob.fastGeneration && videoJob.autoApprove) {
    LoggerService.info('Script auto-approved - continuing to audio', { jobId });
    await ActivityLogService.add(jobId, 'Script generated and auto-approved.');
    return null;
  }

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
