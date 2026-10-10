jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn(), success: jest.fn(), border: jest.fn(),
}));
jest.mock('../../src/services/publishing/PublishingEvents', () => ({ emitJob: jest.fn(), emitAccount: jest.fn() }));
jest.mock('../../src/models/PublishingJob', () => {
  const model = require('./helpers/fakeMongo').makeJobModel();
  model.ACTIVE_STATUSES = ['VALIDATING', 'UPLOADING', 'PROCESSING'];
  return model;
});

const fs = require('fs');
const os = require('os');
const path = require('path');
const config = require('../../src/config');
const PublishingJob = require('../../src/models/PublishingJob');
const events = require('../../src/services/publishing/PublishingEvents');
const PublishingJobStore = require('../../src/services/publishing/PublishingJobStore');
const { processExportJob } = require('../../src/services/publishing/udemy/processExportJob');
const { PublishError } = require('../../src/services/publishing/errors');
const { OWNER, IDS, RENDER_URL, settingsFor } = require('./helpers/harness');

const course = { _id: IDS.course, title: 'JS: The Course?', description: 'd', language: 'english' };
const video = (n, over = {}) => ({
  _id: `vid-0000000${n}`, courseId: IDS.course, title: `L${n}`, order: n, renderUrl: RENDER_URL(`vid-0000000${n}`),
  videoStatus: 'Completed', status: 'Completed', audioDuration: 600, script: { scenes: [] }, ...over,
});
const profile = {
  subtitle: 'Sub', description: 'Desc', learningObjectives: ['a', 'b', 'c', 'd'], prerequisites: ['p'], intendedAudience: ['x'],
  sections: [{ title: 'S1', lessonIds: ['vid-00000001', 'vid-00000002', 'vid-00000003'] }],
};

let clock; let store; let storage; let enqueue; let tmpDir; let buildZip; let loaded;

beforeEach(() => {
  PublishingJob.reset();
  jest.clearAllMocks();
  clock = Date.parse('2026-10-10T12:00:00Z');
  store = new PublishingJobStore({ now: () => clock });
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vireon-export-test-'));
  storage = {
    parsePublicUrl: (url) => ({ bucket: 'vireon-video', key: new URL(url).pathname.split('/').slice(2).join('/') }),
    statObject: jest.fn(async () => ({ size: 1000, etag: 'e' })),
    putObjectFile: jest.fn(async (bucket, key, file) => ({ bucket, key, size: fs.statSync(file).size })),
  };
  enqueue = jest.fn(async () => {});
  loaded = { course, profile, videos: [video(1), video(2), video(3)] };
  buildZip = jest.fn(async ({ outFile, onProgress }) => {
    await onProgress({ done: 2, steps: 4 });
    fs.writeFileSync(outFile, Buffer.from('PK-fake-zip'));
    return { bytes: 3000 };
  });
});
afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

const seedJob = (over = {}) => PublishingJob.seed({
  ownerId: OWNER, platform: 'udemy-export', courseId: IDS.course, status: 'QUEUED', queuedAt: new Date(clock), maxAttempts: 3,
  dedupeKey: `udemy-export|${OWNER}|${IDS.course}`, exportOptions: { includeMedia: true, includeCaptions: true, allowIncomplete: false }, ...over,
});
const row = () => PublishingJob.rows[0];
const run = (id, over = {}) => processExportJob(id, {
  store, storage, enqueue, workerId: 'w1', loadData: async () => loaded, settings: settingsFor()(), now: () => clock, tmpDir, buildZip, ...over,
});

describe('Udemy package build', () => {
  it('validates, builds the ZIP, stores it and completes - without contacting Udemy', async () => {
    const job = seedJob();
    expect(await run(job._id)).toEqual({ outcome: 'completed' });

    expect(row()).toMatchObject({ status: 'COMPLETED', progress: { percent: 100 } });
    expect(row().exportResult).toMatchObject({ fileName: 'JS The Course - Udemy package.zip', size: 11, bucket: config.minio.videoBucket });
    expect(row().exportResult.key).toBe(`publishing/exports/${job._id}/JS The Course - Udemy package.zip`);
    expect(row().exportResult.validation.ok).toBe(true);
    expect(row().dedupeKey).toBeUndefined(); // the next build is allowed
    expect(storage.putObjectFile).toHaveBeenCalledWith(config.minio.videoBucket, row().exportResult.key, expect.stringContaining(`vireon-udemy-${job._id}.zip`), 'application/zip');
    expect(events.emitJob).toHaveBeenCalled();
    expect(fs.readdirSync(tmpDir)).toEqual([]); // temp ZIP removed
  });

  it('fails with the report when the course is not ready, and builds nothing', async () => {
    loaded.videos[1] = video(2, { renderUrl: '', videoStatus: 'Pending', status: 'Draft' });
    const job = seedJob();
    expect((await run(job._id)).outcome).toBe('failed');

    expect(row().error).toMatchObject({ code: 'VALIDATION_FAILED', retryable: false });
    expect(row().error.message).toMatch(/no rendered video/);
    expect(row().exportResult.validation.errors.map((e) => e.code)).toContain('LESSON_VIDEO_MISSING');
    expect(buildZip).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
    expect(row().dedupeKey).toBeUndefined();
  });

  it('exports an incomplete package only when the user explicitly allows it', async () => {
    loaded.videos[1] = video(2, { renderUrl: '', videoStatus: 'Pending', status: 'Draft' });
    const job = seedJob({ exportOptions: { includeMedia: true, includeCaptions: true, allowIncomplete: true } });
    expect((await run(job._id)).outcome).toBe('completed');
    expect(row().exportResult.validation.ok).toBe(false);
  });

  it('refuses a package larger than the configured limit and suggests exporting without media', async () => {
    storage.statObject.mockResolvedValue({ size: 10 * 1024 ** 3, etag: 'e' });
    const job = seedJob();
    expect((await run(job._id, { settings: { ...settingsFor()(), export: { maxBytes: 5 * 1024 ** 3 } } })).outcome).toBe('failed');
    expect(row().error).toMatchObject({ code: 'SOURCE_TOO_LARGE' });
    expect(row().error.action).toMatch(/without media/);
    expect(buildZip).not.toHaveBeenCalled();
  });

  it('skips the size/media checks entirely for a manifest-only export', async () => {
    const job = seedJob({ exportOptions: { includeMedia: false, includeCaptions: true, allowIncomplete: false } });
    await run(job._id);
    expect(storage.statObject).not.toHaveBeenCalled();
    expect(buildZip.mock.calls[0][0].includeMedia).toBe(false);
    expect(row().status).toBe('COMPLETED');
  });

  it('fails clearly when a lesson video vanished from storage', async () => {
    storage.statObject.mockResolvedValue(null);
    const job = seedJob();
    expect((await run(job._id)).outcome).toBe('failed');
    expect(row().error.code).toBe('SOURCE_MISSING');
  });

  it('retries with backoff when storing the package fails transiently, then succeeds', async () => {
    const job = seedJob();
    storage.putObjectFile.mockRejectedValueOnce(new Error('MinIO upload timed out'));
    expect((await run(job._id)).outcome).toBe('retrying');
    expect(row()).toMatchObject({ status: 'RETRYING', attempts: 1 });
    expect(row().error).toMatchObject({ code: 'SERVER', retryable: true });
    expect(enqueue.mock.calls[0][1].delayMs).toBe(5000);

    clock = new Date(row().nextRetryAt).getTime() + 1;
    expect((await run(job._id)).outcome).toBe('completed');
    expect(row().attempts).toBe(2);
  });

  it('explains a full disk instead of retrying pointlessly', async () => {
    const job = seedJob();
    buildZip.mockRejectedValueOnce(Object.assign(new Error('no space left'), { code: 'ENOSPC' }));
    expect((await run(job._id)).outcome).toBe('failed');
    expect(row().error.message).toMatch(/out of disk space/);
    expect(row().error.retryable).toBe(false);
  });

  it('stops quietly when cancelled while building', async () => {
    const job = seedJob();
    buildZip.mockImplementationOnce(async ({ isCancelled }) => {
      row().status = 'CANCELLED';
      expect(await isCancelled()).toBe(true);
      throw new PublishError('CANCELLED', 'The export was cancelled');
    });
    const result = await run(job._id);
    expect(result.outcome).toBe('cancelled');
    expect(enqueue).not.toHaveBeenCalled();
    expect(row().status).toBe('CANCELLED');
  });

  it('does nothing for a job that is not claimable', async () => {
    const job = seedJob({ status: 'COMPLETED' });
    expect(await run(job._id)).toEqual({ outcome: 'skipped' });
    expect(buildZip).not.toHaveBeenCalled();
  });
});
