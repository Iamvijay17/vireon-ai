/*
 * Vireon AI logo geometry - the single source of truth.
 *
 * Both the React <Logo> components and scripts/build-brand-assets.mjs (which
 * writes public/brand/*.svg and the PNG/ICO icons) import from here, so the
 * in-app mark and the exported files can never drift apart.
 *
 * The mark, "The Vireon Vortex", on a 64 x 64 grid:
 *   - a V sheared into two blades; the right blade sits higher, so the letter
 *     reads as turning (motion). Each blade is also a right triangle: together
 *     they are a play triangle rotated onto its point and split in two.
 *   - a four-point spark floating in the V's open counter (generative AI).
 * It is flat and two-tone on purpose. No gradients, so it stays crisp at 16px.
 *
 * The wordmark is hand-built from rectangles, arcs and polygons (no font file),
 * so exported SVGs render identically everywhere. Baseline y = 30, cap height 30,
 * x-height 22. "AI" is a smaller secondary lockup in the lighter violet.
 */

export const BRAND = {
  violet: "#7C3AED",
  lavender: "#A78BFA",
  ink: "#09090B",
  paper: "#FFFFFF",
  textOnDark: "#F4F4F8",
};

// Colour roles per surface. `mark` fills the left blade, right blade and spark;
// `wordmark` / `accent` fill "Vireon" and "AI" (and the i-dot).
export const TONES = {
  // Dark surfaces: the app, sidebar, app icon.
  dark: { left: BRAND.violet, right: BRAND.lavender, spark: BRAND.paper, wordmark: BRAND.textOnDark, accent: BRAND.lavender },
  // White surfaces: documents, light UI. Dark symbol, violet accents.
  light: { left: BRAND.ink, right: BRAND.violet, spark: BRAND.violet, wordmark: BRAND.ink, accent: BRAND.violet },
  // Single colour; one fill everywhere (the blade gap and counter keep it legible).
  mono: { left: "currentColor", right: "currentColor", spark: "currentColor", wordmark: "currentColor", accent: "currentColor" },
};

export const MARK_SIZE = 64;

/** Four-point concave spark centred on (cx, cy) with tip radius r. */
function spark(cx, cy, r, k = 0.16) {
  const f = (n) => +n.toFixed(2);
  const c = r * k;
  return (
    `M${f(cx)} ${f(cy - r)}Q${f(cx + c)} ${f(cy - c)} ${f(cx + r)} ${f(cy)}` +
    `Q${f(cx + c)} ${f(cy + c)} ${f(cx)} ${f(cy + r)}` +
    `Q${f(cx - c)} ${f(cy + c)} ${f(cx - r)} ${f(cy)}` +
    `Q${f(cx - c)} ${f(cy - c)} ${f(cx)} ${f(cy - r)}Z`
  );
}

export const SPARK = { cx: 30, cy: 15, r: 7, k: 0.16 };

// Polygons as point lists (used by the rasterizer) plus their SVG path data.
export const LEFT_BLADE = [[4, 14], [21, 14], [31, 33], [31, 58]];
export const RIGHT_BLADE = [[60, 6], [43, 6], [33, 25], [33, 50]];

const toPath = (pts) => `M${pts.map((p) => p.join(" ")).join("L")}Z`;

export const MARK_PATHS = {
  left: toPath(LEFT_BLADE),
  right: toPath(RIGHT_BLADE),
  spark: spark(SPARK.cx, SPARK.cy, SPARK.r, SPARK.k),
};

/** Flatten the spark's quadratic curves into a polygon for the rasterizer. */
export function sparkPolygon(steps = 16) {
  const { cx, cy, r, k } = SPARK;
  const c = r * k;
  const q = (p0, p1, p2) =>
    Array.from({ length: steps }, (_, i) => {
      const t = i / steps;
      const u = 1 - t;
      return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]];
    });
  return [
    ...q([cx, cy - r], [cx + c, cy - c], [cx + r, cy]),
    ...q([cx + r, cy], [cx + c, cy + c], [cx, cy + r]),
    ...q([cx, cy + r], [cx - c, cy + c], [cx - r, cy]),
    ...q([cx - r, cy], [cx - c, cy - c], [cx, cy - r]),
  ];
}

// ---------------------------------------------------------------- wordmark

const STROKE = 5; // main stem weight
const T = (x, y = 8) => `translate(${x} ${y})`; // lowercase sits on the baseline: top = 30 - 22

/**
 * Wordmark pieces, in a 165-wide, 30-tall space (baseline y = 30).
 * `stroke` pieces are centre-line paths drawn with butt caps; `fill` pieces are polygons.
 * `role` picks the colour: "wordmark" for Vireon, "accent" for the i-dot and AI.
 */
export const WORDMARK = {
  width: 164.8,
  height: 30,
  pieces: [
    // V
    { kind: "fill", role: "wordmark", d: "M0 0H5.8L14 22.6 22.2 0H28L17 30H11Z" },
    // i - stem, then a diamond dot (a small echo of the spark)
    { kind: "stroke", role: "wordmark", d: "M33.5 8V30", width: STROKE },
    { kind: "fill", role: "accent", d: "M33.5 -0.6L36.5 2.4 33.5 5.4 30.5 2.4Z" },
    // r
    { kind: "stroke", role: "wordmark", d: "M2.5 22V11A8.5 8.5 0 0 1 11 2.5H14", width: STROKE, transform: T(39.5) },
    // e
    { kind: "stroke", role: "wordmark", d: "M2.5 11H19.5A8.5 8.5 0 1 0 17 17", width: STROKE, transform: T(57) },
    // o
    { kind: "stroke", role: "wordmark", d: "M2.5 11a8.5 8.5 0 1 0 17 0a8.5 8.5 0 1 0 -17 0", width: STROKE, transform: T(82.5) },
    // n
    { kind: "stroke", role: "wordmark", d: "M2.5 22V11A8.5 8.5 0 0 1 19.5 11V22", width: STROKE, transform: T(108) },
    // A (hole = counter above the crossbar) and I - the secondary "AI"
    { kind: "fill", role: "accent", fillRule: "evenodd", d: "M0 30L7.2 14H10.8L18 30H14.1L12.9 26.8H5.1L3.9 30ZM6.6 23.2H11.4L9 17.9Z", transform: T(139, 0) },
    { kind: "fill", role: "accent", d: "M22 14H25.8V30H22Z", transform: T(139, 0) },
  ],
};

// Where the wordmark sits next to the mark in the combined lockups.
// scale: wordmark units -> mark units. The wordmark is vertically centred on the mark.
export const LOCKUPS = {
  // Primary logo: generous gap, larger type.
  primary: { scale: 1.15, gap: 20 },
  // Sidebar: tighter; the symbol is the hero, text is compact.
  compact: { scale: 0.92, gap: 14 },
};

/** Geometry of a lockup in mark units: where the wordmark goes and the total box. */
export function lockupLayout(name) {
  const { scale, gap } = LOCKUPS[name];
  const markLeft = 4;
  const markRight = 60;
  const x = markRight + gap;
  const capH = WORDMARK.height * scale;
  const baseline = MARK_SIZE / 2 + capH / 2; // cap-height block centred on y = 32
  const y = baseline - WORDMARK.height * scale;
  const right = x + WORDMARK.width * scale;
  return { scale, x, y, viewBox: [markLeft, 6, right - markLeft, 52] };
}
