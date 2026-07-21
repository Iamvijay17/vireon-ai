const { Client } = require("@gradio/client");
const fs = require("fs").promises;
const path = require("path");
const config = require("../../config");
const LoggerService = require("../LoggerService");

// Qwen3-TTS built-in speaker presets (used for "custom voice" mode).
const QWEN_SPEAKERS = Object.freeze([
  "Aiden",
  "Dylan",
  "Eric",
  "Ono_anna",
  "Ryan",
  "Serena",
  "Sohee",
  "Uncle_fu",
  "Vivian",
]);

const DEFAULT_SPEAKER = "Ryan";

// Backward-compatible mapping for the old bare voice keys (male-1, female-1, ...).
const LEGACY_VOICE_MAP = Object.freeze({
  "male-1": "Ryan",
  "male-2": "Aiden",
  "female-1": "Serena",
  "female-2": "Vivian",
  "neutral-1": "Eric",
});

const VOICES_DIR = path.resolve(__dirname, "../../../voices");

/**
 * Service for generating audio via Pinokio Qwen3-TTS API.
 * Supports two voice modes:
 *  - "custom:<Speaker>"  -> one of Qwen3-TTS's built-in speaker presets
 *  - "clone:<file>.wav"  -> voice cloning from a reference .wav file in backend/voices/
 * Legacy bare keys (male-1, female-1, ...) are still accepted and mapped to a preset.
 * Single Responsibility: Text-to-speech generation.
 */
class AudioService {
  static _transcriptCache = new Map();

  /**
   * List the built-in custom-voice speaker presets.
   */
  static listCustomVoices() {
    return QWEN_SPEAKERS.map((speaker) => ({
      id: `custom:${speaker}`,
      speaker,
      label: speaker.replace(/_/g, " "),
    }));
  }

  /**
   * List cloneable voices, discovered from the .wav files in backend/voices/.
   */
  static async listCloneVoices() {
    let files;
    try {
      files = await fs.readdir(VOICES_DIR);
    } catch {
      return [];
    }

    return files
      .filter((file) => file.toLowerCase().endsWith(".wav"))
      .map((file) => ({
        id: `clone:${file}`,
        file,
        label: file
          .replace(/\.wav$/i, "")
          .replace(/[_-]+/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase()),
      }));
  }

  /**
   * Resolve a voice selection string into either a custom-voice speaker
   * or a clone-voice reference file, validating clone files on disk.
   */
  static async resolveVoice(voice) {
    if (typeof voice === "string" && voice.startsWith("clone:")) {
      const file = path.basename(voice.slice("clone:".length));
      if (!file.toLowerCase().endsWith(".wav")) {
        throw new Error(`Invalid clone voice "${file}": must be a .wav file`);
      }

      const filePath = path.join(VOICES_DIR, file);
      try {
        await fs.access(filePath);
      } catch {
        throw new Error(`Clone voice file not found: ${file}`);
      }

      return { mode: "clone", file, filePath };
    }

    if (typeof voice === "string" && voice.startsWith("custom:")) {
      const requested = voice.slice("custom:".length);
      const match = QWEN_SPEAKERS.find(
        (s) => s.toLowerCase() === requested.toLowerCase(),
      );
      return { mode: "custom", speaker: match || DEFAULT_SPEAKER };
    }

    // Legacy bare key (male-1, female-1, ...) or unrecognized value.
    return { mode: "custom", speaker: LEGACY_VOICE_MAP[voice] || DEFAULT_SPEAKER };
  }

  /**
   * Get (and cache) a transcript for a reference audio file, used as the
   * clone's ref_text. Falls back to x-vector-only cloning if transcription
   * fails, rather than failing the whole scene.
   */
  static async _getReferenceText(client, filePath, cacheKey) {
    if (this._transcriptCache.has(cacheKey)) {
      return this._transcriptCache.get(cacheKey);
    }

    try {
      const audioBuffer = await fs.readFile(filePath);
      const audioBlob = new Blob([audioBuffer], { type: "audio/wav" });
      const result = await client.predict("/transcribe_audio", {
        audio: audioBlob,
      });
      const transcript = (result.data?.[0] || "").toString().trim();
      this._transcriptCache.set(cacheKey, transcript);
      return transcript;
    } catch (err) {
      LoggerService.warn(
        `Failed to transcribe reference voice "${cacheKey}", falling back to x-vector-only cloning`,
        { error: err.message },
      );
      this._transcriptCache.set(cacheKey, "");
      return "";
    }
  }

  static async _generateCustom(client, resolved, text) {
    return client.predict("/generate_custom_voice", {
      text,
      language: "Auto",
      speaker: resolved.speaker,
      instruct: "",
      model_size: config.tts.modelSize,
      seed: -1,
    });
  }

  static async _generateClone(client, resolved, text) {
    const refText = await this._getReferenceText(
      client,
      resolved.filePath,
      resolved.file,
    );
    const refAudioBuffer = await fs.readFile(resolved.filePath);
    const refAudioBlob = new Blob([refAudioBuffer], { type: "audio/wav" });

    return client.predict("/generate_voice_clone", {
      ref_audio: refAudioBlob,
      ref_text: refText,
      target_text: text,
      language: "Auto",
      use_xvector_only: !refText,
      model_size: config.tts.modelSize,
      max_chunk_chars: 200,
      chunk_gap: 0,
      seed: -1,
    });
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

    // Resolve the voice once up front - an invalid/missing clone file is a
    // configuration error, not a transient failure, so don't retry on it.
    const resolved = await this.resolveVoice(voice);

    for (let attempt = 1; attempt <= config.tts.maxRetries; attempt++) {
      try {
        LoggerService.tts(
          `Generating audio scene ${scene.sceneNumber} (attempt ${attempt})`,
          {
            voice,
            mode: resolved.mode,
            speaker: resolved.speaker,
            cloneFile: resolved.file,
            textLength: text.length,
          },
        );

        // Connect to Gradio Qwen3-TTS server
        const client = await Client.connect(
          config.tts.url.replace(/\/generate$/, "").replace(/\/$/, ""),
        );

        const result =
          resolved.mode === "clone"
            ? await this._generateClone(client, resolved, text)
            : await this._generateCustom(client, resolved, text);

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
