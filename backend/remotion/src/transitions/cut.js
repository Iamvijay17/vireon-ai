export const id = 'cut';
// Zero overlap is computed for hard-cut transitions (see transitions/index.js's
// HARD_CUT_IDS), so `progress` here is always 1 - this is a no-op safety net,
// not the thing that actually produces the hard cut.
export const hardCut = true;

/** Also registered as `none` (VideoComposition's existing alias). */
export const style = () => ({ opacity: 1 });
