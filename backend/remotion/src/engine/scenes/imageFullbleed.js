import { fitTextToBox } from '../textFit';
import { CANVAS, PAD } from './shared';

export const id = 'image-fullbleed';

export const build = (profile) => {
  const boxWidth = CANVAS.width - PAD.x * 2;
  const slots = [{ id: 'image', role: 'image', xPct: 0, yPct: 0, wPct: 1, hPct: 1 }];

  if (profile.subtitle) {
    slots.push({
      id: 'label', role: 'label', text: profile.subtitle,
      xPct: PAD.x / CANVAS.width, yPct: 0.72,
      wPct: boxWidth / CANVAS.width, hPct: 0.05, fontSize: 22, textAlign: 'left',
    });
  }
  if (profile.title) {
    const { fontSize } = fitTextToBox(profile.title, { boxWidth, boxHeight: 220, maxFontSize: 64, minFontSize: 36 });
    slots.push({
      id: 'title', role: 'title', text: profile.title,
      xPct: PAD.x / CANVAS.width, yPct: 0.79,
      wPct: boxWidth / CANVAS.width, hPct: 0.19, fontSize, textAlign: 'left',
    });
  }
  return slots;
};
