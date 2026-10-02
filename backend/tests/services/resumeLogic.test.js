jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), success: jest.fn(),
}));

const { getResumeStep, getStepForResume } = require('../../src/services/video/videoService/resumeLogic');
const { JOB_STATUS } = require('../../src/constants');

/**
 * Resume mapping decides how much of a job gets re-done after a crash,
 * restart, or automatic retry. Getting it wrong is expensive in exactly two
 * directions: resuming too late silently skips a step the job never
 * actually finished, and resuming too early re-spends TTS/GPU time on work
 * already persisted. Both are invisible in the UI, which is why they are
 * pinned here.
 */

const jobWith = (overrides = {}) => ({ status: JOB_STATUS.QUEUED, script: null, ...overrides });
const scenes = (total, withAudio) =>
  Array.from({ length: total }, (_, i) => ({
    sceneNumber: i + 1,
    audio: i < withAudio ? { file: `scene-${i + 1}.wav` } : {},
  }));

describe('getResumeStep (resume after a failure)', () => {
  it('sends a script-generation failure back to the very start', () => {
    // SCRIPT_GENERATION produces nothing durable until it completes, so
    // there is no partial work to preserve.
    expect(getResumeStep(jobWith({ error: { step: JOB_STATUS.SCRIPT_GENERATION } })))
      .toMatchObject({ status: JOB_STATUS.QUEUED, progress: 0 });
  });

  it('retries the same step a mid-pipeline failure died on', () => {
    for (const step of [JOB_STATUS.GENERATING_AUDIO, JOB_STATUS.PREPARING_ASSETS, JOB_STATUS.RENDERING, JOB_STATUS.UPLOADING]) {
      expect(getResumeStep(jobWith({ error: { step } })).status).toBe(step);
    }
  });

  it('moves past AUDIO_COMPLETED rather than re-running it', () => {
    // AUDIO_COMPLETED is a marker, not work - resuming *at* it would loop.
    expect(getResumeStep(jobWith({ error: { step: JOB_STATUS.AUDIO_COMPLETED } })))
      .toMatchObject({ status: JOB_STATUS.PREPARING_ASSETS, progress: 60 });
  });

  it('keeps progress and currentStep consistent with the resumed status', () => {
    const result = getResumeStep(jobWith({ error: { step: JOB_STATUS.RENDERING } }));
    expect(result.currentStep).toBe(result.status);
    expect(result.progress).toBe(80);
  });

  describe('fallback when the failed step was never recorded', () => {
    it('resumes at PREPARING_ASSETS when every scene already has audio', () => {
      const job = jobWith({ script: { scenes: scenes(3, 3) } });
      expect(getResumeStep(job)).toMatchObject({ status: JOB_STATUS.PREPARING_ASSETS, progress: 60 });
    });

    it('resumes at GENERATING_AUDIO when audio is only partly done', () => {
      const job = jobWith({ script: { scenes: scenes(3, 1) } });
      expect(getResumeStep(job)).toMatchObject({ status: JOB_STATUS.GENERATING_AUDIO, progress: 40 });
    });

    it('lands back on the approval gate for a script with no audio at all', () => {
      // Not GENERATING_AUDIO: a script-having job with zero audio has only
      // ever stopped at the manual approval pause, and skipping that gate
      // would spend TTS on an unapproved script.
      const job = jobWith({ script: { scenes: scenes(3, 0) } });
      expect(getResumeStep(job)).toMatchObject({ status: JOB_STATUS.AWAITING_APPROVAL, progress: 20 });
    });

    it('starts over for a job with no script', () => {
      expect(getResumeStep(jobWith())).toMatchObject({ status: JOB_STATUS.QUEUED, progress: 0 });
    });

    it('treats an empty scenes array as no script', () => {
      expect(getResumeStep(jobWith({ script: { scenes: [] } })))
        .toMatchObject({ status: JOB_STATUS.QUEUED, progress: 0 });
    });
  });
});

describe('getStepForResume (unstick a job sitting in a processing state)', () => {
  it('restarts script generation from QUEUED', () => {
    expect(getStepForResume(jobWith({ status: JOB_STATUS.SCRIPT_GENERATION })))
      .toMatchObject({ status: JOB_STATUS.QUEUED, progress: 0 });
  });

  it('holds AUDIO_COMPLETED in place rather than advancing it', () => {
    // Differs from getResumeStep on purpose: nothing *failed* here, so the
    // job should re-enter the pipeline exactly where it stalled.
    expect(getStepForResume(jobWith({ status: JOB_STATUS.AUDIO_COMPLETED })))
      .toMatchObject({ status: JOB_STATUS.AUDIO_COMPLETED, progress: 50 });
  });

  it('preserves an approval pause instead of skipping it', () => {
    expect(getStepForResume(jobWith({ status: JOB_STATUS.AWAITING_APPROVAL })))
      .toMatchObject({ status: JOB_STATUS.AWAITING_APPROVAL, progress: 20 });
  });

  it('falls back to job state for an unmapped status', () => {
    const job = jobWith({ status: JOB_STATUS.RETRY_SCHEDULED, script: { scenes: scenes(2, 2) } });
    expect(getStepForResume(job)).toMatchObject({ status: JOB_STATUS.PREPARING_ASSETS });
  });
});
