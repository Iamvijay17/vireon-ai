import { createSeededRng, pick } from './seedRandom';

/**
 * Style Generator - layer 3 of the generative scene engine.
 *
 * Extends theme.js's single fixed palette into a seeded family: same seed
 * (a job's shared seed, reused across every scene) always resolves to the
 * same StylePlan, so a whole video looks coherent instead of each scene
 * picking its own random look.
 */
const PALETTES = [
  { bg: '#0d1117', bgGradient: 'linear-gradient(135deg, #0d1117 0%, #161b22 60%, #1a1a2e 100%)', accent: '#60a5fa', text: '#ffffff', textMuted: '#94a3b8' },
  { bg: '#1a1a2e', bgGradient: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 60%, #0f3460 100%)', accent: '#a78bfa', text: '#ffffff', textMuted: '#c4b5fd' },
  { bg: '#0f172a', bgGradient: 'linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #334155 100%)', accent: '#34d399', text: '#f1f5f9', textMuted: '#94a3b8' },
  { bg: '#2d1b2e', bgGradient: 'linear-gradient(135deg, #2d1b2e 0%, #4c1d3d 60%, #1a1a2e 100%)', accent: '#f472b6', text: '#ffffff', textMuted: '#e9d5ff' },
  { bg: '#0c2b23', bgGradient: 'linear-gradient(135deg, #0c2b23 0%, #114b3f 60%, #1a936f 100%)', accent: '#fbbf24', text: '#ffffff', textMuted: '#d1fae5' },
  { bg: '#111827', bgGradient: 'linear-gradient(135deg, #111827 0%, #1f2937 60%, #374151 100%)', accent: '#fb923c', text: '#f9fafb', textMuted: '#d1d5db' },
];

const FONT_PAIRINGS = [
  { title: "'Helvetica Neue', Helvetica, Arial, sans-serif", body: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
  { title: "Georgia, 'Times New Roman', serif", body: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
];

const SHAPES = [
  { radius: 8, shadow: '0 8px 24px rgba(0,0,0,0.25)' },
  { radius: 20, shadow: '0 12px 32px rgba(0,0,0,0.35)' },
  { radius: 2, shadow: 'none' },
];

const TITLE_WEIGHTS = [300, 600, 800];

export const generateStyle = (seedInput) => {
  const rng = createSeededRng(`${seedInput}-style`);
  return {
    palette: pick(rng, PALETTES),
    fonts: pick(rng, FONT_PAIRINGS),
    shape: pick(rng, SHAPES),
    titleWeight: pick(rng, TITLE_WEIGHTS),
    accentStyle: pick(rng, ['solid', 'gradient']),
  };
};
