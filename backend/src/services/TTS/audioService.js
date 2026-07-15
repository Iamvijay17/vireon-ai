const { Client } = require("@gradio/client");
const fs = require('fs').promises;
const path = require('path');
const config = require('../../config');
const LoggerService = require('../LoggerService');

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
    const voiceDir = path.resolve(__dirname, '../../../voices');
    const voiceMap = {
      male: 'male_voice.mp3',
      female: 'female_voice.mp3',
      default: 'default_voice.mp3'
    };
    
    // If voice is a path, use it directly
    if (voice && voice.includes('/')) {
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
      LoggerService.warn('Scene has no audio text, skipping', { sceneNumber: scene.sceneNumber });
      return null;
    }

    const audioDir = path.resolve(__dirname, '../../../jobs', jobId, 'audio');
    await fs.mkdir(audioDir, { recursive: true });

    const outputFile = path.join(audioDir, `scene${scene.sceneNumber}.mp3`);
    let lastError = null;

    // Get reference audio path
    const refAudioPath = this.getReferenceAudio(voice);

    for (let attempt = 1; attempt <= config.tts.maxRetries; attempt++) {
      try {
        LoggerService.tts(`Generating audio scene ${scene.sceneNumber} (attempt ${attempt})`, {
          voice,
          textLength: text.length,
        });

        // Connect to Gradio F5-TTS server
        const client = await Client.connect(config.tts.url.replace(/\/generate$/, '').replace(/\/$/, ''));

        // Read reference audio file
        const audioBuffer = await fs.readFile(refAudioPath);
        const audioBlob = new Blob([audioBuffer], { type: "audio/mpeg" });

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

          // Estimate duration based on audio file size (rough heuristic: ~16KB per second for mp3 @ 128kbps)
          const stats = await fs.stat(outputFile);
          const estimatedDuration = Math.round((stats.size / 16000) * 10) / 10;

          LoggerService.tts(`Audio generated for scene ${scene.sceneNumber}`, {
            file: `scene${scene.sceneNumber}.mp3`,
            duration: estimatedDuration,
            size: `${(stats.size / 1024).toFixed(1)} KB`,
          });

          return {
            file: `scene${scene.sceneNumber}.mp3`,
            path: outputFile,
            duration: estimatedDuration || Math.ceil(text.split(' ').length * 0.4), // fallback: ~0.4s per word
          };
        }

        throw new Error('No audio URL returned from TTS API');
      } catch (err) {
        lastError = err;
        const isLastAttempt = attempt === config.tts.maxRetries;

        LoggerService.warn(
          `TTS attempt ${attempt} failed for scene ${scene.sceneNumber}${isLastAttempt ? ' (final)' : ''}`,
          { error: err.message }
        );

        if (!isLastAttempt) {
          const delay = Math.min(2000 * Math.pow(2, attempt - 1), 16000);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(`TTS failed after ${config.tts.maxRetries} attempts for scene ${scene.sceneNumber}: ${lastError.message}`);
  }

  /**
   * Generate audio for all scenes in a script.
   */
  static async generateAllAudio(jobId, scenes, voice) {
    LoggerService.tts('Starting batch audio generation', {
      jobId,
      scenes: scenes.length,
      voice,
    });

    const results = [];
    for (let i = 0; i < scenes.length; i++) {
      const result = await this.generateSceneAudio(jobId, scenes[i], voice || scenes[i].audio?.voice);
      if (result) {
        results.push(result);
      }
    }

    LoggerService.tts('Batch audio generation complete', {
      jobId,
      generated: results.length,
    });

    return results;
  }
}

module.exports = AudioService;