jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn(),
}));

const config = require('../../src/config');
const { SPEECH_EVENTS, SPEECH_EVENT_LABELS, emitSpeechStage } = require('../../src/services/audio/pipeline/speech/events');
const { createLimiter } = require('../../src/services/audio/pipeline/alignment/limiter');
const { SOCKET_EVENTS } = require('../../src/constants');

const flags = { ...config.speech };
afterEach(() => Object.assign(config.speech, flags));

describe('speech progress events', () => {
  it('uses the event names of the spec, with friendly labels for the UI', () => {
    expect(Object.values(SPEECH_EVENTS)).toEqual([
      'tts:start', 'tts:complete', 'alignment:start', 'alignment:progress', 'alignment:complete', 'timeline:complete', 'render:start', 'render:complete',
    ]);
    expect(SPEECH_EVENT_LABELS['alignment:start']).toBe('Analyzing speech timing...');
    expect(SPEECH_EVENT_LABELS['alignment:complete']).toBe('Speech timing analyzed');
    expect(SOCKET_EVENTS.SPEECH_STAGE).toBe('speechStage');
    for (const e of Object.values(SPEECH_EVENTS)) expect(SPEECH_EVENT_LABELS[e]).toEqual(expect.any(String));
  });

  it('emits through the socket service when speech alignment is on', () => {
    config.speech.alignmentEnabled = true;
    const socket = { emitSpeechStage: jest.fn() };
    emitSpeechStage(socket, 'job-1', SPEECH_EVENTS.ALIGNMENT_PROGRESS, { current: 2, total: 5 });
    expect(socket.emitSpeechStage).toHaveBeenCalledWith({ jobId: 'job-1', event: 'alignment:progress', label: 'Analyzing speech timing...', current: 2, total: 5 });
  });

  it('emits nothing when speech alignment is off (existing behaviour untouched)', () => {
    config.speech.alignmentEnabled = false;
    const socket = { emitSpeechStage: jest.fn() };
    emitSpeechStage(socket, 'job-1', SPEECH_EVENTS.TTS_START);
    expect(socket.emitSpeechStage).not.toHaveBeenCalled();
  });

  it('can never fail a job: a throwing socket is swallowed', () => {
    config.speech.alignmentEnabled = true;
    const socket = { emitSpeechStage: () => { throw new Error('redis down'); } };
    expect(() => emitSpeechStage(socket, 'job-1', SPEECH_EVENTS.TTS_START)).not.toThrow();
    expect(() => emitSpeechStage(undefined, 'job-1', SPEECH_EVENTS.TTS_START)).not.toThrow();
  });
});

describe('alignment concurrency limiter', () => {
  const tracker = () => {
    let active = 0;
    let max = 0;
    const task = (ms) => async () => {
      active++;
      max = Math.max(max, active);
      await new Promise((r) => setTimeout(r, ms));
      active--;
      return ms;
    };
    return { task, get max() { return max; } };
  };

  it('never runs more than the limit at once, and keeps order', async () => {
    const t = tracker();
    const limiter = createLimiter(() => 1);
    const results = await Promise.all([30, 10, 20, 5].map((ms) => limiter.run(t.task(ms))));
    expect(results).toEqual([30, 10, 20, 5]);
    expect(t.max).toBe(1);
  });

  it('allows the configured parallelism', async () => {
    const t = tracker();
    const limiter = createLimiter(() => 2);
    await Promise.all([10, 10, 10, 10, 10].map((ms) => limiter.run(t.task(ms))));
    expect(t.max).toBe(2);
  });

  it('a failing task neither blocks the queue nor leaks its slot', async () => {
    const limiter = createLimiter(() => 1);
    const boom = limiter.run(async () => { throw new Error('boom'); });
    const after = limiter.run(async () => 'ok');
    await expect(boom).rejects.toThrow('boom');
    await expect(after).resolves.toBe('ok');
    expect(limiter.active).toBe(0);
    expect(limiter.pending).toBe(0);
  });

  it('treats a bad limit as 1', async () => {
    const t = tracker();
    const limiter = createLimiter(() => 0);
    await Promise.all([5, 5, 5].map((ms) => limiter.run(t.task(ms))));
    expect(t.max).toBe(1);
  });
});
