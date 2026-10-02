const mockSpawn = jest.fn(() => ({ on: jest.fn(), unref: jest.fn(), pid: 1234 }));
const mockPortOpen = jest.fn();

jest.mock('child_process', () => ({ spawn: (...a) => mockSpawn(...a) }));
jest.mock('net', () => ({
  createConnection: jest.fn((opts) => {
    // fake socket: reports "open" or "closed" via the shared mock, per host
    const handlers = {};
    const socket = {
      setTimeout: jest.fn(),
      removeAllListeners: jest.fn(),
      destroy: jest.fn(),
      once: (evt, cb) => { handlers[evt] = cb; },
    };
    setImmediate(() => (mockPortOpen(opts.host) ? handlers.connect : handlers.error)?.());
    return socket;
  }),
}));
jest.mock('../../src/services/common/LoggerService', () => ({ warn: jest.fn(), error: jest.fn(), success: jest.fn(), info: jest.fn() }));

const load = (redisHost = 'localhost') => {
  jest.resetModules();
  jest.doMock('../../src/config', () => ({ redis: { host: redisHost, port: 6379 } }));
  return require('../../src/utils/ensureRedis');
};

describe('ensureRedis', () => {
  const originalFlag = process.env.REDIS_AUTOSTART;
  beforeEach(() => {
    mockSpawn.mockClear();
    mockPortOpen.mockReset();
    delete process.env.REDIS_AUTOSTART;
  });
  afterAll(() => {
    if (originalFlag === undefined) delete process.env.REDIS_AUTOSTART;
    else process.env.REDIS_AUTOSTART = originalFlag;
  });

  it('probes both loopback families for localhost', () => {
    expect(load().hostsToProbe('localhost')).toEqual(['127.0.0.1', '::1']);
    expect(load().hostsToProbe('redis')).toEqual(['redis']);
  });

  it('does NOT spawn a second Redis when only IPv4 answers (Docker publishes 127.0.0.1 only)', async () => {
    mockPortOpen.mockImplementation((host) => host === '127.0.0.1');
    await load()();
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('never spawns anything when REDIS_AUTOSTART=false, even if Redis is unreachable', async () => {
    process.env.REDIS_AUTOSTART = 'false';
    mockPortOpen.mockReturnValue(false);
    await load()();
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('spawns a loopback-only Redis when none is reachable and autostart is allowed', async () => {
    mockPortOpen.mockReturnValueOnce(false).mockReturnValueOnce(false).mockReturnValue(true);
    await load()();
    expect(mockSpawn).toHaveBeenCalledTimes(1);
    const args = mockSpawn.mock.calls[0][1];
    expect(args).toEqual(expect.arrayContaining(['--bind', '127.0.0.1', '-::1']));
  });
});
