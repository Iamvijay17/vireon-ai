const { execFile } = require('child_process');
const { promisify } = require('util');
const config = require('../config');
const MetricsService = require('../services/common/MetricsService');
const { generatePreview } = require('../services/audio/pipeline/preview');
const { listProfiles } = require('../services/audio/pipeline/voiceProfiles');
const { PRONUNCIATION_VERSION } = require('../services/audio/pipeline/pronunciation');
const { DIRECTOR_VERSION } = require('../services/audio/pipeline/voiceDirector');
const ffmpeg = require('../services/audio/pipeline/ffmpeg');
const { STYLES, EMOTIONS, TTS_LANGUAGES, AUDIO_FORMATS, previewRequestSchema } = require('../services/audio/pipeline/schemas');
const { validate } = require('../validators');

const execFileAsync = promisify(execFile);

/** Best-effort GPU reading; null wherever nvidia-smi isn't available. */
async function gpuUtilization() {
  try {
    const { stdout } = await execFileAsync(
      'nvidia-smi',
      ['--query-gpu=name,utilization.gpu,memory.used,memory.total', '--format=csv,noheader,nounits'],
      { timeout: 3000, windowsHide: true }
    );
    const [name, util, used, total] = stdout.trim().split('\n')[0].split(',').map((s) => s.trim());
    return { name, utilizationPercent: Number(util), memoryUsedMb: Number(used), memoryTotalMb: Number(total) };
  } catch {
    return null;
  }
}

const round1 = (n) => (n === null || n === undefined ? null : Math.round(n * 10) / 10);

class TtsController {
  /**
   * GET /api/tts/voices - everything the Voice Studio needs to render its
   * controls: voice profiles plus the valid styles/emotions/languages and
   * numeric limits (so the UI never hard-codes ranges the server enforces).
   */
  static async voices(req, res, next) {
    try {
      const { speedMin, speedMax, pitchLimit, previewMaxChars } = config.audio;
      res.status(200).json({
        profiles: listProfiles(),
        styles: STYLES,
        emotions: EMOTIONS,
        languages: TTS_LANGUAGES,
        formats: AUDIO_FORMATS,
        limits: { speedMin, speedMax, pitchMin: -pitchLimit, pitchMax: pitchLimit, previewMaxChars },
        versions: { voiceDirector: DIRECTOR_VERSION, pronunciation: PRONUNCIATION_VERSION },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/tts/preview - synthesize a short line through the real
   * narration pipeline and return the audio itself (audio/wav or audio/mpeg).
   * Timing/cache details ride in X-Tts-* headers, so the body can go straight
   * into an <audio> element.
   */
  static async preview(req, res, next) {
    try {
      const request = validate(previewRequestSchema)(req.body);
      const result = await generatePreview(request);

      res.set({
        'Content-Type': result.contentType,
        'Content-Length': String(result.buffer.length),
        'Cache-Control': 'no-store',
        'X-Tts-Duration-Ms': String(result.durationMs),
        'X-Tts-Cache': result.cache,
        'X-Tts-Segments': String(result.segments),
        'X-Tts-Style': result.style,
        'X-Tts-Format': result.format,
        ...(result.formatNote ? { 'X-Tts-Note': result.formatNote } : {}),
        'Access-Control-Expose-Headers': 'X-Tts-Duration-Ms, X-Tts-Cache, X-Tts-Segments, X-Tts-Style, X-Tts-Format, X-Tts-Note',
      });
      res.status(200).send(result.buffer);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/tts/stats - narration performance since the metrics began:
   * cache hit rates, average generation / processing / assembly / queue-wait
   * times, failure count, ffmpeg + GPU status. Measures, doesn't optimise.
   */
  static async stats(req, res, next) {
    try {
      const [
        processedRate, rawRate, generationAvg, generationCount, processingAvg, assemblyAvg, queueWaitAvg, failures, ffmpegStatus, gpu,
      ] = await Promise.all([
        MetricsService.getRate('tts.segment.processed.hit', 'tts.segment.processed.miss'),
        MetricsService.getRate('tts.segment.raw.hit', 'tts.segment.raw.miss'),
        MetricsService.getAverage('tts.segment.generation'),
        MetricsService.getCount('tts.segment.generation'),
        MetricsService.getAverage('audio.processing'),
        MetricsService.getAverage('audio.assembly'),
        MetricsService.getAverage('tts.queueWait'),
        MetricsService.getCount('tts.segment.failed'),
        ffmpeg.getFfmpegStatus(),
        gpuUtilization(),
      ]);

      const attempts = generationCount + failures;
      res.status(200).json({
        segmentedPipeline: config.audio.segmentedTts,
        cache: { processedHitRatePercent: processedRate, rawHitRatePercent: rawRate },
        averagesMs: {
          ttsGenerationPerSegment: round1(generationAvg),
          audioProcessingPerSegment: round1(processingAvg),
          audioAssemblyPerScene: round1(assemblyAvg),
          queueWait: round1(queueWaitAvg),
        },
        segmentsGenerated: generationCount,
        segmentFailures: failures,
        failureRatePercent: attempts ? round1((failures / attempts) * 100) : null,
        ffmpeg: ffmpegStatus,
        gpu,
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = TtsController;
