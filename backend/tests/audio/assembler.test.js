const fs = require('fs');
const os = require('os');
const path = require('path');
const { assembleScene } = require('../../src/services/audio/pipeline/assembler');
const { buildWavBuffer, parseWav } = require('../../src/utils/wavAudio');

const RATE = 24000;
const fmt = { audioFormat: 1, channels: 1, sampleRate: RATE, byteRate: RATE * 2, blockAlign: 2, bitsPerSample: 16 };

/** A WAV of `ms` of a constant non-zero tone, so silence is distinguishable from audio. */
function tone(ms, amplitude = 8000) {
  const samples = Math.round((RATE * ms) / 1000);
  const buf = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) buf.writeInt16LE(amplitude, i * 2);
  return buildWavBuffer(fmt, buf);
}

let dir;
beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vireon-asm-')); });
afterAll(() => { fs.rmSync(dir, { recursive: true, force: true }); });

function clip(name, ms, extra = {}) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, tone(ms));
  return { file, ...extra };
}

describe('assembleScene', () => {
  it('lays segments out with exact timings and collapses adjacent pauses', async () => {
    const clips = [
      clip('a.wav', 1000, { pauseAfterMs: 300 }),
      clip('b.wav', 500, { pauseBeforeMs: 500, pauseAfterMs: 200 }), // gap = max(300, 500)
      clip('c.wav', 250, { pauseAfterMs: 400 }),                      // gap = max(200, 0)
    ];
    const out = path.join(dir, 'scene.wav');
    const r = await assembleScene(clips, out);

    expect(r.timings).toEqual([
      { startMs: 0, endMs: 1000, durationMs: 1000 },
      { startMs: 1500, endMs: 2000, durationMs: 500 },
      { startMs: 2200, endMs: 2450, durationMs: 250 },
    ]);
    // 1000 + 500 + 500 + 200 + 250 + 400 tail
    expect(r.durationMs).toBe(2850);

    const { fmt: outFmt, data } = parseWav(fs.readFileSync(out));
    expect(outFmt.sampleRate).toBe(RATE);
    expect(Math.round((data.length / outFmt.byteRate) * 1000)).toBe(r.durationMs);
  });

  it('puts the tail pause after the last clip and a leading pause before the first', async () => {
    const r = await assembleScene([clip('d.wav', 400, { pauseBeforeMs: 100, pauseAfterMs: 300 })], path.join(dir, 's2.wav'));
    expect(r.timings[0].startMs).toBe(100);
    expect(r.durationMs).toBe(800);
  });

  it('rejects clips with different formats rather than producing garbled audio', async () => {
    const odd = path.join(dir, 'odd.wav');
    fs.writeFileSync(odd, buildWavBuffer({ ...fmt, sampleRate: 16000, byteRate: 32000 }, Buffer.alloc(3200)));
    await expect(assembleScene([clip('e.wav', 100), { file: odd }], path.join(dir, 's3.wav'))).rejects.toThrow(/inconsistent formats/);
  });

  it('rejects an empty clip list and an unreadable clip', async () => {
    await expect(assembleScene([], path.join(dir, 's4.wav'))).rejects.toThrow(/No audio clips/);
    await expect(assembleScene([{ file: path.join(dir, 'missing.wav') }], path.join(dir, 's5.wav'))).rejects.toThrow(/could not read/);
  });
});
