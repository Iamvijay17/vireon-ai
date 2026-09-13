import { fitTextToBox } from '../textFit';
import { CANVAS } from './shared';

export const id = 'stat-highlight';

// Matches a leading numeric figure like "87%", "$4.2M", "10x" - the signal
// chooseStrategy uses to route a single short item here instead of the
// generic stack-list/timeline fallback.
export const STAT_PATTERN = /^[$]?\d[\d,.]*\s*[%xX]?/;

/** One oversized number/stat + short label beneath, centered. */
export const build = (profile) => {
  const item = profile.items[0];
  if (!item) return [];

  const itemText = (item.text || '').trim();
  const statMatch = itemText.match(STAT_PATTERN);
  const statText = statMatch ? statMatch[0].trim() : (item.heading || itemText);
  const labelText = statMatch ? itemText.slice(statMatch[0].length).trim() : (item.heading ? itemText : '');

  const boxWidth = CANVAS.width * 0.7;
  const boxX = (CANVAS.width - boxWidth) / 2;
  const slots = [];

  if (profile.title) {
    slots.push({
      id: 'label', role: 'label', text: profile.title,
      xPct: boxX / CANVAS.width, yPct: 0.28,
      wPct: boxWidth / CANVAS.width, hPct: 0.06, fontSize: 24, textAlign: 'center',
    });
  }

  slots.push({
    id: 'title', role: 'title', text: statText,
    xPct: boxX / CANVAS.width, yPct: 0.38,
    wPct: boxWidth / CANVAS.width, hPct: 0.28, fontSize: 160, textAlign: 'center',
  });

  if (labelText) {
    const { fontSize } = fitTextToBox(labelText, { boxWidth, boxHeight: 120, maxFontSize: 32, minFontSize: 20 });
    slots.push({
      id: 'body', role: 'body', text: labelText,
      xPct: boxX / CANVAS.width, yPct: 0.68,
      wPct: boxWidth / CANVAS.width, hPct: 0.12, fontSize, textAlign: 'center',
    });
  }
  return slots;
};
