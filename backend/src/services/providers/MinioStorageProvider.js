const path = require('path');
const Minio = require('minio');
const config = require('../../config');
const LoggerService = require('../LoggerService');
const StorageProvider = require('./StorageProvider');

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
    const buckets = [...new Set([config.minio.scenesBucket, config.minio.videoBucket])];
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
   */
  parsePublicUrl(url) {
    const prefix = `${config.minio.publicUrl}/`;
    if (!url || !url.startsWith(prefix)) {
      throw new Error(`Not a recognized MinIO public URL: ${url}`);
    }
    const [bucket, ...keyParts] = url.slice(prefix.length).split('/');
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
        await this.client.fPutObject(bucket, key, filePath);
        const url = this.getPublicUrl(id, category, fileName);
        LoggerService.upload(`Uploaded ${category}/${fileName}`, { url });
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
  }
}

module.exports = MinioStorageProvider;
