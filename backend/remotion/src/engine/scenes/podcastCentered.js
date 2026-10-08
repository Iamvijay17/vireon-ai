import { fitTextToBox } from '../textFit';
import { CANVAS, orientationOf, titleSlot } from './shared';
import { buildBlockStack } from './stackLayout';
import { measureTextBlock } from '../verticalLayout';

export const id = 'podcast-centered';

const AVATAR_SIZE = 220;
const NAME_FONT = 22;
// Waveform.jsx renders a fixed 40px bar row.
const WAVEFORM_HEIGHT = 40;

/** Avatar, host name, title, subtitle and waveform as one centered stack. */
export const build = (profile, _rng, ctx) => {
  const canvas = ctx?.canvas || CANVAS;
  const centerWidth = canvas.width * (orientationOf(canvas) === 'landscape' ? 0.7 : 0.86);
  const centerX = (canvas.width - centerWidth) / 2;
  const centered = { xPct: centerX / canvas.width, yPct: 0, wPct: centerWidth / canvas.width, textAlign: 'center' };

  const { slots, placed, diagnostics } = buildBlockStack(ctx, id, (scale) => {
    const blocks = [];
    if (profile.imageSrc) {
      blocks.push({
        id: 'image', kind: 'point', height: AVATAR_SIZE, gapScale: 1.4,
        slot: {
          id: 'image', role: 'image', circle: true,
          xPct: 0.5 - AVATAR_SIZE / canvas.width / 2, yPct: 0,
          wPct: AVATAR_SIZE / canvas.width, hPct: AVATAR_SIZE / canvas.height,
        },
      });
    }
    if (profile.hostName) {
      const height = Math.ceil(NAME_FONT * 1.5);
      blocks.push({
        id: 'label', kind: 'point', fontSize: NAME_FONT, height,
        slot: { ...centered, id: 'label', role: 'label', text: profile.hostName, hPct: height / canvas.height, fontSize: NAME_FONT },
      });
    }
    const title = titleSlot(profile.title, centerWidth, 0, Math.round(56 * scale), canvas);
    if (title) {
      blocks.push({
        id: 'title', kind: 'title', fontSize: title.fontSize, height: title.hPct * canvas.height,
        slot: { ...title, xPct: centered.xPct, wPct: centered.wPct, textAlign: 'center' },
      });
    }
    if (profile.subtitle) {
      const { fontSize } = fitTextToBox(profile.subtitle, { boxWidth: centerWidth, boxHeight: 100, maxFontSize: Math.round(26 * scale), minFontSize: 18 });
      const { height } = measureTextBlock(profile.subtitle, { fontSize, width: centerWidth, lineHeight: 1.5 });
      const total = height + Math.ceil(fontSize * 0.15);
      blocks.push({
        id: 'subtitle', kind: 'point', fontSize, height: total, gapScale: 1.5,
        slot: { ...centered, id: 'subtitle', role: 'body', text: profile.subtitle, hPct: total / canvas.height, fontSize },
      });
    }
    blocks.push({ id: 'waveform', kind: 'point', height: WAVEFORM_HEIGHT });
    return { blocks };
  });

  const waveWidthPct = 0.16 * (canvas.width > canvas.height ? 1 : 1.6);
  const waveform = { xPct: 0.5 - waveWidthPct / 2, yPct: placed.waveform / canvas.height, wPct: waveWidthPct };
  return { slots, waveform, diagnostics };
};
