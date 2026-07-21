const { Client } = require("@gradio/client");
const fs = require("fs").promises;
const path = require("path");
const config = require("../../config");
const LoggerService = require("../LoggerService");

/**
 * Service for generating audio via Pinokio F5-TTS API.
 * Single Responsibility: Text-to-speech generation.
 */
class AudioService {
  /**
   * Get reference audio path based on voice selection.
   * Falls back to a default voice if none specified.
   */
  static getReferenceAudio(voice) {
    const voiceDir = path.resolve(__dirname, "../../../voices");
    const voiceMap = {
      "male-1": "default_male_voice.wav",
      "male-2": "default_male_voice.wav",
      "female-1": "default_female_voice.wav",
      "female-2": "default_female_voice.wav",
      "neutral-1": "default_male_voice.wav",
      default: "default_male_voice.wav",
    };

    // If voice is a path, use it directly
    if (voice && (voice.includes("/") || voice.includes("\\"))) {
      return voice;
    }

    // Otherwise, use mapped voice
    return path.join(voiceDir, voiceMap[voice] || voiceMap.default);
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

    // Get reference audio path
    const refAudioPath = this.getReferenceAudio(voice);

    for (let attempt = 1; attempt <= config.tts.maxRetries; attempt++) {
      try {
        LoggerService.tts(
          `Generating audio scene ${scene.sceneNumber} (attempt ${attempt})`,
          {
            voice,
            textLength: text.length,
          },
        );

        // Connect to Gradio F5-TTS server
        const client = await Client.connect(
          config.tts.url.replace(/\/generate$/, "").replace(/\/$/, ""),
        );

        // Read reference audio file
        const audioBuffer = await fs.readFile(refAudioPath);

        // Create blob for Gradio API (Node.js 24+ supports Blob natively)
        const audioBlob = new Blob([audioBuffer], { type: "audio/wav" });

        // Call the F5-TTS API with proper parameters
        const result = await client.predict("/basic_tts", {
          ref_audio_input: audioBlob,
          ref_text_input: "", // Empty reference text lets the model auto-detect
          gen_text_input: text,
          remove_silence: false,
          randomize_seed: true,
          seed_input: 0,
          cross_fade_duration_slider: 0.15,
          nfe_slider: 32,
          speed_slider: 1.0,
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
