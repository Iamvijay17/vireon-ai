jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn(), success: jest.fn(), border: jest.fn(),
}));

// ioredis: record instances so the test can drive the subscriber's 'message' handler and inspect publishes.
const mockInstances = [];
jest.mock('ioredis', () => class FakeRedis {
  constructor() {
    this.handlers = {};
    this.publish = jest.fn(async () => 1);
    this.subscribe = jest.fn((_channel, cb) => cb && cb(null, 1));
    this.on = jest.fn((event, fn) => { this.handlers[event] = fn; });
    mockInstances.push(this);
  }
});

const { state } = require('../../src/services/common/socketService/state');
const redisBridge = require('../../src/services/common/socketService/redisBridge');
const publishingEvents = require('../../src/services/common/socketService/publishingEvents');
const { SOCKET_EVENTS, REDIS_CHANNEL } = require('../../src/constants');
const PublishingEvents = require('../../src/services/publishing/PublishingEvents');

const jobDoc = () => ({
  toJSON() {
    return {
      _id: 'pub-00000001', platform: 'youtube', courseId: 'cou-aaaaaaaa', courseVideoId: 'vid-aaaaaaaa', accountId: 'pac-aaaaaaaa',
      status: 'UPLOADING', progress: { percent: 42, bytesUploaded: 42, bytesTotal: 100, phase: 'Uploading' }, attempts: 1, maxAttempts: 5,
      remote: { videoId: 'VID', url: 'https://www.youtube.com/watch?v=VID', studioUrl: 's', sessionEnc: 'v1:SECRET-SESSION', processingState: '' },
      error: { code: '' }, lease: { owner: 'w1', expiresAt: new Date() }, dedupeKey: 'fp-secret', metadata: { title: 'private title' },
      source: { bucket: 'b', key: 'internal/key.mp4' }, updatedAt: new Date('2026-10-10T00:00:00Z'),
    };
  },
});

afterEach(() => { state.io = null; state.redisPublisher = null; state.redisSubscriber = null; mockInstances.length = 0; jest.clearAllMocks(); });

describe('publishing progress over Socket.IO', () => {
  it('sends a sanitised summary - no session URL, lease, dedupe key, metadata or storage location', () => {
    const summary = PublishingEvents.summarize(jobDoc());
    expect(summary).toMatchObject({ jobId: 'pub-00000001', status: 'UPLOADING', progress: { percent: 42 }, remote: { videoId: 'VID' }, error: null });
    expect(JSON.stringify(summary)).not.toMatch(/SECRET|sessionEnc|lease|dedupe|fp-secret|internal\/key|private title|bucket/);
  });

  it('includes an actionable error when the job failed', () => {
    const doc = jobDoc();
    const json = doc.toJSON();
    json.error = { code: 'AUTH_REVOKED', message: 'm', action: 'Reconnect', retryable: false };
    expect(PublishingEvents.summarize({ toJSON: () => json }).error).toEqual({ code: 'AUTH_REVOKED', message: 'm', action: 'Reconnect', retryable: false });
  });

  it('in the API process, emits straight to every connected client', () => {
    const emit = jest.fn();
    state.io = { emit };
    publishingEvents.emitPublishingJobUpdated({ jobId: 'pub-1', status: 'UPLOADING' });
    expect(emit).toHaveBeenCalledWith(SOCKET_EVENTS.PUBLISHING_JOB_UPDATED, { jobId: 'pub-1', status: 'UPLOADING' });
    expect(SOCKET_EVENTS.PUBLISHING_JOB_UPDATED).toBe('publishingJobUpdated');
  });

  it('in a worker process (no Socket.IO server), publishes over Redis for the API to forward', () => {
    publishingEvents.emitPublishingJobUpdated({ jobId: 'pub-1', status: 'COMPLETED' });
    const publisher = mockInstances.find((r) => r.publish.mock.calls.length);
    const [channel, message] = publisher.publish.mock.calls[0];
    expect(channel).toBe(REDIS_CHANNEL);
    expect(JSON.parse(message)).toEqual({ type: 'publishingJobUpdated', jobId: 'pub-1', data: { jobId: 'pub-1', status: 'COMPLETED' } });
  });

  it('the API process forwards a worker\'s Redis message to browsers', () => {
    const emit = jest.fn();
    state.io = { emit, to: jest.fn(() => ({ emit })) };
    redisBridge.initRedis();
    const subscriber = mockInstances[0];
    subscriber.handlers.message(REDIS_CHANNEL, JSON.stringify({ type: 'publishingJobUpdated', jobId: 'pub-1', data: { jobId: 'pub-1', status: 'PROCESSING' } }));
    subscriber.handlers.message(REDIS_CHANNEL, JSON.stringify({ type: 'publishingAccountUpdated', jobId: 'pac-1', data: { accountId: 'pac-1', status: 'needs_reauth' } }));
    expect(emit).toHaveBeenCalledWith('publishingJobUpdated', { jobId: 'pub-1', status: 'PROCESSING' });
    expect(emit).toHaveBeenCalledWith('publishingAccountUpdated', { accountId: 'pac-1', status: 'needs_reauth' });
  });

  it('a socket failure can never fail a publish', () => {
    jest.resetModules();
    jest.doMock('../../src/services/common/SocketService', () => { throw new Error('socket layer exploded'); });
    jest.doMock('../../src/services/common/LoggerService', () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }));
    const isolated = require('../../src/services/publishing/PublishingEvents');
    expect(() => isolated.emitJob(jobDoc())).not.toThrow();
    expect(() => isolated.emitAccount({ _id: 'pac-1', status: 'connected' })).not.toThrow();
  });
});
