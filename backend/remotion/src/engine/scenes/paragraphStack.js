import { fitTextToBox } from '../textFit';
import { CANVAS, PAD, titleSlot, contentTopAfterTitle } from './shared';

export const id = 'paragraph-stack';

export const build = (profile) => {
  const boxWidth = CANVAS.width - PAD.x * 2;
  const slots = [];
  const title = titleSlot(profile.title, boxWidth, PAD.top / CANVAS.height);
  if (title) slots.push(title);

  const stackTop = contentTopAfterTitle(title, PAD.top);
  const available = CANVAS.height - stackTop - PAD.bottom;
  const rowHeight = available / Math.max(profile.itemCount, 1);
  profile.items.forEach((item, index) => {
    const { fontSize } = fitTextToBox(item.text || '', { boxWidth, boxHeight: rowHeight - 28, maxFontSize: 34, minFontSize: 22 });
    slots.push({
      id: `item-${index}`, role: 'body', text: item.text || '',
      xPct: PAD.x / CANVAS.width, yPct: (stackTop + index * rowHeight) / CANVAS.height,
      wPct: boxWidth / CANVAS.width, hPct: (rowHeight - 28) / CANVAS.height,
      fontSize, textAlign: 'left',
    });
  });
  return slots;
};
