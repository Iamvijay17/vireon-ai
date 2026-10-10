// A YAML mistake in a route's @swagger block does not just drop that route: swagger-jsdoc reports it
// and the spec for the WHOLE API loses entries. Pin that every publishing route is documented.
const spec = require('../../src/config/swagger');

const EXPECTED = [
  '/api/publishing/capabilities',
  '/api/publishing/accounts',
  '/api/publishing/accounts/youtube/connect',
  '/api/publishing/oauth/google/callback',
  '/api/publishing/accounts/{id}',
  '/api/publishing/courses/{courseId}/lessons',
  '/api/publishing/jobs',
  '/api/publishing/history',
  '/api/publishing/jobs/{id}',
  '/api/publishing/jobs/{id}/submit',
  '/api/publishing/jobs/{id}/retry',
  '/api/publishing/jobs/{id}/cancel',
  '/api/publishing/jobs/{id}/download',
  '/api/publishing/courses/{courseId}/udemy',
  '/api/publishing/courses/{courseId}/udemy/export',
];

describe('OpenAPI spec', () => {
  it('documents every publishing route', () => {
    expect(Object.keys(spec.paths).filter((p) => p.includes('/publishing/')).sort()).toEqual([...EXPECTED].sort());
  });

  it('states that submitting needs explicit confirmation', () => {
    expect(spec.paths['/api/publishing/jobs/{id}/submit'].post.summary).toMatch(/confirm/);
  });

  it('still documents the pre-existing API (nothing was lost)', () => {
    expect(Object.keys(spec.paths)).toEqual(expect.arrayContaining(['/api/courses', '/api/videos']));
  });
});
