const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const config = require('../../../../config');
const LoggerService = require('../../../common/LoggerService');

const execFileAsync = promisify(execFile);

/**
 * Alignment providers turn finished audio clips into per-word timings. The
 * pipeline only ever talks to this interface, so a stronger forced-alignment
 * model (e.g. wav2vec2 / MFA) can replace faster-whisper by registering a
 * provider - no pipeline code changes.
 *
 * A provider's `alignBatch(files)` resolves to one entry per file: an array of
 * `{ word, start, end, probability? }` in seconds, or null when that file
 * could not be aligned. It must never throw for a per-file problem, and must
 * never invent timings it did not measure.
 */
const providers = new Map();

const SCRIPT = path.resolve(__dirname, '../../alignCaptions.py');

const fasterWhisper = {
  name: 'faster-whisper',
  async alignBatch(files, { signal } = {}) {
    if (files.length === 0) return [];
    try {
      const { stdout } = await execFileAsync('python', [SCRIPT, '--batch', config.audio.alignment.model, ...files], {
        encoding: 'utf8',
        // Model load plus ~10s of CPU per clip; generous so a slow box does
        // not silently lose all alignment.
        timeout: 60000 + files.length * 20000,
        maxBuffer: 32 * 1024 * 1024,
        signal: signal || undefined,
      });

      const lines = stdout.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('['));
      if (lines.length !== files.length) {
        LoggerService.warn('Caption alignment returned an unexpected number of results', { expected: files.length, got: lines.length });
        return files.map(() => null);
      }
      return lines.map((line) => {
        try {
          const words = JSON.parse(line);
          return Array.isArray(words) && words.length > 0 ? words : null;
        } catch {
          return null;
        }
      });
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      LoggerService.warn('Caption alignment failed, falling back to estimated pacing', { error: err.message });
      return files.map(() => null);
    }
  },
};

const none = {
  name: 'none',
  async alignBatch(files) {
    return files.map(() => null);
  },
};

registerProvider(fasterWhisper);
registerProvider(none);

function registerProvider(provider) {
  providers.set(provider.name, provider);
}

function getProvider(name = config.audio.alignment.provider) {
  const provider = providers.get(name);
  if (!provider) {
    LoggerService.warn(`Unknown alignment provider "${name}", alignment disabled`);
    return none;
  }
  return provider;
}

/** Align a set of clips with the configured provider. Resolves to one entry per file. */
function alignBatch(files, opts) {
  return getProvider().alignBatch(files, opts);
}

module.exports = { alignBatch, registerProvider, getProvider };
