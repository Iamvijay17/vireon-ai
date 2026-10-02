import { CANVAS, PAD, titleSlot } from './shared';

export const id = 'title-only';

export const build = (profile) => {
  const boxWidth = CANVAS.width - PAD.x * 2;
  const slot = titleSlot(profile.title, boxWidth, 0.42, 76);
  return slot ? [slot] : [];
};
