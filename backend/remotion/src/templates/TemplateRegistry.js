import { lazy } from 'react';

/**
 * Template Registry
 *
 * Maps template IDs to their corresponding React components. Every id uses
 * a numbered "NNN-<sceneType>" naming scheme (e.g. "001-title",
 * "002-content") so multiple visual variants can exist per scene type
 * without ever colliding with each other. Most scene types currently have
 * just one variant (001-*); "content" has 3 (001-content..003-content) -
 * see SceneTypeCategories in TemplateCategories.js for which ids belong to
 * which scene type.
 *
 * Adding a new template requires only:
 * 1. Create the template folder (e.g. "005-content") with index.jsx
 * 2. Import and register it here
 * 3. Add it to the right sceneType's array in TemplateCategories.js
 *
 * No switch statements or if-else chains needed for template resolution.
 */

// Lazy load templates for better performance
// Each template is loaded only when needed
const Title001 = lazy(() => import('./001-title'));
const Title002 = lazy(() => import('./002-title'));
const Title003 = lazy(() => import('./003-title'));
const Title004 = lazy(() => import('./004-title'));
const Title005 = lazy(() => import('./005-title'));
const Title006 = lazy(() => import('./006-title'));
const Title007 = lazy(() => import('./007-title'));
const Title008 = lazy(() => import('./008-title'));
const Title009 = lazy(() => import('./009-title'));
const Title010 = lazy(() => import('./010-title'));
const Content001 = lazy(() => import('./001-content'));
const Content002 = lazy(() => import('./002-content'));
const Content003 = lazy(() => import('./003-content'));
const Content004 = lazy(() => import('./004-content'));
const Content005 = lazy(() => import('./005-content'));
const Content006 = lazy(() => import('./006-content'));
const Content007 = lazy(() => import('./007-content'));
const Content008 = lazy(() => import('./008-content'));
const Content009 = lazy(() => import('./009-content'));
const Content010 = lazy(() => import('./010-content'));
const Content011 = lazy(() => import('./011-content'));
const Content012 = lazy(() => import('./012-content'));
const Content013 = lazy(() => import('./013-content'));
const Content014 = lazy(() => import('./014-content'));
const Content015 = lazy(() => import('./015-content'));
const ContentWithImage001 = lazy(() => import('./001-contentwithimage'));
const ContentWithImage002 = lazy(() => import('./002-contentwithimage'));
const ContentWithImage003 = lazy(() => import('./003-contentwithimage'));
const ContentWithImage004 = lazy(() => import('./004-contentwithimage'));
const ContentWithImage005 = lazy(() => import('./005-contentwithimage'));
const ContentWithImage006 = lazy(() => import('./006-contentwithimage'));
const ContentWithImage007 = lazy(() => import('./007-contentwithimage'));
const ContentWithImage008 = lazy(() => import('./008-contentwithimage'));
const ContentWithImage009 = lazy(() => import('./009-contentwithimage'));
const Image001 = lazy(() => import('./001-image'));
const Image002 = lazy(() => import('./002-image'));
const Image003 = lazy(() => import('./003-image'));
const Image004 = lazy(() => import('./004-image'));
const Image005 = lazy(() => import('./005-image'));
const Image006 = lazy(() => import('./006-image'));
const Image007 = lazy(() => import('./007-image'));
const Image008 = lazy(() => import('./008-image'));
const Image009 = lazy(() => import('./009-image'));
const Image010 = lazy(() => import('./010-image'));
const Podcast001 = lazy(() => import('./001-podcast'));
const Podcast002 = lazy(() => import('./002-podcast'));

/**
 * Template registry object.
 * Key: templateId (string, "NNN-<sceneType>").
 * Value: React component
 */
const TemplateRegistry = {
  '001-title': Title001,
  '002-title': Title002,
  '003-title': Title003,
  '004-title': Title004,
  '005-title': Title005,
  '006-title': Title006,
  '007-title': Title007,
  '008-title': Title008,
  '009-title': Title009,
  '010-title': Title010,
  '001-content': Content001,
  '002-content': Content002,
  '003-content': Content003,
  '004-content': Content004,
  '005-content': Content005,
  '006-content': Content006,
  '007-content': Content007,
  '008-content': Content008,
  '009-content': Content009,
  '010-content': Content010,
  '011-content': Content011,
  '012-content': Content012,
  '013-content': Content013,
  '014-content': Content014,
  '015-content': Content015,
  '001-contentwithimage': ContentWithImage001,
  '002-contentwithimage': ContentWithImage002,
  '003-contentwithimage': ContentWithImage003,
  '004-contentwithimage': ContentWithImage004,
  '005-contentwithimage': ContentWithImage005,
  '006-contentwithimage': ContentWithImage006,
  '007-contentwithimage': ContentWithImage007,
  '008-contentwithimage': ContentWithImage008,
  '009-contentwithimage': ContentWithImage009,
  '001-image': Image001,
  '002-image': Image002,
  '003-image': Image003,
  '004-image': Image004,
  '005-image': Image005,
  '006-image': Image006,
  '007-image': Image007,
  '008-image': Image008,
  '009-image': Image009,
  '010-image': Image010,
  '001-podcast': Podcast001,
  '002-podcast': Podcast002,
};

export default TemplateRegistry;
