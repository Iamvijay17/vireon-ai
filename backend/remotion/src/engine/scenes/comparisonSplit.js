import { fitTextToBox } from '../textFit';
import { CANVAS, PAD, titleSlot, contentTopAfterTitle } from './shared';

export const id = 'comparison-split';

/**
 * Two-column side-by-side comparison for exactly 2 non-paragraph items -
 * each column rendered as a `card` slot (the same chrome buildGrid already
 * uses) so the two sides read as visually distinct without needing a new
 * divider-line rendering primitive.
 */
export const build = (profile) => {
  const boxWidth = CANVAS.width - PAD.x * 2;
  const slots = [];
  const title = titleSlot(profile.title, boxWidth, PAD.top / CANVAS.height, 56);
  if (title) slots.push(title);

  const top = contentTopAfterTitle(title, PAD.top);
  const gap = 48;
  const colWidth = (boxWidth - gap) / 2;
  const colHeight = CANVAS.height - top - PAD.bottom;

  profile.items.forEach((item, index) => {
    const colX = PAD.x + index * (colWidth + gap);
    const { fontSize } = fitTextToBox(item.text || '', { boxWidth: colWidth - 56, boxHeight: colHeight - 100, maxFontSize: 28, minFontSize: 18 });
    slots.push({
      id: `item-${index}`, role: 'listItem', text: item.text || '',
      heading: item.heading || (index === 0 ? 'A' : 'B'),
      xPct: colX / CANVAS.width, yPct: top / CANVAS.height,
      wPct: colWidth / CANVAS.width, hPct: colHeight / CANVAS.height,
      fontSize, textAlign: 'left', card: true,
    });
  });
  return slots;
};
