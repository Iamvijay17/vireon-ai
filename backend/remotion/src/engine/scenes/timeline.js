import { fitTextToBox } from '../textFit';
import { CANVAS, PAD, titleSlot, contentTopAfterTitle } from './shared';

export const id = 'timeline';

export const build = (profile) => {
  const boxWidth = CANVAS.width - PAD.x * 2 - 70;
  const slots = [];
  const title = titleSlot(profile.title, CANVAS.width - PAD.x * 2, PAD.top / CANVAS.height);
  if (title) slots.push(title);

  const listTop = contentTopAfterTitle(title, PAD.top);
  const rowHeight = Math.min(140, (CANVAS.height - listTop - PAD.bottom) / Math.max(profile.itemCount, 1));
  profile.items.forEach((item, index) => {
    const { fontSize } = fitTextToBox(item.text || '', { boxWidth, boxHeight: rowHeight - 24, maxFontSize: 28, minFontSize: 18 });
    slots.push({
      id: `item-${index}`, role: 'listItem', text: item.text || '', heading: item.heading || '',
      xPct: (PAD.x + 70) / CANVAS.width, yPct: (listTop + index * rowHeight) / CANVAS.height,
      wPct: boxWidth / CANVAS.width, hPct: (rowHeight - 24) / CANVAS.height,
      fontSize, textAlign: 'left', numbered: true, index,
    });
  });
  return slots;
};
