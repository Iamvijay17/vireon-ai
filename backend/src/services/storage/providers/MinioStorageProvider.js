const path = require('path');
const fs = require('fs/promises');
const Minio = require('minio');
const config = require('../../../config');
const LoggerService = require('../../common/LoggerService');
const StorageProvider = require('./StorageProvider');
const Asset = require('../../../models/Asset');
const AssetService = require('../../asset/AssetService');

// Which bucket a category lives in, and what subfolder (if any) its files
// sit under within a video's own prefix. script.json/assets.json are local
// scratch data only (never uploaded - the script content lives in Mongo,
// assets.json is rebuilt fresh on every render), so there's no job-level
// bucket - see the bucket layout in the storage plan.
const CATEGORY_MAP = {
  audio: { bucket: () => config.minio.scenesBucket, subfolder: 'audio' },
  avatar: { bucket: () => config.minio.scenesBucket, subfolder: 'avatar' },
  render: { bucket: () => config.minio.videoBucket, subfolder: null },
  // Audio Studio generations are keyed by AudioGeneration._id, not a video
  // jobId - kept in their own subfolder of scenesBucket so they can't
  // collide with a video's own audio/ files.
  'audio-studio': { bucket: () => config.minio.scenesBucket, subfolder: 'audio-studio' },
};

// Anonymous-read policy applied to each bucket so uploaded assets are
// reachable via plain GET URLs, matching the public download_url behavior
// callers relied on from GitHubStorageProvider.
function publicReadPolicy(bucket) {
  return JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: { AWS: ['*'] },
        Action: ['s3:GetObject'],
        Resource: [`arn:aws:s3:::${bucket}/*`],
      },
    ],
  });
}

/**
 * MinIO (S3-compatible) Storage Provider.
 *
 * Spreads video assets across two buckets instead of one flat namespace:
 * scenes (audio/avatar, keyed by videoId), video (render output, keyed by
 * videoId). In this codebase jobId and videoId are the same underlying
 * Mongo _id.
 */
class MinioStorageProvider extends StorageProvider {
  constructor() {
    super();
    this.client = new Minio.Client({
      endPoint: config.minio.endpoint,
      port: config.minio.port,
      useSSL: config.minio.useSSL,
      accessKey: config.minio.accessKey,
      secretKey: config.minio.secretKey,
    });
    this.#ready = this.#ensureBuckets();
  }

  #ready;

  async #ensureBuckets() {
    // Cache bucket gets the same anonymous-read policy as the other two -
    // CacheService.getAvatarClip hands its URL straight to callers as
    // avatarVideoUrl, which needs to be fetchable the same way a
    // scenesBucket URL is.
    const buckets = [...new Set([config.minio.scenesBucket, config.minio.videoBucket, config.minio.cacheBucket])];
    for (const bucket of buckets) {
      const exists = await this.client.bucketExists(bucket).catch(() => false);
      if (!exists) {
        await this.client.makeBucket(bucket);
        LoggerService.info(`MinIO bucket created: ${bucket}`);
      }
      await this.client.setBucketPolicy(bucket, publicReadPolicy(bucket));
    }
  }

  /**
   * Server-side copy of one object to another bucket/key, used by
   * CacheService to materialize a cached TTS clip at a job's own
   * `{jobId}/audio/{fileName}` path on a cache hit - existing consumers only
   * know the job-scoped filename (see StorageService/CATEGORY_MAP), not the
   * cache bucket, so the bytes have to actually live there too. Avoids a
   * download+re-upload round trip through this process.
   */
  async copyObject(destBucket, destKey, srcBucket, srcKey) {
    await this.#ready;
    await this.client.copyObject(destBucket, destKey, `/${srcBucket}/${srcKey}`);
  }

  /**
   * Resolve a (id, category, fileName) triple to the bucket + in-bucket key
   * it lives at.
   */
  #resolve(id, category, fileName) {
    const mapping = CATEGORY_MAP[category];
    if (!mapping) throw new Error(`Unknown storage category: ${category}`);
    const bucket = mapping.bucket();
    const key = mapping.subfolder ? `${id}/${mapping.subfolder}/${fileName}` : `${id}/${fileName}`;
    return { bucket, key };
  }

  getPublicUrl(id, category, fileName) {
    const { bucket, key } = this.#resolve(id, category, fileName);
    return `${config.minio.publicUrl}/${bucket}/${key}`;
  }

  /**
   * Reverse of getPublicUrl: split a previously-returned public URL back
   * into its bucket + in-bucket key, so a caller holding only the stored
   * URL (e.g. CourseVideo.renderUrl) can stream the object's bytes directly
   * instead of proxying an extra HTTP request to MinIO's public endpoint.
   * Only the path is inspected on purpose - stored URLs may carry whatever
   * origin MINIO_PUBLIC_URL pointed at when they were written (127.0.0.1, a
   * previous LAN IP, the current LAN IP), so requiring an exact prefix would
   * break every historical record whenever that setting changes.
   */
  parsePublicUrl(url) {
    if (!url || !/^https?:\/\//i.test(String(url))) {
      throw new Error(`Not a recognized MinIO public URL: ${url}`);
    }
    const [bucket, ...keyParts] = new URL(String(url)).pathname.replace(/^\//, '').split('/');
    if (!bucket || keyParts.length === 0) {
      throw new Error(`Not a recognized MinIO public URL: ${url}`);
    }
    return { bucket, key: keyParts.join('/') };
  }

  /**
   * Open a readable stream for an object, given its bucket + key (as
   * returned by parsePublicUrl). Used for download endpoints that need to
   * set a custom filename via Content-Disposition.
   */
  async getObjectStream(bucket, key) {
    await this.#ready;
    return this.client.getObject(bucket, key);
  }

  async objectExists(id, category, fileName) {
    await this.#ready;
    const { bucket, key } = this.#resolve(id, category, fileName);
    try {
      await this.client.statObject(bucket, key);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Upload a single file to MinIO, keyed by videoId. Retries with
   * exponential backoff on transient failures.
   *
   * @param {string} id
   * @param {string} filePath - Absolute path to local file.
   * @param {string} category - 'audio', 'avatar', or 'render'.
   * @returns {Promise<string>} Public download URL.
   */
  async uploadFile(id, filePath, category) {
    await this.#ready;
    const fileName = path.basename(filePath);
    const { bucket, key } = this.#resolve(id, category, fileName);

    let lastError = null;
    for (let attempt = 1; attempt <= config.minio.uploadRetries; attempt++) {
      try {
        LoggerService.upload(`Uploading ${category}/${fileName} to MinIO (attempt ${attempt})`, {
          bucket,
          key,
        });
        // Stat before uploading, while the local scratch file is certainly
        // still there - job cleanup can delete it moments after this
        // function returns, so a stat done any later (e.g. inside
        // AssetService.recordUpload, un-awaited) reliably loses that race.
        const size = await fs.stat(filePath).then((s) => s.size).catch(() => null);
        await this.client.fPutObject(bucket, key, filePath);
        const url = this.getPublicUrl(id, category, fileName);
        LoggerService.upload(`Uploaded ${category}/${fileName}`, { url });
        await AssetService.recordUpload({ id, category, bucket, key, url, filePath, size });
        return url;
      } catch (err) {
        lastError = err;
        const isLastAttempt = attempt === config.minio.uploadRetries;
        LoggerService.warn(
          `MinIO upload attempt ${attempt} failed${isLastAttempt ? ' (final)' : ''}`,
          { error: err.message }
        );
        if (!isLastAttempt) {
          const delay = Math.min(2000 * Math.pow(2, attempt - 1), 16000);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(`MinIO upload failed after ${config.minio.uploadRetries} attempts: ${lastError?.message}`);
  }

  /**
   * Delete all assets for a given video from MinIO: `{videoId}/*` from the
   * scenes and video buckets.
   *
   * @param {string} jobId
   * @param {string} [videoId]
   * @returns {Promise<void>}
   */
  async deleteJob(jobId, videoId = jobId) {
    await this.#ready;

    const targets = [
      { bucket: config.minio.scenesBucket, prefix: `${videoId}/` },
      { bucket: config.minio.videoBucket, prefix: `${videoId}/` },
    ];

    for (const { bucket, prefix } of targets) {
      try {
        const objectNames = await new Promise((resolve, reject) => {
          const names = [];
          const stream = this.client.listObjectsV2(bucket, prefix, true);
          stream.on('data', (obj) => names.push(obj.name));
          stream.on('error', reject);
          stream.on('end', () => resolve(names));
        });

        if (objectNames.length > 0) {
          await this.client.removeObjects(bucket, objectNames);
          LoggerService.info(`Deleted ${objectNames.length} object(s) from MinIO`, { bucket, jobId, videoId });
        }
      } catch (err) {
        LoggerService.warn('Failed to delete objects from MinIO', { bucket, jobId, videoId, error: err.message });
      }
    }

    await Asset.deleteMany({ ownerId: videoId }).catch(() => {});
  }

  /**
   * Delete a single object by its bucket + key, as returned by parsePublicUrl.
   * Used for one-off asset cleanup (e.g. orphaned assets) where a full
   * deleteJob prefix wipe would be too broad.
   */
  async deleteObject(bucket, key) {
    await this.#ready;
    await this.client.removeObject(bucket, key);
  }

  /**
   * Byte size of an already-uploaded object, or null if it doesn't exist.
   */
  async statObjectSize(bucket, key) {
    await this.#ready;
    try {
      const stat = await this.client.statObject(bucket, key);
      return stat.size;
    } catch {
      return null;
    }
  }
}

module.exports = MinioStorageProvider;
