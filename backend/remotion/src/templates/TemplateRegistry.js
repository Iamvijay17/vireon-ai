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
const Template046 = lazy(() => import('./template-046'));
const Template047 = lazy(() => import('./template-047'));
const Template048 = lazy(() => import('./template-048'));
const Template049 = lazy(() => import('./template-049'));
const Template050 = lazy(() => import('./template-050'));
const Template051 = lazy(() => import('./template-051'));
const Template052 = lazy(() => import('./template-052'));
const Template053 = lazy(() => import('./template-053'));
const Template054 = lazy(() => import('./template-054'));
const Template055 = lazy(() => import('./template-055'));
const Template056 = lazy(() => import('./template-056'));
const Template057 = lazy(() => import('./template-057'));
const Template058 = lazy(() => import('./template-058'));
const Template059 = lazy(() => import('./template-059'));
const Template060 = lazy(() => import('./template-060'));
const Template061 = lazy(() => import('./template-061'));

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
  'template-046': Template046,
  'template-047': Template047,
  'template-048': Template048,
  'template-049': Template049,
  'template-050': Template050,
  'template-051': Template051,
  'template-052': Template052,
  'template-053': Template053,
  'template-054': Template054,
  'template-055': Template055,
  'template-056': Template056,
  'template-057': Template057,
  'template-058': Template058,
  'template-059': Template059,
  'template-060': Template060,
  'template-061': Template061,
};

export default TemplateRegistry;
