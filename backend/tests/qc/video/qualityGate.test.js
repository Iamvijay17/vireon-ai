jest.mock('../../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), success: jest.fn(), debug: jest.fn(),
}));
jest.mock('../../../src/services/common/ActivityLogService', () => ({ add: jest.fn(async () => {}) }));
jest.mock('../../../src/services/common/JobEventService', () => ({ append: jest.fn(async () => ({})) }));
jest.mock('../../../src/services/qc/video/VideoQualityService', () => ({ run: jest.fn() }));

const mockPaths = { jobDir: '' };
jest.mock('../../../src/services/storage/StorageService', () => ({
  getJobDir: () => mockPaths.jobDir,
  getRenderDir: () => require('path').join(mockPaths.jobDir, 'render'),
}));

const fs = require('fs');
const os = require('os');
const path = require('path');
const config = require('../../../src/config');
const ActivityLogService = require('../../../src/services/common/ActivityLogService');
const JobEventService = require('../../../src/services/common/JobEventService');
const VideoQualityService = require('../../../src/services/qc/video/VideoQualityService');
const { buildReport } = require('../../../src/services/qc/video/report');
const { QualityCheckError } = require('../../../src/services/qc/video/QualityCheckError');
const { runVideoQualityGate } = require('../../../src/services/qc/video/qualityGate');
const { toStructuredError, CODES } = require('../../../src/services/pipeline/pipelineErrors');
const { decideRetry } = require('../../../src/services/common/retryPolicy');

const err = (check, message) => ({ check, severity: 'error', message });
const warning = (check, message) => ({ check, severity: 'warn', message });
const passing = () => buildReport({ issues: [] });
const failingContent = () => buildReport({ issues: [err('audio-silence', 'Scene 2 has narration but its audio is silent')] });
const failingFile = () => buildReport({ issues: [err('video-decodable', 'The video file cannot be read')] });

const gate = (over = {}) => runVideoQualityGate({ id: 'job1', scenes: [{ sceneNumber: 1 }], resolution: '320x180', deps: { objectExists: async () => true }, ...over });

const original = config.qc.video.mode;
const setMode = (mode) => { config.qc.video.mode = mode; };

beforeEach(() => {
  mockPaths.jobDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vireon-gate-'));
  fs.mkdirSync(path.join(mockPaths.jobDir, 'render'));
  fs.writeFileSync(path.join(mockPaths.jobDir, 'render', 'video.mp4'), 'x');
  fs.writeFileSync(path.join(mockPaths.jobDir, '.render-fingerprint'), 'abc');
  VideoQualityService.run.mockResolvedValue(passing());
  setMode('enforce');
});

afterEach(() => {
  fs.rmSync(mockPaths.jobDir, { recursive: true, force: true });
  setMode(original);
});

describe('runVideoQualityGate', () => {
  it('returns the report when the video passes, and records it everywhere', async () => {
    const save = jest.fn(async () => {});
    const report = await gate({ save });

    expect(report.status).toBe('passed');
    expect(save).toHaveBeenCalledWith(report);
    expect(JobEventService.append).toHaveBeenCalledWith('job1', 'qualityReport', expect.objectContaining({ status: 'passed', errors: 0 }));
    expect(ActivityLogService.add).toHaveBeenCalledWith('job1', 'Quality check passed.');
  });

  it('points the checker at the render output for the job', async () => {
    await gate();
    expect(VideoQualityService.run).toHaveBeenCalledWith(expect.objectContaining({
      jobId: 'job1', videoPath: path.join(mockPaths.jobDir, 'render', 'video.mp4'), resolution: '320x180',
    }));
  });

  it('passes with warnings without blocking, and logs them', async () => {
    VideoQualityService.run.mockResolvedValue(buildReport({ issues: [warning('captions', 'Scene 3 has no word timing')] }));
    const report = await gate();
    expect(report.status).toBe('passed-with-warnings');
    expect(ActivityLogService.add).toHaveBeenCalledWith('job1', expect.stringMatching(/passed with warnings.*Scene 3 has no word timing/));
  });

  describe('enforce mode (default): the job cannot complete on a failed check', () => {
    it('throws QualityCheckError carrying the report', async () => {
      VideoQualityService.run.mockResolvedValue(failingContent());
      const save = jest.fn(async () => {});
      const thrown = await gate({ save }).catch((e) => e);

      expect(thrown).toBeInstanceOf(QualityCheckError);
      expect(thrown.message).toMatch(/Quality check failed: Scene 2 has narration but its audio is silent/);
      expect(thrown.report.passed).toBe(false);
      expect(save).toHaveBeenCalled(); // the report is saved BEFORE the job fails, so the UI can show why
      expect(ActivityLogService.add).toHaveBeenCalledWith('job1', expect.stringMatching(/Quality check failed/));
    });

    it('a content fault is permanent: re-rendering would reproduce it, so the job fails without retrying', async () => {
      VideoQualityService.run.mockResolvedValue(failingContent());
      const thrown = await gate().catch((e) => e);
      expect(thrown.renderFault).toBe(false);
      expect(thrown.permanent).toBe(true);

      const structured = toStructuredError(thrown, { stage: 'render', attempt: 1 });
      expect(structured).toMatchObject({ code: CODES.QUALITY_FAILED, retryable: false });
      expect(decideRetry({ attempt: 1, maxRetries: 3, eligible: structured.retryable }).shouldRetry).toBe(false);
      // the render is kept: nothing about the file was wrong
      expect(fs.existsSync(path.join(mockPaths.jobDir, 'render', 'video.mp4'))).toBe(true);
    });

    it('a file fault is retryable AND discards the render so the retry really re-renders', async () => {
      VideoQualityService.run.mockResolvedValue(failingFile());
      const thrown = await gate().catch((e) => e);

      expect(thrown.renderFault).toBe(true);
      expect(thrown.permanent).toBe(false);
      const structured = toStructuredError(thrown, { stage: 'render', attempt: 1 });
      expect(structured).toMatchObject({ code: CODES.QUALITY_FAILED, retryable: true, stage: 'render' });
      expect(decideRetry({ attempt: 1, maxRetries: 3, eligible: structured.retryable }).shouldRetry).toBe(true);

      // Without this, isRenderCurrent() matches the broken file's fingerprint and the "retry" re-checks the same file.
      expect(fs.existsSync(path.join(mockPaths.jobDir, '.render-fingerprint'))).toBe(false);
      expect(fs.existsSync(path.join(mockPaths.jobDir, 'render'))).toBe(false);
    });

    it('the user-facing message is the QC finding, not a generic "failed" wrapper', async () => {
      VideoQualityService.run.mockResolvedValue(failingContent());
      const thrown = await gate().catch((e) => e);
      const structured = toStructuredError(thrown, { stage: 'render', attempt: 1 });
      expect(structured.message).toMatch(/^Quality check failed: Scene 2/);
      expect(structured.message).not.toMatch(/render failed/i);
    });
  });

  describe('report mode', () => {
    it('records the failure but never blocks', async () => {
      setMode('report');
      VideoQualityService.run.mockResolvedValue(failingContent());
      const save = jest.fn(async () => {});
      const report = await gate({ save });
      expect(report.passed).toBe(false);
      expect(save).toHaveBeenCalled();
      expect(ActivityLogService.add).toHaveBeenCalledWith('job1', expect.stringMatching(/report only/));
    });
  });

  it('off mode does nothing at all', async () => {
    setMode('off');
    expect(await gate()).toBeNull();
    expect(VideoQualityService.run).not.toHaveBeenCalled();
  });

  describe('a broken checker never blocks a video', () => {
    it('turns a crash into a skipped report', async () => {
      VideoQualityService.run.mockRejectedValue(new Error('spawn ffprobe EACCES'));
      const save = jest.fn(async () => {});
      const report = await gate({ save });

      expect(report).toMatchObject({ status: 'skipped', passed: true });
      expect(report.skippedReason).toMatch(/EACCES/);
      expect(save).toHaveBeenCalledWith(report);
      expect(ActivityLogService.add).toHaveBeenCalledWith('job1', expect.stringMatching(/skipped/));
    });

    it('a failure to save the report does not fail the job', async () => {
      const report = await gate({ save: jest.fn().mockRejectedValue(new Error('mongo down')) });
      expect(report.status).toBe('passed');
    });

    it('a failure to record the event does not fail the job', async () => {
      JobEventService.append.mockRejectedValueOnce(new Error('redis down'));
      await expect(gate()).resolves.toMatchObject({ status: 'passed' });
    });
  });

  it('lets a cancellation through untouched', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    VideoQualityService.run.mockRejectedValue(abort);
    await expect(gate()).rejects.toBe(abort);
  });
});
