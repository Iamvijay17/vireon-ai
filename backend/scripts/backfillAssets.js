/**
 * One-off backfill: populate the Asset registry (added for the centralized
 * asset system) from media already referenced by existing VideoJob,
 * CourseVideo, and AudioGeneration docs - assets uploaded before the
 * registry existed have no Asset entry yet.
 *
 * Safe to re-run: upserts on the {ownerId, key} unique index, so nothing is
 * duplicated on a second pass. Size is left null for backfilled rows (would
 * require a `statObject` round trip per file); mimeType is derived from the
 * extension, which is free.
 *
 * Usage: node scripts/backfillAssets.js
 */
const path = require('path');
const { connectDatabase } = require('../src/config/database');
const { getStorageProvider } = require('../src/services/storage/providers');
const Asset = require('../src/models/Asset');
const VideoJob = require('../src/models/VideoJob');
const CourseVideo = require('../src/models/CourseVideo');
const AudioGeneration = require('../src/models/AudioGeneration');

const MIME_TYPES = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

function mimeTypeFor(fileName) {
  return MIME_TYPES[path.extname(fileName).toLowerCase()] || null;
}

let created = 0;
let skipped = 0;

async function upsertAsset({ ownerType, ownerId, category, url }) {
  const storage = getStorageProvider();
  let bucket;
  let key;
  try {
    ({ bucket, key } = storage.parsePublicUrl(url));
  } catch {
    skipped++;
    return;
  }

  const fileName = path.basename(key);
  const exists = await storage.objectExists(ownerId, category, fileName).catch(() => false);
  if (!exists) {
    skipped++;
    return;
  }

  const existedBefore = await Asset.exists({ ownerId, key });

  await Asset.findOneAndUpdate(
    { ownerId, key },
    {
      ownerType,
      ownerId,
      category,
      bucket,
      key,
      url,
      fileName,
      mimeType: mimeTypeFor(fileName),
    },
    { upsert: true, new: true }
  );

  if (!existedBefore) created++;
}

async function backfillVideoJobs() {
  const storage = getStorageProvider();
  const jobs = await VideoJob.find({}).lean();
  for (const job of jobs) {
    if (job.videoUrl) await upsertAsset({ ownerType: 'video', ownerId: job._id, category: 'render', url: job.videoUrl });
    if (job.thumbnailUrl) await upsertAsset({ ownerType: 'video', ownerId: job._id, category: 'render', url: job.thumbnailUrl });
    if (job.avatarVideoUrl) await upsertAsset({ ownerType: 'video', ownerId: job._id, category: 'avatar', url: job.avatarVideoUrl });
    for (const url of job.audioUrls || []) {
      await upsertAsset({ ownerType: 'video', ownerId: job._id, category: 'audio', url });
    }
    for (const scene of job.script?.scenes || []) {
      if (scene.audio?.file) {
        const url = storage.getPublicUrl(job._id, 'audio', scene.audio.file);
        await upsertAsset({ ownerType: 'video', ownerId: job._id, category: 'audio', url });
      }
    }
  }
  console.log(`VideoJob: scanned ${jobs.length}`);
}

async function backfillCourseVideos() {
  const storage = getStorageProvider();
  const videos = await CourseVideo.find({}).lean();
  for (const video of videos) {
    if (video.renderUrl) await upsertAsset({ ownerType: 'course-video', ownerId: video._id, category: 'render', url: video.renderUrl });
    if (video.avatarVideoUrl) await upsertAsset({ ownerType: 'course-video', ownerId: video._id, category: 'avatar', url: video.avatarVideoUrl });
    if (video.audioUrl) await upsertAsset({ ownerType: 'course-video', ownerId: video._id, category: 'audio', url: video.audioUrl });
    for (const scene of video.script?.scenes || []) {
      if (scene.audio?.file) {
        const url = storage.getPublicUrl(video._id, 'audio', scene.audio.file);
        await upsertAsset({ ownerType: 'course-video', ownerId: video._id, category: 'audio', url });
      }
    }
  }
  console.log(`CourseVideo: scanned ${videos.length}`);
}

async function backfillAudioGenerations() {
  const records = await AudioGeneration.find({}).lean();
  for (const record of records) {
    if (record.audioUrl) await upsertAsset({ ownerType: 'audio-studio', ownerId: record._id, category: 'audio-studio', url: record.audioUrl });
    for (const turn of record.turns || []) {
      if (turn.file) await upsertAsset({ ownerType: 'audio-studio', ownerId: record._id, category: 'audio-studio', url: turn.file });
    }
    for (const chunk of record.chunks || []) {
      if (chunk.file) await upsertAsset({ ownerType: 'audio-studio', ownerId: record._id, category: 'audio-studio', url: chunk.file });
    }
  }
  console.log(`AudioGeneration: scanned ${records.length}`);
}

async function main() {
  await connectDatabase();
  await backfillVideoJobs();
  await backfillCourseVideos();
  await backfillAudioGenerations();
  console.log(`Done. Created ${created} Asset record(s), skipped ${skipped} missing/unrecognized reference(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
