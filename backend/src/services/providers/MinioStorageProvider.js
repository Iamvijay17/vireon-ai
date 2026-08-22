const Minio = require('minio');
const config = require('../../config');
const LoggerService = require('../LoggerService');
const StorageProvider = require('./StorageProvider');

// Anonymous-read policy applied to the bucket so uploaded assets are
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
 * Stores job assets in a local MinIO server under `videos/{jobId}/`,
 * mirroring the layout GitHubStorageProvider used. The backend persists
 * only the returned public URLs in the database.
 */
class MinioStorageProvider extends StorageProvider {
  constructor() {
    super();
    this.bucket = config.minio.bucket;
    this.client = new Minio.Client({
      endPoint: config.minio.endpoint,
      port: config.minio.port,
      useSSL: config.minio.useSSL,
      accessKey: config.minio.accessKey,
      secretKey: config.minio.secretKey,
    });
    this.#ready = this.#ensureBucket();
  }

  #ready;

  async #ensureBucket() {
    const exists = await this.client.bucketExists(this.bucket).catch(() => false);
    if (!exists) {
      await this.client.makeBucket(this.bucket);
      LoggerService.info(`MinIO bucket created: ${this.bucket}`);
    }
    await this.client.setBucketPolicy(this.bucket, publicReadPolicy(this.bucket));
  }

  #publicUrl(remotePath) {
    return `${config.minio.publicUrl}/${this.bucket}/${remotePath}`;
  }

  /**
   * Upload a single file to MinIO under `videos/{jobId}/{category}/{fileName}`.
   * Retries with exponential backoff on transient failures.
   *
   * @param {string} jobId
   * @param {string} filePath - Absolute path to local file.
   * @param {string} category - 'script', 'audio', or 'render'.
   * @returns {Promise<string>} Public download URL.
   */
  async uploadFile(jobId, filePath, category) {
    await this.#ready;
    const fileName = require('path').basename(filePath);
    const remotePath = this.getRemotePath(jobId, category, fileName);

    let lastError = null;
    for (let attempt = 1; attempt <= config.minio.uploadRetries; attempt++) {
      try {
        LoggerService.upload(`Uploading ${category}/${fileName} to MinIO (attempt ${attempt})`, {
          remotePath,
        });
        await this.client.fPutObject(this.bucket, remotePath, filePath);
        const url = this.#publicUrl(remotePath);
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
   * Upload multiple job assets grouped by category.
   *
   * @param {string} jobId
   * @param {Object<string, string[]>} files - e.g. { script: [...], audio: [...], render: [...] }
   * @returns {Promise<Object<string, string[]>>} Map of category → array of uploaded URLs.
   */
  async uploadJobAssets(jobId, files) {
    const uploaded = {};

    for (const [category, filePaths] of Object.entries(files)) {
      uploaded[category] = [];
      for (const filePath of filePaths) {
        const url = await this.uploadFile(jobId, filePath, category);
        uploaded[category].push(url);
      }
    }

    return uploaded;
  }

  /**
   * Delete all assets for a given job from MinIO.
   *
   * @param {string} jobId
   * @returns {Promise<void>}
   */
  async deleteJob(jobId) {
    await this.#ready;
    const prefix = `${this.getJobPath(jobId)}/`;

    try {
      const objectNames = await new Promise((resolve, reject) => {
        const names = [];
        const stream = this.client.listObjectsV2(this.bucket, prefix, true);
        stream.on('data', (obj) => names.push(obj.name));
        stream.on('error', reject);
        stream.on('end', () => resolve(names));
      });

      if (objectNames.length > 0) {
        await this.client.removeObjects(this.bucket, objectNames);
        LoggerService.info(`Deleted ${objectNames.length} object(s) from MinIO storage`, { jobId });
      }
    } catch (err) {
      LoggerService.warn('Failed to delete job objects from MinIO', { jobId, error: err.message });
    }
  }
}

module.exports = MinioStorageProvider;
