const { enqueue, size } = require('../../src/services/audio/audioGenerationQueue');

const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

describe('audioGenerationQueue', () => {
  it('runs tasks one at a time, in submission order', async () => {
    const order = [];
    const gate = deferred();

    const first = enqueue(async () => {
      order.push('first:start');
      await gate.promise;
      order.push('first:end');
    });
    const second = enqueue(async () => {
      order.push('second:start');
    });

    await new Promise((r) => setImmediate(r));
    expect(order).toEqual(['first:start']);
    expect(size()).toBe(2);

    gate.resolve();
    await Promise.all([first, second]);
    expect(order).toEqual(['first:start', 'first:end', 'second:start']);
    expect(size()).toBe(0);
  });

  it('keeps going after a task rejects', async () => {
    const ran = jest.fn();
    enqueue(async () => {
      throw new Error('boom');
    });
    await enqueue(async () => ran());
    expect(ran).toHaveBeenCalledTimes(1);
  });
});
