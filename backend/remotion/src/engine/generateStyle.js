import { createSeededRng, pick, range } from './seedRandom';
import { hslToHex } from './color';

/**
 * Style Generator - layer 3 of the generative scene engine.
 *
 * Generates a palette procedurally from a continuous hue (via HSL color
 * math) instead of picking from a small fixed list - a fixed list of N
 * palettes collides constantly at real usage volume (N jobs before a
 * repeat becomes likely). A continuous hue space makes two jobs landing on
 * a visually identical look extremely unlikely, while a harmony rule
 * (complementary/triadic/analogous/split-complementary, picked per seed)
 * keeps the background/accent/text combination coherent rather than
 * arbitrary. Background lightness/saturation stay in a narrow dark band so
 * white/near-white text always has enough contrast, whatever hue lands.
 *
 * Same seed (a job's shared seed, reused across every scene) always
 * resolves to the same StylePlan, so a whole video looks coherent instead
 * of each scene picking its own random look.
 */
const HARMONY_OFFSETS = [180, 150, 210, 120, 240]; // complementary, split-complementary (x2), triadic (x2)

const buildPalette = (rng) => {
  const hue = range(rng, 0, 360);
  const accentHue = hue + pick(rng, HARMONY_OFFSETS);

  const bgSat = range(rng, 0.35, 0.6);
  const bgLight = range(rng, 0.08, 0.14);
  const midLight = bgLight + range(rng, 0.05, 0.09);

  const bg = hslToHex(hue, bgSat, bgLight);
  const bgMid = hslToHex(hue + range(rng, -20, 20), bgSat * 0.9, midLight);
  const bgDark = hslToHex(hue + range(rng, 10, 40), bgSat * 0.7, bgLight * 0.5);

  const accent = hslToHex(accentHue, range(rng, 0.55, 0.85), range(rng, 0.58, 0.72));
  const textMuted = hslToHex(hue, range(rng, 0.15, 0.3), range(rng, 0.72, 0.82));

  return {
    bg,
    bgGradient: `linear-gradient(135deg, ${bg} 0%, ${bgMid} 60%, ${bgDark} 100%)`,
    accent,
    text: '#ffffff',
    textMuted,
  };
};

// A handful of pairings rather than a continuous "font space" - unlike
// color, typefaces can't be interpolated, so variety here comes from
// having enough distinct pairings that repeats are uncommon rather than
// impossible. Sticks to system-safe stacks (no font loading dependency).
const FONT_PAIRINGS = [
  { title: "'Helvetica Neue', Helvetica, Arial, sans-serif", body: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
  { title: "Georgia, 'Times New Roman', serif", body: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
  { title: "'Trebuchet MS', 'Helvetica Neue', sans-serif", body: "Verdana, Geneva, sans-serif" },
  { title: "Cambria, Georgia, serif", body: "Cambria, Georgia, serif" },
  { title: "'Segoe UI', 'Helvetica Neue', sans-serif", body: "'Segoe UI', 'Helvetica Neue', sans-serif" },
  { title: "'Courier New', Courier, monospace", body: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
];

const TITLE_WEIGHTS = [300, 500, 600, 700, 800];

export const generateStyle = (seedInput) => {
  const rng = createSeededRng(`${seedInput}-style`);
  return {
    palette: buildPalette(rng),
    fonts: pick(rng, FONT_PAIRINGS),
    // Continuous radius/shadow intensity, same reasoning as the palette -
    // a handful of fixed shape presets repeats far more often than a
    // sampled range does.
    shape: {
      radius: Math.round(range(rng, 2, 26)),
      shadow: `0 ${Math.round(range(rng, 6, 14))}px ${Math.round(range(rng, 20, 36))}px rgba(0,0,0,${range(rng, 0.2, 0.4).toFixed(2)})`,
    },
    titleWeight: pick(rng, TITLE_WEIGHTS),
    accentStyle: pick(rng, ['solid', 'gradient']),
  };
};
