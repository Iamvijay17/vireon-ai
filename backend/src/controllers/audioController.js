const fs = require('fs').promises;
const path = require('path');
const AudioGeneration = require('../models/AudioGeneration');
const AudioService = require('../services/audio/audioService');
const { getStorageProvider } = require('../services/storage/providers');
const LoggerService = require('../services/common/LoggerService');
const SocketService = require('../services/common/SocketService');
const { SOCKET_EVENTS } = require('../constants');
const { parseDialogueScript } = require('../utils/parseDialogueScript');
const { chunkText } = require('../utils/textChunking');
const { concatWavFiles } = require('../utils/wavAudio');
const { createAudioSchema, audioIdSchema, createDialogueAudioSchema, validate } = require('../validators');

// Above this length, single-voice text is split into sentence-boundary
// chunks and synthesized/surfaced progressively (see textChunking.chunkText)
// instead of one long TTS call the user waits on with no feedback. Short
// requests (the common case) stay a single call - no chunking overhead.
const CHUNK_MAX_CHARS = 400;
// Chunk boundaries are mid-narration, not a speaker handoff (contrast with
// the dialogue turn gap below, which varies 0.25-0.55s to avoid sounding
// metronomic across many turns) - a small fixed pause is enough here.
const CHUNK_GAP_SECONDS = 0.2;

class AudioController {
  /**
   * POST /api/audio/generate - Synthesize standalone TTS audio from raw
   * text (Audio Studio). Synchronous - the TTS call itself is the slow part
   * (tens of seconds), same tradeoff as regenerateSceneAudio. Text over
   * CHUNK_MAX_CHARS is split into sentence-boundary chunks and synthesized
   * progressively (each chunk saved + pushed over the socket as it finishes)
   * so the client can start playing before the whole thing is done, mirroring
   * generateDialogue's per-turn approach below.
   */
  static async generate(req, res, next) {
    let record;
    try {
      const { text, voice, emotion, fastMode } = validate(createAudioSchema)(req.body);
      const textChunks = chunkText(text, CHUNK_MAX_CHARS);

      if (textChunks.length <= 1) {
        record = await AudioGeneration.create({ text, voice, emotion, fastMode, status: 'PENDING' });

        const result = await AudioService.generateStandaloneAudio(record._id, text, voice, emotion, fastMode);
        const audioUrl = await getStorageProvider().uploadFile(record._id, result.path, 'audio-studio');

        record.status = 'COMPLETED';
        record.audioUrl = audioUrl;
        record.duration = result.duration;
        await record.save();
        await fs.rm(path.dirname(result.path), { recursive: true, force: true }).catch(() => {});

        return res.status(201).json({ audio: record });
      }

      record = await AudioGeneration.create({
        text,
        voice,
        emotion,
        fastMode,
        chunks: textChunks.map((t, i) => ({ order: i, text: t })),
        status: 'PENDING',
      });

      for (let i = 0; i < textChunks.length; i++) {
        const result = await AudioService.generateStandaloneAudioChunk(record._id, i, textChunks[i], voice, emotion, fastMode);
        record.chunks[i].file = await getStorageProvider().uploadFile(record._id, result.path, 'audio-studio');
        record.chunks[i].duration = result.duration;
        await record.save();
        SocketService.emitToJob(record._id, SOCKET_EVENTS.AUDIO_STUDIO_CHUNK_READY, {
          id: record._id,
          chunkIndex: i,
          chunk: record.chunks[i],
        });
      }

      const audioDir = path.resolve(__dirname, '../../jobs/audio-studio', record._id);
      const chunkFilePaths = record.chunks.map((c) => path.join(audioDir, path.basename(c.file)));
      const merged = await concatWavFiles(chunkFilePaths, () => CHUNK_GAP_SECONDS);
      const mergedFile = 'audio.mp3';
      const mergedPath = path.join(audioDir, mergedFile);
      await fs.writeFile(mergedPath, merged.buffer);

      record.status = 'COMPLETED';
      record.audioUrl = await getStorageProvider().uploadFile(record._id, mergedPath, 'audio-studio');
      record.duration = merged.durationSeconds;
      await record.save();
      await fs.rm(audioDir, { recursive: true, force: true }).catch(() => {});
      SocketService.emitToJob(record._id, SOCKET_EVENTS.AUDIO_STUDIO_COMPLETED, { id: record._id, audio: record });

      res.status(201).json({ audio: record });
    } catch (err) {
      if (record) {
        record.status = 'FAILED';
        record.error = err.message;
        await record.save().catch(() => {});
        LoggerService.error('Standalone audio generation failed', {
          id: record._id,
          error: err.message,
        });
        SocketService.emitToJob(record._id, SOCKET_EVENTS.AUDIO_STUDIO_FAILED, { id: record._id, error: err.message });
        return res.status(500).json({ error: 'Audio generation failed', message: err.message, audio: record });
      }
      next(err);
    }
  }

  /**
   * POST /api/audio/generate-dialogue - Synthesize a multi-speaker script
   * (Audio Studio "podcast" mode). Each "Name: line" turn is parsed against
   * the given speaker roster and synthesized with that speaker's voice, one
   * file per turn (see AudioService.generateDialogueTurnAudio), then merged
   * into a single output file (audioUrl/duration, same fields single-voice
   * mode uses) with a short silence between turns. Per-turn files are the
   * source material behind that merge but each is uploaded to storage as
   * soon as it's synthesized (record.turns[i].file), so once the merge
   * itself is uploaded the whole local audioDir is deleted - nothing left
   * needs the local copies.
   */
  static async generateDialogue(req, res, next) {
    let record;
    try {
      const { script, speakers, fastMode } = validate(createDialogueAudioSchema)(req.body);

      const { turns: parsedTurns, unknownSpeakers } = parseDialogueScript(script, speakers);
      if (unknownSpeakers.length > 0) {
        return res.status(400).json({
          error: 'Validation failed',
          details: [
            {
              field: 'script',
              message: `Script mentions speaker(s) not in the roster: ${unknownSpeakers.join(', ')}`,
            },
          ],
        });
      }
      if (parsedTurns.length === 0) {
        return res.status(400).json({
          error: 'Validation failed',
          details: [{ field: 'script', message: 'No recognizable "Name: line" turns found in the script' }],
        });
      }

      record = await AudioGeneration.create({
        mode: 'dialogue',
        text: script,
        speakers,
        fastMode,
        turns: parsedTurns.map((t, i) => ({ order: i, speaker: t.speaker, voice: t.voice, text: t.text, emotion: t.emotion })),
        status: 'PENDING',
      });

      for (let i = 0; i < parsedTurns.length; i++) {
        const turn = parsedTurns[i];
        const result = await AudioService.generateDialogueTurnAudio(
          record._id,
          i,
          turn.text,
          turn.voice,
          turn.speaker,
          turn.emotion,
          fastMode,
        );
        record.turns[i].file = await getStorageProvider().uploadFile(record._id, result.path, 'audio-studio');
        record.turns[i].duration = result.duration;
        // Persist after each turn (not just once at the end) so the history
        // list can show real "N of M turns done" progress instead of a bare
        // "Pending" spinner, and so a crash mid-run leaves a record of how
        // far it got instead of nothing at all.
        await record.save();
        // Push the turn to any client watching this generation's room, so
        // it can play this turn immediately instead of waiting for the
        // whole (possibly multi-minute) dialogue to finish and merge.
        SocketService.emitToJob(record._id, SOCKET_EVENTS.AUDIO_STUDIO_TURN_READY, {
          id: record._id,
          turnIndex: i,
          turn: record.turns[i],
        });
      }

      const audioDir = path.resolve(__dirname, '../../jobs/audio-studio', record._id);
      const turnFilePaths = record.turns.map((t) => path.join(audioDir, path.basename(t.file)));
      const merged = await concatWavFiles(turnFilePaths, (i) =>
        AudioService.turnGapSeconds(`${record._id}:gap:${i}`),
      );
      const mergedFile = 'dialogue.mp3';
      const mergedPath = path.join(audioDir, mergedFile);
      await fs.writeFile(mergedPath, merged.buffer);

      record.status = 'COMPLETED';
      record.audioUrl = await getStorageProvider().uploadFile(record._id, mergedPath, 'audio-studio');
      record.duration = merged.durationSeconds;
      await record.save();
      await fs.rm(audioDir, { recursive: true, force: true }).catch(() => {});
      SocketService.emitToJob(record._id, SOCKET_EVENTS.AUDIO_STUDIO_COMPLETED, { id: record._id, audio: record });

      res.status(201).json({ audio: record });
    } catch (err) {
      if (record) {
        record.status = 'FAILED';
        record.error = err.message;
        await record.save().catch(() => {});
        LoggerService.error('Dialogue audio generation failed', {
          id: record._id,
          error: err.message,
        });
        SocketService.emitToJob(record._id, SOCKET_EVENTS.AUDIO_STUDIO_FAILED, { id: record._id, error: err.message });
        return res.status(500).json({ error: 'Audio generation failed', message: err.message, audio: record });
      }
      next(err);
    }
  }

  /**
   * GET /api/audio - List past generations, newest first.
   */
  static async list(req, res, next) {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 20;

      const [items, total] = await Promise.all([
        AudioGeneration.find().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        AudioGeneration.countDocuments(),
      ]);

      res.json({
        items,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /api/audio/:id - Remove a generation's record and its audio file.
   */
  static async remove(req, res, next) {
    try {
      const { id } = validate(audioIdSchema)({ id: req.params.id });
      const record = await AudioGeneration.findByIdAndDelete(id);
      if (!record) {
        return res.status(404).json({ error: 'Audio generation not found' });
      }

      const audioDir = path.resolve(__dirname, '../../jobs/audio-studio', id);
      await fs.rm(audioDir, { recursive: true, force: true });
      await getStorageProvider().deleteJob(id);

      res.json({ id });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = AudioController;
