const { Client } = require("@gradio/client");
const { execFile } = require("child_process");
const { promisify } = require("util");
const fs = require("fs").promises;
const path = require("path");
const config = require("../../config");
const LoggerService = require("../LoggerService");

const execFileAsync = promisify(execFile);

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
   * List the built-in custom-voice speaker presets, matched up against any
   * same-named reference .wav in backend/voices/ (e.g. "Aiden" -> aiden.wav)
   * so the frontend can preview an actual sample of that speaker instead of
   * a generic placeholder. Matching is substring-based (normalized to
   * lowercase, underscores stripped) so "Ono_anna" matches anna.wav and
   * "Uncle_fu" matches uncle.wav.
   */
  static async listCustomVoices() {
    let files = [];
    try {
      files = await fs.readdir(VOICES_DIR);
    } catch {
      files = [];
    }
    const wavFiles = files.filter((f) => f.toLowerCase().endsWith(".wav"));

    return QWEN_SPEAKERS.map((speaker) => {
      const normalizedSpeaker = speaker.toLowerCase().replace(/_/g, "");
      const file = wavFiles.find((f) => {
        const normalizedFile = f.replace(/\.wav$/i, "").toLowerCase().replace(/_/g, "");
        return normalizedSpeaker.includes(normalizedFile) || normalizedFile.includes(normalizedSpeaker);
      });

      return {
        id: `custom:${speaker}`,
        speaker,
        label: speaker.replace(/_/g, " "),
        file: file || null,
      };
    });
  }

  /**
   * List cloneable voices, discovered from the .wav/.mp3 files in backend/voices/.
   */
  static async listCloneVoices() {
    let files;
    try {
      files = await fs.readdir(VOICES_DIR);
    } catch {
      return [];
    }

    return files
      .filter((file) => /\.(wav|mp3)$/i.test(file))
      .map((file) => ({
        id: `clone:${file}`,
        file,
        label: file
          .replace(/\.(wav|mp3)$/i, "")
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
      if (!/\.(wav|mp3)$/i.test(file)) {
        throw new Error(`Invalid clone voice "${file}": must be a .wav or .mp3 file`);
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
      const mimeType = filePath.toLowerCase().endsWith(".mp3") ? "audio/mpeg" : "audio/wav";
      const audioBlob = new Blob([audioBuffer], { type: mimeType });
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

  /**
   * Derive a stable positive 32-bit seed from a jobId so every scene in the
   * same video gets identical TTS prosody instead of a random seed per call.
   */
  static _seedFromJobId(jobId) {
    let hash = 5381;
    const str = String(jobId);
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 33) ^ str.charCodeAt(i);
    }
    return hash >>> 0;
  }

  /**
   * Podcast voice-clone turns have no `instruct` param to hint delivery (see
   * _instructFor) - the Qwen3 clone endpoint just doesn't expose one - so a
   * shared per-job seed is the one place left that can vary. Reusing the
   * exact same seed for all ~30 alternating turns (host and guest alike)
   * makes every line land with byte-identical prosodic rhythm, which reads
   * as robotic repetition rather than two people talking. Derive a seed
   * per scene instead, still fully deterministic (jobId+sceneNumber) so
   * resumed/retried scenes reproduce the same output. Non-podcast scenes
   * (scene.speaker unset) keep the original one-seed-per-job behavior,
   * which exists so a single narrator's pace/tone doesn't jump scene to
   * scene.
   */
  static _seedForScene(jobId, scene) {
    if (scene?.speaker === "host" || scene?.speaker === "guest") {
      return this._seedFromJobId(`${jobId}:${scene.sceneNumber}`);
    }
    return this._seedFromJobId(jobId);
  }

  static async _generateCustom(client, resolved, text, seed, instruct = "") {
    return client.predict("/generate_custom_voice", {
      text,
      language: "Auto",
      speaker: resolved.speaker,
      instruct,
      model_size: config.tts.modelSize,
      seed,
    });
  }

  /**
   * Podcast turns are synthesized one at a time with no awareness of the
   * conversation around them, which is what made two alternating voices
   * read as two monologues instead of people talking to each other. Give
   * the TTS model an explicit conversational-delivery instruction based on
   * the turn's role so host/guest lines actually sound like they're
   * reacting to one another.
   */
  static _instructFor(scene) {
    // A line can carry more than one emotion in a single breath (self-aware
    // humor sliding into real nervousness, then curiosity) - no fixed
    // per-role string captures that. The script LLM writes the line and
    // already knows its intended emotional arc, so prefer its own
    // scene.audio.emotion note (e.g. "wry and relatable at first, a flash
    // of genuine nervousness on 'terrifying', landing on sincere
    // curiosity") over a generic role-based default.
    const emotion = scene?.audio?.emotion?.trim();

    if (scene?.speaker === "host") {
      return emotion
        ? `Speak like a podcast host in a live conversation with a guest, with this delivery: ${emotion}`
        : "Speak like a podcast host in a live conversation with a guest: warm, curious, reacting naturally to what was just said.";
    }
    if (scene?.speaker === "guest") {
      return emotion
        ? `Speak like a podcast guest responding to the host in a live conversation, with this delivery: ${emotion}`
        : "Speak like a podcast guest responding to the host in a live conversation: natural, engaged, as if genuinely replying to their question.";
    }
    if (emotion) {
      return `Speak naturally like a human narrator, with this delivery: ${emotion}`;
    }
    // Default narrator delivery for non-podcast scenes. Without this the
    // Qwen3-TTS custom-voice endpoint gets an empty instruct and falls back
    // to a flat, monotone read-the-text-aloud delivery instead of sounding
    // like a human narrator.
    return "Speak naturally and expressively like a human narrator telling a story: vary your pitch, pace and emphasis, add warmth and emotion that fits the content, and avoid a flat monotone reading.";
  }

  static async _generateClone(client, resolved, text, seed) {
    const refText = await this._getReferenceText(
      client,
      resolved.filePath,
      resolved.file,
    );
    const refAudioBuffer = await fs.readFile(resolved.filePath);
    const refMimeType = resolved.file.toLowerCase().endsWith(".mp3") ? "audio/mpeg" : "audio/wav";
    const refAudioBlob = new Blob([refAudioBuffer], { type: refMimeType });

    return client.predict("/generate_voice_clone", {
      ref_audio: refAudioBlob,
      ref_text: refText,
      target_text: text,
      language: "Auto",
      use_xvector_only: !refText,
      model_size: config.tts.modelSize,
      max_chunk_chars: 200,
      chunk_gap: 0,
      seed,
    });
  }

  /**
   * Run forced alignment on a finished audio clip to get real per-word
   * timestamps for caption sync. Best-effort: returns null on any failure
   * (missing python/faster-whisper, timeout, etc.) rather than throwing,
   * since a missing alignment just means CaptionRenderer's estimated-pace
   * fallback kicks in instead.
   *
   * Async (execFile, not execFileSync) so this ~7s subprocess doesn't block
   * Node's event loop - with the worker's `concurrency: 3`, a blocking call
   * here previously froze every other concurrently-processing job for its
   * entire duration, not just the one it belongs to. Also lets
   * generateAllAudio overlap one scene's alignment with the next scene's
   * TTS call instead of paying for both serially.
   */
  static async _alignCaptions(audioFilePath) {
    try {
      const script = path.resolve(__dirname, "alignCaptions.py");
      const { stdout } = await execFileAsync("python", [script, audioFilePath], {
        encoding: "utf8",
        timeout: 60000,
      });

      const lastLine = stdout.trim().split("\n").filter(Boolean).pop() || "[]";
      const words = JSON.parse(lastLine);
      return Array.isArray(words) && words.length > 0 ? words : null;
    } catch (err) {
      LoggerService.warn("Caption alignment failed, falling back to estimated pacing", {
        error: err.message,
      });
      return null;
    }
  }

  /**
   * Synthesize + download a single scene's audio and resolve its final
   * timeline duration. Implements retry with exponential backoff.
   * Deliberately does NOT run caption alignment (see _alignCaptions) -
   * that's a separate ~7s CPU-bound step with no dependency on the next
   * scene's TTS call, so generateAllAudio pipelines it against the next
   * scene's synthesis instead of paying for both serially. generateSceneAudio
   * below (the public single-scene entry point) still does both together for
   * standalone callers like "regenerate this one scene's audio".
   */
  static async _synthesizeSceneAudio(jobId, scene, voice) {
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

    // Fixed per-job (or per-podcast-turn) seed so every scene, including
    // later resumed ones, deterministically reproduces the same prosody
    // instead of a random seed per call.
    const seed = this._seedForScene(jobId, scene);

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

        // Connect to Gradio Qwen3-TTS server. Always closed below, even on
        // failure, so a run of TTS retries/scenes doesn't leak one
        // websocket connection per attempt.
        const client = await Client.connect(
          config.tts.url.replace(/\/generate$/, "").replace(/\/$/, ""),
        );

        let result;
        try {
          result =
            resolved.mode === "clone"
              ? await this._generateClone(client, resolved, text, seed)
              : await this._generateCustom(client, resolved, text, seed, this._instructFor(scene));
        } finally {
          client.close();
        }

        const audio = result.data[0];

        if (audio && audio.url) {
          // Download the generated audio
          const outputResponse = await fetch(audio.url);
          if (!outputResponse.ok) {
            throw new Error(
              `Failed to download generated audio: ${outputResponse.status} ${outputResponse.statusText}`,
            );
          }
          const outputAudioBuffer = await outputResponse.arrayBuffer();
          await fs.writeFile(outputFile, Buffer.from(outputAudioBuffer));

          // Get exact duration by decoding the audio file via helper ESM script
          const helperScript = path.resolve(__dirname, "getAudioDuration.mjs");
          const { stdout: durationStr } = await execFileAsync(
            "node",
            [helperScript, outputFile],
            { encoding: "utf8", timeout: 30000 },
          );
          const duration = Math.round(parseFloat(durationStr) * 100) / 100;

          LoggerService.tts(`Audio generated for scene ${scene.sceneNumber}`, {
            file: `scene${scene.sceneNumber}.mp3`,
            duration: duration,
          });

          const spokenDuration = duration || Math.ceil(text.split(" ").length * 0.4); // fallback: ~0.4s per word

          // Podcast turns are rendered back-to-back with zero gap (the next
          // scene's Sequence starts the instant this one's declared duration
          // ends), so the next speaker cut in immediately - reading as two
          // people talking at/over each other rather than a real
          // back-and-forth. Pad the timeline duration (not the clip itself)
          // with a short natural beat so the next turn has a breath of space
          // to land in. A fixed gap read as metronomic across 30 turns, so
          // vary it (0.15-0.5s) using the same per-turn seed already derived
          // above - still fully deterministic/resumable, just not identical
          // every time. Non-podcast scenes (scene.speaker is unset) keep the
          // exact audio length.
          const turnGapSeconds =
            scene.speaker === "host" || scene.speaker === "guest" ? 0.15 + (seed % 350) / 1000 : 0;

          return {
            file: `scene${scene.sceneNumber}.mp3`,
            path: outputFile,
            duration: spokenDuration + turnGapSeconds,
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
   * Public single-scene entry point: synthesize + align in one call. Used
   * by standalone "regenerate this one scene" callers that have no next
   * scene to pipeline alignment against (see _synthesizeSceneAudio).
   */
  static async generateSceneAudio(jobId, scene, voice) {
    const result = await this._synthesizeSceneAudio(jobId, scene, voice);
    if (!result) return null;
    const captionTimestamps = await this._alignCaptions(result.path);
    return { ...result, captionTimestamps };
  }

  /**
   * Shared synth-download-measure core for standalone (Audio Studio) calls,
   * used by both single-voice and per-turn dialogue generation below.
   * Deliberately separate from _synthesizeSceneAudio - that one is keyed off
   * a jobId+scene shape (script.scenes) this caller doesn't have.
   */
  static async _synthesizeToFile(outputFile, text, voice, seed, instruct, logCtx) {
    const resolved = await this.resolveVoice(voice);
    let lastError = null;

    for (let attempt = 1; attempt <= config.tts.maxRetries; attempt++) {
      try {
        LoggerService.tts(`Generating audio (attempt ${attempt})`, {
          ...logCtx,
          voice,
          mode: resolved.mode,
          speaker: resolved.speaker,
          cloneFile: resolved.file,
          textLength: text.length,
        });

        const client = await Client.connect(
          config.tts.url.replace(/\/generate$/, "").replace(/\/$/, ""),
        );

        let result;
        try {
          result =
            resolved.mode === "clone"
              ? await this._generateClone(client, resolved, text, seed)
              : await this._generateCustom(client, resolved, text, seed, instruct);
        } finally {
          client.close();
        }

        const audio = result.data[0];
        if (!audio || !audio.url) {
          throw new Error("No audio URL returned from TTS API");
        }

        const outputResponse = await fetch(audio.url);
        if (!outputResponse.ok) {
          throw new Error(
            `Failed to download generated audio: ${outputResponse.status} ${outputResponse.statusText}`,
          );
        }
        const outputAudioBuffer = await outputResponse.arrayBuffer();
        await fs.writeFile(outputFile, Buffer.from(outputAudioBuffer));

        const helperScript = path.resolve(__dirname, "getAudioDuration.mjs");
        const { stdout: durationStr } = await execFileAsync(
          "node",
          [helperScript, outputFile],
          { encoding: "utf8", timeout: 30000 },
        );
        const duration = Math.round(parseFloat(durationStr) * 100) / 100;

        LoggerService.tts("Audio generated", { ...logCtx, duration });

        return { path: outputFile, duration };
      } catch (err) {
        lastError = err;
        const isLastAttempt = attempt === config.tts.maxRetries;

        LoggerService.warn(
          `TTS attempt ${attempt} failed${isLastAttempt ? " (final)" : ""}`,
          { ...logCtx, error: err.message },
        );

        if (!isLastAttempt) {
          const delay = Math.min(2000 * Math.pow(2, attempt - 1), 16000);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(
      `TTS failed after ${config.tts.maxRetries} attempts: ${lastError.message}`,
    );
  }

  /**
   * Standalone text-to-speech generation (Audio Studio), independent of the
   * video-job scene pipeline above - no jobId/sceneNumber, just an
   * AudioGeneration id and raw text.
   */
  static async generateStandaloneAudio(id, text, voice, emotion = "") {
    const audioDir = path.resolve(__dirname, "../../../jobs", "audio-studio", id);
    await fs.mkdir(audioDir, { recursive: true });
    const outputFile = path.join(audioDir, "audio.mp3");
    const seed = this._seedFromJobId(id);
    const trimmedEmotion = emotion?.trim();
    const instruct = trimmedEmotion
      ? `Speak naturally like a human narrator, with this delivery: ${trimmedEmotion}.`
      : "Speak naturally and expressively like a human narrator: vary your pitch, pace and emphasis, add warmth and emotion that fits the content, and avoid a flat monotone reading.";

    const result = await this._synthesizeToFile(outputFile, text, voice, seed, instruct, { id });
    return { file: "audio.mp3", ...result };
  }

  /**
   * Deterministic small pause (0.25-0.55s) inserted before the given
   * dialogue turn when merging per-turn audio into one file (see
   * audioController.generateDialogue + utils/wavAudio.concatWavFiles) -
   * keeps turns from butting up against each other while staying
   * reproducible for a given generation id. Varied per turn (not a fixed
   * gap) for the same reason _synthesizeSceneAudio varies podcast turn
   * gaps - a fixed pause across many turns reads as metronomic.
   */
  static turnGapSeconds(seedKey) {
    return 0.25 + (this._seedFromJobId(seedKey) % 300) / 1000;
  }

  /**
   * One turn of a multi-speaker dialogue script (Audio Studio "podcast"
   * mode - see parseDialogueScript). Each turn is synthesized to its own
   * file (turn0.mp3, turn1.mp3, ...); the controller merges them into a
   * single output file afterward (see utils/wavAudio.concatWavFiles).
   */
  static async generateDialogueTurnAudio(id, turnIndex, text, voice, speakerName, emotion = "") {
    const audioDir = path.resolve(__dirname, "../../../jobs", "audio-studio", id);
    await fs.mkdir(audioDir, { recursive: true });
    const file = `turn${turnIndex}.mp3`;
    const outputFile = path.join(audioDir, file);

    // Per-turn seed (id + turnIndex), not one shared seed for the whole
    // dialogue - see _seedForScene's reasoning: a fixed seed across every
    // turn gives every line byte-identical prosody, which reads as robotic
    // repetition rather than a real back-and-forth.
    const seed = this._seedFromJobId(`${id}:${turnIndex}`);
    const trimmedEmotion = emotion?.trim();
    const instruct = trimmedEmotion
      ? `Speak like ${speakerName} in a live, natural conversation, with this delivery: ${trimmedEmotion}.`
      : `Speak like ${speakerName} in a live, natural conversation: warm, engaged, and reacting to what was just said - not reading a monologue.`;

    const result = await this._synthesizeToFile(outputFile, text, voice, seed, instruct, {
      id,
      turn: turnIndex,
      speaker: speakerName,
    });
    return { file, ...result };
  }

  /**
   * Generate audio for all scenes in a script.
   * If `onSceneComplete(sceneNumber, result)` is provided, it is invoked
   * immediately after each individual scene's audio finishes, so callers can
   * persist/broadcast progress without waiting for the whole batch.
   * If `checkCancelled` is provided, it's awaited before each scene - it
   * should throw to abort the batch (used to let a "stop job" request take
   * effect between scenes instead of only after the whole batch finishes).
   *
   * Pipelined: scene N's caption alignment (~7s, CPU-bound, local subprocess)
   * runs concurrently with scene N+1's TTS synthesis (network/GPU-bound,
   * ~45-65s) instead of paying for both back to back - they're independent
   * resources with no reason to serialize. This never has two TTS requests
   * in flight at once, so it doesn't depend on the TTS server supporting
   * concurrent generation.
   */
  static async generateAllAudio(jobId, scenes, voice, onSceneComplete, checkCancelled) {
    LoggerService.tts("Starting batch audio generation", {
      jobId,
      scenes: scenes.length,
      voice,
    });

    const results = [];
    // Holds the previous scene's synthesized result plus its in-flight
    // alignment promise, so it can be settled and flushed (persisted, via
    // onSceneComplete) once the *next* scene's synthesis has already been
    // kicked off - not before.
    let pending = null;

    for (let i = 0; i <= scenes.length; i++) {
      const scene = scenes[i]; // undefined on the final flush-only pass

      let synthesizing = null;
      if (scene) {
        if (typeof checkCancelled === "function") {
          await checkCancelled();
        }
        synthesizing = this._synthesizeSceneAudio(jobId, scene, voice || scene.audio?.voice);
      }

      if (pending) {
        const captionTimestamps = await pending.alignmentPromise;
        const result = { ...pending.synthResult, captionTimestamps };
        results.push(result);
        if (typeof onSceneComplete === "function") {
          await onSceneComplete(pending.scene.sceneNumber, result);
        }
      }
      pending = null;

      if (!scene) break;

      const synthResult = await synthesizing;
      if (synthResult) {
        pending = { scene, synthResult, alignmentPromise: this._alignCaptions(synthResult.path) };
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
