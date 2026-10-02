import { fitTextToBox } from '../textFit';
import { CANVAS } from './shared';

export const id = 'quote-feature';

/**
 * A single large centered pull-quote, for content that's one substantial
 * paragraph with no title/items - the shape `title-only` used to fall back
 * to (silently dropping the body text, since title-only never reads
 * `profile.body`). Optional attribution line below via `profile.subtitle`.
 */
export const build = (profile) => {
  const quoteText = profile.body || profile.title || '';
  if (!quoteText) return [];

  const quoteWidth = CANVAS.width * 0.62;
  const quoteX = (CANVAS.width - quoteWidth) / 2;
  const { fontSize, lines } = fitTextToBox(`“${quoteText}”`, {
    boxWidth: quoteWidth, boxHeight: 420, maxFontSize: 58, minFontSize: 32, lineHeight: 1.3,
  });
  const quoteHeight = Math.min(lines * fontSize * 1.3, 420);
  const quoteY = 0.5 - quoteHeight / CANVAS.height / 2 - 0.03;

  const slots = [{
    id: 'title', role: 'title', text: `“${quoteText}”`,
    xPct: quoteX / CANVAS.width, yPct: quoteY,
    wPct: quoteWidth / CANVAS.width, hPct: quoteHeight / CANVAS.height,
    fontSize, textAlign: 'center',
  }];

  if (profile.subtitle) {
    slots.push({
      id: 'label', role: 'label', text: `— ${profile.subtitle}`,
      xPct: quoteX / CANVAS.width, yPct: quoteY + quoteHeight / CANVAS.height + 0.04,
      wPct: quoteWidth / CANVAS.width, hPct: 0.05, fontSize: 22, textAlign: 'center',
    });
  }
  return slots;
};
