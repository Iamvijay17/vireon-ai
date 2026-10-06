/**
 * Worker identity lets the API list every worker on the shared queue and
 * spot the two problems that hit prod: a worker left running on old code,
 * and more than one worker of a role in one environment.
 */
jest.mock('../../src/config', () => ({ nodeEnv: 'production' }));
jest.mock('../../src/config/version', () => ({ commit: 'ea91bf1' }));

const { workerName, parseWorkerClient, assessWorkers } = require('../../src/workers/workerIdentity');

const client = (name, extra = {}) => ({ rawname: `bull:dmlkZW8:w:${name}`, age: '120', idle: '3', ...extra });

describe('workerName / parseWorkerClient', () => {
  it('round-trips role, environment, commit and pid', () => {
    const name = workerName('video');
    expect(name).toBe(`video.production.ea91bf1.${process.pid}`);
    expect(parseWorkerClient(client(name))).toEqual({
      role: 'video', env: 'production', commit: 'ea91bf1', pid: process.pid, ageSec: 120, idleSec: 3,
    });
  });

  it('ignores clients without an identity (workers started before names existed)', () => {
    expect(parseWorkerClient({ rawname: 'bull:dmlkZW8' })).toBeNull();
    expect(parseWorkerClient({ rawname: 'bull:dmlkZW8:w:something' })).toBeNull();
  });

  it('reads an unknown commit as empty', () => {
    expect(parseWorkerClient(client('course.development.unknown.42')).commit).toBe('');
  });
});

describe('assessWorkers', () => {
  const w = (role, env, commit, pid) => ({ role, env, commit, pid });
  const api = { apiEnv: 'production', apiCommit: 'ea91bf1' };

  it('is healthy with one current worker per role, plus dev workers on any commit', () => {
    const r = assessWorkers(
      [w('video', 'production', 'ea91bf1', 1), w('course', 'production', 'ea91bf1', 2), w('video', 'development', '1e644e9', 3)],
      api
    );
    expect(r.duplicates).toEqual([]);
    expect(r.stale).toEqual([]);
  });

  it('flags a prod worker left on old code', () => {
    const r = assessWorkers([w('video', 'production', 'f8fd748', 13784), w('video', 'production', 'ea91bf1', 22960)], api);
    expect(r.stale.map((x) => x.pid)).toEqual([13784]);
    expect(r.duplicates).toEqual([{ key: 'production/video', count: 2 }]);
  });

  it("can't call anything stale when the API doesn't know its own commit", () => {
    const r = assessWorkers([w('video', 'production', 'f8fd748', 1)], { apiEnv: 'production', apiCommit: '' });
    expect(r.stale).toEqual([]);
  });
});
