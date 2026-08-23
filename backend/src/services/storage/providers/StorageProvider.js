/**
 * Abstract Storage Provider Interface.
 *
 * Defines the contract storage providers (currently just MinIO) implement,
 * so callers like RemotionService, AudioService, and AvatarService never
 * need to know which backend is active.
 *
 * @abstract
 */
class StorageProvider {
  /**
   * Upload a single file to storage.
   * @param {string} id - The video identifier.
   * @param {string} filePath - Absolute path to the local file.
   * @param {string} category - Asset category (e.g., 'audio', 'render').
   * @returns {Promise<string>} The public URL of the uploaded file.
   * @abstract
   */
  async uploadFile(id, filePath, category) {
    throw new Error('Method "uploadFile" must be implemented by subclass');
  }

  /**
   * Delete all assets for a given job/video from storage. `videoId` defaults
   * to `jobId` since today they're always the same underlying id - kept as a
   * separate param for providers that key different categories differently.
   * @param {string} jobId - The job identifier.
   * @param {string} [videoId] - The video identifier (audio/avatar/render data).
   * @returns {Promise<void>}
   * @abstract
   */
  async deleteJob(jobId, videoId = jobId) {
    throw new Error('Method "deleteJob" must be implemented by subclass');
  }

  /**
   * Get the public download URL for a file already known to exist in
   * storage, without uploading anything. Used by RemotionService to point
   * Remotion's renderer straight at storage instead of a local file.
   * @param {string} id - The video identifier.
   * @param {string} category - 'audio', 'avatar', or 'render'.
   * @param {string} fileName
   * @returns {string}
   * @abstract
   */
  getPublicUrl(id, category, fileName) {
    throw new Error('Method "getPublicUrl" must be implemented by subclass');
  }

  /**
   * Whether a given file already exists in storage.
   * @param {string} id - The video identifier.
   * @param {string} category - 'audio', 'avatar', or 'render'.
   * @param {string} fileName
   * @returns {Promise<boolean>}
   * @abstract
   */
  async objectExists(id, category, fileName) {
    throw new Error('Method "objectExists" must be implemented by subclass');
  }
}

module.exports = StorageProvider;