const hashInputs = require('../../utils/hashInputs');
const config = require('../../config');
const LoggerService = require('./LoggerService');
const MetricsService = require('./MetricsService');
const { getStorageProvider } = require('../storage/providers');

/**
 * Content-addressed Smart Cache for expensive, deterministic generation
 * calls (TTS synthesis) so identical inputs across
 * different jobs skip the GPU/TTS round trip and reuse a prior result.
 * Built entirely on the existing MinIO storage provider - a dedicated
 * bucket (config.minio.cacheBucket), not the per-job scenesBucket/
 * videoBucket, so job cleanup/delete never touches cached entries.
 *
 * Script/curriculum generation is deliberately NOT cached here - that
 * sampling (temperature 0.7) is meant to be creative/non-deterministic.
 *
 * Single Responsibility: cache lookups/writes. Callers decide what's safe
 * to cache and compute the cache key.
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

    try {
      const metaChunks = [];
      const metaStream = await this.#client().getObject(config.minio.cacheBucket, metaKey);
      for await (const chunk of metaStream) metaChunks.push(chunk);
      const metadata = JSON.parse(Buffer.concat(metaChunks).toString('utf8'));

      const provider = getStorageProvider();
      await provider.copyObject(config.minio.scenesBucket, `${jobId}/audio/${fileName}`, config.minio.cacheBucket, audioKey);

      LoggerService.info('Smart Cache hit: TTS audio', { hash, jobId, fileName });
      MetricsService.increment('cache.hits');
      return metadata;
    } catch {
      MetricsService.increment('cache.misses');
      return null;
    }
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
   * metadata. Returns null on a miss. A backend error (not a plain "no such
   * key") is logged and also treated as a miss - a flaky cache must never
   * fail narration, it just costs a regeneration.
   */
  static async getSegmentAudio(kind, hash, destPath) {
    if (!config.cache.enabled) return null;
    const { audioKey, metaKey } = this.#segmentKeys(kind, hash);
    try {
      const chunks = [];
      const stream = await this.#client().getObject(config.minio.cacheBucket, metaKey);
      for await (const chunk of stream) chunks.push(chunk);
      const metadata = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      await this.#client().fGetObject(config.minio.cacheBucket, audioKey, destPath);
      MetricsService.increment(`tts.segment.${kind}.hit`);
      return metadata;
    } catch (err) {
      if (err?.code !== 'NoSuchKey' && err?.code !== 'NotFound') {
        LoggerService.warn('Smart Cache segment lookup failed', { kind, hash, error: err.message });
      }
      MetricsService.increment(`tts.segment.${kind}.miss`);
      return null;
    }
  }

  /** Stores a segment clip + metadata. Returns false (never throws) if the cache is unavailable. */
  static async putSegmentAudio(kind, hash, localFilePath, metadata) {
    if (!config.cache.enabled) return false;
    const { audioKey, metaKey } = this.#segmentKeys(kind, hash);
    try {
      await this.#client().fPutObject(config.minio.cacheBucket, audioKey, localFilePath);
      await this.#client().putObject(config.minio.cacheBucket, metaKey, Buffer.from(JSON.stringify(metadata)));
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
  // size, model, sampler settings, workflow). Same shape as TTS audio above.

  /** Same stable hash as hashTtsInputs; named for what it is when the inputs aren't TTS. */
  static hashInputs(inputs) {
    return this.hashTtsInputs(inputs);
  }

  /**
   * On a hit, copies the cached image into the job's own `{jobId}/images/{fileName}`
   * path (where scene URLs point) and returns the sidecar metadata. Null on a miss.
   */
  static async getImage(hash, jobId, fileName) {
    if (!config.cache.enabled) return null;
    const imageKey = `image/${hash}.png`;
    const metaKey = `image/${hash}.json`;

    try {
      const metaChunks = [];
      const metaStream = await this.#client().getObject(config.minio.cacheBucket, metaKey);
      for await (const chunk of metaStream) metaChunks.push(chunk);
      const metadata = JSON.parse(Buffer.concat(metaChunks).toString('utf8'));

      await getStorageProvider().copyObject(config.minio.scenesBucket, `${jobId}/images/${fileName}`, config.minio.cacheBucket, imageKey);

      LoggerService.info('Smart Cache hit: scene image', { hash, jobId, fileName });
      MetricsService.increment('cache.hits');
      return metadata;
    } catch {
      MetricsService.increment('cache.misses');
      return null;
    }
  }

  static async putImage(hash, localFilePath, metadata) {
    if (!config.cache.enabled) return;
    try {
      await this.#client().fPutObject(config.minio.cacheBucket, `image/${hash}.png`, localFilePath);
      await this.#client().putObject(config.minio.cacheBucket, `image/${hash}.json`, Buffer.from(JSON.stringify(metadata)));
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
      MetricsService.increment('cache.hits');
      return Buffer.concat(chunks).toString('utf8');
    } catch {
      MetricsService.increment('cache.misses');
      return null;
    }
  }

  static async putReferenceTranscript(cacheKey, transcript) {
    if (!config.cache.enabled) return;
    const key = `tts-transcript/${cacheKey}.txt`;
    try {
      await this.#client().putObject(config.minio.cacheBucket, key, Buffer.from(transcript, 'utf8'));
      LoggerService.info('Smart Cache stored: reference transcript', { cacheKey });
    } catch (err) {
      LoggerService.warn('Smart Cache failed to store reference transcript', { cacheKey, error: err.message });
    }
  }
}

module.exports = CacheService;
