const crypto = require('crypto');
const fs = require('fs');
const { Transform } = require('stream');
const archiver = require('archiver');
const { buildSubtitles } = require('../../../utils/subtitles');
const { PublishError } = require('../errors');
const { buildManifest, buildCourseMetadata, renderChecklist, NOTICE } = require('./manifest');

/**
 * Writes the Udemy package ZIP to `outFile`.
 *
 *   manifest.json            machine-readable curriculum + media list (with SHA-256 per file)
 *   course-metadata.json     course-level fields only
 *   validation-report.json   what was wrong / worth knowing when this was built
 *   PUBLISHING-CHECKLIST.md  step-by-step manual upload guide
 *   README.txt               the "this does not publish anything" notice
 *   videos/<NN-section>/...  lesson videos, numbered to match the curriculum
 *   captions/*.srt           timed captions where word alignment exists
 *   promo/promo-video.mp4    the promo video, when rendered
 *
 * Media is streamed from storage into the archive one object at a time (never
 * buffered whole), stored uncompressed - MP4 is already compressed, so deflate
 * would only burn CPU. Entries are added one at a time so each file's hash is
 * known before the manifest (which records it) is written last.
 */

function hashingPassThrough() {
  const hash = crypto.createHash('sha256');
  let bytes = 0;
  const stream = new Transform({
    transform(chunk, _enc, cb) {
      hash.update(chunk);
      bytes += chunk.length;
      cb(null, chunk);
    },
  });
  return { stream, digest: () => ({ sha256: hash.digest('hex'), sizeBytes: bytes }) };
}

function appendAndWait(archive, source, name, options = {}) {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      archive.off('entry', onEntry);
      reject(err);
    };
    const onEntry = (entry) => {
      if (entry.name !== name) return;
      archive.off('entry', onEntry);
      archive.off('error', onError);
      resolve();
    };
    archive.on('entry', onEntry);
    archive.on('error', onError);
    archive.append(source, { name, ...options });
  });
}

async function buildPackage({
  plan, validation, videos = [], storage, outFile,
  includeMedia = true, includeCaptions = true, generator = {},
  onProgress = async () => {}, isCancelled = async () => false,
}) {
  const byId = new Map(videos.map((v) => [String(v._id), v]));
  const generatedAt = new Date();
  const media = {}; // path -> { sizeBytes, sha256 }

  const output = fs.createWriteStream(outFile);
  const archive = archiver('zip', { zlib: { level: 6 } });
  const finished = new Promise((resolve, reject) => {
    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);
  });
  archive.pipe(output);

  const lectures = plan.sections.flatMap((s) => s.lectures).filter((l) => l.video.available);
  const mediaItems = [
    ...(plan.promo?.video.available ? [{ path: plan.promo.video.path, renderUrl: plan.promo.video.renderUrl }] : []),
    ...lectures.map((l) => ({ path: l.video.path, renderUrl: l.video.renderUrl })),
  ];
  const steps = (includeMedia ? mediaItems.length : 0) + (includeCaptions ? lectures.length : 0) + 4;
  let done = 0;
  const tick = async (label) => {
    done += 1;
    await onProgress({ done, steps, label });
  };

  try {
    if (includeMedia) {
      for (const item of mediaItems) {
        if (await isCancelled()) throw new PublishError('CANCELLED', 'The export was cancelled');
        const { bucket, key } = storage.parsePublicUrl(item.renderUrl);
        const source = await storage.getObjectStream(bucket, key);
        const hasher = hashingPassThrough();
        source.on('error', (err) => hasher.stream.destroy(err));
        source.pipe(hasher.stream);
        await appendAndWait(archive, hasher.stream, item.path, { store: true });
        media[item.path] = hasher.digest();
        await tick(item.path);
      }
    }

    if (includeCaptions) {
      for (const lec of lectures) {
        const video = byId.get(lec.id);
        // Only voice-aligned captions: estimated pacing would put words on screen at the
        // wrong time, and a wrong caption file is worse than none.
        const { cues, text } = lec.hasCaptions ? buildSubtitles(video?.script?.scenes, 'srt') : { cues: 0, text: '' };
        if (cues > 0) {
          const buf = Buffer.from(text, 'utf8');
          await appendAndWait(archive, buf, lec.video.captionPath);
          media[lec.video.captionPath] = { sizeBytes: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex') };
        }
        await tick(lec.video.captionPath);
      }
    }

    // The documents last: the manifest records the hashes computed above.
    const manifest = buildManifest(plan, validation, { media, generator, generatedAt });
    const json = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await appendAndWait(archive, json(manifest), 'manifest.json');
    await appendAndWait(archive, json(buildCourseMetadata(plan)), 'course-metadata.json');
    await appendAndWait(archive, json({ generatedAt: manifest.generatedAt, ...validation }), 'validation-report.json');
    await appendAndWait(archive, Buffer.from(renderChecklist(plan, validation), 'utf8'), 'PUBLISHING-CHECKLIST.md');
    await appendAndWait(archive, Buffer.from(`${NOTICE}\n`, 'utf8'), 'README.txt');
    await tick('manifest');

    await archive.finalize();
    await finished;
  } catch (err) {
    archive.abort();
    // Wait for the file handle to actually close before deleting: destroying a stream that is
    // still opening can otherwise (re)create the file after the rm below has run.
    await new Promise((resolve) => {
      if (output.closed) return resolve();
      output.once('close', resolve);
      output.destroy();
      return undefined;
    });
    await fs.promises.rm(outFile, { force: true }).catch(() => {});
    throw err;
  }

  return { manifest: buildManifest(plan, validation, { media, generator, generatedAt }), media, bytes: Object.values(media).reduce((s, m) => s + m.sizeBytes, 0) };
}

module.exports = { buildPackage };
