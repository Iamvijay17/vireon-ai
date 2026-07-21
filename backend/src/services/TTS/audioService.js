const { Client } = require("@gradio/client");
const fs = require("fs").promises;
const path = require("path");
const config = require("../../config");
const LoggerService = require("../LoggerService");

/**
 * Service for generating audio via Pinokio Qwen3-TTS API.
 * Single Responsibility: Text-to-speech generation.
 */
class AudioService {
  /**
   * Map our internal voice keys to a Qwen3-TTS built-in speaker.
   * Falls back to a default speaker if none specified/recognized.
   */
  static getSpeaker(voice) {
    const speakerMap = {
      "male-1": "Ryan",
      "male-2": "Aiden",
      "female-1": "Serena",
      "female-2": "Vivian",
      "neutral-1": "Eric",
      default: "Ryan",
    };

    return speakerMap[voice] || speakerMap.default;
  }

  /**
   * Generate audio for a single scene's text.
   * Implements retry with exponential backoff.
   */
  static async generateSceneAudio(jobId, scene, voice) {
    const { text } = scene.audio;
    if (!text) {
      LoggerService.warn("Scene has no audio text, skipping", {
        sceneNumber: scene.sceneNumber,
      });
      return null;
    }

    const audioDir = path.resolve(__dirname, "../../../jobs", jobId, "audio");
    await fs.mkdir(audioDir, { recursive: true });

    const outputFile = path.join(audioDir, `scene${scene.sceneNumber}.mp3`);
    let lastError = null;

    // Map our internal voice key to a Qwen3-TTS built-in speaker
    const speaker = this.getSpeaker(voice);

    for (let attempt = 1; attempt <= config.tts.maxRetries; attempt++) {
      try {
        LoggerService.tts(
          `Generating audio scene ${scene.sceneNumber} (attempt ${attempt})`,
          {
            voice,
            speaker,
            textLength: text.length,
          },
        );

        // Connect to Gradio Qwen3-TTS server
        const client = await Client.connect(
          config.tts.url.replace(/\/generate$/, "").replace(/\/$/, ""),
        );

        // Call the Qwen3-TTS custom-voice API with a built-in speaker preset
        const result = await client.predict("/generate_custom_voice", {
          text,
          language: "Auto",
          speaker,
          instruct: "",
          model_size: config.tts.modelSize,
          seed: -1,
        });

        const audio = result.data[0];

        if (audio && audio.url) {
          // Download the generated audio
          const outputResponse = await fetch(audio.url);
          const outputAudioBuffer = await outputResponse.arrayBuffer();
          await fs.writeFile(outputFile, Buffer.from(outputAudioBuffer));

          // Get exact duration by decoding the audio file via helper ESM script
          const { execSync } = require("child_process");
          const helperScript = path.resolve(__dirname, "getAudioDuration.mjs");
          const durationStr = execSync(
            `node "${helperScript}" "${outputFile}"`,
            { encoding: "utf8", timeout: 30000 },
          ).trim();
          // const duration = Math.round(parseFloat(durationStr) * 10) / 10;
          // const duration = Math.round(parseFloat(durationStr) * 100) / 100;
          const duration = parseFloat(durationStr);

          LoggerService.tts(`Audio generated for scene ${scene.sceneNumber}`, {
            file: `scene${scene.sceneNumber}.mp3`,
            duration: duration,
          });

          return {
            file: `scene${scene.sceneNumber}.mp3`,
            path: outputFile,
            duration: duration || Math.ceil(text.split(" ").length * 0.4), // fallback: ~0.4s per word
          };
        }

        throw new Error("No audio URL returned from TTS API");
      } catch (err) {
        lastError = err;
        const isLastAttempt = attempt === config.tts.maxRetries;

        LoggerService.warn(
          `TTS attempt ${attempt} failed for scene ${scene.sceneNumber}${isLastAttempt ? " (final)" : ""}`,
          { error: err.message },
        );

        if (!isLastAttempt) {
          const delay = Math.min(2000 * Math.pow(2, attempt - 1), 16000);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(
      `TTS failed after ${config.tts.maxRetries} attempts for scene ${scene.sceneNumber}: ${lastError.message}`,
    );
  }

  /**
   * Generate audio for all scenes in a script.
   * If `onSceneComplete(sceneNumber, result)` is provided, it is invoked
   * immediately after each individual scene's audio finishes, so callers can
   * persist/broadcast progress without waiting for the whole batch.
   */
  static async generateAllAudio(jobId, scenes, voice, onSceneComplete) {
    LoggerService.tts("Starting batch audio generation", {
      jobId,
      scenes: scenes.length,
      voice,
    });

    const results = [];
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const result = await this.generateSceneAudio(
        jobId,
        scene,
        voice || scene.audio?.voice,
      );
      if (result) {
        results.push(result);
        if (typeof onSceneComplete === "function") {
          await onSceneComplete(scene.sceneNumber, result);
        }
      }
    }

    LoggerService.tts("Batch audio generation complete", {
      jobId,
      generated: results.length,
    });

    return results;
  }
}

module.exports = AudioService;
