import { MARK_PATHS, MARK_SIZE, TONES, WORDMARK, lockupLayout } from "./geometry";

/*
 * Vireon AI brand marks as inline SVG (so they follow currentColor and never
 * flash in like an <img>). The exported files in public/brand/ are generated
 * from the same geometry by scripts/build-brand-assets.mjs.
 *
 *   <LogoMark />                    the symbol alone (collapsed sidebar, app icon slots)
 *   <Logo variant="compact" />      symbol + "Vireon AI" (sidebar)
 *   <Logo variant="primary" />      the full lockup (splash, empty states, docs)
 *
 * tone: "dark" (default, for dark surfaces) | "light" (white surfaces) | "mono" (currentColor).
 * Pass `title` when the logo is the only thing naming the link or page; leave it
 * off when text next to it already says "Vireon AI" (the svg is then aria-hidden).
 */

function a11y(title) {
  return title ? { role: "img", "aria-label": title } : { "aria-hidden": true, focusable: "false" };
}

function MarkShapes({ colors }) {
  return (
    <>
      <path d={MARK_PATHS.left} fill={colors.left} />
      <path d={MARK_PATHS.right} fill={colors.right} />
      <path d={MARK_PATHS.spark} fill={colors.spark} />
    </>
  );
}

function WordmarkShapes({ colors }) {
  return (
    <>
      {WORDMARK.pieces.map((p, i) =>
        p.kind === "stroke" ? (
          <path key={i} d={p.d} transform={p.transform} fill="none" stroke={colors[p.role]} strokeWidth={p.width} />
        ) : (
          <path key={i} d={p.d} transform={p.transform} fill={colors[p.role]} fillRule={p.fillRule} />
        ),
      )}
    </>
  );
}

/** The symbol alone, square. */
export function LogoMark({ size = 32, tone = "dark", title, className, ...rest }) {
  const colors = TONES[tone] || TONES.dark;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${MARK_SIZE} ${MARK_SIZE}`}
      width={size}
      height={size}
      className={className}
      {...a11y(title)}
      {...rest}
    >
      <MarkShapes colors={colors} />
    </svg>
  );
}

/** Symbol + "Vireon AI" wordmark. `height` is the rendered height in px; width follows. */
export function Logo({ height = 28, variant = "compact", tone = "dark", title, className, ...rest }) {
  const colors = TONES[tone] || TONES.dark;
  const { scale, x, y, viewBox } = lockupLayout(variant);
  const [vx, vy, vw, vh] = viewBox;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`${vx} ${vy} ${vw} ${vh}`}
      width={(height * vw) / vh}
      height={height}
      className={className}
      {...a11y(title)}
      {...rest}
    >
      <MarkShapes colors={colors} />
      <g transform={`translate(${x} ${y}) scale(${scale})`}>
        <WordmarkShapes colors={colors} />
      </g>
    </svg>
  );
}

export default Logo;
