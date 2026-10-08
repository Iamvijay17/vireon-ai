const mongoose = require('mongoose');

/**
 * One row per cached artifact (an image, a TTS clip, ...) - the ledger of what the
 * smart cache holds and how it is used. The bytes live in MinIO (the cache bucket);
 * this is the bookkeeping that makes the cache measurable: how often an entry is
 * served, how long it took to make, when it was last reused, and whether it has gone
 * stale (its object vanished from storage).
 *
 * Written best-effort and never read on the generation path, so a failure here can
 * only cost a statistic - never a result. `_id` is `${kind}:${key}`.
 */
const cacheEntrySchema = new mongoose.Schema(
  {
    _id: { type: String },
    // 'image' | 'tts' | 'tts-seg-raw' | 'tts-seg-processed' | 'transcript'
    kind: { type: String, required: true },
    key: { type: String, required: true },

    // Served from the cache without generating.
    hits: { type: Number, default: 0 },
    // Asked for, not there, had to be generated.
    misses: { type: Number, default: 0 },
    // Waited for an identical request already generating, instead of generating again.
    shared: { type: Number, default: 0 },
    // Times the metadata was present but the stored object was missing.
    stale: { type: Number, default: 0 },

    // Cost of making it: summed over every time it was generated, plus the last one.
    generations: { type: Number, default: 0 },
    generationMs: { type: Number, default: 0 },
    lastGenerationMs: { type: Number, default: null },

    sizeBytes: { type: Number, default: null },
    status: { type: String, enum: ['ready', 'stale'], default: 'ready' },

    firstStoredAt: { type: Date, default: null },
    // The last time it was reused instead of regenerated.
    lastHitAt: { type: Date, default: null },
    lastMissAt: { type: Date, default: null },
    lastStaleAt: { type: Date, default: null },
  },
  { versionKey: false }
);

cacheEntrySchema.index({ kind: 1, status: 1 });
cacheEntrySchema.index({ lastHitAt: -1 });

module.exports = mongoose.model('CacheEntry', cacheEntrySchema);
