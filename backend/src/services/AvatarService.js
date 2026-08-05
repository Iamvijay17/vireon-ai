const { Client } = require("@gradio/client");
const fs = require("fs").promises;
const path = require("path");
const { execSync } = require("child_process");
const config = require("../config");
const LoggerService = require("./LoggerService");

/**
 * Service for generating a lip-synced talking-avatar clip per scene via a
 * local MuseTalk Gradio server. Mirrors TTS/audioService.js's Gradio client
 * pattern (same local-first, HTTP-to-a-sibling-process shape as TTS/ComfyUI).
 *
 * MuseTalk animates the mouth region of an existing reference video rather
 * than generating motion from a still photo, so every scene reuses the same
 * short idle-loop clip at config.avatar.referenceVideoPath, synced against
 * that scene's own narration audio file.
 *
 * NOTE: `/lipsync` below is a placeholder endpoint name/param shape. Confirm
 * the real API name and named params against your installed MuseTalk Gradio
 * app (open its `/?view=api` page, same way docs/pinokio_api.md documents
 * the F5-TTS endpoint) and adjust _generateLipsync accordingly before first
 * use - this cannot be verified without a running server.
 */
class AvatarService {
  /**
   * Generate a lip-synced avatar clip for one scene, synced to its existing
   * narration audio. Returns null (not an error) if the scene has no audio
   * yet - nothing to sync to.
   */
  static async generateSceneAvatar(jobId, scene) {
    const audioFile = scene.audio?.file;
    if (!audioFile) {
      LoggerService.warn("Scene has no audio file, skipping avatar generation", {
        sceneNumber: scene.sceneNumber,
      });
      return null;
    }

    const audioDir = path.resolve(__dirname, "../../jobs", jobId, "audio");
    const audioPath = path.join(audioDir, audioFile.replace(/^.*[\\/]/, ""));

    const avatarDir = path.resolve(__dirname, "../../jobs", jobId, "avatar");
    await fs.mkdir(avatarDir, { recursive: true });
    const outputFile = path.join(avatarDir, `scene${scene.sceneNumber}.mp4`);

    let lastError = null;
    for (let attempt = 1; attempt <= config.avatar.maxRetries; attempt++) {
      try {
        LoggerService.info(
          `Generating avatar for scene ${scene.sceneNumber} (attempt ${attempt})`,
          { audioPath }
        );

        const client = await Client.connect(
          config.avatar.url.replace(/\/$/, "")
        );

        const result = await this._generateLipsync(client, audioPath);
        const avatar = result.data?.[0];

        if (avatar && avatar.url) {
          const outputResponse = await fetch(avatar.url);
          const outputBuffer = await outputResponse.arrayBuffer();
          await fs.writeFile(outputFile, Buffer.from(outputBuffer));

          const duration = this._getVideoDuration(outputFile);

          LoggerService.info(`Avatar generated for scene ${scene.sceneNumber}`, {
            file: `scene${scene.sceneNumber}.mp4`,
            duration,
          });

          return {
            file: `scene${scene.sceneNumber}.mp4`,
            path: outputFile,
            duration: duration || scene.audio?.duration || 0,
          };
        }

        throw new Error("No avatar video URL returned from avatar API");
      } catch (err) {
        lastError = err;
        const isLastAttempt = attempt === config.avatar.maxRetries;

        LoggerService.warn(
          `Avatar generation attempt ${attempt} failed for scene ${scene.sceneNumber}${isLastAttempt ? " (final)" : ""}`,
          { error: err.message }
        );

        if (!isLastAttempt) {
          const delay = Math.min(2000 * Math.pow(2, attempt - 1), 16000);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(
      `Avatar generation failed after ${config.avatar.maxRetries} attempts for scene ${scene.sceneNumber}: ${lastError.message}`
    );
  }

  /**
   * Calls the MuseTalk Gradio API with the default reference video + this
   * scene's audio. Endpoint/param names are a placeholder - see class-level
   * NOTE above.
   */
  static async _generateLipsync(client, audioPath) {
    const referenceBuffer = await fs.readFile(config.avatar.referenceVideoPath);
    const referenceBlob = new Blob([referenceBuffer], { type: "video/mp4" });

    const audioBuffer = await fs.readFile(audioPath);
    const audioMimeType = audioPath.toLowerCase().endsWith(".mp3") ? "audio/mpeg" : "audio/wav";
    const audioBlob = new Blob([audioBuffer], { type: audioMimeType });

    return client.predict("/lipsync", {
      video: referenceBlob,
      audio: audioBlob,
    });
  }

  /**
   * Duration of the generated clip via ffprobe (Remotion's toolchain already
   * depends on ffmpeg, so ffprobe is expected to be on PATH alongside it).
   * Best-effort: falls back to the source audio's duration on failure rather
   * than failing the whole scene over a missing duration number.
   */
  static _getVideoDuration(filePath) {
    try {
      const stdout = execSync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
        { encoding: "utf8", timeout: 15000 }
      ).trim();
      return parseFloat(stdout) || 0;
    } catch (err) {
      LoggerService.warn("ffprobe duration lookup failed for avatar clip", {
        filePath,
        error: err.message,
      });
      return 0;
    }
  }

  /**
   * Generate avatar clips for all scenes that have audio. Same shape as
   * AudioService.generateAllAudio: onSceneComplete persists+broadcasts each
   * scene as soon as it's ready, checkCancelled is awaited before each scene
   * so a "stop" request can take effect between scenes.
   */
  static async generateAllAvatars(jobId, scenes, onSceneComplete, checkCancelled) {
    LoggerService.info("Starting batch avatar generation", {
      jobId,
      scenes: scenes.length,
    });

    const results = [];
    for (let i = 0; i < scenes.length; i++) {
      if (typeof checkCancelled === "function") {
        await checkCancelled();
      }
      const scene = scenes[i];
      const result = await this.generateSceneAvatar(jobId, scene);
      if (result) {
        results.push(result);
        if (typeof onSceneComplete === "function") {
          await onSceneComplete(scene.sceneNumber, result);
        }
      }
    }

    LoggerService.info("Batch avatar generation complete", {
      jobId,
      generated: results.length,
    });

    return results;
  }
}

module.exports = AvatarService;
