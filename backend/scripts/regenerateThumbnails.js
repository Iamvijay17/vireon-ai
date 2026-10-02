#!/usr/bin/env node
/**
 * Replaces the thumbnail of already-rendered video jobs with a frame taken
 * from the job's ACTUAL rendered video.mp4 (960px wide JPEG).
 *
 * Why: until the loading-placeholder fix, `remotion still` captured the
 * template's dark "loading" fallback, so some thumbnails are a flat #1a1a2e
 * square. Taking the frame from the finished video (instead of re-rendering a
 * still) guarantees the thumbnail looks exactly like the video, which a new
 * still would not for jobs rendered before scenes carried their `sceneId`.
 *
 * Safe by default: prints what it would do. The old thumbnail object is left in
 * storage; only the job's `thumbnailUrl` is repointed.
 *
 *   node scripts/regenerateThumbnails.js job-AAAA1111 job-BBBB2222          # dry run
 *   node scripts/regenerateThumbnails.js job-AAAA1111 --apply               # do it
 *
 * Needs ffmpeg on PATH (or FFMPEG=C:\path\to\ffmpeg.exe) and the same backend/.env
 * as the app (Mongo + MinIO).
 */
const path = require('path');
const os = require('os');
const fs = require('fs');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);
const FPS = 30;

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const jobIds = args.filter((a) => !a.startsWith('--'));
  if (jobIds.length === 0) {
    console.error('usage: node scripts/regenerateThumbnails.js <jobId> [<jobId>...] [--apply]');
    process.exit(2);
  }

  const mongoose = require('mongoose');
  const config = require('../src/config');
  const VideoJob = require('../src/models/VideoJob');
  const { getStorageProvider } = require('../src/services/storage/providers');
  const ffmpeg = process.env.FFMPEG || 'ffmpeg';

  await mongoose.connect(config.mongodb.uri, { serverSelectionTimeoutMS: 10000 });
  console.log(apply ? 'APPLY mode' : 'DRY RUN (add --apply to write)');

  let failures = 0;
  for (const jobId of jobIds) {
    try {
      const job = await VideoJob.findById(jobId).lean();
      if (!job) throw new Error('job not found');
      if (job.status !== 'COMPLETED' || !job.videoUrl) throw new Error(`not a completed video (status ${job.status})`);

      // Same frame the pipeline picks: 30% into the second scene (middle of
      // the only scene for a single-scene video). Durations are the audio
      // durations the render used.
      const scenes = job.script?.scenes || [];
      const dur = (s) => s.audio?.duration || s.duration || 8;
      const seconds =
        scenes.length > 1
          ? dur(scenes[0]) + dur(scenes[1]) * 0.3
          : scenes.length === 1
            ? dur(scenes[0]) * 0.5
            : 1;

      // Read the video through MinIO directly (the stored URL's host may be an old LAN IP).
      const videoPath = new URL(job.videoUrl).pathname;
      const source = `http://${config.minio.endpoint}:${config.minio.port}${videoPath}`;

      console.log(`${jobId}: frame at ${seconds.toFixed(2)}s of ${source}`);
      console.log(`  current thumbnail: ${job.thumbnailUrl || '(none)'}`);
      if (!apply) continue;

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'thumb-'));
      const out = path.join(tmpDir, 'thumbnail.jpg'); // basename becomes the storage key
      await execFileAsync(ffmpeg, ['-y', '-loglevel', 'error', '-ss', seconds.toFixed(2), '-i', source, '-frames:v', '1', '-vf', 'scale=960:-2', '-q:v', '3', out]);
      const bytes = fs.statSync(out).size;
      if (bytes < 2048) throw new Error(`suspiciously small thumbnail (${bytes} B)`);

      const url = await getStorageProvider().uploadFile(jobId, out, 'render');
      await VideoJob.updateOne({ _id: jobId }, { $set: { thumbnailUrl: url } });
      fs.rmSync(tmpDir, { recursive: true, force: true });
      console.log(`  -> ${url} (${Math.round(bytes / 1024)} KB)`);
    } catch (err) {
      failures += 1;
      console.error(`${jobId}: FAILED - ${err.message}`);
    }
  }

  await mongoose.disconnect();
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
