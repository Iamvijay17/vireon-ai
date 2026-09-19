/**
 * One-off backfill: populate `contentHash` for Asset rows recorded before
 * AssetService.recordUpload started hashing uploads, by streaming each
 * object back out of MinIO and sha256-ing it. `cacheKey` can't be
 * backfilled - the producing step's inputs weren't recorded - so only new
 * TTS uploads carry one.
 *
 * Safe to re-run: only touches rows still matching contentHash: null, and
 * leaves a row untouched if the object is missing from MinIO.
 *
 * Usage: node scripts/backfillAssetHashes.js
 */
const crypto = require('crypto');
const { connectDatabase } = require('../src/config/database');
const { getStorageProvider } = require('../src/services/storage/providers');
const Asset = require('../src/models/Asset');

let updated = 0;
let missing = 0;

async function hashObject(storage, bucket, key) {
  const stream = await storage.getObjectStream(bucket, key);
  const hash = crypto.createHash('sha256');
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest('hex');
}

async function backfillHashes() {
  const storage = getStorageProvider();
  const assets = await Asset.find({ contentHash: null }).select('bucket key').lean();

  for (const asset of assets) {
    let contentHash;
    try {
      contentHash = await hashObject(storage, asset.bucket, asset.key);
    } catch {
      missing++;
      continue;
    }
    await Asset.updateOne({ _id: asset._id }, { $set: { contentHash } });
    updated++;
  }

  console.log(`Asset: scanned ${assets.length} null-hash row(s)`);
}

async function main() {
  await connectDatabase();
  await backfillHashes();
  console.log(`Done. Hashed ${updated} row(s), ${missing} object(s) missing from MinIO (left null).`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
