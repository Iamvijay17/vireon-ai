/**
 * End-to-end check of the narration pipeline on the real stack:
 *
 *   script -> Voice Director -> segmentation -> pronunciation -> Qwen3-TTS
 *          -> audio processing -> assembly -> assets.json -> Remotion -> mp4
 *
 * Nothing is mocked: it needs MongoDB, MinIO, the TTS server and Remotion's
 * browser, exactly like a real job, and takes a few minutes (GPU TTS + render).
 * It forces TTS_SEGMENTED on for this process only, builds a tiny two-scene
 * script, and verifies the finished video:
 *   - the video has an audio stream and its length matches the narration,
 *   - the assets handed to Remotion carry the segment timeline and caption words,
 *   - captions stay one-to-one with the ORIGINAL words (not the respelled ones).
 *
 *   node scripts/e2eNarration.js [--keep]      (--keep leaves the job dir + storage objects)
 */
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const mongoose = require('mongoose');
const config = require('../src/config');

config.audio.segmentedTts = true;

const JOB_ID = `e2e-${Date.now()}`;
const keep = process.argv.includes('--keep');

const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) process.exitCode = 1;
};

async function main() {
  await mongoose.connect(config.mongodb.uri);

  const ScriptParserService = require('../src/services/video/ScriptParserService');
  const AudioService = require('../src/services/audio/audioService');
  const RemotionService = require('../src/services/video/RemotionService');
  const LocalAIService = require('../src/services/localAI');
  const { captionTokens } = require('../src/services/audio/pipeline/pronunciation');
  const { getStorageProvider } = require('../src/services/storage/providers');

  const raw = (n, text, extra = {}) => ({
    sceneNumber: n,
    sceneType: n === 1 ? 'title' : 'content',
    title: n === 1 ? 'Meet Vireon' : 'How it works',
    subtitle: n === 1 ? 'Narration, directed' : '',
    backgroundColor: '#101828',
    transition: 'fade',
    imagePrompt: '',
    cameraMotion: 'static',
    animation: '',
    scene_meta: { content: ['Voice Director', 'Segments', 'Remotion'] },
    audio: { text, voice: 'custom:Ryan', emotion: n === 1 ? 'warm and inviting' : '' },
    ...extra,
  });

  const script = ScriptParserService.validate(
    {
      title: 'Narration e2e', description: 'e2e', tags: ['e2e'],
      scenes: [
        raw(1, `Welcome to Vireon. Run ${Date.now() % 1000} tests: it is built on Node.js and MongoDB.`),
        raw(2, 'Each sentence is directed, spoken and timed. The result stays in sync with the captions.'),
      ],
    },
    'educational',
    { seed: JOB_ID }
  );

  const jobConfig = {
    type: 'educational', language: 'english', resolution: '1280x720', aspectRatio: '16:9',
    quality: 'draft', fontPairing: 'default', captionAnimation: 'fadeInUp', aspect: '16:9',
  };

  // ---- audio -------------------------------------------------------------
  const events = [];
  const t0 = Date.now();
  const results = await LocalAIService.gpu.withGPU('tts', () =>
    AudioService.generateAllAudio(
      JOB_ID, script.scenes, 'custom:Ryan',
      async (sceneNumber, result) => {
        const scene = script.scenes.find((s) => s.sceneNumber === sceneNumber);
        scene.audio.file = result.file;
        scene.audio.duration = result.duration;
        scene.audio.captionTimestamps = result.captionTimestamps;
        scene.audio.segments = result.segments;
        scene.audio.ttsMeta = result.ttsMeta;
        scene.duration = result.duration;
        if (scene.elements) scene.elements.captionTimestamps = result.captionTimestamps;
      },
      null, false, false, null,
      { videoType: 'educational', totalScenes: script.scenes.length, onProgress: (e) => events.push(e.stage) }
    )
  );
  console.log(`audio done in ${Math.round((Date.now() - t0) / 1000)}s; stages: ${[...new Set(events)].join(' > ')}`);
  check('every scene produced audio', results.length === script.scenes.length);
  check('progress stages were emitted', ['segmenting', 'audio-assembling', 'audio-complete'].every((s) => events.includes(s)));

  for (const scene of script.scenes) {
    const words = captionTokens(scene.audio.text).length;
    const stamps = scene.audio.captionTimestamps;
    check(`scene ${scene.sceneNumber}: caption timestamps are one-to-one with original words`, Array.isArray(stamps) && stamps.length === words, `${stamps?.length}/${words}`);
    check(`scene ${scene.sceneNumber}: segment timeline present and inside the audio`,
      scene.audio.segments.length > 0 && scene.audio.segments.every((s) => s.endMs <= scene.audio.duration * 1000 + 5));
  }
  check('original text is untouched while TTS got the respelling',
    script.scenes[0].audio.text.includes('Node.js') && script.scenes[0].audio.segments[0].spokenText.includes('Node JS'));

  // ---- render ------------------------------------------------------------
  const assets = await RemotionService.prepareAssets(JOB_ID, script, jobConfig);
  const a0 = assets.scenes[0].audio;
  check('assets carry the segment timeline for Remotion', Array.isArray(a0.timeline) && a0.timeline.length > 0);
  check('assets carry the audio URL and exact duration', /scene1\.mp3$/.test(a0.file) && a0.duration > 0);

  console.log('rendering with Remotion (this takes a while)...');
  const rendered = await RemotionService.renderVideo(JOB_ID, null, (f) => process.stdout.write(`\r  render ${Math.round(f * 100)}%   `), new AbortController().signal);
  console.log('');

  const jobDir = path.resolve(__dirname, '../jobs', JOB_ID);
  const video = path.join(jobDir, 'render', 'video.mp4');
  check('video file exists', fs.existsSync(video), rendered?.videoPath || video);

  const probe = JSON.parse(execFileSync(config.audio.ffprobePath, ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,duration', '-of', 'json', video], { encoding: 'utf8' }));
  const audioStream = probe.streams.find((s) => s.codec_type === 'audio');
  const videoStream = probe.streams.find((s) => s.codec_type === 'video');
  const narration = script.scenes.reduce((sum, s) => sum + s.audio.duration, 0);
  check('video has video and audio streams', Boolean(audioStream && videoStream), `${videoStream?.codec_name}/${audioStream?.codec_name}`);
  const videoSeconds = Number(videoStream?.duration);
  check('video length matches the narration', Math.abs(videoSeconds - narration) < 1.5, `${videoSeconds.toFixed(2)}s vs ${narration.toFixed(2)}s`);

  if (!keep) {
    fs.rmSync(jobDir, { recursive: true, force: true });
    try {
      const client = getStorageProvider().client;
      for (const bucket of [config.minio.scenesBucket, config.minio.videoBucket]) {
        const keys = [];
        await new Promise((resolve) => {
          const s = client.listObjectsV2(bucket, `${JOB_ID}/`, true);
          s.on('data', (o) => keys.push(o.name));
          s.on('end', resolve);
          s.on('error', resolve);
        });
        if (keys.length) await client.removeObjects(bucket, keys);
      }
    } catch (err) {
      console.log('storage cleanup skipped:', err.message);
    }
  } else {
    console.log('kept:', jobDir);
  }

  await mongoose.disconnect();
  console.log(process.exitCode ? '\nE2E FAILED' : '\nE2E PASSED');
  process.exit(process.exitCode || 0);
}

main().catch((err) => {
  console.error('e2e failed:', err);
  process.exit(1);
});
