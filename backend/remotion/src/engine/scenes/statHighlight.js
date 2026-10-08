import { estimateTextWidth, fitTextToBox } from '../textFit';
import { CANVAS, orientationOf } from './shared';
import { buildBlockStack } from './stackLayout';
import { measureTextBlock } from '../verticalLayout';

export const id = 'stat-highlight';

// Matches a leading numeric figure like "87%", "$4.2M", "10x" - the signal
// chooseStrategy uses to route a single short item here instead of the
// generic stack-list/timeline fallback.
export const STAT_PATTERN = /^[$]?\d[\d,.]*\s*[%xX]?/;

const STAT_MAX_FONT = 160;
const STAT_MIN_FONT = 64;
const LABEL_FONT = 24;

/** One oversized number/stat + short label beneath, centered as one group. */
export const build = (profile, _rng, ctx) => {
  const item = profile.items[0];
  if (!item) return [];

  const itemText = (item.text || '').trim();
  const statMatch = itemText.match(STAT_PATTERN);
  const statText = statMatch ? statMatch[0].trim() : (item.heading || itemText);
  const labelText = statMatch ? itemText.slice(statMatch[0].length).trim() : (item.heading ? itemText : '');

  const canvas = ctx?.canvas || CANVAS;
  const boxWidth = canvas.width * (orientationOf(canvas) === 'landscape' ? 0.7 : 0.86);
  const boxX = (canvas.width - boxWidth) / 2;
  const base = { xPct: boxX / canvas.width, yPct: 0, wPct: boxWidth / canvas.width, textAlign: 'center' };

  // The stat is a single oversized line: shrink it to the column rather than letting it wrap.
  const widthFit = Math.floor(boxWidth / Math.max(estimateTextWidth(statText, 1), 0.01));

  const { slots, diagnostics } = buildBlockStack(ctx, id, (scale) => {
    const blocks = [];
    if (profile.title) {
      const height = Math.ceil(LABEL_FONT * 1.5);
      blocks.push({
        id: 'label', kind: 'point', fontSize: LABEL_FONT, height,
        slot: { ...base, id: 'label', role: 'label', text: profile.title, hPct: height / canvas.height, fontSize: LABEL_FONT },
      });
    }

    const statFont = Math.max(STAT_MIN_FONT, Math.min(Math.round(STAT_MAX_FONT * scale), widthFit));
    const statHeight = Math.ceil(statFont * 1.2);
    blocks.push({
      id: 'title', kind: 'point', fontSize: statFont, height: statHeight,
      slot: { ...base, id: 'title', role: 'title', text: statText, hPct: statHeight / canvas.height, fontSize: statFont },
    });

    if (labelText) {
      const { fontSize } = fitTextToBox(labelText, { boxWidth, boxHeight: 120, maxFontSize: Math.round(32 * scale), minFontSize: 20 });
      const { height } = measureTextBlock(labelText, { fontSize, width: boxWidth, lineHeight: 1.5 });
      blocks.push({
        id: 'body', kind: 'point', fontSize, height: height + Math.ceil(fontSize * 0.15),
        slot: { ...base, id: 'body', role: 'body', text: labelText, hPct: (height + Math.ceil(fontSize * 0.15)) / canvas.height, fontSize },
      });
    }
    return { blocks };
  });
  return { slots, diagnostics };
};
