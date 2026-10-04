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
    expect(load()).toEqual({ version: '2.0.30', commit: 'abcdef1', buildDate: '2026-10-04T14:38:59Z' });
  });

  it('falls back to "<package version>-dev" when unstamped', () => {
    delete process.env.APP_VERSION;
    delete process.env.APP_COMMIT;
    delete process.env.APP_BUILD_DATE;
    const v = load();
    expect(v.version).toMatch(/-dev$/);
    expect(v.commit).toBe('');
  });
});
