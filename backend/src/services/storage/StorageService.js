const path = require('path');
const fs = require('fs').promises;
const LoggerService = require('../common/LoggerService');

/**
 * Local storage service for managing job files on disk.
 * Single Responsibility: Local file management.
 */
class StorageService {
  static getJobDir(jobId) {
    return path.resolve(__dirname, '../../jobs', jobId);
  }

  static getAudioDir(jobId) {
    return path.join(this.getJobDir(jobId), 'audio');
  }

  static getRenderDir(jobId) {
    return path.join(this.getJobDir(jobId), 'render');
  }

  /**
   * Ensure all job directories exist.
   */
  static async ensureJobDirs(jobId) {
    const dirs = [
      this.getJobDir(jobId),
      this.getAudioDir(jobId),
      this.getRenderDir(jobId),
    ];

    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }

    return this.getJobDir(jobId);
  }

  /**
   * Wipe the entire job scratch directory after a successful run.
   *
   * Every artifact (script, assets, scene audio, avatar, render output) is
   * uploaded to MinIO the moment it's produced - see
   * AudioService._synthesizeSceneAudio, AvatarService.animatePortrait, and
   * videoWorker.js's inline uploads - so nothing here needs to survive
   * locally once the job completes. VideoService.rerender() and the Studio
   * Editor's re-render flow read scene audio/avatar straight from storage
   * (RemotionService.prepareAssets builds URLs via the storage provider, not
   * local file paths), so an empty scratch dir doesn't block a re-render.
   */
  static async cleanupJob(jobId) {
    const jobDir = this.getJobDir(jobId);

    try {
      await fs.rm(jobDir, { recursive: true, force: true });
      LoggerService.info('Job scratch directory cleaned up', { jobId });
    } catch (err) {
      LoggerService.warn('Failed to cleanup job scratch directory', { jobId, error: err.message });
    }
  }
}

module.exports = StorageService;
