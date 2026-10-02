import * as titleOnly from './titleOnly';
import * as stackList from './stackList';
import * as grid from './grid';
import * as timeline from './timeline';
import * as paragraphStack from './paragraphStack';
import * as splitImage from './splitImage';
import * as imageFullbleed from './imageFullbleed';
import * as podcastSplit from './podcastSplit';
import * as podcastCentered from './podcastCentered';
import * as quoteFeature from './quoteFeature';
import * as statHighlight from './statHighlight';
import * as comparisonSplit from './comparisonSplit';

/**
 * The 12 Scene Components of the Vireon Motion Design System. Each module
 * exports `{ id, build(profile, rng) }`, returning either a plain slot
 * array or `{ slots, waveform }` (the two podcast components, which also
 * place the decorative waveform primitive). Moved out of what was
 * previously one 349-line solveLayout.js so each composition strategy is
 * its own named, browsable file; `chooseStrategy` (still in
 * solveLayout.js) is the routing policy that picks one per ContentProfile.
 */
export const SCENE_REGISTRY = {
  [titleOnly.id]: titleOnly,
  [stackList.id]: stackList,
  [grid.id]: grid,
  [timeline.id]: timeline,
  [paragraphStack.id]: paragraphStack,
  [splitImage.id]: splitImage,
  [imageFullbleed.id]: imageFullbleed,
  [podcastSplit.id]: podcastSplit,
  [podcastCentered.id]: podcastCentered,
  [quoteFeature.id]: quoteFeature,
  [statHighlight.id]: statHighlight,
  [comparisonSplit.id]: comparisonSplit,
};

export const SCENE_IDS = Object.keys(SCENE_REGISTRY);

// Re-exported so solveLayout.js's chooseStrategy can route to stat-highlight
// without statHighlight.js becoming a second import site for the pattern.
export { STAT_PATTERN } from './statHighlight';
