import { fitTextToBox } from '../textFit';
import { CANVAS, PAD, titleSlot, contentTopAfterTitle } from './shared';

export const id = 'stack-list';

export const build = (profile) => {
  const boxWidth = CANVAS.width - PAD.x * 2;
  const rowWidth = boxWidth * 0.88;
  const slots = [];
  const title = titleSlot(profile.title, boxWidth, PAD.top / CANVAS.height);
  if (title) slots.push(title);

  const listTop = contentTopAfterTitle(title, PAD.top);
  const rowHeight = Math.min(110, (CANVAS.height - listTop - PAD.bottom) / Math.max(profile.itemCount, 1));
  profile.items.forEach((item, index) => {
    const { fontSize } = fitTextToBox(item.text || '', { boxWidth: rowWidth, boxHeight: rowHeight - 16, maxFontSize: 32, minFontSize: 20 });
    slots.push({
      id: `item-${index}`, role: 'listItem', text: item.text || '', heading: item.heading || '',
      xPct: PAD.x / CANVAS.width, yPct: (listTop + index * rowHeight) / CANVAS.height,
      wPct: rowWidth / CANVAS.width, hPct: (rowHeight - 16) / CANVAS.height,
      fontSize, textAlign: 'left', bullet: true,
    });
  });
  return slots;
};
