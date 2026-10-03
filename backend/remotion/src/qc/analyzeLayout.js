/**
 * Layout QC - decides whether a rendered scene has a visible layout problem.
 *
 * Pure: it takes measurements (rects in canvas pixels, taken from the real DOM
 * by LayoutQc.jsx) and returns issues. Keeping it free of DOM access is what
 * makes the rules testable without a browser.
 *
 * What it looks for, in order of how much it hurts a viewer:
 *   clipped      lines of text cut off by their own box (the layout engine clamps
 *                title/body boxes, so text that does not fit is silently truncated)
 *   offscreen    text running outside the frame
 *   image-failed an image that did not load
 *   overlap      text drawn over other text, or over the captions
 *   small-text   text too small to read on a phone
 *   empty        a scene that shows nothing at all
 *
 * Thresholds scale with the canvas (all are written for 1080px tall).
 */

const REFERENCE_HEIGHT = 1080;
const OFFSCREEN_TOLERANCE_PX = 4;
const MIN_FONT_PX = 22;
const OVERLAP_WARN_RATIO = 0.15;
const OVERLAP_ERROR_RATIO = 0.4;
const PREVIEW_CHARS = 40;

const preview = (text) => {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > PREVIEW_CHARS ? `${clean.slice(0, PREVIEW_CHARS)}...` : clean;
};

const area = (r) => Math.max(0, r.w) * Math.max(0, r.h);

const intersectionArea = (a, b) => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
};

/** How far a rect sticks out past each edge of the canvas (0 when inside). */
const overhang = (r, canvas) => ({
  left: Math.max(0, -r.x),
  top: Math.max(0, -r.y),
  right: Math.max(0, r.x + r.w - canvas.width),
  bottom: Math.max(0, r.y + r.h - canvas.height),
});

/**
 * @param {object} input
 * @param {{width:number,height:number}} input.canvas
 * @param {Array<{role:string,text:string,rect:{x,y,w,h},clippedLines?:number,totalLines?:number,fontPx?:number}>} input.texts
 * @param {Array<{text:string,rect:{x,y,w,h}}>} [input.captions]
 * @param {Array<{src?:string,loaded:boolean}>} [input.images]
 * @returns {Array<{type:string,severity:'error'|'warn',message:string,detail?:object}>}
 */
export const analyzeLayout = ({ canvas, texts = [], captions = [], images = [] }) => {
  const issues = [];
  const scale = (canvas.height || REFERENCE_HEIGHT) / REFERENCE_HEIGHT;
  const add = (type, severity, message, detail) => issues.push({ type, severity, message, ...(detail ? { detail } : {}) });

  const smallText = [];
  for (const t of texts) {
    const label = `${t.role} "${preview(t.text)}"`;

    if ((t.clippedLines || 0) > 0) {
      const total = Math.max(t.totalLines || 0, t.clippedLines);
      add('clipped', 'error', `${label} is cut off - ${t.clippedLines} of its ${total} line${total === 1 ? '' : 's'} do not fit`, { role: t.role, clippedLines: t.clippedLines, totalLines: total });
    }

    const out = overhang(t.rect, canvas);
    const worst = Math.max(out.left, out.top, out.right, out.bottom);
    if (worst > OFFSCREEN_TOLERANCE_PX * scale) {
      const side = Object.entries(out).sort((a, b) => b[1] - a[1])[0][0];
      add('offscreen', 'error', `${label} runs ${Math.round(worst / scale)}px past the ${side} edge of the frame`, { role: t.role, side, px: Math.round(worst) });
    }

    // Labels are small caps by design; captions are checked separately below.
    if (t.fontPx && t.role !== 'label' && t.fontPx < MIN_FONT_PX * scale) smallText.push({ label, role: t.role, fontPx: t.fontPx });
  }

  // A crowded list shrinks every row the same amount - one warning, not forty.
  if (smallText.length > 0) {
    const smallest = smallText.reduce((a, b) => (b.fontPx < a.fontPx ? b : a));
    const px = Math.round(smallest.fontPx / scale);
    add(
      'small-text',
      'warn',
      smallText.length === 1
        ? `${smallest.label} is only ${px}px tall - hard to read on a phone`
        : `${smallText.length} text blocks are small - the smallest is ${smallest.label} at ${px}px, hard to read on a phone`,
      { count: smallText.length, fontPx: Math.round(smallest.fontPx) }
    );
  }

  for (const c of captions) {
    const out = overhang(c.rect, canvas);
    const worst = Math.max(out.left, out.top, out.right, out.bottom);
    if (worst > OFFSCREEN_TOLERANCE_PX * scale) {
      add('offscreen', 'error', `captions run ${Math.round(worst / scale)}px outside the frame`, { role: 'caption', px: Math.round(worst) });
    }
  }

  // Text over text. Two slots touching at an edge is normal; a real overlap is a
  // sizeable share of the smaller one.
  const blocks = [
    ...texts.map((t) => ({ kind: t.role, label: `${t.role} "${preview(t.text)}"`, rect: t.rect, caption: false })),
    ...captions.map((c) => ({ kind: 'captions', label: 'the captions', rect: c.rect, caption: true })),
  ];
  // A crowded list overlaps in dozens of pairs; one line per kind of overlap is
  // what a person can act on, with the worst pair named.
  const overlaps = new Map(); // "kindA+kindB" -> { count, worst, ratio, severe }
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const smaller = Math.min(area(blocks[i].rect), area(blocks[j].rect));
      if (smaller <= 0) continue;
      const ratio = intersectionArea(blocks[i].rect, blocks[j].rect) / smaller;
      if (ratio < OVERLAP_WARN_RATIO) continue;

      const key = [blocks[i].kind, blocks[j].kind].sort().join(' + ');
      const severe = ratio >= OVERLAP_ERROR_RATIO || blocks[i].caption || blocks[j].caption;
      const entry = overlaps.get(key) || { count: 0, ratio: 0, severe: false, worst: null };
      entry.count += 1;
      entry.severe = entry.severe || severe;
      if (ratio > entry.ratio) { entry.ratio = ratio; entry.worst = [blocks[i].label, blocks[j].label]; }
      overlaps.set(key, entry);
    }
  }
  for (const [key, entry] of overlaps) {
    const worst = `${entry.worst[0]} overlaps ${entry.worst[1]} (${Math.round(entry.ratio * 100)}% of the smaller one)`;
    add(
      'overlap',
      entry.severe ? 'error' : 'warn',
      entry.count === 1 ? worst : `${entry.count} overlapping pairs (${key}); worst: ${worst}`,
      { pairs: entry.count, ratio: Number(entry.ratio.toFixed(2)) }
    );
  }

  for (const img of images) {
    if (!img.loaded) add('image-failed', 'error', `an image did not load${img.src ? ` (${preview(img.src)})` : ''}`, img.src ? { src: img.src } : undefined);
  }

  if (texts.length === 0 && captions.length === 0 && images.length === 0) {
    add('empty', 'warn', 'this scene shows no text and no image');
  }

  return issues;
};

/** Worst severity first, then by type - the order a person wants to read them in. */
export const sortIssues = (issues) =>
  [...issues].sort((a, b) => (a.severity === b.severity ? a.type.localeCompare(b.type) : a.severity === 'error' ? -1 : 1));
