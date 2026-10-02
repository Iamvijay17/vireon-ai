const LoggerService = require('../../common/LoggerService');
const { JOB_STATUS } = require('../../../constants');

/**
 * Map step to resume status for jobs that are stuck.
 * When a job is stuck in a processing state, we resume from the next step.
 */
function getStepForResume(job) {
  const currentStep = job.status;

  // Map current step to the next step to resume from
  const stepStatusMap = {
    [JOB_STATUS.SCRIPT_GENERATION]: { status: JOB_STATUS.QUEUED, progress: 0 },
    [JOB_STATUS.SCRIPT_COMPLETED]: { status: JOB_STATUS.SCRIPT_COMPLETED, progress: 20 },
    [JOB_STATUS.AWAITING_APPROVAL]: { status: JOB_STATUS.AWAITING_APPROVAL, progress: 20 },
    [JOB_STATUS.GENERATING_AUDIO]: { status: JOB_STATUS.GENERATING_AUDIO, progress: 40 },
    [JOB_STATUS.AUDIO_COMPLETED]: { status: JOB_STATUS.AUDIO_COMPLETED, progress: 50 },
    [JOB_STATUS.PREPARING_ASSETS]: { status: JOB_STATUS.PREPARING_ASSETS, progress: 60 },
    [JOB_STATUS.RENDERING]: { status: JOB_STATUS.RENDERING, progress: 80 },
    [JOB_STATUS.UPLOADING]: { status: JOB_STATUS.UPLOADING, progress: 90 },
  };

  // If we have specific current step info, use it
  if (stepStatusMap[currentStep]) {
    LoggerService.info('Resuming from current step', {
      currentStep,
      resumeStatus: stepStatusMap[currentStep].status,
    });

    return {
      status: stepStatusMap[currentStep].status,
      progress: stepStatusMap[currentStep].progress,
      currentStep: stepStatusMap[currentStep].status,
    };
  }

  // Fallback: Determine based on job state (script and audio files). A job
  // with scenes but none awaiting/past audio yet is presumed still awaiting
  // manual approval, since that's the only place a script-having job stops
  // this early - resuming should land back on the approval gate, not skip it.
  if (job.script?.scenes?.length > 0) {
    const scenesWithAudio = job.script.scenes.filter(s => s.audio?.file);

    if (scenesWithAudio.length === job.script.scenes.length) {
      return {
        status: JOB_STATUS.PREPARING_ASSETS,
        progress: 60,
        currentStep: JOB_STATUS.PREPARING_ASSETS,
      };
    }

    if (scenesWithAudio.length > 0) {
      return {
        status: JOB_STATUS.GENERATING_AUDIO,
        progress: 40,
        currentStep: JOB_STATUS.GENERATING_AUDIO,
      };
    }

    return {
      status: JOB_STATUS.AWAITING_APPROVAL,
      progress: 20,
      currentStep: JOB_STATUS.AWAITING_APPROVAL,
    };
  }

  return {
    status: JOB_STATUS.QUEUED,
    progress: 0,
    currentStep: JOB_STATUS.QUEUED,
  };
}

/**
 * Map error step to resume status.
 * When a step fails, we resume from the beginning of that step.
 */
function getResumeStep(job) {
  const failedStep = job.error?.step;

  // Map error step to resume status
  // When a step fails, we resume from that same step to retry it
  const stepStatusMap = {
    [JOB_STATUS.SCRIPT_GENERATION]: { status: JOB_STATUS.QUEUED, progress: 0 },
    [JOB_STATUS.SCRIPT_COMPLETED]: { status: JOB_STATUS.QUEUED, progress: 0 },
    [JOB_STATUS.AWAITING_APPROVAL]: { status: JOB_STATUS.AWAITING_APPROVAL, progress: 20 },
    [JOB_STATUS.GENERATING_AUDIO]: { status: JOB_STATUS.GENERATING_AUDIO, progress: 40 },
    [JOB_STATUS.AUDIO_COMPLETED]: { status: JOB_STATUS.PREPARING_ASSETS, progress: 60 },
    [JOB_STATUS.PREPARING_ASSETS]: { status: JOB_STATUS.PREPARING_ASSETS, progress: 60 },
    [JOB_STATUS.RENDERING]: { status: JOB_STATUS.RENDERING, progress: 80 },
    [JOB_STATUS.UPLOADING]: { status: JOB_STATUS.UPLOADING, progress: 90 },
  };

  // If we have specific error step info, use it
  if (failedStep && stepStatusMap[failedStep]) {
    LoggerService.info('Resuming from failed step', {
      failedStep,
      resumeStatus: stepStatusMap[failedStep].status,
    });

    return {
      status: stepStatusMap[failedStep].status,
      progress: stepStatusMap[failedStep].progress,
      currentStep: stepStatusMap[failedStep].status,
    };
  }

  // Fallback: Determine based on job state (script and audio files). A job
  // with scenes but no audio yet is presumed still awaiting manual
  // approval, since that's the only place a script-having job stops this
  // early - resuming should land back on the approval gate, not skip it.
  if (job.script?.scenes?.length > 0) {
    const scenesWithAudio = job.script.scenes.filter(s => s.audio?.file);

    if (scenesWithAudio.length === job.script.scenes.length) {
      return {
        status: JOB_STATUS.PREPARING_ASSETS,
        progress: 60,
        currentStep: JOB_STATUS.PREPARING_ASSETS,
      };
    }

    if (scenesWithAudio.length > 0) {
      return {
        status: JOB_STATUS.GENERATING_AUDIO,
        progress: 40,
        currentStep: JOB_STATUS.GENERATING_AUDIO,
      };
    }

    return {
      status: JOB_STATUS.AWAITING_APPROVAL,
      progress: 20,
      currentStep: JOB_STATUS.AWAITING_APPROVAL,
    };
  }

  return {
    status: JOB_STATUS.QUEUED,
    progress: 0,
    currentStep: JOB_STATUS.QUEUED,
  };
}

module.exports = { getStepForResume, getResumeStep };
