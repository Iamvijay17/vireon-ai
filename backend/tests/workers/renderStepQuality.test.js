/**
 * The render step runs the output quality gate after every render - freshly made
 * or reused from an earlier run - and before it returns, so the upload stage
 * (which marks the job complete) cannot start for a video that failed it.
 */
jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn(), success: jest.fn(), border: jest.fn(),
}));
jest.mock('../../src/services/common/ActivityLogService', () => ({ add: jest.fn().mockResolvedValue() }));
jest.mock('../../src/services/common/SocketService', () => ({ emitJobProgress: jest.fn() }));
jest.mock('../../src/services/video/VideoService', () => ({
  updateStatus: jest.fn().mockResolvedValue({}),
  saveQualityReport: jest.fn().mockResolvedValue({}),
}));
jest.mock('../../src/services/video/RemotionService', () => ({
  validateAssets: jest.fn().mockResolvedValue(),
  renderCurrency: jest.fn(),
  renderVideo: jest.fn().mockResolvedValue({ video: 'render/video.mp4' }),
}));
jest.mock('../../src/services/localAI/remotionStatus', () => ({ begin: jest.fn(), end: jest.fn() }));
jest.mock('../../src/services/qc/runLayoutQc', () => ({ runLayoutQc: jest.fn().mockResolvedValue(null) }));
jest.mock('../../src/services/qc/video/qualityGate', () => ({ runVideoQualityGate: jest.fn() }));
jest.mock('../../src/services/cache/CacheLedger', () => ({ hit: jest.fn(), miss: jest.fn(), generated: jest.fn() }));
jest.mock('../../src/services/audio/pipeline/speech/events', () => ({
  SPEECH_EVENTS: { RENDER_START: 'a', RENDER_COMPLETE: 'b' },
  emitSpeechStage: jest.fn(),
}));

const RemotionService = require('../../src/services/video/RemotionService');
const VideoService = require('../../src/services/video/VideoService');
const { runVideoQualityGate } = require('../../src/services/qc/video/qualityGate');
const { QualityCheckError } = require('../../src/services/qc/video/QualityCheckError');
const { buildReport } = require('../../src/services/qc/video/report');
const { JobCancelledError } = require('../../src/workers/videoWorker/shared');
const renderStep = require('../../src/workers/videoWorker/renderStep');

const script = { scenes: [{ sceneNumber: 1 }, { sceneNumber: 2 }] };
const assets = { scenes: [], resolution: '1920x1080', quality: 'standard' };
const ctx = () => ({ currentStep: null, signal: new AbortController().signal });

beforeEach(() => {
  jest.clearAllMocks();
  RemotionService.renderCurrency.mockResolvedValue({ current: false, reason: 'no-previous-render' });
  runVideoQualityGate.mockResolvedValue({ status: 'passed' });
});

describe('renderStep.render: output quality gate', () => {
  it('checks the freshly rendered video against the script, after the render', async () => {
    const context = ctx();
    await renderStep.render('job-1', assets, context, script);

    expect(RemotionService.renderVideo).toHaveBeenCalled();
    expect(runVideoQualityGate).toHaveBeenCalledTimes(1);
    expect(runVideoQualityGate).toHaveBeenCalledWith(expect.objectContaining({
      id: 'job-1', scenes: script.scenes, resolution: '1920x1080', signal: context.signal,
    }));
    expect(RemotionService.renderVideo.mock.invocationCallOrder[0]).toBeLessThan(runVideoQualityGate.mock.invocationCallOrder[0]);
    expect(context.currentStep).toBe('Quality check');
  });

  it('also checks a reused render - a file that survived a crash is exactly the one worth re-checking', async () => {
    RemotionService.renderCurrency.mockResolvedValue({ current: true, reason: null });
    await renderStep.render('job-1', assets, ctx(), script);

    expect(RemotionService.renderVideo).not.toHaveBeenCalled();
    expect(runVideoQualityGate).toHaveBeenCalledTimes(1);
  });

  it('saves the report on the job', async () => {
    await renderStep.render('job-1', assets, ctx(), script);
    const { save } = runVideoQualityGate.mock.calls[0][0];
    const report = { status: 'passed' };
    await save(report);
    expect(VideoService.saveQualityReport).toHaveBeenCalledWith('job-1', report);
  });

  it('propagates a failed gate so the stage fails and upload never starts', async () => {
    const failure = new QualityCheckError(buildReport({ issues: [{ check: 'video-file', severity: 'error', message: 'The rendered video file is missing' }] }), { renderFault: true });
    runVideoQualityGate.mockRejectedValue(failure);
    await expect(renderStep.render('job-1', assets, ctx(), script)).rejects.toBe(failure);
  });

  it('turns an abort during the check into a job cancellation', async () => {
    runVideoQualityGate.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    await expect(renderStep.render('job-1', assets, ctx(), script)).rejects.toBeInstanceOf(JobCancelledError);
  });
});
