const { uploadToYouTube } = require('../../src/services/publishing/youtube/YouTubeUploader');
const { PublishError } = require('../../src/services/publishing/errors');

const CHUNK = 256 * 1024;
const meta = { title: 'T', description: '', tags: [], categoryId: '27', language: '', privacyStatus: 'private', publishAt: null, madeForKids: false, containsSyntheticMedia: true };

/** A fake storage serving `size` bytes by range. */
const storageOf = (size) => ({ getObjectRange: jest.fn(async (_b, _k, offset, length) => Buffer.alloc(Math.min(length, size - offset), 1)) });

const makeJob = (size, session = '') => ({
  accountId: 'pac-1', metadata: meta, session,
  source: { bucket: 'b', key: 'k.mp4', size, contentType: 'video/mp4' },
});

const makeHooks = () => ({
  saveSession: jest.fn(async () => {}),
  clearSession: jest.fn(async () => {}),
  onProgress: jest.fn(async () => {}),
  checkCancelled: jest.fn(async () => {}),
});

const auth = () => ({ getAccessToken: jest.fn(async () => 'AT') });
const noSleep = jest.fn(async () => {});

/** Fake YouTube that tracks the bytes it has "persisted" and can be told to fail. */
function fakeYouTube({ total, failures = [], videoId = 'VID1' } = {}) {
  let received = 0;
  const script = [...failures];
  const api = {
    initiateUpload: jest.fn(async () => 'https://upload.example/session/1'),
    uploadChunk: jest.fn(async (_t, _url, { chunk, start }) => {
      const next = script.shift();
      if (next === 'drop-after-receive') { // bytes arrived, response lost
        received = Math.max(received, start + chunk.length);
        throw new PublishError('NETWORK', 'connection reset');
      }
      if (next) throw next;
      expect(start).toBe(received); // the uploader must never skip or repeat bytes
      received = start + chunk.length;
      return received >= total ? { done: true, video: { id: videoId } } : { done: false, nextOffset: received };
    }),
    queryUpload: jest.fn(async () => (received >= total ? { done: true, video: { id: videoId } } : { done: false, nextOffset: received })),
  };
  return { api, received: () => received };
}

const run = (overrides) => uploadToYouTube({ chunkSize: CHUNK, sleep: noSleep, ...overrides });

describe('resumable YouTube upload', () => {
  it('uploads in chunks and returns only what YouTube confirms', async () => {
    const total = CHUNK * 2 + 100;
    const yt = fakeYouTube({ total });
    const hooks = makeHooks();
    const { video } = await run({ job: makeJob(total), api: yt.api, auth: auth(), storage: storageOf(total), hooks });

    expect(video.id).toBe('VID1');
    expect(yt.api.initiateUpload).toHaveBeenCalledTimes(1);
    expect(yt.api.initiateUpload.mock.calls[0][1]).toMatchObject({ size: total, contentType: 'video/mp4' });
    expect(yt.api.uploadChunk).toHaveBeenCalledTimes(3);
    expect(hooks.saveSession).toHaveBeenCalledWith('https://upload.example/session/1');
    expect(hooks.onProgress).toHaveBeenLastCalledWith(total, total);
  });

  it('survives a dropped connection by asking YouTube what it has, then continuing', async () => {
    const total = CHUNK * 3;
    const yt = fakeYouTube({ total, failures: [new PublishError('SERVER', 'HTTP 503')] });
    const { video } = await run({ job: makeJob(total), api: yt.api, auth: auth(), storage: storageOf(total), hooks: makeHooks() });

    expect(video.id).toBe('VID1');
    expect(yt.api.queryUpload).toHaveBeenCalled();
    expect(noSleep).toHaveBeenCalled();
  });

  it('does not send a chunk twice when the connection died AFTER YouTube received it', async () => {
    const total = CHUNK * 2;
    const yt = fakeYouTube({ total, failures: ['drop-after-receive'] });
    await run({ job: makeJob(total), api: yt.api, auth: auth(), storage: storageOf(total), hooks: makeHooks() });
    // 1 dropped + 1 remaining chunk; the fake asserts start === received on every real send.
    expect(yt.api.uploadChunk).toHaveBeenCalledTimes(2);
  });

  it('returns the video - without re-sending - when the final response was lost but the upload finished', async () => {
    const total = CHUNK;
    const yt = fakeYouTube({ total, failures: ['drop-after-receive'] });
    const { video } = await run({ job: makeJob(total), api: yt.api, auth: auth(), storage: storageOf(total), hooks: makeHooks() });
    expect(video.id).toBe('VID1');
    expect(yt.api.uploadChunk).toHaveBeenCalledTimes(1); // no duplicate upload
  });

  it('resumes a stored session from YouTube\'s confirmed offset instead of starting over', async () => {
    const total = CHUNK * 4;
    const yt = fakeYouTube({ total });
    // Pretend a previous worker got 2 chunks in before it died.
    await yt.api.uploadChunk('AT', 's', { chunk: Buffer.alloc(CHUNK * 2), start: 0 });
    yt.api.uploadChunk.mockClear();

    const hooks = makeHooks();
    const storage = storageOf(total);
    await run({ job: makeJob(total, 'https://upload.example/session/1'), api: yt.api, auth: auth(), storage, hooks });

    expect(yt.api.initiateUpload).not.toHaveBeenCalled();
    expect(hooks.saveSession).not.toHaveBeenCalled();
    expect(storage.getObjectRange.mock.calls[0][2]).toBe(CHUNK * 2); // first read starts at the confirmed offset
    expect(yt.api.uploadChunk).toHaveBeenCalledTimes(2);
  });

  it('returns immediately when the stored session turns out to be a finished upload', async () => {
    const total = CHUNK;
    const yt = fakeYouTube({ total });
    await yt.api.uploadChunk('AT', 's', { chunk: Buffer.alloc(CHUNK), start: 0 });
    yt.api.uploadChunk.mockClear();
    const { video } = await run({ job: makeJob(total, 'https://s'), api: yt.api, auth: auth(), storage: storageOf(total), hooks: makeHooks() });
    expect(video.id).toBe('VID1');
    expect(yt.api.uploadChunk).not.toHaveBeenCalled();
  });

  it('opens a fresh session when the stored one has expired', async () => {
    const total = CHUNK;
    const yt = fakeYouTube({ total });
    yt.api.queryUpload.mockRejectedValueOnce(new PublishError('SESSION_EXPIRED', 'expired'));
    const hooks = makeHooks();
    await run({ job: makeJob(total, 'https://stale'), api: yt.api, auth: auth(), storage: storageOf(total), hooks });
    expect(hooks.clearSession).toHaveBeenCalled();
    expect(yt.api.initiateUpload).toHaveBeenCalledTimes(1);
    expect(hooks.saveSession).toHaveBeenCalled();
  });

  it('refreshes the access token once when Google says it expired mid-upload', async () => {
    const total = CHUNK;
    const yt = fakeYouTube({ total, failures: [new PublishError('AUTH_EXPIRED', 'expired')] });
    const a = auth();
    await run({ job: makeJob(total), api: yt.api, auth: a, storage: storageOf(total), hooks: makeHooks() });
    expect(a.getAccessToken).toHaveBeenCalledWith('pac-1', { forceRefresh: true });
  });

  it('fails fast on permanent errors (no retry loop) and on revoked credentials', async () => {
    const total = CHUNK;
    const bad = fakeYouTube({ total, failures: [new PublishError('INVALID_METADATA', 'bad title')] });
    await expect(run({ job: makeJob(total), api: bad.api, auth: auth(), storage: storageOf(total), hooks: makeHooks() }))
      .rejects.toMatchObject({ code: 'INVALID_METADATA' });
    expect(bad.api.uploadChunk).toHaveBeenCalledTimes(1);

    const a = { getAccessToken: jest.fn(async () => { throw new PublishError('AUTH_REVOKED', 'revoked'); }) };
    await expect(run({ job: makeJob(total), api: fakeYouTube({ total }).api, auth: a, storage: storageOf(total), hooks: makeHooks() }))
      .rejects.toMatchObject({ code: 'AUTH_REVOKED', retryable: false });
  });

  it('hands quota exhaustion straight to the job level so it can wait for the reset', async () => {
    const total = CHUNK;
    const yt = fakeYouTube({ total, failures: [new PublishError('QUOTA_EXCEEDED', 'quota')] });
    await expect(run({ job: makeJob(total), api: yt.api, auth: auth(), storage: storageOf(total), hooks: makeHooks() }))
      .rejects.toMatchObject({ code: 'QUOTA_EXCEEDED', defer: true });
    expect(yt.api.uploadChunk).toHaveBeenCalledTimes(1);
  });

  it('gives up on a persistently failing network after a bounded number of tries', async () => {
    const total = CHUNK;
    const yt = fakeYouTube({ total, failures: Array.from({ length: 20 }, () => new PublishError('NETWORK', 'down')) });
    await expect(run({ job: makeJob(total), api: yt.api, auth: auth(), storage: storageOf(total), hooks: makeHooks() }))
      .rejects.toMatchObject({ code: 'NETWORK', retryable: true });
    expect(yt.api.uploadChunk.mock.calls.length).toBeLessThanOrEqual(7);
  });

  it('stops promptly when the job is cancelled between chunks', async () => {
    const total = CHUNK * 3;
    const yt = fakeYouTube({ total });
    const hooks = makeHooks();
    hooks.checkCancelled.mockResolvedValueOnce().mockRejectedValueOnce(new PublishError('CANCELLED', 'cancelled'));
    await expect(run({ job: makeJob(total), api: yt.api, auth: auth(), storage: storageOf(total), hooks }))
      .rejects.toMatchObject({ code: 'CANCELLED' });
    expect(yt.api.uploadChunk).toHaveBeenCalledTimes(1);
  });

  it('fails if the stored video is shorter than the draft recorded (re-rendered underneath)', async () => {
    const total = CHUNK * 2;
    const storage = { getObjectRange: jest.fn(async () => Buffer.alloc(10)) };
    await expect(run({ job: makeJob(total), api: fakeYouTube({ total }).api, auth: auth(), storage, hooks: makeHooks() }))
      .rejects.toMatchObject({ code: 'SOURCE_CHANGED' });
  });

  it('rejects an empty source before talking to YouTube', async () => {
    const yt = fakeYouTube({ total: 0 });
    await expect(run({ job: makeJob(0), api: yt.api, auth: auth(), storage: storageOf(0), hooks: makeHooks() }))
      .rejects.toMatchObject({ code: 'SOURCE_MISSING' });
    expect(yt.api.initiateUpload).not.toHaveBeenCalled();
  });
});
