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
const Template026 = lazy(() => import('./template-026'));
const Template027 = lazy(() => import('./template-027'));
const Template028 = lazy(() => import('./template-028'));
const Template029 = lazy(() => import('./template-029'));
const Template030 = lazy(() => import('./template-030'));
const Template031 = lazy(() => import('./template-031'));
const Template032 = lazy(() => import('./template-032'));
const Template033 = lazy(() => import('./template-033'));
const Template034 = lazy(() => import('./template-034'));
const Template035 = lazy(() => import('./template-035'));
const Template036 = lazy(() => import('./template-036'));
const Template037 = lazy(() => import('./template-037'));
const Template038 = lazy(() => import('./template-038'));
const Template039 = lazy(() => import('./template-039'));
const Template040 = lazy(() => import('./template-040'));
const Template041 = lazy(() => import('./template-041'));
const Template042 = lazy(() => import('./template-042'));
const Template043 = lazy(() => import('./template-043'));
const Template044 = lazy(() => import('./template-044'));
const Template045 = lazy(() => import('./template-045'));

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
  'template-026': Template026,
  'template-027': Template027,
  'template-028': Template028,
  'template-029': Template029,
  'template-030': Template030,
  'template-031': Template031,
  'template-032': Template032,
  'template-033': Template033,
  'template-034': Template034,
  'template-035': Template035,
  'template-036': Template036,
  'template-037': Template037,
  'template-038': Template038,
  'template-039': Template039,
  'template-040': Template040,
  'template-041': Template041,
  'template-042': Template042,
  'template-043': Template043,
  'template-044': Template044,
  'template-045': Template045,
};

export default TemplateRegistry;
