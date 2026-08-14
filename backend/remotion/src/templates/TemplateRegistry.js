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
const Content001 = lazy(() => import('./001-content'));
const Content002 = lazy(() => import('./002-content'));
const Content003 = lazy(() => import('./003-content'));
const Content004 = lazy(() => import('./004-content'));
const Content005 = lazy(() => import('./005-content'));
const ContentWithImage001 = lazy(() => import('./001-contentwithimage'));
const ContentWithImage002 = lazy(() => import('./002-contentwithimage'));
const Image001 = lazy(() => import('./001-image'));
const Image002 = lazy(() => import('./002-image'));
const Image003 = lazy(() => import('./003-image'));
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
  '001-content': Content001,
  '002-content': Content002,
  '003-content': Content003,
  '004-content': Content004,
  '005-content': Content005,
  '001-contentwithimage': ContentWithImage001,
  '002-contentwithimage': ContentWithImage002,
  '001-image': Image001,
  '002-image': Image002,
  '003-image': Image003,
  '001-podcast': Podcast001,
  '002-podcast': Podcast002,
};

export default TemplateRegistry;
