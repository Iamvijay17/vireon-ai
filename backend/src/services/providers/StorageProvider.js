/**
 * Abstract Storage Provider Interface.
 *
 * Defines the contract for all storage providers (GitHub).
 * Each provider must implement these methods to ensure the backend
 * remains storage-agnostic and easily swappable.
 *
 * @abstract
 */
class StorageProvider {
  /**
   * Upload a single file to storage.
   * @param {string} jobId - The job identifier.
   * @param {string} filePath - Absolute path to the local file.
   * @param {string} category - Asset category (e.g., 'script', 'audio', 'render').
   * @returns {Promise<string>} The public URL of the uploaded file.
   * @abstract
   */
  async uploadFile(jobId, filePath, category) {
    throw new Error('Method "uploadFile" must be implemented by subclass');
  }

  /**
   * Upload multiple job assets grouped by category.
   * @param {string} jobId - The job identifier.
   * @param {Object<string, string[]>} files - Map of category → array of file paths.
   * @returns {Promise<Object<string, string[]>>} Map of category → array of uploaded URLs.
   * @abstract
   */
  async uploadJobAssets(jobId, files) {
    throw new Error('Method "uploadJobAssets" must be implemented by subclass');
  }

  /**
   * Delete all assets for a given job from storage.
   * @param {string} jobId - The job identifier.
   * @returns {Promise<void>}
   * @abstract
   */
  async deleteJob(jobId) {
    throw new Error('Method "deleteJob" must be implemented by subclass');
  }

  /**
   * Get the base remote path for a job (e.g., "videos/{jobId}").
   * @param {string} jobId
   * @returns {string}
   */
  getJobPath(jobId) {
    return `videos/${jobId}`;
  }

  /**
   * Get the remote path for a specific file within a job.
   * @param {string} jobId
   * @param {string} category
   * @param {string} fileName
   * @returns {string}
   */
  getRemotePath(jobId, category, fileName) {
    return `${this.getJobPath(jobId)}/${category}/${fileName}`;
  }
}

module.exports = StorageProvider;