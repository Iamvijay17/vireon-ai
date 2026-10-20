const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('../../../config');
const LoggerService = require('../../common/LoggerService');

/**
 * Reading the finished file back: container facts via ffprobe, and the actual
 * decoded audio and picture via ffmpeg.
 *
 * The decode is the point. A file can have a perfectly good header and still be
 * truncated or corrupt in the middle, and the only way to know is to decode it
 * - which also gives us the samples and frames the silence and black-frame
 * checks measure. Both are read as small raw streams (8 kHz mono PCM, tiny
 * grayscale frames) and analysed in JS, so nothing depends on which filters
 * a given ffmpeg build ships (Remotion's bundled one has no blackdetect).
 *
 * Tools: the configured ffmpeg/ffprobe (FFMPEG_PATH / FFPROBE_PATH, else PATH),
 * falling back to the ones Remotion installs with its compositor package, which
 * are always there wherever a render could happen.
 */

const AUDIO_RATE = 8000;
const FRAME_W = 32;
const FRAME_H = 18;

let toolsPromise = null;

const run = (file, args, { signal, timeoutMs = 120_000, maxBuffer = 64 * 1024 * 1024 } = {}) =>
  new Promise((resolve, reject) => {
    execFile(file, args, { encoding: 'buffer', timeout: timeoutMs, maxBuffer, windowsHide: true, signal: signal || undefined }, (err, stdout, stderr) => {
      if (err) {
        err.stdout = stdout;
        err.stderr = stderr;
        return reject(err);
      }
      resolve({ stdout, stderr });
    });
  });

const works = (file) => run(file, ['-version'], { timeoutMs: 10_000 }).then(() => true, () => false);

/** Where Remotion put its own ffmpeg/ffprobe, if it did. */
function remotionBundledTools() {
  let root;
  try {
    root = require('../../video/RemotionService').getRemotionProjectRoot();
  } catch {
    return null;
  }
  const scopeDir = path.join(root, 'node_modules', '@remotion');
  let entries = [];
  try {
    entries = fs.readdirSync(scopeDir);
  } catch {
    return null;
  }
  const exe = process.platform === 'win32' ? '.exe' : '';
  for (const entry of entries.filter((e) => e.startsWith(`compositor-${process.platform}-${process.arch}`))) {
    const ffmpeg = path.join(scopeDir, entry, `ffmpeg${exe}`);
    const ffprobe = path.join(scopeDir, entry, `ffprobe${exe}`);
    if (fs.existsSync(ffmpeg) && fs.existsSync(ffprobe)) return { ffmpeg, ffprobe };
  }
  return null;
}

/** `{ ffmpeg, ffprobe, source }` or null when neither the system's nor Remotion's tools run. Cached. */
function resolveTools() {
  if (!toolsPromise) {
    toolsPromise = (async () => {
      const configured = { ffmpeg: config.audio.ffmpegPath, ffprobe: config.audio.ffprobePath };
      if ((await works(configured.ffmpeg)) && (await works(configured.ffprobe))) return { ...configured, source: 'system' };

      const bundled = remotionBundledTools();
      if (bundled && (await works(bundled.ffmpeg)) && (await works(bundled.ffprobe))) {
        LoggerService.info('[QC] Using the ffmpeg bundled with Remotion', { ffmpeg: bundled.ffmpeg });
        return { ...bundled, source: 'remotion' };
      }
      LoggerService.warn('[QC] No ffmpeg/ffprobe available - decode-based video checks will be skipped. Set FFMPEG_PATH / FFPROBE_PATH.');
      return null;
    })();
  }
  return toolsPromise;
}

function parseFps(rate) {
  const [n, d] = String(rate || '').split('/').map(Number);
  return n > 0 && d > 0 ? n / d : null;
}

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

/** Pure: ffprobe's JSON -> the facts the checks use. */
function parseProbe(json) {
  const streams = Array.isArray(json?.streams) ? json.streams : [];
  const v = streams.find((s) => s.codec_type === 'video');
  const a = streams.find((s) => s.codec_type === 'audio');
  const format = json?.format || {};
  return {
    formatName: format.format_name || null,
    durationSec: num(format.duration),
    sizeBytes: num(format.size),
    video: v ? {
      codec: v.codec_name,
      width: v.width,
      height: v.height,
      fps: parseFps(v.avg_frame_rate) || parseFps(v.r_frame_rate),
      durationSec: num(v.duration) ?? num(format.duration),
      frames: num(v.nb_frames),
    } : null,
    audio: a ? {
      codec: a.codec_name,
      channels: a.channels,
      sampleRate: num(a.sample_rate),
      durationSec: num(a.duration) ?? num(format.duration),
    } : null,
  };
}

async function probe(tools, file, { signal } = {}) {
  const { stdout } = await run(tools.ffprobe, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], { signal, timeoutMs: 60_000 });
  return parseProbe(JSON.parse(stdout.toString('utf8')));
}

const errorLines = (stderr) =>
  String(stderr?.toString?.('utf8') ?? stderr ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

/**
 * Decode the whole audio track to mono 16-bit PCM. Returns `{ pcm, sampleRate, errors }`;
 * `errors` is whatever the decoder complained about while doing it.
 */
async function decodeAudio(tools, file, { signal, timeoutMs }) {
  const { stdout, stderr } = await run(tools.ffmpeg, ['-v', 'error', '-nostdin', '-i', file, '-map', '0:a:0', '-vn', '-ac', '1', '-ar', String(AUDIO_RATE), '-f', 's16le', '-'], { signal, timeoutMs });
  return { pcm: stdout, sampleRate: AUDIO_RATE, errors: errorLines(stderr) };
}

/**
 * Decode the picture to tiny grayscale frames at `fps`. Returns
 * `{ gray, frameBytes, fps, errors }`.
 */
async function decodeFrames(tools, file, { fps, signal, timeoutMs }) {
  const { stdout, stderr } = await run(tools.ffmpeg, ['-v', 'error', '-nostdin', '-i', file, '-map', '0:v:0', '-an', '-vf', `fps=${fps},scale=${FRAME_W}:${FRAME_H},format=gray`, '-f', 'rawvideo', '-'], { signal, timeoutMs });
  return { gray: stdout, frameBytes: FRAME_W * FRAME_H, fps, errors: errorLines(stderr) };
}

/** Test hook. */
function _resetForTests() {
  toolsPromise = null;
}

module.exports = { resolveTools, probe, parseProbe, decodeAudio, decodeFrames, AUDIO_RATE, FRAME_W, FRAME_H, _resetForTests };
