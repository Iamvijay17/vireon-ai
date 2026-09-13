import { fitTextToBox } from '../textFit';
import { CANVAS, PAD, titleSlot, contentTopAfterTitle } from './shared';

export const id = 'grid';

export const build = (profile) => {
  const boxWidth = CANVAS.width - PAD.x * 2;
  const slots = [];
  const title = titleSlot(profile.title, boxWidth, PAD.top / CANVAS.height, 56);
  if (title) slots.push(title);

  const cols = 2;
  const gap = 32;
  const gridTop = contentTopAfterTitle(title, PAD.top);
  const gridHeight = CANVAS.height - gridTop - PAD.bottom;
  const rows = Math.ceil(profile.itemCount / cols);
  const cardWidth = (boxWidth - gap * (cols - 1)) / cols;
  const cardHeight = Math.min(190, (gridHeight - gap * Math.max(rows - 1, 0)) / Math.max(rows, 1));

  profile.items.forEach((item, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const { fontSize } = fitTextToBox(item.text || '', { boxWidth: cardWidth - 56, boxHeight: cardHeight - 70, maxFontSize: 26, minFontSize: 17 });
    slots.push({
      id: `item-${index}`, role: 'listItem', text: item.text || '', heading: item.heading || '',
      xPct: (PAD.x + col * (cardWidth + gap)) / CANVAS.width,
      yPct: (gridTop + row * (cardHeight + gap)) / CANVAS.height,
      wPct: cardWidth / CANVAS.width, hPct: cardHeight / CANVAS.height,
      fontSize, textAlign: 'left', card: true,
    });
  });
  return slots;
};
