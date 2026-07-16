import { lazy } from 'react';

/**
 * Template Registry
 *
 * Maps template IDs to their corresponding React components.
 * Adding a new template requires only:
 * 1. Create the template folder with index.jsx
 * 2. Import and register it here
 *
 * No switch statements or if-else chains needed for template resolution.
 */

// Lazy load templates for better performance
// Each template is loaded only when needed
const Template001 = lazy(() => import('./template-001'));
const Template002 = lazy(() => import('./template-002'));
const Template003 = lazy(() => import('./template-003'));
const Template004 = lazy(() => import('./template-004'));
const Template005 = lazy(() => import('./template-005'));

/**
 * Template registry object.
 * Key: templateId (string)
 * Value: React component
 */
const TemplateRegistry = {
  'template-001': Template001,
  'template-002': Template002,
  'template-003': Template003,
  'template-004': Template004,
  'template-005': Template005,
};

export default TemplateRegistry;
