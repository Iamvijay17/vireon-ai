const { execSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const config = require('../config');
const LoggerService = require('./LoggerService');

/**
 * Service for rendering videos using Remotion.
 * Single Responsibility: Video rendering via Remotion CLI.
 */
class RemotionService {
  /**
   * Get the Remotion project root directory.
   */
  static getRemotionProjectRoot() {
    return path.resolve(__dirname, '../../remotion');
  }

  /**
   * Generate assets.json from the script for Remotion consumption.
   */
  static async prepareAssets(jobId, script, jobConfig) {
    const jobDir = path.resolve(__dirname, '../../jobs', jobId);
    await fs.mkdir(jobDir, { recursive: true });

    const assets = {
      title: script.title,
      description: script.description,
      resolution: jobConfig.resolution || '1920x1080',
      aspectRatio: jobConfig.aspectRatio || '16:9',
      scenes: script.scenes.map((scene) => ({
        sceneNumber: scene.sceneNumber,
        title: scene.title,
        subtitle: scene.subtitle,
        duration: scene.duration || 8,
        backgroundColor: scene.backgroundColor,
        transition: scene.transition,
        imagePrompt: scene.imagePrompt,
        cameraMotion: scene.cameraMotion,
        animation: scene.animation,
        audio: {
          file: `./audio/scene${scene.sceneNumber}.mp3`,
          duration: scene.audio?.duration || 0,
        },
        fonts: {
          primary: 'Inter',
          secondary: 'Roboto',
        },
        theme: {
          type: jobConfig.type || 'educational',
          textColor: '#ffffff',
          accentColor: '#6c63ff',
        },
      })),
      output: {
        video: `./render/video.mp4`,
        thumbnail: `./render/thumbnail.png`,
      },
    };

    const assetsPath = path.join(jobDir, 'assets.json');
    await fs.writeFile(assetsPath, JSON.stringify(assets, null, 2), 'utf-8');

    LoggerService.render('Assets prepared for Remotion', {
      jobId,
      scenes: assets.scenes.length,
      path: assetsPath,
    });

    return assets;
  }

  /**
   * Execute Remotion render process.
   */
  static async renderVideo(jobId, assets = null) {
    const jobDir = path.resolve(__dirname, '../../jobs', jobId);
    const assetsPath = path.join(jobDir, 'assets.json');
    const renderDir = path.join(jobDir, 'render');
    const remotionRoot = this.getRemotionProjectRoot();

    await fs.mkdir(renderDir, { recursive: true });

    // Read assets.json for duration calculation
    const assetsFile = assets || JSON.parse(await fs.readFile(assetsPath, 'utf-8'));
    const totalDuration = assetsFile.scenes.reduce(
      (sum, scene) => sum + (scene.duration || 8),
      0
    );

    let lastError = null;

    for (let attempt = 1; attempt <= config.remotion.maxRetries; attempt++) {
      try {
        LoggerService.render(`Rendering video (attempt ${attempt}/${config.remotion.maxRetries})`, {
          jobId,
          remotionRoot,
          assetsPath,
          duration: totalDuration,
        });

        // Calculate dimensions from resolution
        const [width, height] = (assetsFile.resolution || '1920x1080').split('x').map(Number);

        // Use remotion render from the remotion project directory
        // For Remotion v4, we use the project structure with npx remotion render
        const propsJson = JSON.stringify({ assets: assetsFile });

        // Build the command - Remotion v4 uses remotion render VideoComposition out.mp4
        const cmd = `npx remotion render VideoComposition ${renderDir}/video.mp4 --props='${propsJson}' --duration-in-frames ${totalDuration * 30} --width ${width} --height ${height} --fps 30`;

        execSync(cmd, {
          cwd: remotionRoot,
          timeout: config.remotion.timeout,
          stdio: 'pipe',
        });

        // Verify output exists
        const videoPath = path.join(renderDir, 'video.mp4');
        const stats = await fs.stat(videoPath);

        LoggerService.render('Video rendered successfully', {
          jobId,
          size: `${(stats.size / (1024 * 1024)).toFixed(2)} MB`,
          path: videoPath,
        });

        return {
          video: 'render/video.mp4',
          thumbnail: 'render/thumbnail.png',
          path: renderDir,
        };
      } catch (err) {
        lastError = err;
        const isLastAttempt = attempt === config.remotion.maxRetries;

        LoggerService.warn(
          `Remotion attempt ${attempt} failed${isLastAttempt ? ' (final)' : ''}`,
          { error: err.message }
        );

        if (!isLastAttempt) {
          const delay = Math.min(5000 * Math.pow(2, attempt - 1), 30000);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(`Remotion rendering failed after ${config.remotion.maxRetries} attempts: ${lastError?.message}`);
  }
}

module.exports = RemotionService;