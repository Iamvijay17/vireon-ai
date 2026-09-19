/**
 * Reports how much of what the pipeline generates it has generated before.
 *
 * Reads the `contentHash` / `cacheKey` columns that MinioStorageProvider now
 * records on every upload (see AssetService.recordUpload) and answers three
 * questions the v2 cache design rests on:
 *
 *   1. Duplicate bytes - how many assets are byte-identical copies of an
 *      asset already stored under a different key, and how much storage that
 *      accounts for. This is the ceiling on what content-addressing saves.
 *   2. Cache-key coverage - how many assets carry the input hash of the step
 *      that produced them. Only TTS reports one today; anything at 0% is a
 *      step whose cache-hit rate can't be measured yet.
 *   3. Non-determinism - a cacheKey mapping to more than one contentHash
 *      means identical inputs produced different bytes, so that step's
 *      output cannot be safely reused from cache.
 *
 * Read-only. Assets uploaded before this column existed have contentHash
 * null and are reported separately rather than counted as unique.
 *
 * Usage: node scripts/artifactStats.js
 */
const { connectDatabase } = require('../src/config/database');
const Asset = require('../src/models/Asset');

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function pct(part, whole) {
  if (!whole) return '0%';
  return `${((part / whole) * 100).toFixed(1)}%`;
}

async function report() {
  const assets = await Asset.find({}).select('category contentHash cacheKey size key').lean();
  const hashed = assets.filter((a) => a.contentHash);
  const unhashed = assets.length - hashed.length;

  console.log(`\nAssets: ${assets.length} total, ${hashed.length} hashed, ${unhashed} predate hashing\n`);

  // ── duplicate bytes ──
  const byHash = new Map();
  for (const asset of hashed) {
    if (!byHash.has(asset.contentHash)) byHash.set(asset.contentHash, []);
    byHash.get(asset.contentHash).push(asset);
  }

  let duplicateCount = 0;
  let duplicateBytes = 0;
  for (const copies of byHash.values()) {
    if (copies.length < 2) continue;
    duplicateCount += copies.length - 1;
    // Everything past the first copy is what content-addressing would not
    // have stored a second time.
    duplicateBytes += copies.slice(1).reduce((sum, a) => sum + (a.size || 0), 0);
  }

  console.log('Duplicate bytes');
  console.log(`  distinct blobs      ${byHash.size}`);
  console.log(`  redundant copies    ${duplicateCount} (${pct(duplicateCount, hashed.length)} of hashed assets)`);
  console.log(`  reclaimable         ${formatBytes(duplicateBytes)}`);

  // ── per-category breakdown, since audio and render dedupe very differently ──
  const categories = [...new Set(hashed.map((a) => a.category))].sort();
  for (const category of categories) {
    const inCategory = hashed.filter((a) => a.category === category);
    const distinct = new Set(inCategory.map((a) => a.contentHash)).size;
    console.log(`  ${category.padEnd(18)}${inCategory.length} assets, ${distinct} distinct (${pct(inCategory.length - distinct, inCategory.length)} redundant)`);
  }

  // ── cache-key coverage ──
  const withKey = hashed.filter((a) => a.cacheKey);
  console.log('\nCache-key coverage');
  console.log(`  assets with an input hash  ${withKey.length} (${pct(withKey.length, hashed.length)})`);
  for (const category of categories) {
    const inCategory = hashed.filter((a) => a.category === category);
    const keyed = inCategory.filter((a) => a.cacheKey).length;
    console.log(`  ${category.padEnd(18)}${pct(keyed, inCategory.length)}`);
  }

  // ── determinism ──
  const hashesByKey = new Map();
  for (const asset of withKey) {
    if (!hashesByKey.has(asset.cacheKey)) hashesByKey.set(asset.cacheKey, new Set());
    hashesByKey.get(asset.cacheKey).add(asset.contentHash);
  }
  const divergent = [...hashesByKey.entries()].filter(([, hashes]) => hashes.size > 1);

  console.log('\nDeterminism');
  console.log(`  distinct input hashes      ${hashesByKey.size}`);
  console.log(`  reused inputs              ${withKey.length - hashesByKey.size}`);
  console.log(`  inputs with varying output ${divergent.length}${divergent.length ? '  <-- not safe to cache' : ''}`);
  for (const [key, hashes] of divergent.slice(0, 5)) {
    console.log(`    ${key.slice(0, 12)}... produced ${hashes.size} different outputs`);
  }
  console.log('');
}

async function main() {
  await connectDatabase();
  await report();
  process.exit(0);
}

main().catch((err) => {
  console.error('Artifact stats failed:', err);
  process.exit(1);
});
