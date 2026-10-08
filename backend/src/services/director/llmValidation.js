const LoggerService = require('../common/LoggerService');
const { formatIssues } = require('./schemas');

/**
 * The detect → repair → re-validate → give up gracefully loop for LLM output.
 *
 * Local models are mostly right and occasionally wrong in small, fixable ways -
 * one scene with a layout that does not exist, an image scene with no prompt.
 * Throwing the whole response away for that wastes minutes of GPU time, and
 * trusting it passes the mistake to the renderer. So:
 *
 *   1. each candidate is parsed against the schema on its own;
 *   2. the ones that fail are sent back to the model, with the exact problems
 *      listed, asking only for those corrected;
 *   3. the corrections are validated again;
 *   4. whatever is still invalid is reported as rejected - the caller falls back
 *      to the deterministic default for it. It never goes on to the renderer.
 *
 * Only cancellation propagates out; a repair call that fails just means that
 * candidate stays rejected.
 */

const safeId = (idOf, raw) => {
  try {
    return idOf(raw);
  } catch {
    return undefined;
  }
};

function parseAll(items, schema, idOf) {
  const valid = [];
  const rejected = [];
  for (const raw of items) {
    const result = schema.safeParse(raw);
    if (result.success) valid.push(result.data);
    else rejected.push({ id: safeId(idOf, raw), issues: formatIssues(result.error), raw });
  }
  return { valid, rejected };
}

const isCancel = (err) => err?.cancelled === true || err?.name === 'AbortError';

/**
 * @param {object}   opts
 * @param {unknown[]} opts.candidates   raw items from the model
 * @param {import('zod').ZodTypeAny} opts.schema
 * @param {(raw:any)=>any} opts.idOf    stable id of a raw item (to match a correction to its original)
 * @param {(rejected:{id:any,issues:string[],raw:any}[])=>Promise<unknown[]>} [opts.repair]
 *        asks the model to correct the rejected items; omit to disable repair
 * @param {number}   [opts.maxRepairs=1]
 * @param {string}   [opts.label]       for logs
 * @param {object}   [opts.logContext]
 * @returns {Promise<{ valid: any[], rejected: {id:any, issues:string[], raw:any}[], repairs: number }>}
 */
async function validateWithRepair({ candidates, schema, idOf, repair, maxRepairs = 1, label = 'LLM output', logContext = {} }) {
  const first = parseAll(Array.isArray(candidates) ? candidates : [], schema, idOf);
  const valid = [...first.valid];
  let rejected = first.rejected;
  let repairs = 0;

  while (rejected.length > 0 && repair && repairs < maxRepairs) {
    repairs += 1;
    LoggerService.warn(`${label} failed validation - asking the model to correct it`, {
      ...logContext, round: repairs, rejected: rejected.map((r) => ({ id: r.id, issues: r.issues.slice(0, 4) })),
    });

    let corrections;
    try {
      corrections = await repair(rejected);
    } catch (err) {
      if (isCancel(err)) throw err;
      LoggerService.warn(`${label} repair call failed`, { ...logContext, error: err.message });
      break;
    }

    // A correction counts only for something that was actually rejected, once.
    const wanted = new Set(rejected.map((r) => r.id));
    const answers = new Map();
    for (const raw of Array.isArray(corrections) ? corrections : []) {
      const id = safeId(idOf, raw);
      if (wanted.has(id) && !answers.has(id)) answers.set(id, raw);
    }

    const unanswered = rejected.filter((r) => !answers.has(r.id));
    const second = parseAll([...answers.values()], schema, idOf);
    valid.push(...second.valid);
    rejected = [...unanswered, ...second.rejected];
  }

  if (rejected.length > 0) {
    LoggerService.warn(`${label} still invalid after ${repairs} repair attempt(s) - using defaults for these`, {
      ...logContext, rejected: rejected.map((r) => ({ id: r.id, issues: r.issues.slice(0, 3) })),
    });
  }
  return { valid, rejected, repairs };
}

/**
 * Validate ONE object (the story plan) with the same detect → repair → re-validate
 * flow. Returns { data } on success, or { data: null, issues } when it cannot be fixed.
 */
async function validateObjectWithRepair({ raw, schema, repair, maxRepairs = 1, label = 'LLM output', logContext = {} }) {
  let current = raw;
  let issues = [];
  let repairs = 0;

  for (let round = 0; round <= maxRepairs; round += 1) {
    const result = schema.safeParse(current);
    if (result.success) return { data: result.data, issues: [], repairs };
    issues = formatIssues(result.error);

    if (!repair || round >= maxRepairs) break;
    LoggerService.warn(`${label} failed validation - asking the model to correct it`, { ...logContext, issues: issues.slice(0, 6) });
    repairs += 1;
    try {
      current = await repair(issues, current);
    } catch (err) {
      if (isCancel(err)) throw err;
      LoggerService.warn(`${label} repair call failed`, { ...logContext, error: err.message });
      break;
    }
  }

  LoggerService.warn(`${label} still invalid - using the default plan`, { ...logContext, issues: issues.slice(0, 6) });
  return { data: null, issues, repairs };
}

module.exports = { validateWithRepair, validateObjectWithRepair };
