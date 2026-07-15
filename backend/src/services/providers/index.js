const config = require('../../config');
const LoggerService = require('../LoggerService');

/**
 * Storage Provider Factory.
 *
 * Returns the GitHub storage provider instance (singleton).
 * The backend uses GitHub repository as its object storage backend.
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

  const GitHubStorageProvider = require('./GitHubStorageProvider');
  providerInstance = new GitHubStorageProvider();
  LoggerService.info(`Storage provider initialized: GitHub`, {
    repo: `${config.github.owner}/${config.github.repo}`,
    branch: config.github.branch,
  });

  return providerInstance;
}

/**
 * Reset the provider singleton (useful for testing).
 */
function resetProvider() {
  providerInstance = null;
}

module.exports = { getStorageProvider, resetProvider };