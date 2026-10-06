const config = require('../config');
const appVersion = require('../config/version');

/**
 * Who a BullMQ worker is, carried in its Redis client name so anyone holding
 * the queue can list every worker on it (Queue.getWorkers() returns the name
 * as `rawname`, after a `:w:` marker). Dev and prod share one queue, so this is
 * how a stale or duplicate worker is spotted: role, environment, the commit it
 * was started from, and its process id.
 *
 * Redis client names can't contain spaces, hence the dotted form:
 *   video.production.ab12cd3.22960
 */
function workerName(role) {
  return [role, config.nodeEnv, appVersion.commit || 'unknown', process.pid].join('.');
}

/** Parses a getWorkers() entry back into its parts (null if it isn't one of ours). */
function parseWorkerClient(client) {
  const raw = client?.rawname || '';
  const marker = raw.indexOf(':w:');
  if (marker === -1) return null;
  const [role, env, commit, pid] = raw.slice(marker + 3).split('.');
  if (!role || !env || !commit || !pid) return null;
  return {
    role,
    env,
    commit: commit === 'unknown' ? '' : commit,
    pid: Number(pid),
    ageSec: Number(client.age) || 0,
    idleSec: Number(client.idle) || 0,
  };
}

/**
 * Health of the workers on the queues, from the API's point of view:
 * - stale: a production worker on another commit than a production API. Only
 *   judged in production, where each deploy pins one commit; in dev the
 *   checkout moves with every commit and --watch workers lag behind it.
 * - unidentified: a worker with no identity name, i.e. started from code older
 *   than workerIdentity - so by definition not current.
 * - duplicates: more than one worker of a role, per queue and environment.
 *   Each should run exactly one; an extra one is almost always a process left
 *   behind by a restart.
 */
function assessWorkers(workers, { apiEnv, apiCommit }) {
  const judgeCommits = apiEnv === 'production' && Boolean(apiCommit);
  const list = workers.map((w) => ({
    ...w,
    stale: judgeCommits && w.env === 'production' && Boolean(w.commit) && w.commit !== apiCommit,
  }));
  const identified = list.filter((w) => w.role !== 'unnamed');
  const counts = {};
  for (const w of identified) {
    const key = `${w.queue || '-'}/${w.env}/${w.role}`;
    counts[key] = (counts[key] || 0) + 1;
  }
  const duplicates = Object.entries(counts)
    .filter(([, n]) => n > 1)
    .map(([key, count]) => ({ key, count }));
  const stale = list.filter((w) => w.stale);
  const unidentified = list.filter((w) => w.role === 'unnamed');
  return {
    workers: list,
    duplicates,
    stale,
    unidentified,
    healthy: duplicates.length === 0 && stale.length === 0 && unidentified.length === 0,
  };
}

module.exports = { workerName, parseWorkerClient, assessWorkers };
