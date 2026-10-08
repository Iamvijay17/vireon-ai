jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), success: jest.fn(), debug: jest.fn(),
}));

const mockMongo = { readyState: 1 };
jest.mock('mongoose', () => {
  const actual = jest.requireActual('mongoose');
  return { ...actual, connection: { get readyState() { return mockMongo.readyState; } } };
});

const mockWrites = [];
const mockAggregate = jest.fn();
jest.mock('../../src/models/CacheEntry', () => ({
  updateOne: jest.fn((filter, update, options) => {
    mockWrites.push({ filter, update, options });
    return { exec: () => Promise.resolve() };
  }),
  aggregate: (...args) => mockAggregate(...args),
}));

const CacheEntry = require('../../src/models/CacheEntry');
const ledger = require('../../src/services/cache/CacheLedger');

beforeEach(() => {
  jest.clearAllMocks();
  mockWrites.length = 0;
  mockMongo.readyState = 1;
});

const last = () => mockWrites[mockWrites.length - 1];

describe('writes', () => {
  it('a hit increments hits and stamps the last reuse', () => {
    ledger.hit('image', 'abc');
    expect(last().filter).toEqual({ _id: 'image:abc' });
    expect(last().update.$inc).toEqual({ hits: 1 });
    expect(last().update.$set.lastHitAt).toBeInstanceOf(Date);
    expect(last().update.$set.status).toBe('ready');
    expect(last().options).toEqual({ upsert: true });
  });

  it('a miss increments misses', () => {
    ledger.miss('tts', 'k');
    expect(last().update.$inc).toEqual({ misses: 1 });
    expect(last().update.$set.lastMissAt).toBeInstanceOf(Date);
  });

  it('a shared wait counts as a reuse', () => {
    ledger.shared('image', 'k');
    expect(last().update.$inc).toEqual({ shared: 1 });
    expect(last().update.$set.lastHitAt).toBeInstanceOf(Date);
  });

  it('a stale entry is flagged', () => {
    ledger.stale('image', 'k');
    expect(last().update.$inc).toEqual({ stale: 1 });
    expect(last().update.$set.status).toBe('stale');
  });

  it('a generation adds its time and remembers the last one, and clears a stale flag', () => {
    ledger.generated('image', 'k', 1234.6);
    expect(last().update.$inc).toEqual({ generations: 1, generationMs: 1235 });
    expect(last().update.$set).toMatchObject({ lastGenerationMs: 1235, status: 'ready' });
  });

  it('never records a negative or missing generation time', () => {
    ledger.generated('image', 'k', -50);
    expect(last().update.$inc.generationMs).toBe(0);
    ledger.generated('image', 'k', undefined);
    expect(last().update.$inc.generationMs).toBe(0);
  });

  it('storing keeps the earliest stored time and records the size', () => {
    ledger.stored('image', 'k', { sizeBytes: 2048 });
    expect(last().update.$set).toMatchObject({ status: 'ready', sizeBytes: 2048 });
    expect(last().update.$min.firstStoredAt).toBeInstanceOf(Date);
  });

  it('writes the kind and key on first insert only', () => {
    ledger.hit('image', 'abc');
    expect(last().update.$setOnInsert).toEqual({ kind: 'image', key: 'abc' });
  });

  it('skips the write entirely when Mongo is not connected (no ten-second buffer)', () => {
    mockMongo.readyState = 0;
    ledger.hit('image', 'abc');
    expect(CacheEntry.updateOne).not.toHaveBeenCalled();
  });

  it('never throws, even when the write rejects or throws synchronously', async () => {
    CacheEntry.updateOne.mockImplementationOnce(() => ({ exec: () => Promise.reject(new Error('mongo down')) }));
    expect(() => ledger.hit('image', 'a')).not.toThrow();
    CacheEntry.updateOne.mockImplementationOnce(() => { throw new Error('sync'); });
    expect(() => ledger.hit('image', 'b')).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve)); // let the swallowed rejection settle
  });
});

describe('stats', () => {
  const rows = [
    { _id: 'image', entries: 4, hits: 30, misses: 10, shared: 2, stale: 1, generations: 10, generationMs: 1_200_000, sizeBytes: 5_000_000, timeSavedMs: 3_840_000 },
    { _id: 'tts-seg-raw', entries: 20, hits: 5, misses: 0, shared: 0, stale: 0, generations: 0, generationMs: 0, sizeBytes: 0, timeSavedMs: 0 },
  ];

  it('derives hit rate, average generation time and time saved per kind - from real counters', async () => {
    mockAggregate.mockResolvedValue(rows);
    const out = await ledger.stats({ days: 7 });

    expect(out.days).toBe(7);
    expect(out.byKind[0]).toEqual({
      kind: 'image', entries: 4, hits: 30, misses: 10, shared: 2, stale: 1, hitRate: 75, avgGenerationMs: 120_000, timeSavedMs: 3_840_000, sizeBytes: 5_000_000,
    });
  });

  it('does not invent a cost for an entry nobody has generated through the ledger', async () => {
    mockAggregate.mockResolvedValue(rows);
    const raw = (await ledger.stats()).byKind[1];
    expect(raw.avgGenerationMs).toBeNull();
    expect(raw.timeSavedMs).toBe(0);
    expect(raw.hitRate).toBe(100);
  });

  it('totals across kinds and reports a null hit rate when there has been no traffic', async () => {
    mockAggregate.mockResolvedValue(rows);
    expect((await ledger.stats()).total).toMatchObject({ hits: 35, misses: 10, hitRate: 77.8, timeSavedMs: 3_840_000 });

    mockAggregate.mockResolvedValue([]);
    expect(await ledger.stats()).toMatchObject({ byKind: [], total: { hits: 0, misses: 0, hitRate: null } });
  });

  it('only looks at activity inside the requested window', async () => {
    mockAggregate.mockResolvedValue([]);
    await ledger.stats({ days: 3 });
    const match = mockAggregate.mock.calls[0][0][0].$match.$or;
    const since = match[0].lastHitAt.$gte.getTime();
    expect(Date.now() - since).toBeGreaterThan(3 * 24 * 3600 * 1000 - 5000);
    expect(Date.now() - since).toBeLessThan(3 * 24 * 3600 * 1000 + 5000);
    expect(match.map((m) => Object.keys(m)[0])).toEqual(['lastHitAt', 'lastMissAt', 'lastStaleAt']);
  });
});
