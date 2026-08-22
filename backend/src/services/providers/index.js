const config = require('../../config');
const LoggerService = require('../LoggerService');

/**
 * Storage Provider Factory.
 *
 * Returns the configured storage provider instance (singleton), selected
 * via config.storage.provider (STORAGE_PROVIDER env var): 'minio' (default,
 * local MinIO server) or 'github' (GitHub repository as object storage).
 */

let providerInstance = null;

/**
 * Get the current storage provider instance (singleton).
 * @returns {import('./StorageProvider')}
 */
function getStorageProvider() {
  if (providerInstance) {
    return providerInstance;
  }

  if (config.storage.provider === 'github') {
    const GitHubStorageProvider = require('./GitHubStorageProvider');
    providerInstance = new GitHubStorageProvider();
    LoggerService.info(`Storage provider initialized: GitHub`, {
      repo: `${config.github.owner}/${config.github.repo}`,
      branch: config.github.branch,
    });
  } else {
    const MinioStorageProvider = require('./MinioStorageProvider');
    providerInstance = new MinioStorageProvider();
    LoggerService.info(`Storage provider initialized: MinIO`, {
      endpoint: `${config.minio.endpoint}:${config.minio.port}`,
      bucket: config.minio.bucket,
    });
  }

  return providerInstance;
}

/**
 * Reset the provider singleton (useful for testing).
 */
function resetProvider() {
  providerInstance = null;
}

module.exports = { getStorageProvider, resetProvider };