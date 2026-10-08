import { CANVAS, padFor, safeRegion, titleSlot } from './shared';
import { buildBlockStack } from './stackLayout';
import { designScale } from '../verticalLayout';

export const id = 'image-fullbleed';

const LABEL_FONT = 22;

/**
 * Full-frame image with the kicker + headline stacked at the bottom, leaving the
 * lower band clear for the spoken captions. The pair is bottom-aligned, so a
 * longer headline grows upward instead of running into the captions.
 */
export const build = (profile, _rng, ctx) => {
  const canvas = ctx?.canvas || CANVAS;
  const pad = padFor(canvas);
  const boxWidth = canvas.width - pad.x * 2;
  const captionBand = Math.max(pad.bottom, Math.round(150 * designScale(canvas)));

  const { slots, diagnostics } = buildBlockStack(ctx, id, (scale) => {
    const blocks = [];
    if (profile.subtitle) {
      const height = Math.ceil(LABEL_FONT * 1.5);
      blocks.push({
        id: 'label', kind: 'point', fontSize: LABEL_FONT, height,
        slot: {
          id: 'label', role: 'label', text: profile.subtitle,
          xPct: pad.x / canvas.width, yPct: 0,
          wPct: boxWidth / canvas.width, hPct: height / canvas.height, fontSize: LABEL_FONT, textAlign: 'left',
        },
      });
    }
    const title = titleSlot(profile.title, boxWidth, 0, Math.round(64 * scale), canvas);
    if (title) blocks.push({ id: 'title', kind: 'title', slot: title, fontSize: title.fontSize, height: title.hPct * canvas.height });
    return { blocks };
  }, { region: safeRegion(canvas, pad.top, captionBand) });

  return { slots: [{ id: 'image', role: 'image', xPct: 0, yPct: 0, wPct: 1, hPct: 1 }, ...slots], diagnostics };
};
