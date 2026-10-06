// Progress math for a pending Audio Studio generation (see HistoryPanel).
//
// Multi-piece generations (chunked single-voice or dialogue) report real
// progress: the share of characters already synthesized, weighted by text
// length so a long turn counts for more than a short one. A single-call
// generation has no intermediate signal from the TTS server, so for that case
// we estimate with an ease-out curve over elapsed time, held below 95% until
// the completed event actually arrives.

export const STALL_AFTER_SECONDS = 15 * 60;

const weight = (piece) => Math.max(piece.text?.length || 0, 1);

/**
 * @param {object} item     the AudioGeneration record (uses item.text)
 * @param {Array}  pieces   item.turns / item.chunks
 * @param {number} startedAt ms timestamp the client started tracking the item
 * @param {number} now       ms timestamp
 */
export const computeProgress = (item, pieces, startedAt, now) => {
  if (pieces?.length > 1) {
    const total = pieces.reduce((sum, p) => sum + weight(p), 0);
    const done = pieces.reduce((sum, p) => sum + (p.file ? weight(p) : 0), 0);
    return { percent: Math.min(99, Math.round((done / total) * 100)), estimated: false, stalled: false };
  }
  const elapsed = Math.max(0, (now - startedAt) / 1000);
  const tau = Math.max(8, (item.text?.length || 0) * 0.08);
  return {
    percent: Math.min(95, Math.round((1 - Math.exp(-elapsed / tau)) * 100)),
    estimated: true,
    stalled: elapsed > STALL_AFTER_SECONDS,
  };
};

// Items we watch being created use the moment we first rendered them as the
// start, so a browser clock that disagrees with the server's `createdAt` can't
// make the estimate jump or sit at 0%. An item that was already old when we
// first saw it (opened mid-run, or left over) falls back to the server
// timestamp so it can still reach the stalled state.
const FRESH_WINDOW_MS = 60 * 1000;

export const resolveStartedAt = (createdAt, mountedAt) => {
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return mountedAt;
  return mountedAt - created > FRESH_WINDOW_MS ? created : mountedAt;
};
