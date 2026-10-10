/**
 * What Vireon can and cannot do with Udemy - stated plainly so the UI, the API
 * and the docs all say the same true thing.
 *
 * Verification (2026-10-10): the Udemy Instructor API reference is at
 * https://www.udemy.com/developers/instructor/. It is a REST API authenticated
 * with an API client (bearer token) created in the instructor's own account.
 * Its documented resources are read-oriented: the instructor's taught courses
 * and their details, reviews, Q&A threads, performance metrics, and a revenue
 * report. No endpoint for creating a course, building a curriculum, uploading
 * lecture video, or publishing was found in the documented surface. (The
 * documentation host refused automated fetches from the build environment, so
 * the list was cross-checked against search results and a third-party OpenAPI
 * listing of the same six GET operations - re-verify at the link above before
 * relying on a change.)
 *
 * Therefore: NO direct publishing is implemented, NO Udemy credentials are
 * asked for or stored, and no Udemy endpoints are called. The supported path
 * is a course package the instructor uploads through Udemy's own interface.
 * If Udemy ever documents write endpoints AND an instructor account is
 * approved for them, adding a provider here is the extension point - until
 * then `directPublishing` stays false.
 */

const DOCS_URL = 'https://www.udemy.com/developers/instructor/';
const INSTRUCTOR_URL = 'https://www.udemy.com/instructor/';
const HELP_URL = 'https://support.udemy.com/';

const UDEMY_CAPABILITIES = Object.freeze({
  directPublishing: false,
  mode: 'export',
  reviewedOn: '2026-10-10',
  summary:
    'Udemy has no public API for creating a course, uploading lesson videos or publishing. Vireon builds a course package (manifest, organised videos, captions, validation report and a checklist) that you upload yourself in Udemy\'s instructor interface. Exporting a package does not create or publish anything on Udemy.',
  officialApi: Object.freeze({
    name: 'Udemy Instructor API',
    docsUrl: DOCS_URL,
    documentedCapabilities: Object.freeze([
      'List the courses you teach and read their details',
      'Read course reviews',
      'Read course Q&A threads',
      'Read course performance metrics',
      'Read the revenue report',
    ]),
    notDocumented: Object.freeze([
      'Create a course',
      'Create sections or lectures',
      'Upload lecture video or resources',
      'Submit a course for review / publish it',
    ]),
  }),
  links: Object.freeze({ docs: DOCS_URL, instructor: INSTRUCTOR_URL, help: HELP_URL }),
  requiresCredentials: false,
});

module.exports = { UDEMY_CAPABILITIES, DOCS_URL, INSTRUCTOR_URL, HELP_URL };
