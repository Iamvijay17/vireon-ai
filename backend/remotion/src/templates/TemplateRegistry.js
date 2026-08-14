import { lazy } from 'react';

/**
 * Template Registry
 *
 * Maps template IDs to their corresponding React components. There are
 * exactly 5 templates - one per scene type - so the templateId and
 * sceneType values are the same 5 strings throughout the pipeline.
 *
 * Adding a new template requires only:
 * 1. Create the template folder with index.jsx
 * 2. Import and register it here
 *
 * No switch statements or if-else chains needed for template resolution.
 */

// Lazy load templates for better performance
// Each template is loaded only when needed
const Title = lazy(() => import('./title'));
const Content = lazy(() => import('./content'));
const ContentWithImage = lazy(() => import('./contentwithimage'));
const ImageTemplate = lazy(() => import('./image'));
const Podcast = lazy(() => import('./podcast'));

/**
 * Template registry object.
 * Key: templateId (string) - one of the 5 scene types.
 * Value: React component
 */
const TemplateRegistry = {
  title: Title,
  content: Content,
  contentwithimage: ContentWithImage,
  image: ImageTemplate,
  podcast: Podcast,
};

export default TemplateRegistry;
