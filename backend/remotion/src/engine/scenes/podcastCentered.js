import { fitTextToBox } from '../textFit';
import { CANVAS, titleSlot } from './shared';

export const id = 'podcast-centered';

export const build = (profile) => {
  const avatarSize = 220;
  const avatarWPct = avatarSize / CANVAS.width;
  const avatarHPct = avatarSize / CANVAS.height;
  const centerWidth = CANVAS.width * 0.7;
  const centerX = (CANVAS.width - centerWidth) / 2;
  const slots = [];

  if (profile.imageSrc) {
    slots.push({
      id: 'image', role: 'image', circle: true,
      xPct: 0.5 - avatarWPct / 2, yPct: 0.13,
      wPct: avatarWPct, hPct: avatarHPct,
    });
  }

  if (profile.hostName) {
    slots.push({
      id: 'label', role: 'label', text: profile.hostName,
      xPct: centerX / CANVAS.width, yPct: 0.40,
      wPct: centerWidth / CANVAS.width, hPct: 0.05, fontSize: 22, textAlign: 'center',
    });
  }

  const title = titleSlot(profile.title, centerWidth, 0.46, 56);
  if (title) slots.push({ ...title, xPct: centerX / CANVAS.width, wPct: centerWidth / CANVAS.width, textAlign: 'center' });

  if (profile.subtitle) {
    const { fontSize } = fitTextToBox(profile.subtitle, { boxWidth: centerWidth, boxHeight: 100, maxFontSize: 26, minFontSize: 18 });
    slots.push({
      id: 'subtitle', role: 'body', text: profile.subtitle,
      xPct: centerX / CANVAS.width, yPct: 0.62,
      wPct: centerWidth / CANVAS.width, hPct: 0.1, fontSize, textAlign: 'center',
    });
  }

  return { slots, waveform: { xPct: 0.5 - 0.08, yPct: 0.76, wPct: 0.16 } };
};
