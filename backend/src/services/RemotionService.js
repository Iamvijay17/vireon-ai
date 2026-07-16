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
   * Get the Remotion binary path.
   */
  static getRemotionBinary() {
    const remotionRoot = this.getRemotionProjectRoot();
    // Try to find the remotion binary in node_modules
    const binaryPath = path.join(remotionRoot, 'node_modules', '@remotion', 'cli', 'remotion-cli.js');
    return binaryPath;
  }

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
        // Template-based rendering fields
        templateId: scene.templateId || '',
        elements: scene.elements || null,
        audio: {
          // Use HTTP URL served by Express static middleware
          // e.g. http://localhost:{port}/public/{jobId}/audio/scene{N}.mp3
          // This avoids the Remotion webpack public dir caching issue where dynamic files are not available.
          // The Express server serves the jobs directory at /public via express.static
          file: `http://localhost:${config.port || 3000}/public/${jobId}/audio/scene${scene.sceneNumber}.mp3`,
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

        // Write props to a temp file to avoid escaping issues
        const propsPath = path.join(jobDir, 'render-props.json');
        const propsJson = JSON.stringify({ assets: assetsFile, jobId });
        await fs.writeFile(propsPath, propsJson, 'utf-8');

        // Use shell: true to properly handle paths with spaces on Windows
        const binaryPath = path.join(remotionRoot, 'node_modules', '@remotion', 'cli', 'remotion-cli.js');
        const outputPath = path.join(renderDir, 'video.mp4');

        // Build command arguments for array syntax (handles spaces correctly)
        const args = [
          'render',
          'VideoComposition',
          outputPath,
          '--props',
          propsPath,
          '--duration-in-frames',
          String(totalDuration * 30),
          '--width',
          String(width),
          '--height',
          String(height),
          '--fps',
          '30',
        ];

        LoggerService.render('Remotion command args', { args });

        execSync(`node "${binaryPath}" ${args.map(a => `"${a}"`).join(' ')}`, {
          cwd: remotionRoot,
          timeout: config.remotion.timeout,
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: true, // Use shell to handle paths with spaces on Windows
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

        // Log more detailed error
        const errorDetails = {
          message: err.message,
          stdout: err.stdout?.toString(),
          stderr: err.stderr?.toString(),
        };

        LoggerService.warn(
          `Remotion attempt ${attempt} failed${isLastAttempt ? ' (final)' : ''}`,
          errorDetails
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
