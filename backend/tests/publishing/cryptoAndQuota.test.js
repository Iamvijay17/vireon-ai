jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn(), success: jest.fn(), border: jest.fn(),
}));

const crypto = require('crypto');
const cipher = require('../../src/services/publishing/crypto');
const { quotaDayStart, nextQuotaReset } = require('../../src/services/publishing/quota');

const KEY = crypto.randomBytes(32).toString('base64');
const OTHER_KEY = crypto.randomBytes(32).toString('hex');

describe('token encryption at rest', () => {
  it('round-trips a refresh token', () => {
    const token = '1//0g-refresh-token-value';
    expect(cipher.decrypt(cipher.encrypt(token, KEY), KEY)).toBe(token);
  });

  it('never stores the plaintext and uses a fresh IV every time', () => {
    const a = cipher.encrypt('secret-token', KEY);
    const b = cipher.encrypt('secret-token', KEY);
    expect(a).not.toContain('secret-token');
    expect(a).not.toEqual(b);
    expect(a.startsWith('v1:')).toBe(true);
  });

  it('accepts a 64-char hex key as well as base64', () => {
    const hex = crypto.randomBytes(32).toString('hex');
    expect(cipher.decrypt(cipher.encrypt('x', hex), hex)).toBe('x');
  });

  it('refuses to decrypt with a different key (and says nothing about the key)', () => {
    const stored = cipher.encrypt('token', KEY);
    expect(() => cipher.decrypt(stored, OTHER_KEY)).toThrow(/could not be decrypted/);
    expect(cipher.isReadable(stored, OTHER_KEY)).toBe(false);
    expect(cipher.isReadable(stored, KEY)).toBe(true);
  });

  it('detects tampering with the ciphertext (GCM authentication)', () => {
    const [v, iv, tag, ct] = cipher.encrypt('token', KEY).split(':');
    const flipped = Buffer.from(ct, 'base64url');
    flipped[0] ^= 0xff;
    expect(() => cipher.decrypt([v, iv, tag, flipped.toString('base64url')].join(':'), KEY)).toThrow();
  });

  it('rejects unrecognised formats', () => {
    expect(() => cipher.decrypt('plain-text-token', KEY)).toThrow(/not in a recognised/);
    expect(() => cipher.decrypt('', KEY)).toThrow();
  });

  it('fails clearly when no key is configured or it is the wrong size', () => {
    expect(() => cipher.encrypt('x', '')).toThrow(/not set/);
    expect(() => cipher.encrypt('x', 'too-short')).toThrow(/valid 32-byte key/);
  });
});

describe('YouTube quota day (resets at midnight Pacific)', () => {
  it('finds the Pacific midnight in summer (PDT = UTC-7)', () => {
    const now = new Date('2026-10-10T12:00:00Z');
    expect(quotaDayStart(now).toISOString()).toBe('2026-10-10T07:00:00.000Z');
    expect(nextQuotaReset(now).toISOString()).toBe('2026-10-11T07:00:00.000Z');
  });

  it('is exact on both sides of the boundary', () => {
    expect(quotaDayStart(new Date('2026-10-10T06:59:59Z')).toISOString()).toBe('2026-10-09T07:00:00.000Z');
    expect(quotaDayStart(new Date('2026-10-10T07:00:00Z')).toISOString()).toBe('2026-10-10T07:00:00.000Z');
  });

  it('handles the daylight-saving transitions', () => {
    // 2026-11-01: clocks go back; the Pacific day is 25 hours long.
    expect(nextQuotaReset(new Date('2026-11-01T09:00:00Z')).toISOString()).toBe('2026-11-02T08:00:00.000Z');
    // 2026-03-08: clocks go forward; the day is 23 hours long.
    expect(nextQuotaReset(new Date('2026-03-08T20:00:00Z')).toISOString()).toBe('2026-03-09T07:00:00.000Z');
  });
});
