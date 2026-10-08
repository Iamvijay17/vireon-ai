const { execFile } = require('child_process');
const { promisify } = require('util');
const os = require('os');
const path = require('path');
const config = require('../../../../config');
const LoggerService = require('../../../common/LoggerService');
const { createLimiter } = require('./limiter');

const execFileAsync = promisify(execFile);

/**
 * Alignment providers turn finished audio clips into per-word timings. The
 * pipeline only ever talks to this interface (through speech/alignmentService,
 * which normalises the result), so a stronger forced-alignment model
 * (e.g. wav2vec2 / MFA) can replace faster-whisper by registering a provider -
 * no pipeline code changes.
 *
 * A provider's `alignBatch(files, opts)` resolves to one entry per file: an
 * array of `{ word, start, end, probability? }` in seconds, or null when that
 * file could not be aligned. `opts` may carry `signal`, `languages[]` (TTS
 * language names, one per file) and `prompts[]` (vocabulary hints, one per
 * file) - a provider is free to ignore the hints. It must never throw for a
 * per-file problem, and must never invent timings it did not measure.
 *
 * `version` identifies the measurement behaviour: it is stored with every
 * alignment and is part of cache validity, so swapping provider or model
 * (or changing how the hints are used) retires old alignment data.
 */
const providers = new Map();

const SCRIPT = path.resolve(__dirname, '../../alignCaptions.py');

// Qwen3-TTS language names -> the ISO codes whisper expects. 'auto' (or an
// unknown name) lets the recogniser detect the language itself.
const WHISPER_LANGUAGE = {
  english: 'en', chinese: 'zh', japanese: 'ja', korean: 'ko', german: 'de',
  french: 'fr', russian: 'ru', portuguese: 'pt', spanish: 'es', italian: 'it',
};

// The recogniser takes the hint as a style/vocabulary primer, not as text to
// find; a long one only slows decoding.
const MAX_PROMPT_CHARS = 400;

// Bumped when the way the aligner is driven changes in a way that can move
// timestamps (prompting, decoding flags).
const FASTER_WHISPER_DRIVER_VERSION = 2;

// One process at a time by default: this is CPU work beside the GPU workers
// and Remotion, and parallel runs would only fight each other for cores.
const limiter = createLimiter(() => config.audio.alignment.concurrency);

const fasterWhisper = {
  name: 'faster-whisper',
  get version() {
    const { model, textPrompt } = config.audio.alignment;
    return `faster-whisper:${model}:d${FASTER_WHISPER_DRIVER_VERSION}${textPrompt ? ':prompt' : ''}`;
  },
  async alignBatch(files, { signal, languages = [], prompts = [] } = {}) {
    if (files.length === 0) return [];
    const useHints = config.audio.alignment.textPrompt;
    const jobs = files.map((file, i) => ({
      file,
      language: WHISPER_LANGUAGE[String(languages[i] || '').toLowerCase()] || null,
      prompt: useHints && prompts[i] ? String(prompts[i]).slice(0, MAX_PROMPT_CHARS) : null,
    }));

    try {
      const pending = execFileAsync('python', [SCRIPT, '--jobs', config.audio.alignment.model], {
        encoding: 'utf8',
        // Model load plus ~10s of CPU per clip; generous so a slow box does
        // not silently lose all alignment.
        timeout: 60000 + files.length * 20000,
        maxBuffer: 32 * 1024 * 1024,
        signal: signal || undefined,
        env: { ...process.env, ALIGNMENT_CPU_THREADS: String(config.audio.alignment.cpuThreads) },
        windowsHide: true,
      });
      // Jobs go in over stdin as UTF-8 JSON: no temp files, no argv length limits.
      pending.child.stdin.on('error', () => { /* the process died; the await below reports it */ });
      pending.child.stdin.end(JSON.stringify(jobs), 'utf8');
      lowerPriority(pending.child.pid);
      const { stdout } = await pending;

      const lines = stdout.split('\n').map((l) => l.trim()).filter((l) => l === 'null' || l.startsWith('{'));
      if (lines.length !== files.length) {
        LoggerService.warn('Speech alignment returned an unexpected number of results', { expected: files.length, got: lines.length });
        return files.map(() => null);
      }
      return lines.map((line) => {
        try {
          const parsed = JSON.parse(line);
          return Array.isArray(parsed?.words) && parsed.words.length > 0 ? parsed.words : null;
        } catch {
          return null;
        }
      });
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      LoggerService.warn('Speech alignment failed, falling back to segment-level timing', { error: err.message });
      return files.map(() => null);
    }
  },
};

/** Best effort: alignment must never starve the GPU workers or a running render. */
function lowerPriority(pid) {
  if (!pid) return;
  try {
    os.setPriority(pid, os.constants.priority.PRIORITY_BELOW_NORMAL);
  } catch {
    /* not permitted / process already gone - priority is a courtesy */
  }
}

const none = {
  name: 'none',
  version: 'none',
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

/** Identifies what would measure a clip right now - stored with, and checked against, cached alignment. */
function getAlignmentVersion() {
  const provider = getProvider();
  return typeof provider.version === 'string' ? provider.version : provider.name;
}

/** Align a set of clips with the configured provider. Resolves to one entry per file. */
function alignBatch(files, opts) {
  return limiter.run(() => getProvider().alignBatch(files, opts));
}

module.exports = { alignBatch, registerProvider, getProvider, getAlignmentVersion };
