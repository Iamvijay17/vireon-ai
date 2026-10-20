const { GpuTaskQueue, BLOCK } = require('../../src/services/gpu/GpuTaskQueue');

let seq = 0;
const task = (id, service, enqueuedAt, priority = 0) => ({ id, service, enqueuedAt, priority, seq: (seq += 1) });
const ids = (q) => q.list().map((t) => t.id);

describe('GpuTaskQueue ordering', () => {
  it('is FIFO within a priority', () => {
    const q = new GpuTaskQueue({ priorityWeightMs: 1000 });
    q.add(task('b', 'llm', 20));
    q.add(task('a', 'llm', 10));
    q.add(task('c', 'llm', 30));
    expect(ids(q)).toEqual(['a', 'b', 'c']);
  });

  it('lets higher priority jump a newer-but-lower task', () => {
    const q = new GpuTaskQueue({ priorityWeightMs: 1000 });
    q.add(task('batch', 'tts', 0, 0));
    q.add(task('interactive', 'tts', 500, 2));
    expect(ids(q)).toEqual(['interactive', 'batch']);
  });

  it('but a low-priority task that waited long enough still goes first (no starvation)', () => {
    const q = new GpuTaskQueue({ priorityWeightMs: 1000 });
    q.add(task('old-batch', 'tts', 0, 0));
    q.add(task('new-interactive', 'tts', 5000, 2)); // 2 levels = 2000ms head start, batch is 5000ms older
    expect(ids(q)).toEqual(['old-batch', 'new-interactive']);
  });

  it('breaks exact ties by arrival order', () => {
    const q = new GpuTaskQueue();
    q.add(task('first', 'llm', 5));
    q.add(task('second', 'llm', 5));
    expect(ids(q)).toEqual(['first', 'second']);
  });

  it('remove() reports whether the task was there', () => {
    const q = new GpuTaskQueue();
    q.add(task('a', 'llm', 1));
    expect(q.remove('a')).toBe(true);
    expect(q.remove('a')).toBe(false);
    expect(q.size).toBe(0);
  });
});

describe('GpuTaskQueue.pick', () => {
  const always = () => BLOCK.NONE;

  it('returns null when empty', () => {
    expect(new GpuTaskQueue().pick()).toBeNull();
  });

  it('picks the head when nothing is warm', () => {
    const q = new GpuTaskQueue({ affinityWindowMs: 1000 });
    q.add(task('a', 'llm', 0));
    q.add(task('b', 'tts', 10));
    expect(q.pick({ check: always }).id).toBe('a');
  });

  it('prefers a task for the warm model within the affinity window', () => {
    const q = new GpuTaskQueue({ affinityWindowMs: 1000 });
    q.add(task('needs-llm', 'llm', 0));
    q.add(task('warm-tts', 'tts', 500));
    expect(q.pick({ warm: new Set(['tts']), check: always }).id).toBe('warm-tts');
  });

  it('does not let a warm task overtake one that has waited past the window', () => {
    const q = new GpuTaskQueue({ affinityWindowMs: 1000 });
    q.add(task('needs-llm', 'llm', 0));
    q.add(task('warm-tts', 'tts', 5000));
    expect(q.pick({ warm: new Set(['tts']), check: always }).id).toBe('needs-llm');
  });

  it('affinity 0 is strict priority/FIFO', () => {
    const q = new GpuTaskQueue({ affinityWindowMs: 0 });
    q.add(task('needs-llm', 'llm', 0));
    q.add(task('warm-tts', 'tts', 1));
    expect(q.pick({ warm: new Set(['tts']), check: always }).id).toBe('needs-llm');
  });

  it('skips a task whose own service is busy so other services can run', () => {
    const q = new GpuTaskQueue({ affinityWindowMs: 0 });
    q.add(task('second-llm', 'llm', 0));
    q.add(task('tts', 'tts', 10));
    const check = (t) => (t.service === 'llm' ? BLOCK.SERVICE_BUSY : BLOCK.NONE);
    expect(q.pick({ check }).id).toBe('tts');
  });

  it('holds the line when the head is out of capacity - nothing behind may take its room', () => {
    const q = new GpuTaskQueue({ affinityWindowMs: 0 });
    q.add(task('big', 'comfyui', 0));
    q.add(task('small', 'llm', 10));
    const check = (t) => (t.id === 'big' ? BLOCK.CAPACITY : BLOCK.NONE);
    expect(q.pick({ check })).toBeNull();
  });

  it('never picks a warm task that cannot actually start', () => {
    const q = new GpuTaskQueue({ affinityWindowMs: 1000 });
    q.add(task('head', 'llm', 0));
    q.add(task('warm', 'tts', 10));
    const check = (t) => (t.id === 'warm' ? BLOCK.SERVICE_BUSY : BLOCK.NONE);
    expect(q.pick({ warm: new Set(['tts']), check }).id).toBe('head');
  });
});
