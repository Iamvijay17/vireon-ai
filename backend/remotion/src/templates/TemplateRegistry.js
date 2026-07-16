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
const Template006 = lazy(() => import('./template-006'));
const Template007 = lazy(() => import('./template-007'));
const Template008 = lazy(() => import('./template-008'));
const Template009 = lazy(() => import('./template-009'));
const Template010 = lazy(() => import('./template-010'));
const Template011 = lazy(() => import('./template-011'));
const Template012 = lazy(() => import('./template-012'));
const Template013 = lazy(() => import('./template-013'));
const Template014 = lazy(() => import('./template-014'));
const Template015 = lazy(() => import('./template-015'));
const Template016 = lazy(() => import('./template-016'));
const Template017 = lazy(() => import('./template-017'));
const Template018 = lazy(() => import('./template-018'));
const Template019 = lazy(() => import('./template-019'));
const Template020 = lazy(() => import('./template-020'));
const Template021 = lazy(() => import('./template-021'));
const Template022 = lazy(() => import('./template-022'));
const Template023 = lazy(() => import('./template-023'));
const Template024 = lazy(() => import('./template-024'));
const Template025 = lazy(() => import('./template-025'));

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
  'template-006': Template006,
  'template-007': Template007,
  'template-008': Template008,
  'template-009': Template009,
  'template-010': Template010,
  'template-011': Template011,
  'template-012': Template012,
  'template-013': Template013,
  'template-014': Template014,
  'template-015': Template015,
  'template-016': Template016,
  'template-017': Template017,
  'template-018': Template018,
  'template-019': Template019,
  'template-020': Template020,
  'template-021': Template021,
  'template-022': Template022,
  'template-023': Template023,
  'template-024': Template024,
  'template-025': Template025,
};

export default TemplateRegistry;
