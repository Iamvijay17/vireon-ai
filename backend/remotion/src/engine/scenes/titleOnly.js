import { CANVAS, padFor, titleSlot } from './shared';
import { buildBlockStack } from './stackLayout';

export const id = 'title-only';

export const build = (profile, _rng, ctx) => {
  const canvas = ctx?.canvas || CANVAS;
  const boxWidth = canvas.width - padFor(canvas).x * 2;
  const { slots, diagnostics } = buildBlockStack(ctx, id, (scale) => {
    const slot = titleSlot(profile.title, boxWidth, 0, Math.round(76 * scale), canvas);
    return { blocks: slot ? [{ id: 'title', kind: 'title', slot, height: slot.hPct * canvas.height, fontSize: slot.fontSize }] : [] };
  });
  return { slots, diagnostics };
};
