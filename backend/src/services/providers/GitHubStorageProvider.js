const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const config = require('../../config');
const LoggerService = require('../LoggerService');
const StorageProvider = require('./StorageProvider');

/**
 * Git's own blob hash (sha1 of "blob <size>\0<content>"), computed locally
 * so uploadFile can tell whether the local file already matches what's on
 * GitHub without needing a second round-trip. Comparable directly against
 * the `sha` field GitHub's contents API returns.
 */
function gitBlobSha(buffer) {
  const header = Buffer.from(`blob ${buffer.length}\0`);
  return crypto.createHash('sha1').update(Buffer.concat([header, buffer])).digest('hex');
}

/**
 * GitHub Repository Storage Provider.
 *
 * Stores job assets in a GitHub repository under `videos/{jobId}/`
 * mimicking an object storage bucket. Each generated video job is
 * stored as a directory containing all generated assets.
 *
 * The backend persists only the returned GitHub raw URLs in the database.
 */
class GitHubStorageProvider extends StorageProvider {
  constructor() {
    super();
    this.#baseUrl = `https://api.github.com/repos/${config.github.owner}/${config.github.repo}/contents`;
  }

  #baseUrl;

  // One promise chain per jobId, so concurrent upload/delete calls for the
  // *same* job (e.g. a rerender racing the original still-in-flight upload)
  // run one at a time instead of interleaving GET-for-SHA/PUT/DELETE calls
  // against the same remote paths - that GET-then-write pattern isn't
  // atomic on GitHub's side, so two overlapping writers can each read a
  // stale SHA and clobber or 409 on each other's PUT.
  #jobLocks = new Map();

  async #withJobLock(jobId, fn) {
    const previous = this.#jobLocks.get(jobId) || Promise.resolve();
    const tail = previous.then(fn, fn);
    const settleTail = tail.then(() => {}, () => {});
    this.#jobLocks.set(jobId, settleTail);
    try {
      return await tail;
    } finally {
      if (this.#jobLocks.get(jobId) === settleTail) {
        this.#jobLocks.delete(jobId);
      }
    }
  }

  /**
   * Build request headers for GitHub API.
   */
  #headers() {
    return {
      Authorization: `token ${config.github.token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    };
  }

  /**
   * Upload a single file to GitHub under `videos/{jobId}/{category}/{fileName}`.
   * Implements retry logic with exponential backoff. Serialized per jobId -
   * see #withJobLock.
   *
   * @param {string} jobId
   * @param {string} filePath - Absolute path to local file.
   * @param {string} category - 'script', 'audio', or 'render'.
   * @returns {Promise<string>} Raw GitHub download URL.
   */
  async uploadFile(jobId, filePath, category) {
    return this.#withJobLock(jobId, () => this.#uploadFileLocked(jobId, filePath, category));
  }

  async #uploadFileLocked(jobId, filePath, category) {
    const fileName = path.basename(filePath);
    const remotePath = this.getRemotePath(jobId, category, fileName);

    const fileContent = await fs.readFile(filePath);
    const contentBase64 = fileContent.toString('base64');

    let lastError = null;

    for (let attempt = 1; attempt <= config.github.uploadRetries; attempt++) {
      try {
        LoggerService.upload(`Uploading ${category}/${fileName} to GitHub (attempt ${attempt})`, {
          remotePath,
          size: `${(fileContent.length / 1024).toFixed(1)} KB`,
        });

        // Check if file exists to get SHA for update
        let sha = null;
        try {
          const existing = await axios.get(`${this.#baseUrl}/${remotePath}`, {
            headers: this.#headers(),
          });
          sha = existing.data.sha;

          // Same content already on GitHub - skip the PUT entirely. Without
          // this, a BullMQ retry that re-runs a job whose upload step
          // already partially succeeded re-uploads every already-uploaded
          // file from scratch, burning GitHub API calls/rate limit for no
          // reason.
          if (sha === gitBlobSha(fileContent)) {
            LoggerService.upload(`Skipping upload - ${category}/${fileName} already up to date on GitHub`, {
              remotePath,
            });
            return existing.data.download_url || '';
          }
        } catch {
          // File doesn't exist yet — that's fine
        }

        const response = await axios.put(
          `${this.#baseUrl}/${remotePath}`,
          {
            message: `Upload ${category} for job ${jobId}`,
            content: contentBase64,
            sha: sha || undefined,
            branch: config.github.branch,
          },
          { headers: this.#headers() }
        );

        const downloadUrl = response.data.content?.download_url || '';

        LoggerService.upload(`Uploaded ${category}/${fileName}`, {
          url: downloadUrl,
        });

        return downloadUrl;
      } catch (err) {
        lastError = err;
        const isLastAttempt = attempt === config.github.uploadRetries;

        LoggerService.warn(
          `GitHub upload attempt ${attempt} failed${isLastAttempt ? ' (final)' : ''}`,
          { error: err.response?.data?.message || err.message }
        );

        if (!isLastAttempt) {
          const delay = Math.min(2000 * Math.pow(2, attempt - 1), 16000);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(
      `GitHub upload failed after ${config.github.uploadRetries} attempts: ${lastError?.message}`
    );
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
   * Delete all assets for a given job from GitHub.
   * Iterates through all files at `videos/{jobId}/` and deletes them.
   * Serialized per jobId - see #withJobLock.
   *
   * @param {string} jobId
   * @returns {Promise<void>}
   */
  async deleteJob(jobId) {
    return this.#withJobLock(jobId, () => this.#deleteJobLocked(jobId));
  }

  async #deleteJobLocked(jobId) {
    const jobPath = this.getJobPath(jobId);

    try {
      const { data: contents } = await axios.get(`${this.#baseUrl}/${jobPath}`, {
        headers: this.#headers(),
      });

      const items = Array.isArray(contents) ? contents : [contents];

      for (const item of items) {
        try {
          await axios.delete(`${this.#baseUrl}/${item.path}`, {
            headers: this.#headers(),
            data: {
              message: `Delete job ${jobId}`,
              sha: item.sha,
              branch: config.github.branch,
            },
          });
          LoggerService.info(`Deleted ${item.path} from GitHub storage`, { jobId });
        } catch (err) {
          LoggerService.warn(`Failed to delete ${item.path} from GitHub`, {
            jobId,
            error: err.response?.data?.message || err.message,
          });
        }
      }
    } catch (err) {
      // Folder may not exist — that's acceptable
      if (err.response?.status !== 404) {
        LoggerService.warn(`Failed to list job directory on GitHub`, {
          jobId,
          error: err.response?.data?.message || err.message,
        });
      }
    }
  }
}

module.exports = GitHubStorageProvider;