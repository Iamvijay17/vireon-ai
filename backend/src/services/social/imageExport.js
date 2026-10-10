const fs = require('fs');
const os = require('os');
const path = require('path');
const { pipeline } = require('stream/promises');
const { customAlphabet } = require('nanoid');
const ffmpeg = require('../audio/pipeline/ffmpeg');
const LoggerService = require('../common/LoggerService');
const { readImageSize } = require('./imageMeta');

const idTail = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 10);

// Tried in order until the file fits the platform cap: best quality first, then smaller, then smaller AND shrunk.
const ATTEMPTS = Object.freeze([
  { quality: 2, scale: 1 },
  { quality: 6, scale: 1 },
  { quality: 8, scale: 0.7 },
]);

/**
 * Image Studio saves PNGs (and 2k/4k ones can pass the 8 MB image cap), but Instagram accepts JPEG only.
 * So a picked Image Studio picture is re-encoded once into a JPEG that belongs to the promotion
 * (`social/...`), which also means deleting the picture in Image Studio cannot break a scheduled post.
 *
 * Returns the stored media description, or null when it cannot be done (ffmpeg missing, file unreadable,
 * nothing small enough) - the caller then keeps the original PNG, which still works on Facebook and Threads.
 */
async function exportAsJpeg({ storage, source, destBucket, destKey, maxBytes, fileName }) {
  if (!(await ffmpeg.isAvailable())) {
    LoggerService.warn('ffmpeg is not available, so the Image Studio picture was not converted to JPEG');
    return null;
  }
  const stem = path.join(os.tmpdir(), `vireon-social-img-${idTail()}`);
  const input = `${stem}.in`;
  const output = `${stem}.jpg`;
  try {
    await pipeline(await storage.getObjectStream(source.bucket, source.key), fs.createWriteStream(input));

    let fitted = false;
    for (const { quality, scale } of ATTEMPTS) {
      const args = ['-i', input, '-frames:v', '1'];
      if (scale !== 1) args.push('-vf', `scale=trunc(iw*${scale}/2)*2:trunc(ih*${scale}/2)*2`);
      args.push('-q:v', String(quality), '-pix_fmt', 'yuvj420p', output);
      await ffmpeg.runFfmpeg(args, { timeoutMs: 60000 });
      const { size } = await fs.promises.stat(output);
      if (size > 0 && size <= maxBytes) {
        fitted = true;
        break;
      }
    }
    if (!fitted) return null;

    const stored = await storage.putObjectFile(destBucket, destKey, output, 'image/jpeg');
    const stat = await storage.statObject(destBucket, destKey);
    const head = Buffer.alloc(65536);
    const fd = await fs.promises.open(output, 'r');
    let read = 0;
    try {
      ({ bytesRead: read } = await fd.read(head, 0, head.length, 0));
    } finally {
      await fd.close();
    }
    const dims = readImageSize(head.subarray(0, read), 'image/jpeg');
    return {
      kind: 'image', bucket: destBucket, key: destKey, size: stored.size ?? stat?.size ?? 0, etag: stat?.etag || '',
      contentType: 'image/jpeg', fileName, durationSec: null,
      width: dims?.width ?? source.width ?? null, height: dims?.height ?? source.height ?? null, measured: dims ? 'file' : 'record',
    };
  } catch (err) {
    LoggerService.warn('Could not convert the Image Studio picture to JPEG; using the original', { error: err.message });
    return null;
  } finally {
    fs.promises.unlink(input).catch(() => {});
    fs.promises.unlink(output).catch(() => {});
  }
}

module.exports = { exportAsJpeg, ATTEMPTS };
