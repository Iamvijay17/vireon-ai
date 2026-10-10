const crypto = require('crypto');
const config = require('../../config');
const { decodeEncryptionKey } = require('../../config/validate');

/**
 * Encryption at rest for the few secrets publishing stores (OAuth refresh
 * tokens, resumable-upload session URLs): AES-256-GCM with a fresh random IV
 * per value. GCM authenticates as well as encrypts, so a tampered or
 * wrong-key value fails loudly in decrypt() instead of yielding garbage.
 *
 * Stored form: `v1:<iv>:<tag>:<ciphertext>` (base64url). The `v1` prefix is
 * the hook for key rotation - a future v2 can be decrypted alongside v1 while
 * values are re-encrypted lazily.
 *
 * The key comes from PUBLISHING_TOKEN_ENCRYPTION_KEY and is never stored or
 * logged. Losing or changing it makes stored tokens unreadable; the affected
 * accounts then show "reconnect" (see isReadable) rather than breaking.
 */

const VERSION = 'v1';
const AAD = Buffer.from('vireon-publishing/v1');

class CryptoConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CryptoConfigError';
    this.code = 'ENCRYPTION_NOT_CONFIGURED';
  }
}

function getKey(rawKey = config.publishing.encryptionKey) {
  if (!rawKey) {
    throw new CryptoConfigError('PUBLISHING_TOKEN_ENCRYPTION_KEY is not set - cannot store credentials');
  }
  const key = decodeEncryptionKey(rawKey);
  if (!key) throw new CryptoConfigError('PUBLISHING_TOKEN_ENCRYPTION_KEY is not a valid 32-byte key');
  return key;
}

function encrypt(plaintext, rawKey) {
  const key = getKey(rawKey);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join(':');
}

function decrypt(payload, rawKey) {
  const key = getKey(rawKey);
  const [version, iv, tag, ciphertext] = String(payload || '').split(':');
  if (version !== VERSION || !iv || !tag || !ciphertext) {
    throw new Error('Stored credential is not in a recognised encrypted format');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAAD(AAD);
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  try {
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    // Deliberately vague: the GCM error says nothing useful and must not hint at key material.
    throw new Error('Stored credential could not be decrypted (wrong or changed PUBLISHING_TOKEN_ENCRYPTION_KEY?)');
  }
}

/** True when `payload` decrypts under the current key. Never throws. */
function isReadable(payload, rawKey) {
  try {
    decrypt(payload, rawKey);
    return true;
  } catch {
    return false;
  }
}

const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

module.exports = { encrypt, decrypt, isReadable, sha256, randomToken, CryptoConfigError };
