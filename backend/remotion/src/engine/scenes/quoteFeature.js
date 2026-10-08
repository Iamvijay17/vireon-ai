import { fitTextToBox } from '../textFit';
import { CANVAS, orientationOf } from './shared';
import { buildBlockStack } from './stackLayout';

export const id = 'quote-feature';

const QUOTE_LINE_HEIGHT = 1.3;
const LABEL_FONT = 22;
const QUOTE_BOX_HEIGHT = { landscape: 420, square: 500, portrait: 760 };

/**
 * A single large centered pull-quote, for content that's one substantial
 * paragraph with no title/items - the shape `title-only` used to fall back
 * to (silently dropping the body text, since title-only never reads
 * `profile.body`). Optional attribution line below via `profile.subtitle`;
 * the quote and attribution are stacked as one centered group.
 */
export const build = (profile, _rng, ctx) => {
  const quoteText = profile.body || profile.title || '';
  if (!quoteText) return [];

  const canvas = ctx?.canvas || CANVAS;
  const orientation = orientationOf(canvas);
  const quoteWidth = canvas.width * (orientation === 'landscape' ? 0.62 : 0.84);
  const quoteX = (canvas.width - quoteWidth) / 2;

  const { slots, diagnostics } = buildBlockStack(ctx, id, (scale) => {
    const { fontSize, lines } = fitTextToBox(`“${quoteText}”`, {
      boxWidth: quoteWidth, boxHeight: QUOTE_BOX_HEIGHT[orientation] * scale, maxFontSize: Math.round(58 * scale), minFontSize: 32, lineHeight: QUOTE_LINE_HEIGHT,
    });
    const quoteHeight = Math.min(lines * fontSize * QUOTE_LINE_HEIGHT, QUOTE_BOX_HEIGHT[orientation]);
    const blocks = [{
      id: 'title', kind: 'point', fontSize, height: quoteHeight,
      slot: {
        id: 'title', role: 'title', text: `“${quoteText}”`,
        xPct: quoteX / canvas.width, yPct: 0,
        wPct: quoteWidth / canvas.width, hPct: quoteHeight / canvas.height,
        fontSize, textAlign: 'center',
      },
    }];
    if (profile.subtitle) {
      const labelHeight = Math.ceil(LABEL_FONT * 1.5);
      blocks.push({
        id: 'label', kind: 'point', fontSize: LABEL_FONT, height: labelHeight,
        slot: {
          id: 'label', role: 'label', text: `— ${profile.subtitle}`,
          xPct: quoteX / canvas.width, yPct: 0,
          wPct: quoteWidth / canvas.width, hPct: labelHeight / canvas.height, fontSize: LABEL_FONT, textAlign: 'center',
        },
      });
    }
    return { blocks };
  });
  return { slots, diagnostics };
};
