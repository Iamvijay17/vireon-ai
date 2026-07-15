const LoggerService = require('./LoggerService');
const { getStorageProvider } = require('./providers');

/**
 * Service for uploading files to GitHub repository (object-storage style).
 *
 * Every generated video job is stored as: videos/{jobId}/
 * containing all generated assets. The backend persists only the
 * returned GitHub URLs in the database.
 *
 * This class is a backward-compatible delegate to the provider layer.
 * New code should use getStorageProvider() from providers/index.js directly.
 */
class GitHubService {
  /**
   * Upload a file to GitHub repository under videos/{jobId}/{category}/.
   * @param {string} jobId
   * @param {string} filePath - Absolute path to local file.
   * @param {string} category - Asset category (e.g., 'script', 'audio', 'render').
   * @returns {Promise<string>} Download URL.
   */
  static async uploadFile(jobId, filePath, category) {
    const provider = getStorageProvider();
    return provider.uploadFile(jobId, filePath, category);
  }

  /**
   * Upload multiple files for a job.
   * @param {string} jobId
   * @param {Object<string, string[]>} files - Map of category → file paths.
   * @returns {Promise<Object<string, string[]>>} Map of category → URLs.
   */
  static async uploadJobAssets(jobId, files) {
    const provider = getStorageProvider();
    return provider.uploadJobAssets(jobId, files);
  }

  /**
   * Delete all assets for a job from GitHub.
   * @param {string} jobId
   * @returns {Promise<void>}
   */
  static async deleteJob(jobId) {
    const provider = getStorageProvider();
    return provider.deleteJob(jobId);
  }
}

module.exports = GitHubService;