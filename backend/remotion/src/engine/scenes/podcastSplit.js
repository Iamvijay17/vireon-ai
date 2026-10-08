import { fitTextToBox } from '../textFit';
import { pick } from '../seedRandom';
import { CANVAS, titleSlot } from './shared';
import { buildBlockStack } from './stackLayout';
import { measureTextBlock } from '../verticalLayout';
import { splitFrame } from './splitImage';

export const id = 'podcast-split';

// Waveform.jsx renders a fixed 40px bar row.
const WAVEFORM_HEIGHT = 40;

export const build = (profile, rng, ctx) => {
  const imageLeft = pick(rng, [true, false]);
  const canvas = ctx?.canvas || CANVAS;
  const frame = splitFrame(canvas, imageLeft);

  const { slots, placed, diagnostics } = buildBlockStack(ctx, id, (scale) => {
    const blocks = [];
    const title = titleSlot(profile.title, frame.textWidth, 0, Math.round(50 * scale), canvas);
    if (title) {
      blocks.push({
        id: 'title', kind: 'title', fontSize: title.fontSize, height: title.hPct * canvas.height, gapScale: 1.25,
        slot: { ...title, xPct: frame.textX / canvas.width, wPct: frame.textWidth / canvas.width },
      });
    }
    if (profile.subtitle) {
      const { fontSize } = fitTextToBox(profile.subtitle, { boxWidth: frame.textWidth, boxHeight: 140, maxFontSize: Math.round(26 * scale), minFontSize: 18 });
      const { height } = measureTextBlock(profile.subtitle, { fontSize, width: frame.textWidth, lineHeight: 1.5 });
      const total = height + Math.ceil(fontSize * 0.15);
      blocks.push({
        id: 'subtitle', kind: 'point', fontSize, height: total, gapScale: 1.5,
        slot: {
          id: 'subtitle', role: 'body', text: profile.subtitle,
          xPct: frame.textX / canvas.width, yPct: 0,
          wPct: frame.textWidth / canvas.width, hPct: total / canvas.height, fontSize, textAlign: 'left',
        },
      });
    }
    blocks.push({ id: 'waveform', kind: 'point', height: WAVEFORM_HEIGHT });
    return { blocks };
  }, { region: frame.region });

  const image = { id: 'image', role: 'image', ...frame.image, nameplateText: profile.hostName || '' };
  const waveform = { xPct: frame.textX / canvas.width, yPct: placed.waveform / canvas.height, wPct: 0.16 * (canvas.width > canvas.height ? 1 : 1.6) };
  return { slots: [image, ...slots], waveform, diagnostics };
};
