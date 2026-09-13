/**
 * One-off backfill: populate `size` for existing Asset rows that have
 * `size: null` - either backfilled by scripts/backfillAssets.js (which never
 * stats), or recorded before the MinioStorageProvider/AssetService fix that
 * stats the local scratch file before upload instead of after (the local
 * file is often already deleted by job cleanup by the time the old code
 * re-stat'd it, so every asset recorded under the old code path has
 * size: null).
 *
 * Safe to re-run: only touches rows still matching size: null, and leaves a
 * row untouched (still null) if the object is missing from MinIO.
 *
 * Usage: node scripts/backfillAssetSizes.js
 */
const { connectDatabase } = require('../src/config/database');
const { getStorageProvider } = require('../src/services/storage/providers');
const Asset = require('../src/models/Asset');

let updated = 0;
let missing = 0;

async function backfillSizes() {
  const storage = getStorageProvider();
  const assets = await Asset.find({ size: null }).lean();

  for (const asset of assets) {
    const size = await storage.statObjectSize(asset.bucket, asset.key);
    if (size == null) {
      missing++;
      continue;
    }
    await Asset.updateOne({ _id: asset._id }, { $set: { size } });
    updated++;
  }

  console.log(`Asset: scanned ${assets.length} null-size row(s)`);
}

async function main() {
  await connectDatabase();
  await backfillSizes();
  console.log(`Done. Updated ${updated} row(s), ${missing} object(s) missing from MinIO (left null).`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
