const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const config = require('../config');
const LoggerService = require('./LoggerService');

/**
 * Service for uploading files to GitHub repository (temporary storage).
 * Single Responsibility: File upload to GitHub.
 */
class GitHubService {
  static #baseUrl = `https://api.github.com/repos/${config.github.owner}/${config.github.repo}/contents`;

  static #headers() {
    return {
      Authorization: `token ${config.github.token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    };
  }

  /**
   * Upload a file to GitHub repository.
   */
  static async uploadFile(jobId, filePath, category) {
    const fileName = path.basename(filePath);
    const remotePath = `jobs/${jobId}/${category}/${fileName}`;

    const fileContent = await fs.readFile(filePath);
    const contentBase64 = fileContent.toString('base64');

    let lastError = null;

    for (let attempt = 1; attempt <= config.github.uploadRetries; attempt++) {
      try {
        LoggerService.upload(`Uploading ${category}/${fileName} to GitHub (attempt ${attempt})`, {
          remotePath,
          size: `${(fileContent.length / 1024).toFixed(1)} KB`,
        });

        // Check if file exists first
        let sha = null;
        try {
          const existing = await axios.get(`${this.#baseUrl}/${remotePath}`, {
            headers: this.#headers(),
          });
          sha = existing.data.sha;
        } catch {
          // File doesn't exist yet, that's fine
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

    throw new Error(`GitHub upload failed after ${config.github.uploadRetries} attempts: ${lastError.message}`);
  }

  /**
   * Upload multiple files for a job.
   */
  static async uploadJobAssets(jobId, files) {
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
}

module.exports = GitHubService;
