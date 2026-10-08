const fs = require('fs').promises;
const hashInputs = require('../../utils/hashInputs');
const config = require('../../config');
const LoggerService = require('./LoggerService');
const MetricsService = require('./MetricsService');
const ledger = require('../cache/CacheLedger');
const { getStorageProvider } = require('../storage/providers');

/**
 * Content-addressed Smart Cache for expensive, deterministic generation
 * calls (TTS synthesis, scene images) so identical inputs across
 * different jobs skip the GPU round trip and reuse a prior result.
 * Built entirely on the existing MinIO storage provider - a dedicated
 * bucket (config.minio.cacheBucket), not the per-job scenesBucket/
 * videoBucket, so job cleanup/delete never touches cached entries.
 *
 * Script/curriculum generation is deliberately NOT cached here - that
 * sampling (temperature 0.7) is meant to be creative/non-deterministic.
 *
 * Single Responsibility: cache lookups/writes. Callers decide what's safe
 * to cache and compute the cache key (see services/cache/cacheKeys.js).
 *
 * Every entry is a pair: the bytes (`<kind>/<hash>.<ext>`) and a small JSON
 * sidecar (`<kind>/<hash>.json`) that is read first. Two things can go wrong with
 * a pair, and they are not the same:
 *   - no sidecar: a plain miss - nothing was ever cached under this key;
 *   - a sidecar but no bytes: a STALE entry (the object was lost or expired out of
 *     band). The sidecar is evicted so it stops being trusted, the staleness is
 *     recorded, and the lookup is reported as a miss - the caller regenerates and
 *     the entry heals itself.
 * A backend failure (not "no such key") is logged and also treated as a miss: a
 * flaky cache must never fail a generation, it only costs a regeneration.
 *
 * Hits, misses, staleness, sizes and reuse times are recorded in the cache ledger
 * (services/cache/CacheLedger.js) alongside the existing Metric counters.
 */
class CacheService {
  static #client() {
    return getStorageProvider().client;
  }

  /**
   * Stable content hash for a set of TTS inputs. Order-independent (keys
   * are sorted) so callers don't have to worry about property order.
   */
  static hashTtsInputs(inputs) {
    return hashInputs(inputs);
  }

  static #isMissing(err) {
    return err?.code === 'NoSuchKey' || err?.code === 'NotFound' || err?.code === 'NoSuchObject';
  }

  /** Read and parse a JSON sidecar; null for "not there". Throws for any other failure. */
  static async #readJson(key) {
    const chunks = [];
    let stream;
    try {
      stream = await this.#client().getObject(config.minio.cacheBucket, key);
      for await (const chunk of stream) chunks.push(chunk);
    } catch (err) {
      if (this.#isMissing(err)) return null;
      throw err;
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }

  /** The bytes behind a sidecar are gone: stop trusting the sidecar, and say so. */
  static async #evictStale(kind, hash, metaKey, reason) {
    ledger.stale(kind, hash);
    LoggerService.warn('Smart Cache entry is stale - its stored object is missing; it will be regenerated', { kind, hash, reason });
    await this.#client().removeObject(config.minio.cacheBucket, metaKey).catch(() => {});
  }

  static #hit(kind, hash, metric = 'cache.hits') {
    ledger.hit(kind, hash);
    MetricsService.increment(metric);
  }

  static #miss(kind, hash, metric = 'cache.misses') {
    ledger.miss(kind, hash);
    MetricsService.increment(metric);
  }

  static async #sizeOf(localFilePath) {
    try {
      return (await fs.stat(localFilePath)).size;
    } catch {
      return null;
    }
  }

  // ---- TTS audio: keyed by a content hash of (text, voice, seed, ...) ----

  /**
   * On a hit, copies the cached audio bytes into the job's own
   * `{jobId}/audio/{fileName}` path (existing consumers only know that
   * job-scoped filename, not the cache bucket - see MinioStorageProvider)
   * and returns the sidecar metadata. Returns null on a miss.
   */
  static async getTtsAudio(hash, jobId, fileName) {
    if (!config.cache.enabled) return null;
    const audioKey = `tts/${hash}.mp3`;
    const metaKey = `tts/${hash}.json`;

    let metadata;
    try {
      metadata = await this.#readJson(metaKey);
    } catch (err) {
      LoggerService.warn('Smart Cache TTS lookup failed', { hash, error: err.message });
    }
    if (!metadata) {
      this.#miss('tts', hash);
      return null;
    }

    try {
      const provider = getStorageProvider();
      await provider.copyObject(config.minio.scenesBucket, `${jobId}/audio/${fileName}`, config.minio.cacheBucket, audioKey);
    } catch (err) {
      if (this.#isMissing(err)) await this.#evictStale('tts', hash, metaKey, err.message);
      else LoggerService.warn('Smart Cache TTS copy failed', { hash, error: err.message });
      this.#miss('tts', hash);
      return null;
    }

    LoggerService.info('Smart Cache hit: TTS audio', { hash, jobId, fileName });
    this.#hit('tts', hash);
    return metadata;
  }

  static async putTtsAudio(hash, localFilePath, metadata) {
    if (!config.cache.enabled) return;
    const audioKey = `tts/${hash}.mp3`;
    const metaKey = `tts/${hash}.json`;
    try {
      await this.#client().fPutObject(config.minio.cacheBucket, audioKey, localFilePath);
      await this.#client().putObject(
        config.minio.cacheBucket,
        metaKey,
        Buffer.from(JSON.stringify(metadata)),
      );
      ledger.stored('tts', hash, { sizeBytes: await this.#sizeOf(localFilePath) });
      LoggerService.info('Smart Cache stored: TTS audio', { hash });
    } catch (err) {
      LoggerService.warn('Smart Cache failed to store TTS audio', { hash, error: err.message });
    }
  }

  // ---- Segment-level TTS audio (segmented narration pipeline). Two kinds,
  // keyed independently - see services/audio/pipeline/cacheKeys.js:
  //   'raw'       straight from the TTS model (the expensive GPU result)
  //   'processed' after speed/loudness/EQ post-processing
  // Unlike getTtsAudio above these hand back a local file, because the
  // pipeline works on segments locally and only the assembled scene is
  // uploaded to the job's storage path.

  static #segmentKeys(kind, hash) {
    return { audioKey: `tts-seg/${kind}/${hash}.wav`, metaKey: `tts-seg/${kind}/${hash}.json` };
  }

  /**
   * On a hit, downloads the cached clip to `destPath` and returns its
   * metadata. Returns null on a miss (including a stale entry whose clip is gone).
   */
  static async getSegmentAudio(kind, hash, destPath) {
    if (!config.cache.enabled) return null;
    const { audioKey, metaKey } = this.#segmentKeys(kind, hash);
    const ledgerKind = `tts-seg-${kind}`;
    const metric = `tts.segment.${kind}`;

    let metadata;
    try {
      metadata = await this.#readJson(metaKey);
    } catch (err) {
      LoggerService.warn('Smart Cache segment lookup failed', { kind, hash, error: err.message });
    }
    if (!metadata) {
      this.#miss(ledgerKind, hash, `${metric}.miss`);
      return null;
    }

    try {
      await this.#client().fGetObject(config.minio.cacheBucket, audioKey, destPath);
    } catch (err) {
      if (this.#isMissing(err)) await this.#evictStale(ledgerKind, hash, metaKey, err.message);
      else LoggerService.warn('Smart Cache segment download failed', { kind, hash, error: err.message });
      this.#miss(ledgerKind, hash, `${metric}.miss`);
      return null;
    }

    this.#hit(ledgerKind, hash, `${metric}.hit`);
    return metadata;
  }

  /** Stores a segment clip + metadata. Returns false (never throws) if the cache is unavailable. */
  static async putSegmentAudio(kind, hash, localFilePath, metadata) {
    if (!config.cache.enabled) return false;
    const { audioKey, metaKey } = this.#segmentKeys(kind, hash);
    try {
      await this.#client().fPutObject(config.minio.cacheBucket, audioKey, localFilePath);
      await this.#client().putObject(config.minio.cacheBucket, metaKey, Buffer.from(JSON.stringify(metadata)));
      ledger.stored(`tts-seg-${kind}`, hash, { sizeBytes: await this.#sizeOf(localFilePath) });
      return true;
    } catch (err) {
      LoggerService.warn('Smart Cache failed to store TTS segment', { kind, hash, error: err.message });
      return false;
    }
  }

  /** Rewrites only the sidecar metadata of an already-cached segment (e.g. once word timings are known). */
  static async putSegmentMeta(kind, hash, metadata) {
    if (!config.cache.enabled) return false;
    try {
      await this.#client().putObject(config.minio.cacheBucket, this.#segmentKeys(kind, hash).metaKey, Buffer.from(JSON.stringify(metadata)));
      return true;
    } catch (err) {
      LoggerService.warn('Smart Cache failed to update TTS segment metadata', { kind, hash, error: err.message });
      return false;
    }
  }

  // ---- Generated scene images: keyed by a content hash of (prompt, seed,
  // size, model, sampler settings, workflow) - see cache/cacheKeys.js imageKey.
  // Same shape as TTS audio above.

  /** Same stable hash as hashTtsInputs; named for what it is when the inputs aren't TTS. */
  static hashInputs(inputs) {
    return this.hashTtsInputs(inputs);
  }

  /**
   * On a hit, copies the cached image into the job's own `{jobId}/images/{fileName}`
   * path (where scene URLs point) and returns the sidecar metadata. Null on a miss -
   * including a stale entry whose image object has gone missing from the cache bucket.
   */
  static async getImage(hash, jobId, fileName) {
    if (!config.cache.enabled) return null;
    const imageKey = `image/${hash}.png`;
    const metaKey = `image/${hash}.json`;

    let metadata;
    try {
      metadata = await this.#readJson(metaKey);
    } catch (err) {
      LoggerService.warn('Smart Cache image lookup failed', { hash, error: err.message });
    }
    if (!metadata) {
      this.#miss('image', hash);
      return null;
    }

    try {
      await getStorageProvider().copyObject(config.minio.scenesBucket, `${jobId}/images/${fileName}`, config.minio.cacheBucket, imageKey);
    } catch (err) {
      if (this.#isMissing(err)) await this.#evictStale('image', hash, metaKey, err.message);
      else LoggerService.warn('Smart Cache image copy failed', { hash, error: err.message });
      this.#miss('image', hash);
      return null;
    }

    LoggerService.info('Smart Cache hit: scene image', { hash, jobId, fileName });
    this.#hit('image', hash);
    return metadata;
  }

  static async putImage(hash, localFilePath, metadata) {
    if (!config.cache.enabled) return;
    try {
      await this.#client().fPutObject(config.minio.cacheBucket, `image/${hash}.png`, localFilePath);
      await this.#client().putObject(config.minio.cacheBucket, `image/${hash}.json`, Buffer.from(JSON.stringify(metadata)));
      ledger.stored('image', hash, { sizeBytes: await this.#sizeOf(localFilePath) });
      LoggerService.info('Smart Cache stored: scene image', { hash });
    } catch (err) {
      LoggerService.warn('Smart Cache failed to store scene image', { hash, error: err.message });
    }
  }

  // ---- Voice-clone reference transcripts: keyed by the (bundled, fixed)
  // reference audio filename, not user-uploaded content. ----

  /**
   * ttsClient.getReferenceText already memoizes this in an in-process Map,
   * which only helps repeat calls within one worker's lifetime - every
   * worker restart (deploy, crash-recovery, or just a second worker
   * process) re-pays for transcribing the same handful of bundled
   * reference-voice files. Persisting it here like TTS audio itself makes
   * that transcription a true one-time cost.
   */
  static async getReferenceTranscript(cacheKey) {
    if (!config.cache.enabled) return null;
    const key = `tts-transcript/${cacheKey}.txt`;
    try {
      const chunks = [];
      const stream = await this.#client().getObject(config.minio.cacheBucket, key);
      for await (const chunk of stream) chunks.push(chunk);
      LoggerService.info('Smart Cache hit: reference transcript', { cacheKey });
      this.#hit('transcript', cacheKey);
      return Buffer.concat(chunks).toString('utf8');
    } catch {
      this.#miss('transcript', cacheKey);
      return null;
    }
  }

  static async putReferenceTranscript(cacheKey, transcript) {
    if (!config.cache.enabled) return;
    const key = `tts-transcript/${cacheKey}.txt`;
    try {
      await this.#client().putObject(config.minio.cacheBucket, key, Buffer.from(transcript, 'utf8'));
      ledger.stored('transcript', cacheKey, { sizeBytes: Buffer.byteLength(transcript, 'utf8') });
      LoggerService.info('Smart Cache stored: reference transcript', { cacheKey });
    } catch (err) {
      LoggerService.warn('Smart Cache failed to store reference transcript', { cacheKey, error: err.message });
    }
  }
}

module.exports = CacheService;
