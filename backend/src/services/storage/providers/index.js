const config = require('../../../config');
const LoggerService = require('../../common/LoggerService');
const MinioStorageProvider = require('./MinioStorageProvider');

/**
 * Storage Provider Factory.
 *
 * Returns the MinIO storage provider instance (singleton) - the backend's
 * only storage backend.
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

  providerInstance = new MinioStorageProvider();
  LoggerService.info('Storage provider initialized: MinIO', {
    endpoint: `${config.minio.endpoint}:${config.minio.port}`,
    scenesBucket: config.minio.scenesBucket,
    videoBucket: config.minio.videoBucket,
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
