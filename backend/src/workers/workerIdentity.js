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
 * Health of the workers on a queue, from the API's point of view: which are
 * running other code than this API (same environment only - a dev worker on
 * a different commit is normal), and whether an environment has more than
 * one worker of a role (each should run exactly one; an extra one is almost
 * always a leftover process from a restart).
 */
function assessWorkers(workers, { apiEnv, apiCommit }) {
  const list = workers.map((w) => ({
    ...w,
    stale: Boolean(apiCommit && w.commit && w.env === apiEnv && w.commit !== apiCommit),
  }));
  const counts = {};
  for (const w of list) {
    const key = `${w.env}/${w.role}`;
    counts[key] = (counts[key] || 0) + 1;
  }
  const duplicates = Object.entries(counts)
    .filter(([, n]) => n > 1)
    .map(([key, count]) => ({ key, count }));
  return { workers: list, duplicates, stale: list.filter((w) => w.stale) };
}

module.exports = { workerName, parseWorkerClient, assessWorkers };
