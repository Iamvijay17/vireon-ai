#!/usr/bin/env node
/**
 * Check a video's layout on demand - the same check the pipeline runs when
 * QC_ENABLED=true (see services/qc/), without waiting for a render.
 *
 *   node scripts/layoutQc.js --job <videoJobId>      a video job in your database
 *   node scripts/layoutQc.js --assets <file.json>    an assets.json (the render props'
 *                                                    "assets", e.g. backend/jobs/<id>/assets.json)
 *
 * Prints every problem found, worst first, and exits 1 if any is an error
 * (cut-off or off-frame text, a broken image) so it can gate a script or CI step.
 * Reads backend/.env like the server does; --assets needs no database.
 */
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const flag = (name) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : null;
};

async function loadFromJob(jobId) {
  const mongoose = require('mongoose');
  const config = require('../src/config');
  await mongoose.connect(config.mongodb.uri, { serverSelectionTimeoutMS: 8000 });

  const VideoJob = require('../src/models/VideoJob');
  const RemotionService = require('../src/services/video/RemotionService');
  const job = await VideoJob.findById(jobId);
  if (!job) throw new Error(`No video job ${jobId}`);
  if (!job.script?.scenes?.length) throw new Error(`Job ${jobId} has no script yet`);

  const assets = await RemotionService.prepareAssets(jobId, job.script, {
    type: job.type,
    language: job.language,
    resolution: job.resolution,
    quality: job.quality,
    aspectRatio: job.aspectRatio,
    fontPairing: job.fontPairing,
    captionAnimation: job.captionAnimation,
    avatar: job.avatarVideoUrl ? { videoUrl: job.avatarVideoUrl, position: job.avatarPosition } : undefined,
  });
  return { jobId, assets, close: () => mongoose.disconnect() };
}

async function main() {
  const jobId = flag('job');
  const assetsFile = flag('assets');
  if (!jobId && !assetsFile) {
    console.error('Usage: node scripts/layoutQc.js --job <videoJobId> | --assets <assets.json>');
    process.exit(2);
  }

  let loaded;
  if (assetsFile) {
    const assets = JSON.parse(fs.readFileSync(path.resolve(assetsFile), 'utf8'));
    loaded = { jobId: path.basename(path.dirname(path.resolve(assetsFile))) || 'assets', assets: assets.assets || assets, close: async () => {} };
  } else {
    loaded = await loadFromJob(jobId);
  }

  const LayoutQcService = require('../src/services/qc/LayoutQcService');
  console.log(`Checking ${loaded.assets.scenes?.length || 0} scene(s)...`);
  const result = await LayoutQcService.run({ jobId: loaded.jobId, assets: loaded.assets });
  await loaded.close();

  if (result.issues.length === 0) {
    console.log(`\nNo layout problems found (${result.scenesChecked} scenes, ${(result.durationMs / 1000).toFixed(1)}s).`);
    return 0;
  }

  console.log('');
  for (const issue of result.issues) {
    console.log(`  scene ${String(issue.scene).padEnd(3)} ${issue.severity === 'error' ? 'ERROR' : 'warn '}  ${issue.type.padEnd(13)} ${issue.message}`);
  }
  console.log(`\n${result.errors} error(s), ${result.warnings} warning(s) across ${result.scenesChecked} scenes (${(result.durationMs / 1000).toFixed(1)}s).`);
  return result.errors > 0 ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`Layout check failed: ${err.message}`);
    process.exit(2);
  });
