/**
 * Generic dependency-graph executor. Knows nothing about video, jobs, or
 * GPUs - a node is just `{ id, deps, run, cacheKey }`, so this is the same
 * engine whether it's wired to real step handlers (audio/render/upload) or
 * to synthetic test nodes.
 *
 * Execution model: a node becomes eligible the instant every dep in its
 * `deps` list has settled. Eligible nodes launch immediately (up to
 * `concurrency`), so independent branches (e.g. per-scene work) run in
 * parallel instead of the strict left-to-right order a hand-written
 * pipeline forces. A failed node fails every node that (transitively)
 * depends on it - marked 'skipped', never attempted - without stopping
 * sibling branches that don't depend on it.
 */

class CycleError extends Error {
  constructor(remaining) {
    super(`Cycle or missing dependency involving: ${remaining.join(', ')}`);
    this.name = 'CycleError';
    this.remaining = remaining;
  }
}

/**
 * Validate the node list and return { byId, order } where `order` is a
 * valid topological ordering (Kahn's algorithm) - used only to catch
 * cycles/missing deps up front, not to force sequential execution.
 */
function analyze(nodes) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const node of nodes) {
    for (const dep of node.deps || []) {
      if (!byId.has(dep)) {
        throw new Error(`Node "${node.id}" depends on unknown node "${dep}"`);
      }
    }
  }

  const indegree = new Map(nodes.map((n) => [n.id, (n.deps || []).length]));
  const dependents = new Map(nodes.map((n) => [n.id, []]));
  for (const node of nodes) {
    for (const dep of node.deps || []) dependents.get(dep).push(node.id);
  }

  const queue = nodes.filter((n) => indegree.get(n.id) === 0).map((n) => n.id);
  const order = [];
  while (queue.length > 0) {
    const id = queue.shift();
    order.push(id);
    for (const dependentId of dependents.get(id)) {
      indegree.set(dependentId, indegree.get(dependentId) - 1);
      if (indegree.get(dependentId) === 0) queue.push(dependentId);
    }
  }

  if (order.length !== nodes.length) {
    const remaining = nodes.map((n) => n.id).filter((id) => !order.includes(id));
    throw new CycleError(remaining);
  }

  return { byId, dependents, order };
}

/**
 * Run a graph to completion.
 *
 * @param {Array<{id, deps?, run, cacheKey?}>} nodes
 * @param {object} [opts]
 * @param {number} [opts.concurrency=Infinity] max nodes running at once
 * @param {(cacheKey: string) => Promise<{hit: boolean, value?: any}>} [opts.resolveCache]
 *   Checked before `run` for any node that declares a `cacheKey`. A hit
 *   short-circuits `run` entirely - the node is marked 'cached', not 'done',
 *   so callers can tell real work apart from a reused result.
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<{results: Map<string, NodeResult>, ok: boolean}>}
 *
 * Each node's `run(ctx)` receives `ctx.results` - the same Map this
 * function returns, already populated for every dep by the time `run`
 * fires - so a node can read `ctx.results.get(depId).value` instead of
 * relying on positional arguments a dependency's own signature can't
 * express once a node has more than one dep.
 */
async function runGraph(nodes, opts = {}) {
  const { concurrency = Infinity, resolveCache, signal } = opts;
  const { dependents } = analyze(nodes);

  const results = new Map();
  const running = new Set();
  let active = 0;

  return new Promise((resolve, reject) => {
    let settledCount = 0;
    const total = nodes.length;

    const finish = () => resolve({ results, ok: [...results.values()].every((r) => r.status !== 'failed') });

    const settle = (id, patch) => {
      results.set(id, { id, ...patch });
      running.delete(id);
      active -= 1;
      settledCount += 1;
      if (settledCount === total) return finish();
      pump();
    };

    const skip = (id, reason) => {
      settle(id, { status: 'skipped', reason });
      for (const dependentId of dependents.get(id)) {
        if (!results.has(dependentId) && !running.has(dependentId)) skip(dependentId, `upstream "${id}" did not complete`);
      }
    };

    const launch = async (node) => {
      running.add(node.id);
      active += 1;
      const startedAt = Date.now();

      try {
        if (signal?.aborted) throw Object.assign(new Error('Graph run aborted'), { name: 'AbortError' });

        if (node.cacheKey && resolveCache) {
          const cached = await resolveCache(node.cacheKey);
          if (cached?.hit) {
            return settle(node.id, { status: 'cached', value: cached.value, cacheKey: node.cacheKey, startedAt, endedAt: Date.now() });
          }
        }

        const value = await node.run({ signal, results });
        settle(node.id, { status: 'done', value, cacheKey: node.cacheKey || null, startedAt, endedAt: Date.now() });
      } catch (err) {
        settle(node.id, { status: 'failed', error: err, startedAt, endedAt: Date.now() });
        for (const dependentId of dependents.get(node.id)) {
          if (!results.has(dependentId) && !running.has(dependentId)) skip(dependentId, `upstream "${node.id}" failed`);
        }
      }
    };

    function pump() {
      if (active >= concurrency) return;
      for (const node of nodes) {
        if (active >= concurrency) break;
        if (results.has(node.id) || running.has(node.id)) continue;
        const deps = node.deps || [];
        if (!deps.every((d) => results.get(d)?.status === 'done' || results.get(d)?.status === 'cached')) continue;
        launch(node).catch(reject);
      }
    }

    if (total === 0) return resolve({ results, ok: true });
    pump();
  });
}

/**
 * Depth of each node (longest path from a root) and the max number of
 * nodes that share a depth - i.e. how parallel this graph actually is,
 * independent of any concurrency cap applied at run time. Used to compare
 * a compiled graph's real parallelism against a sequential pipeline's
 * step count without executing anything.
 */
function analyzeParallelism(nodes) {
  const { byId } = analyze(nodes);
  const depth = new Map();

  const depthOf = (id) => {
    if (depth.has(id)) return depth.get(id);
    const node = byId.get(id);
    const d = (node.deps || []).length === 0 ? 0 : 1 + Math.max(...node.deps.map(depthOf));
    depth.set(id, d);
    return d;
  };

  for (const node of nodes) depthOf(node.id);

  const byDepth = new Map();
  for (const [id, d] of depth) {
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d).push(id);
  }

  return {
    depth: Object.fromEntries(depth),
    levels: byDepth.size,
    maxWidth: Math.max(0, ...[...byDepth.values()].map((ids) => ids.length)),
    byDepth: Object.fromEntries([...byDepth.entries()].sort((a, b) => a[0] - b[0])),
  };
}

module.exports = { runGraph, analyze, analyzeParallelism, CycleError };
