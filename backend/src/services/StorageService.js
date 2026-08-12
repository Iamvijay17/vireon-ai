const path = require('path');
const fs = require('fs').promises;
const LoggerService = require('./LoggerService');

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
   * Get all files for upload from a job directory.
   */
  static async getUploadFiles(jobId) {
    const jobDir = this.getJobDir(jobId);
    const files = {
      script: [],
      audio: [],
      render: [],
    };

    // Script file
    const scriptPath = path.join(jobDir, 'script.json');
    try {
      await fs.access(scriptPath);
      files.script.push(scriptPath);
    } catch {
      LoggerService.warn('Script file not found for upload', { jobId });
    }

    // Audio files
    const audioDir = this.getAudioDir(jobId);
    try {
      const audioFiles = await fs.readdir(audioDir);
      audioFiles
        .filter((f) => f.endsWith('.mp3'))
        .forEach((f) => files.audio.push(path.join(audioDir, f)));
    } catch {
      LoggerService.warn('Audio directory not found for upload', { jobId });
    }

    // Render files
    const renderDir = this.getRenderDir(jobId);
    try {
      const renderFiles = await fs.readdir(renderDir);
      renderFiles.forEach((f) => files.render.push(path.join(renderDir, f)));
    } catch {
      LoggerService.warn('Render directory not found for upload', { jobId });
    }

    // Assets file
    const assetsPath = path.join(jobDir, 'assets.json');
    try {
      await fs.access(assetsPath);
      files.script.push(assetsPath);
    } catch {
      // assets might not exist yet
    }

    return files;
  }

  /**
   * Clean up job directory after a successful upload.
   *
   * Only removes the render output and the transient assets/render-props
   * files (both get freshly regenerated on every render anyway). Keeps
   * script.json, audio/, and images/ on disk - VideoService.rerender() and
   * the Studio Editor's re-render flow both resume from the existing script
   * and audio without regenerating them, so wiping the whole job directory
   * here (as this used to do) made every completed job's "Re-render" button
   * fail with a 404 once Remotion tried to read audio files that no longer
   * existed.
   */
  static async cleanupJob(jobId) {
    const jobDir = this.getJobDir(jobId);
    const renderDir = this.getRenderDir(jobId);
    const assetsPath = path.join(jobDir, 'assets.json');
    const propsPath = path.join(jobDir, 'render-props.json');

    try {
      await fs.rm(renderDir, { recursive: true, force: true });
      await fs.unlink(assetsPath).catch(() => {});
      await fs.unlink(propsPath).catch(() => {});
      LoggerService.info('Job render output cleaned up (script/audio/images kept for re-render)', { jobId });
    } catch (err) {
      LoggerService.warn('Failed to cleanup job render output', { jobId, error: err.message });
    }
  }
}

module.exports = StorageService;
