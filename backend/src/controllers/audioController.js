const fs = require('fs').promises;
const path = require('path');
const AudioGeneration = require('../models/AudioGeneration');
const AudioService = require('../services/TTS/audioService');
const LoggerService = require('../services/LoggerService');
const { parseDialogueScript } = require('../utils/parseDialogueScript');
const { concatWavFiles } = require('../utils/wavAudio');
const { createAudioSchema, audioIdSchema, createDialogueAudioSchema, validate } = require('../validators');

class AudioController {
  /**
   * POST /api/audio/generate - Synthesize standalone TTS audio from raw
   * text (Audio Studio). Synchronous - the TTS call itself is the slow part
   * (tens of seconds), same tradeoff as regenerateSceneAudio.
   */
  static async generate(req, res, next) {
    let record;
    try {
      const { text, voice, emotion } = validate(createAudioSchema)(req.body);
      record = await AudioGeneration.create({ text, voice, emotion, status: 'PENDING' });

      const result = await AudioService.generateStandaloneAudio(record._id, text, voice, emotion);

      record.status = 'COMPLETED';
      record.audioUrl = `/public/audio-studio/${record._id}/${result.file}`;
      record.duration = result.duration;
      await record.save();

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
   * mode uses) with a short silence between turns - the per-turn files stay
   * on disk too, kept as the source material behind that merge.
   */
  static async generateDialogue(req, res, next) {
    let record;
    try {
      const { script, speakers } = validate(createDialogueAudioSchema)(req.body);

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
        );
        record.turns[i].file = `/public/audio-studio/${record._id}/${result.file}`;
        record.turns[i].duration = result.duration;
        // Persist after each turn (not just once at the end) so the history
        // list can show real "N of M turns done" progress instead of a bare
        // "Pending" spinner, and so a crash mid-run leaves a record of how
        // far it got instead of nothing at all.
        await record.save();
      }

      const audioDir = path.resolve(__dirname, '../../jobs/audio-studio', record._id);
      const turnFilePaths = record.turns.map((t) => path.join(audioDir, path.basename(t.file)));
      const merged = await concatWavFiles(turnFilePaths, (i) =>
        AudioService.turnGapSeconds(`${record._id}:gap:${i}`),
      );
      const mergedFile = 'dialogue.mp3';
      await fs.writeFile(path.join(audioDir, mergedFile), merged.buffer);

      record.status = 'COMPLETED';
      record.audioUrl = `/public/audio-studio/${record._id}/${mergedFile}`;
      record.duration = merged.durationSeconds;
      await record.save();

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

      res.json({ id });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = AudioController;
