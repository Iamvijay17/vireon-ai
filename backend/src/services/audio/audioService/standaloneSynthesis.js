const { execFile } = require("child_process");
const { promisify } = require("util");
const fs = require("fs").promises;
const path = require("path");
const config = require("../../../config");
const LoggerService = require("../../common/LoggerService");
const { resolveVoice } = require("./voiceCatalog");
const { seedFromJobId, seedForVoice } = require("./seeding");
const ttsClient = require("./ttsClient");

const execFileAsync = promisify(execFile);

/**
 * Shared synth-download-measure core for standalone (Audio Studio) calls,
 * used by both single-voice and per-turn dialogue generation below.
 * Deliberately separate from sceneSynthesis.synthesizeSceneAudio - that one
 * is keyed off a jobId+scene shape (script.scenes) this caller doesn't have.
 */
async function synthesizeToFile(outputFile, text, voice, seed, instruct, logCtx, fastMode = false) {
  const { Client } = require("@gradio/client");
  const resolved = await resolveVoice(voice);
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

      const result = await ttsClient.generate(client, resolved, text, seed, instruct, fastMode);

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

      const helperScript = path.resolve(__dirname, "../getAudioDuration.mjs");
      const { stdout: durationStr } = await execFileAsync(
        "node",
        [helperScript, outputFile],
        { encoding: "utf8", timeout: 30000 },
      );
      const duration = parseFloat(durationStr);

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
 * video-job scene pipeline (see sceneSynthesis.js) - no jobId/sceneNumber,
 * just an AudioGeneration id and raw text.
 */
async function generateStandaloneAudio(id, text, voice, emotion = "", fastMode = false) {
  const audioDir = path.resolve(__dirname, "../../../../jobs", "audio-studio", id);
  await fs.mkdir(audioDir, { recursive: true });
  const outputFile = path.join(audioDir, "audio.mp3");
  const seed = seedFromJobId(id);
  const trimmedEmotion = emotion?.trim();
  const instruct = trimmedEmotion
    ? `Speak naturally like a human narrator, with this delivery: ${trimmedEmotion}.`
    : "Speak naturally and expressively like a human narrator: vary your pitch, pace and emphasis, add warmth and emotion that fits the content, and avoid a flat monotone reading.";

  const result = await synthesizeToFile(outputFile, text, voice, seed, instruct, { id }, fastMode);
  return { file: "audio.mp3", ...result };
}

/**
 * One chunk of a long single-voice standalone request (see
 * utils/textChunking.chunkText) - synthesized to its own file
 * (chunk0.mp3, chunk1.mp3, ...), merged into the final audioUrl by the
 * controller afterward (same shape as generateDialogueTurnAudio below,
 * minus a per-chunk voice since single mode uses one voice throughout).
 */
async function generateStandaloneAudioChunk(id, chunkIndex, text, voice, emotion = "", fastMode = false) {
  const audioDir = path.resolve(__dirname, "../../../../jobs", "audio-studio", id);
  await fs.mkdir(audioDir, { recursive: true });
  const file = `chunk${chunkIndex}.mp3`;
  const outputFile = path.join(audioDir, file);

  // Per-chunk seed (id + chunkIndex), same reasoning as
  // generateDialogueTurnAudio - keeps prosody varied across chunks
  // instead of every chunk sounding byte-identical, while staying fully
  // deterministic/resumable. Designed voices are the exception - see
  // seeding.seedForVoice.
  const seed = seedForVoice(id, voice, chunkIndex);
  const trimmedEmotion = emotion?.trim();
  const instruct = trimmedEmotion
    ? `Speak naturally like a human narrator, with this delivery: ${trimmedEmotion}.`
    : "Speak naturally and expressively like a human narrator: vary your pitch, pace and emphasis, add warmth and emotion that fits the content, and avoid a flat monotone reading.";

  const result = await synthesizeToFile(outputFile, text, voice, seed, instruct, { id, chunk: chunkIndex }, fastMode);
  return { file, ...result };
}

/**
 * One turn of a multi-speaker dialogue script (Audio Studio "podcast"
 * mode - see parseDialogueScript). Each turn is synthesized to its own
 * file (turn0.mp3, turn1.mp3, ...); the controller merges them into a
 * single output file afterward (see utils/wavAudio.concatWavFiles).
 */
async function generateDialogueTurnAudio(id, turnIndex, text, voice, speakerName, emotion = "", fastMode = false) {
  const audioDir = path.resolve(__dirname, "../../../../jobs", "audio-studio", id);
  await fs.mkdir(audioDir, { recursive: true });
  const file = `turn${turnIndex}.mp3`;
  const outputFile = path.join(audioDir, file);

  // Per-turn seed (id + turnIndex), not one shared seed for the whole
  // dialogue - see seeding.seedForScene's reasoning: a fixed seed across
  // every turn gives every line byte-identical prosody, which reads as
  // robotic repetition rather than a real back-and-forth. Designed voices
  // are the exception - see seeding.seedForVoice.
  const seed = seedForVoice(id, voice, turnIndex);
  const trimmedEmotion = emotion?.trim();
  const instruct = trimmedEmotion
    ? `Speak like ${speakerName} in a live, natural conversation, with this delivery: ${trimmedEmotion}.`
    : `Speak like ${speakerName} in a live, natural conversation: warm, engaged, and reacting to what was just said - not reading a monologue.`;

  const result = await synthesizeToFile(
    outputFile,
    text,
    voice,
    seed,
    instruct,
    { id, turn: turnIndex, speaker: speakerName },
    fastMode,
  );
  return { file, ...result };
}

module.exports = {
  synthesizeToFile,
  generateStandaloneAudio,
  generateStandaloneAudioChunk,
  generateDialogueTurnAudio,
};
