const crypto = require('crypto');
const config = require('../../config');
const LoggerService = require('./LoggerService');
const MetricsService = require('./MetricsService');
const { getStorageProvider } = require('../storage/providers');

/**
 * Content-addressed Smart Cache for expensive, deterministic generation
 * calls (avatar animation, TTS synthesis) so identical inputs across
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
    const sorted = Object.keys(inputs)
      .sort()
      .reduce((acc, key) => {
        acc[key] = inputs[key];
        return acc;
      }, {});
    return crypto.createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
  }

  // ---- Avatar clips: exactly 2 possible outputs (male/female), cached permanently ----

  static async getAvatarClip(gender) {
    if (!config.cache.enabled) return null;
    const key = `avatar/${gender}.mp4`;
    try {
      await this.#client().statObject(config.minio.cacheBucket, key);
      const url = `${config.minio.publicUrl}/${config.minio.cacheBucket}/${key}`;
      LoggerService.info('Smart Cache hit: avatar clip', { gender });
      MetricsService.increment('cache.hits');
      return url;
    } catch {
      MetricsService.increment('cache.misses');
      return null;
    }
  }

  static async putAvatarClip(gender, localFilePath) {
    if (!config.cache.enabled) return;
    const key = `avatar/${gender}.mp4`;
    try {
      await this.#client().fPutObject(config.minio.cacheBucket, key, localFilePath);
      LoggerService.info('Smart Cache stored: avatar clip', { gender });
    } catch (err) {
      LoggerService.warn('Smart Cache failed to store avatar clip', { gender, error: err.message });
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

  // ---- Voice-clone reference transcripts: keyed by the (bundled, fixed)
  // reference audio filename - same "small fixed set of files" shape as
  // avatar clips above, not user-uploaded content. ----

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
