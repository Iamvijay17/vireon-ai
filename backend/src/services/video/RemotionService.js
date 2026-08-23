const { execFile } = require('child_process');
const { promisify } = require('util');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const config = require('../../config');
const LoggerService = require('../common/LoggerService');
const { getStorageProvider } = require('../storage/providers');

const execFileAsync = promisify(execFile);

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
    return path.resolve(__dirname, '../../../remotion');
  }

  /**
   * Generate assets.json from the script for Remotion consumption.
   */
  static async prepareAssets(jobId, script, jobConfig) {
    const jobDir = path.resolve(__dirname, '../../../jobs', jobId);
    await fs.mkdir(jobDir, { recursive: true });

    const assets = {
      title: script.title,
      description: script.description,
      resolution: jobConfig.resolution || '1920x1080',
      aspectRatio: jobConfig.aspectRatio || '16:9',
      // Optional talking-head overlay (see AvatarService + videoWorker.js's
      // GENERATING_AVATAR step) - undefined when the job has no avatar, so
      // VideoComposition's AvatarOverlay renders nothing and reserves no
      // space. `videoUrl` is already the real storage URL (uploaded the
      // moment AvatarService generated it - see AvatarService.animatePortrait),
      // so Remotion's headless renderer fetches it straight from storage.
      avatar: jobConfig.avatar
        ? {
            videoUrl: jobConfig.avatar.videoUrl,
            position: jobConfig.avatar.position,
          }
        : undefined,
      scenes: script.scenes.map((scene, index) => {
        // Determine sceneType based on position if not explicitly provided
        let sceneType = scene.sceneType;
        if (!sceneType) {
          const sceneNum = scene.sceneNumber || (index + 1);
          if (sceneNum === 1) sceneType = 'title';
          else sceneType = 'content';
        }
       return {
           sceneNumber: scene.sceneNumber,
           sceneType,
           title: scene.title,
           subtitle: scene.subtitle,
           // Use audio duration if available (from audio generation), otherwise use scene duration
           // This ensures the scene duration matches the actual audio file duration
           duration: scene.audio?.duration || scene.duration || 8,
           backgroundColor: scene.backgroundColor,
           transition: scene.transition,
           imagePrompt: scene.imagePrompt,
           cameraMotion: scene.cameraMotion,
           animation: scene.animation,
           imageUrl: scene.imageUrl || '',
            // Template-based rendering fields
            templateId: scene.templateId || '',
            elements: scene.elements || null,
            scene_meta: scene.scene_meta || null,
            audio: {
             // Storage URL, not a local file path - scene audio is uploaded
             // to storage the moment AudioService synthesizes it (see
             // AudioService._synthesizeSceneAudio), so Remotion's headless
             // renderer fetches it straight from there. `jobId` here is the
             // video's own id (see the storage plan's bucket table).
             file: getStorageProvider().getPublicUrl(jobId, 'audio', `scene${scene.sceneNumber}.mp3`),
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
         };
       }),
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
   * Verify every scene that's expected to have audio (audio.duration > 0
   * in assets.json) actually made it to storage. Scenes with no audio text
   * legitimately have duration 0 and are skipped. Checks storage rather
   * than local disk since scene audio is uploaded (and backend/jobs/ may
   * already be cleaned up) well before rendering runs.
   */
  static async _verifySceneAudioFiles(jobId, scenes) {
    const provider = getStorageProvider();
    const missing = [];

    for (const scene of scenes) {
      if (!(scene.audio?.duration > 0)) continue;
      const exists = await provider.objectExists(jobId, 'audio', `scene${scene.sceneNumber}.mp3`);
      if (!exists) missing.push(scene.sceneNumber);
    }

    if (missing.length > 0) {
      throw new Error(
        `Missing audio file(s) for scene(s) ${missing.join(', ')} - audio generation must complete before rendering`
      );
    }
  }

  /**
   * Deterministic fingerprint of an assets.json payload - used to tell
   * whether an existing render/video.mp4 still reflects the scenes that
   * would be rendered right now, or was produced from an older version
   * (edited scene text, regenerated image, etc.).
   */
  static _fingerprintAssets(assetsFile) {
    return crypto.createHash('sha256').update(JSON.stringify(assetsFile)).digest('hex');
  }

  /**
   * Whether the existing render/video.mp4 for this job already matches the
   * given assets - i.e. it's safe to skip re-rendering and go straight to
   * upload. True only when both the video file and a fingerprint recorded
   * at render time exist and that fingerprint matches assetsFile exactly.
   * Any missing piece (no prior render, no fingerprint, mismatch, read
   * failure) returns false, which just means "render it" - the same
   * behavior as before this check existed, so this can only make things
   * faster, never wrong.
   */
  static async isRenderCurrent(jobId, assetsFile) {
    const jobDir = path.resolve(__dirname, '../../../jobs', jobId);
    const videoPath = path.join(jobDir, 'render', 'video.mp4');
    const fingerprintPath = path.join(jobDir, '.render-fingerprint');

    try {
      await fs.access(videoPath);
      const stored = await fs.readFile(fingerprintPath, 'utf-8');
      return stored.trim() === this._fingerprintAssets(assetsFile);
    } catch {
      return false;
    }
  }

  /**
   * Execute Remotion render process.
   */
  static async renderVideo(jobId, assets = null) {
    const jobDir = path.resolve(__dirname, '../../../jobs', jobId);
    const assetsPath = path.join(jobDir, 'assets.json');
    const renderDir = path.join(jobDir, 'render');
    const remotionRoot = this.getRemotionProjectRoot();

    await fs.mkdir(renderDir, { recursive: true });

     // Read assets.json for duration calculation
     const assetsFile = assets || JSON.parse(await fs.readFile(assetsPath, 'utf-8'));

     // Calculate total duration from scene durations (which should now include audio durations)
     const totalDuration = assetsFile.scenes.reduce(
       (sum, scene) => {
         const sceneDuration = scene.duration || 8;
         const audioDuration = scene.audio?.duration || 0;
         LoggerService.debug('Scene duration calculation', {
           sceneNumber: scene.sceneNumber,
           sceneDuration,
           audioDuration,
         });
         return sum + sceneDuration;
       },
       0
     );

     LoggerService.render('Total video duration calculated', {
       jobId,
       totalDuration,
       sceneCount: assetsFile.scenes.length,
     });

     // Fail fast and clearly here rather than letting Remotion render
     // silently with a missing/blank clip - a scene with an expected
     // audio.duration > 0 but no actual file on disk usually means a prior
     // TTS step was skipped or partially failed, and that's much easier to
     // diagnose from this error than from a rendering artifact.
     await this._verifySceneAudioFiles(jobId, assetsFile.scenes);

     let lastError = null;

     for (let attempt = 1; attempt <= config.remotion.maxRetries; attempt++) {
       try {
         LoggerService.render(`Rendering video (attempt ${attempt}/${config.remotion.maxRetries})`, {
           jobId,
           remotionRoot,
           assetsPath,
           totalDuration,
         });

        // Calculate dimensions from resolution
        const [width, height] = (assetsFile.resolution || '1920x1080').split('x').map(Number);

        // Write props to a temp file to avoid escaping issues
        const propsPath = path.join(jobDir, 'render-props.json');
        const propsJson = JSON.stringify({ assets: assetsFile, jobId });
        await fs.writeFile(propsPath, propsJson, 'utf-8');

        // Verify assets.json and props.json exist before running Remotion
        const assetsExists = await fs.stat(assetsPath).then(() => true).catch(() => false);
        const propsExists = await fs.stat(propsPath).then(() => true).catch(() => false);
        if (!assetsExists) throw new Error(`assets.json not found at ${assetsPath}`);
        if (!propsExists) throw new Error(`render-props.json not found at ${propsPath}`);

        // Use shell: true to properly handle paths with spaces on Windows
        const binaryPath = path.join(remotionRoot, 'node_modules', '@remotion', 'cli', 'remotion-cli.js');
        const outputPath = path.join(renderDir, 'video.mp4');

        // Check if remotion binary exists
        const binaryExists = await fs.stat(binaryPath).then(() => true).catch(() => false);
        if (!binaryExists) {
          throw new Error(`Remotion CLI not found at ${binaryPath}. Run 'npm install' in ${remotionRoot}`);
        }

        // Build command arguments for Remotion 4.x CLI
        // Use --props=path format to avoid Windows path escaping issues
        const args = [
          'render',
          'VideoComposition',
          outputPath,
          `--props=${propsPath}`,
          '--width',
          String(width),
          '--height',
          String(height),
          '--fps',
          '30',
        ];

        LoggerService.render('Remotion command args', { args });
        LoggerService.render('Executing Remotion command', { binaryPath, args });

        // execFile (async, not execFileSync) spawns node directly with an
        // argv array - no shell involved, so paths with spaces work without
        // manual quoting and no argument can break out into a second shell
        // command. Async matters here: this is the single longest-running
        // step in the pipeline (up to config.remotion.timeout, 5 minutes by
        // default, per attempt) - the sync version blocked Node's entire
        // event loop for that whole duration, freezing every other
        // concurrently-processing job under the worker's `concurrency: 3`
        // setting, not just this one. maxBuffer raised well past the 1MB
        // default since Remotion's per-frame progress output over a
        // multi-minute render can exceed that easily.
        const { stdout } = await execFileAsync(process.execPath, [binaryPath, ...args], {
          cwd: remotionRoot,
          timeout: config.remotion.timeout,
          encoding: 'utf8',
          maxBuffer: 50 * 1024 * 1024,
        });

        LoggerService.render('Remotion stdout', { stdout: stdout.toString().substring(0, 1000) });

        // Verify output exists
        const videoPath = path.join(renderDir, 'video.mp4');
        const stats = await fs.stat(videoPath);

        LoggerService.render('Video rendered successfully', {
          jobId,
          size: `${(stats.size / (1024 * 1024)).toFixed(2)} MB`,
          path: videoPath,
        });

        // Record what this render was made from, so a later crash-recovery
        // retry can tell (via isRenderCurrent) whether this video.mp4 still
        // reflects the current scenes and skip a redundant re-render instead
        // of always redoing the most expensive step in the pipeline. Stored
        // outside renderDir since videoWorker.js uploads every file it finds
        // there - this is internal bookkeeping, not a render output.
        await fs.writeFile(
          path.join(jobDir, '.render-fingerprint'),
          this._fingerprintAssets(assetsFile),
          'utf-8'
        );

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
          stdout: err.stdout?.toString().substring(0, 500),
          stderr: err.stderr?.toString().substring(0, 500),
          code: err.code,
          status: err.status,
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
