const fs = require('fs');
const os = require('os');
const path = require('path');

describe('config/version', () => {
  const saved = { ...process.env };
  const load = () => {
    jest.resetModules();
    return require('../../src/config/version');
  };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('reports the CI stamp, with the commit shortened to 7 chars', () => {
    process.env.APP_VERSION = '2.0.30';
    process.env.APP_COMMIT = 'abcdef1234567';
    process.env.APP_BUILD_DATE = '2026-10-04T14:38:59Z';
    expect(load()).toMatchObject({ version: '2.0.30', commit: 'abcdef1', buildDate: '2026-10-04T14:38:59Z' });
  });

  it('falls back to "<package version>-dev" and the checkout commit when unstamped', () => {
    delete process.env.APP_VERSION;
    delete process.env.APP_COMMIT;
    delete process.env.APP_BUILD_DATE;
    const v = load();
    expect(v.version).toMatch(/-dev$/);
    expect(v.commit).toBe(v.commitFromCheckout().slice(0, 7));
  });
});

describe('commitFromCheckout', () => {
  const { commitFromCheckout } = require('../../src/config/version');
  let root;

  const write = (rel, text) => {
    const file = path.join(root, '.git', rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'vireon-version-'));
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('reads a detached HEAD (what deploy.ps1 checks out)', () => {
    write('HEAD', 'ea91bf1bdf08cdad7a909207ea1de188e404da73\n');
    expect(commitFromCheckout(root)).toBe('ea91bf1bdf08cdad7a909207ea1de188e404da73');
  });

  it('follows a branch ref', () => {
    write('HEAD', 'ref: refs/heads/main\n');
    write('refs/heads/main', '1e644e9aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n');
    expect(commitFromCheckout(root)).toBe('1e644e9aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  });

  it('falls back to packed-refs', () => {
    write('HEAD', 'ref: refs/heads/main\n');
    write('packed-refs', '# pack-refs with: peeled\nabc1234000000000000000000000000000000000 refs/heads/main\n');
    expect(commitFromCheckout(root)).toBe('abc1234000000000000000000000000000000000');
  });

  it('returns an empty string where there is no checkout (the Docker image)', () => {
    expect(commitFromCheckout(root)).toBe('');
  });
});
