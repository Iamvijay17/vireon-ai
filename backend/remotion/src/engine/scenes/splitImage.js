import { fitTextToBox } from '../textFit';
import { pick } from '../seedRandom';
import { CANVAS, titleSlot } from './shared';

export const id = 'split-image';

export const build = (profile, rng) => {
  const imageLeft = pick(rng, [true, false]);
  const halfWidth = CANVAS.width / 2;
  const textPad = 90;
  const textBoxWidth = halfWidth - textPad * 2;
  const textX = imageLeft ? halfWidth + textPad : textPad;
  const slots = [];

  slots.push({
    id: 'image', role: 'image',
    xPct: (imageLeft ? 0 : halfWidth) / CANVAS.width, yPct: 0,
    wPct: halfWidth / CANVAS.width, hPct: 1,
  });

  const title = titleSlot(profile.title, textBoxWidth, 0.36, 54);
  if (title) slots.push({ ...title, xPct: textX / CANVAS.width, yPct: 0.36, wPct: textBoxWidth / CANVAS.width });

  const bodyText = profile.body || profile.items[0]?.text || '';
  if (bodyText) {
    const { fontSize } = fitTextToBox(bodyText, { boxWidth: textBoxWidth, boxHeight: 320, maxFontSize: 30, minFontSize: 20 });
    slots.push({
      id: 'body', role: 'body', text: bodyText,
      xPct: textX / CANVAS.width, yPct: 0.54,
      wPct: textBoxWidth / CANVAS.width, hPct: 0.32,
      fontSize, textAlign: 'left',
    });
  }
  return slots;
};
