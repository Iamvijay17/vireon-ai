import { fitTextToBox } from '../textFit';
import { pick } from '../seedRandom';
import { CANVAS, orientationOf, padFor, safeRegion, titleSlot } from './shared';
import { buildBlockStack } from './stackLayout';
import { designScale, measureTextBlock } from '../verticalLayout';

export const id = 'split-image';

/**
 * Image on one half, text on the other - as a left/right split on landscape and
 * as image-on-top / text-below on portrait and square, where half the width
 * would leave a ~450px text column. The text column is a content-aware stack.
 */
export const splitFrame = (canvas, imageLeft) => {
  const pad = padFor(canvas);
  if (orientationOf(canvas) === 'landscape') {
    const halfWidth = canvas.width / 2;
    const textPad = 90;
    return {
      image: { xPct: (imageLeft ? 0 : halfWidth) / canvas.width, yPct: 0, wPct: halfWidth / canvas.width, hPct: 1 },
      textX: imageLeft ? halfWidth + textPad : textPad,
      textWidth: halfWidth - textPad * 2,
      region: safeRegion(canvas),
    };
  }
  const imageHeight = Math.round(canvas.height * 0.4);
  return {
    image: { xPct: 0, yPct: 0, wPct: 1, hPct: imageHeight / canvas.height },
    textX: pad.x,
    textWidth: canvas.width - pad.x * 2,
    region: safeRegion(canvas, imageHeight + Math.round(56 * designScale(canvas))),
  };
};

export const build = (profile, rng, ctx) => {
  const imageLeft = pick(rng, [true, false]);
  const canvas = ctx?.canvas || CANVAS;
  const frame = splitFrame(canvas, imageLeft);
  const bodyText = profile.body || profile.items[0]?.text || '';

  const { slots, diagnostics } = buildBlockStack(ctx, id, (scale) => {
    const blocks = [];
    const title = titleSlot(profile.title, frame.textWidth, 0, Math.round(54 * scale), canvas);
    if (title) {
      blocks.push({
        id: 'title', kind: 'title', fontSize: title.fontSize, height: title.hPct * canvas.height, gapScale: 1.25,
        slot: { ...title, xPct: frame.textX / canvas.width, wPct: frame.textWidth / canvas.width },
      });
    }
    if (bodyText) {
      const { fontSize } = fitTextToBox(bodyText, { boxWidth: frame.textWidth, boxHeight: 320, maxFontSize: Math.round(30 * scale), minFontSize: 20 });
      const { height } = measureTextBlock(bodyText, { fontSize, width: frame.textWidth, lineHeight: 1.5 });
      const total = height + Math.ceil(fontSize * 0.15);
      blocks.push({
        id: 'body', kind: 'point', fontSize, height: total,
        slot: {
          id: 'body', role: 'body', text: bodyText,
          xPct: frame.textX / canvas.width, yPct: 0,
          wPct: frame.textWidth / canvas.width, hPct: total / canvas.height,
          fontSize, textAlign: 'left',
        },
      });
    }
    return { blocks };
  }, { region: frame.region });

  return { slots: [{ id: 'image', role: 'image', ...frame.image }, ...slots], diagnostics };
};
