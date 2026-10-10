const crypto = require('crypto');
const { validateConfig, ConfigValidationError, decodeEncryptionKey } = require('../../src/config/validate');

const base = () => JSON.parse(JSON.stringify(require('../../src/config')));
const issuesFor = (mutate) => {
  const cfg = base();
  cfg.publishing.google = { clientId: '', clientSecret: '', redirectUri: '' };
  cfg.publishing.encryptionKey = '';
  mutate(cfg.publishing);
  try {
    validateConfig(cfg);
    return [];
  } catch (err) {
    expect(err).toBeInstanceOf(ConfigValidationError);
    return err.issues;
  }
};

const KEY = crypto.randomBytes(32).toString('base64');
const full = (p) => {
  p.google = { clientId: 'id.apps.googleusercontent.com', clientSecret: 'secret', redirectUri: 'https://app.example.com/api/publishing/oauth/google/callback' };
  p.encryptionKey = KEY;
};

describe('publishing configuration', () => {
  it('is optional: an empty Google section is valid (nothing is configured, nothing is published)', () => {
    expect(issuesFor(() => {})).toEqual([]);
  });

  it('accepts a complete setup', () => {
    expect(issuesFor(full)).toEqual([]);
  });

  it('accepts http only for localhost redirect URIs', () => {
    expect(issuesFor((p) => { full(p); p.google.redirectUri = 'http://localhost:3000/api/publishing/oauth/google/callback'; })).toEqual([]);
    const issues = issuesFor((p) => { full(p); p.google.redirectUri = 'http://192.168.1.7:3000/cb'; });
    expect(issues.map((i) => i.path)).toContain('publishing.google.redirectUri');
  });

  it.each([
    ['client id', (p) => { full(p); p.google.clientId = ''; }, 'publishing.google.clientId', 'GOOGLE_CLIENT_ID'],
    ['client secret', (p) => { full(p); p.google.clientSecret = ''; }, 'publishing.google.clientSecret', 'GOOGLE_CLIENT_SECRET'],
    ['redirect URI', (p) => { full(p); p.google.redirectUri = ''; }, 'publishing.google.redirectUri', 'GOOGLE_REDIRECT_URI'],
    ['encryption key', (p) => { full(p); p.encryptionKey = ''; }, 'publishing.encryptionKey', 'PUBLISHING_TOKEN_ENCRYPTION_KEY'],
  ])('a half-finished setup names the missing %s', (_label, mutate, path, envVar) => {
    const issues = issuesFor(mutate);
    expect(issues.find((i) => i.path === path)?.message).toContain(envVar);
  });

  it('rejects an encryption key that is not 32 bytes', () => {
    expect(issuesFor((p) => { full(p); p.encryptionKey = 'short'; }).map((i) => i.path)).toContain('publishing.encryptionKey');
    expect(issuesFor((p) => { full(p); p.encryptionKey = crypto.randomBytes(16).toString('base64'); }).map((i) => i.path)).toContain('publishing.encryptionKey');
  });

  it('accepts hex and base64 keys and decodes both to 32 bytes', () => {
    expect(decodeEncryptionKey(crypto.randomBytes(32).toString('hex'))).toHaveLength(32);
    expect(decodeEncryptionKey(KEY)).toHaveLength(32);
    expect(decodeEncryptionKey('nope')).toBeNull();
  });

  it('rejects an upload chunk size YouTube would refuse', () => {
    const issues = issuesFor((p) => { p.youtube.chunkSizeBytes = 1000000; });
    expect(issues[0].message).toMatch(/multiple of 262144/);
  });

  it('rejects nonsense limits', () => {
    expect(issuesFor((p) => { p.youtube.dailyUploadLimit = 0; }).map((i) => i.path)).toContain('publishing.youtube.dailyUploadLimit');
    expect(issuesFor((p) => { p.youtube.maxAttempts = 99; }).map((i) => i.path)).toContain('publishing.youtube.maxAttempts');
  });

  it('never ships real credentials in .env.example', () => {
    const text = require('fs').readFileSync(require('path').resolve(__dirname, '../../.env.example'), 'utf8');
    const line = (name) => text.split(/\r?\n/).find((l) => l.replace(/^#\s*/, '').startsWith(`${name}=`)) || '';
    for (const name of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'PUBLISHING_TOKEN_ENCRYPTION_KEY']) {
      expect(line(name)).not.toBe('');
      expect(line(name).split('=')[1].trim()).toBe('');
    }
    // No fictional Udemy integration settings.
    expect(text).not.toMatch(/UDEMY_(CLIENT|API|TOKEN|SECRET)/);
  });
});
