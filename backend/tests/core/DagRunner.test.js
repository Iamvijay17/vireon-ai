const { runGraph, analyze, analyzeParallelism, CycleError } = require('../../src/core/graph/DagRunner');

/**
 * DagRunner is the one piece of pipeline machinery that is pure - no DB, no
 * GPU, no filesystem - so its failure semantics (which nodes get skipped,
 * which siblings keep running, what a cache hit short-circuits) are
 * testable exactly, and they are the semantics the whole v2 pipeline rests
 * on.
 */

/** A node that records its own execution order into `log`. */
const node = (id, deps, log, impl) => ({
  id,
  deps,
  run: async (ctx) => {
    log.push(id);
    return impl ? impl(ctx) : id;
  },
});

describe('analyze', () => {
  it('rejects a dependency on a node that does not exist', () => {
    expect(() => analyze([{ id: 'a', deps: ['ghost'] }]))
      .toThrow('Node "a" depends on unknown node "ghost"');
  });

  it('rejects a cycle and names the nodes involved', () => {
    const nodes = [
      { id: 'a', deps: ['b'] },
      { id: 'b', deps: ['a'] },
    ];
    expect(() => analyze(nodes)).toThrow(CycleError);
    try {
      analyze(nodes);
    } catch (err) {
      expect(err.remaining.sort()).toEqual(['a', 'b']);
    }
  });

  it('produces a topological order where every dep precedes its dependent', () => {
    const { order } = analyze([
      { id: 'upload', deps: ['render'] },
      { id: 'render', deps: ['compose'] },
      { id: 'compose', deps: ['audio'] },
      { id: 'audio', deps: [] },
    ]);
    expect(order.indexOf('audio')).toBeLessThan(order.indexOf('compose'));
    expect(order.indexOf('compose')).toBeLessThan(order.indexOf('render'));
    expect(order.indexOf('render')).toBeLessThan(order.indexOf('upload'));
  });
});

describe('runGraph', () => {
  it('resolves immediately for an empty graph', async () => {
    const { results, ok } = await runGraph([]);
    expect(ok).toBe(true);
    expect(results.size).toBe(0);
  });

  it('runs independent nodes concurrently, not in declaration order', async () => {
    let peak = 0;
    let active = 0;
    const slow = (id) => ({
      id,
      deps: [],
      run: async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 10));
        active -= 1;
        return id;
      },
    });

    await runGraph([slow('a'), slow('b'), slow('c')]);
    expect(peak).toBe(3);
  });

  it('honours the concurrency cap', async () => {
    let peak = 0;
    let active = 0;
    const slow = (id) => ({
      id,
      deps: [],
      run: async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 10));
        active -= 1;
      },
    });

    await runGraph([slow('a'), slow('b'), slow('c'), slow('d')], { concurrency: 2 });
    expect(peak).toBeLessThanOrEqual(2);
  });

  it('gives a node its deps results before it runs', async () => {
    const nodes = [
      { id: 'a', deps: [], run: async () => 'A' },
      { id: 'b', deps: [], run: async () => 'B' },
      {
        id: 'c',
        deps: ['a', 'b'],
        run: async (ctx) => `${ctx.results.get('a').value}+${ctx.results.get('b').value}`,
      },
    ];
    const { results } = await runGraph(nodes);
    expect(results.get('c').value).toBe('A+B');
  });

  it('skips only the transitive dependents of a failed node, not its siblings', async () => {
    const log = [];
    const nodes = [
      { id: 'bad', deps: [], run: async () => { throw new Error('boom'); } },
      node('downstream', ['bad'], log),
      node('downstream2', ['downstream'], log),
      node('sibling', [], log),
    ];

    const { results, ok } = await runGraph(nodes);

    expect(ok).toBe(false);
    expect(results.get('bad').status).toBe('failed');
    expect(results.get('downstream').status).toBe('skipped');
    expect(results.get('downstream2').status).toBe('skipped');
    // The whole point: an unrelated branch still completes.
    expect(results.get('sibling').status).toBe('done');
    expect(log).toEqual(['sibling']);
  });

  it('records why a node was skipped', async () => {
    const nodes = [
      { id: 'bad', deps: [], run: async () => { throw new Error('boom'); } },
      { id: 'after', deps: ['bad'], run: async () => 'never' },
    ];
    const { results } = await runGraph(nodes);
    expect(results.get('after').reason).toBe('upstream "bad" failed');
  });

  it('short-circuits a cacheKey hit as "cached", never running the node', async () => {
    const log = [];
    const nodes = [{ ...node('a', [], log), cacheKey: 'k1' }];

    const { results } = await runGraph(nodes, {
      resolveCache: async (key) => (key === 'k1' ? { hit: true, value: 'from-cache' } : { hit: false }),
    });

    expect(results.get('a').status).toBe('cached');
    expect(results.get('a').value).toBe('from-cache');
    expect(log).toEqual([]); // run() never fired
  });

  it('treats a cached dep as satisfied for its dependents', async () => {
    const nodes = [
      { id: 'a', deps: [], cacheKey: 'k1', run: async () => 'fresh' },
      { id: 'b', deps: ['a'], run: async (ctx) => `used:${ctx.results.get('a').value}` },
    ];
    const { results, ok } = await runGraph(nodes, {
      resolveCache: async () => ({ hit: true, value: 'cached' }),
    });
    expect(ok).toBe(true);
    expect(results.get('b').value).toBe('used:cached');
  });

  it('runs the node normally on a cache miss', async () => {
    const nodes = [{ id: 'a', deps: [], cacheKey: 'k1', run: async () => 'fresh' }];
    const { results } = await runGraph(nodes, { resolveCache: async () => ({ hit: false }) });
    expect(results.get('a').status).toBe('done');
    expect(results.get('a').value).toBe('fresh');
  });

  it('fails every node when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const { results, ok } = await runGraph(
      [{ id: 'a', deps: [], run: async () => 'x' }],
      { signal: controller.signal }
    );
    expect(ok).toBe(false);
    expect(results.get('a').error.name).toBe('AbortError');
  });

  it('times every node it runs', async () => {
    const { results } = await runGraph([{ id: 'a', deps: [], run: async () => 'x' }]);
    const r = results.get('a');
    expect(typeof r.startedAt).toBe('number');
    expect(r.endedAt).toBeGreaterThanOrEqual(r.startedAt);
  });
});

describe('analyzeParallelism', () => {
  it('measures depth and width independent of any concurrency cap', () => {
    // Three independent scene-audio nodes feeding compose -> render -> upload,
    // i.e. the shape compileVideoGraph produces for a 3-scene job.
    const nodes = [
      { id: 's1', deps: [] },
      { id: 's2', deps: [] },
      { id: 's3', deps: [] },
      { id: 'compose', deps: ['s1', 's2', 's3'] },
      { id: 'render', deps: ['compose'] },
      { id: 'upload', deps: ['render'] },
    ];

    const { levels, maxWidth, depth } = analyzeParallelism(nodes);

    expect(depth.s1).toBe(0);
    expect(depth.compose).toBe(1);
    expect(depth.upload).toBe(3);
    expect(levels).toBe(4);
    // vs. 6 sequential steps - this is the number the DAG actually buys.
    expect(maxWidth).toBe(3);
  });

  it('reports a fully sequential chain as width 1', () => {
    const { maxWidth, levels } = analyzeParallelism([
      { id: 'a', deps: [] },
      { id: 'b', deps: ['a'] },
      { id: 'c', deps: ['b'] },
    ]);
    expect(maxWidth).toBe(1);
    expect(levels).toBe(3);
  });
});
