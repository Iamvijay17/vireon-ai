import { fitTextToBox } from '../textFit';
import { pick } from '../seedRandom';
import { CANVAS, titleSlot } from './shared';

export const id = 'podcast-split';

export const build = (profile, rng) => {
  const imageLeft = pick(rng, [true, false]);
  const halfWidth = CANVAS.width / 2;
  const textPad = 90;
  const textBoxWidth = halfWidth - textPad * 2;
  const textX = imageLeft ? halfWidth + textPad : textPad;
  const slots = [{
    id: 'image', role: 'image',
    xPct: (imageLeft ? 0 : halfWidth) / CANVAS.width, yPct: 0,
    wPct: halfWidth / CANVAS.width, hPct: 1,
    nameplateText: profile.hostName || '',
  }];

  const title = titleSlot(profile.title, textBoxWidth, 0.38, 50);
  if (title) slots.push({ ...title, xPct: textX / CANVAS.width, wPct: textBoxWidth / CANVAS.width });

  if (profile.subtitle) {
    const { fontSize } = fitTextToBox(profile.subtitle, { boxWidth: textBoxWidth, boxHeight: 140, maxFontSize: 26, minFontSize: 18 });
    slots.push({
      id: 'subtitle', role: 'body', text: profile.subtitle,
      xPct: textX / CANVAS.width, yPct: 0.56,
      wPct: textBoxWidth / CANVAS.width, hPct: 0.14, fontSize, textAlign: 'left',
    });
  }

  return { slots, waveform: { xPct: textX / CANVAS.width, yPct: 0.74, wPct: 0.16 } };
};
