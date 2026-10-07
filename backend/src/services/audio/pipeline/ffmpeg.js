const { execFile } = require('child_process');
const { promisify } = require('util');
const config = require('../../../config');
const LoggerService = require('../../common/LoggerService');
const { SegmentError, SEGMENT_ERROR_CODES } = require('./errors');

const execFileAsync = promisify(execFile);

// ffmpeg is an optional dependency of the narration pipeline: it is needed
// for loudness/EQ/compression and speed changes, not for plain synthesis.
// The probe result is cached for the process lifetime - installing ffmpeg
// needs a worker restart anyway (PATH is read at spawn).
let probePromise = null;
const filterCache = new Map();

const MAX_BUFFER = 16 * 1024 * 1024;

async function probe() {
  try {
    const { stdout } = await execFileAsync(config.audio.ffmpegPath, ['-hide_banner', '-version'], {
      timeout: 10000,
      windowsHide: true,
    });
    const version = stdout.split('\n')[0].replace(/^ffmpeg version\s+/i, '').trim();
    return { available: true, version };
  } catch (err) {
    return { available: false, version: null, reason: err.code === 'ENOENT' ? 'not found' : err.message };
  }
}

/**
 * `{ available, version, reason? }`. Logs once when ffmpeg is missing so the
 * degraded behaviour (post-processing skipped) is visible rather than silent.
 */
function getFfmpegStatus() {
  if (!probePromise) {
    probePromise = probe().then((status) => {
      if (status.available) {
        LoggerService.info('ffmpeg available for audio processing', { version: status.version });
      } else {
        LoggerService.warn(
          'ffmpeg not available - audio post-processing and speed changes will be skipped. Set FFMPEG_PATH to enable them.',
          { path: config.audio.ffmpegPath, reason: status.reason }
        );
      }
      return status;
    });
  }
  return probePromise;
}

async function isAvailable() {
  return (await getFfmpegStatus()).available;
}

/** Whether this ffmpeg build ships a given filter (e.g. "rubberband", "afftdn"). */
async function hasFilter(name) {
  if (filterCache.has(name)) return filterCache.get(name);
  let present = false;
  try {
    const { stdout } = await execFileAsync(config.audio.ffmpegPath, ['-hide_banner', '-filters'], {
      timeout: 10000,
      windowsHide: true,
      maxBuffer: MAX_BUFFER,
    });
    present = new RegExp(`\\s${name}\\s`).test(stdout);
  } catch {
    present = false;
  }
  filterCache.set(name, present);
  return present;
}

/**
 * Run ffmpeg. Throws SegmentError(PROCESSING_FAILED) with the original error
 * in `cause` for logs; the message itself stays user-safe.
 */
async function runFfmpeg(args, { signal, timeoutMs = 120000 } = {}) {
  try {
    return await execFileAsync(config.audio.ffmpegPath, ['-hide_banner', '-nostdin', '-y', ...args], {
      timeout: timeoutMs,
      windowsHide: true,
      maxBuffer: MAX_BUFFER,
      signal: signal || undefined,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    const tail = String(err.stderr || err.message || '').split('\n').slice(-6).join('\n');
    LoggerService.warn('ffmpeg failed', { args: args.join(' ').slice(0, 300), stderr: tail });
    throw new SegmentError(SEGMENT_ERROR_CODES.PROCESSING_FAILED, undefined, { cause: err });
  }
}

/** Duration in ms via ffprobe; null when ffprobe isn't usable. */
async function probeDurationMs(filePath) {
  try {
    const { stdout } = await execFileAsync(
      config.audio.ffprobePath,
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', filePath],
      { timeout: 15000, windowsHide: true }
    );
    const seconds = parseFloat(stdout);
    return Number.isFinite(seconds) ? Math.round(seconds * 1000) : null;
  } catch {
    return null;
  }
}

/** Test hook: forget cached probe results. */
function _resetForTests() {
  probePromise = null;
  filterCache.clear();
}

module.exports = { getFfmpegStatus, isAvailable, hasFilter, runFfmpeg, probeDurationMs, _resetForTests };
