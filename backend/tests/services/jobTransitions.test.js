const { JOB_STATUS } = require('../../src/constants');
const { assertTransitionAllowed } = require('../../src/constants/jobTransitions');

const attempt = (status) => () => assertTransitionAllowed({ status }, 'rerender', (s) => `cannot re-render from ${s}`);

describe('rerender transition', () => {
  test.each([JOB_STATUS.COMPLETED, JOB_STATUS.FAILED])('%s can be re-rendered', (status) => {
    expect(attempt(status)).not.toThrow();
  });

  // Saving edits to a finished job leaves it at SCRIPT_COMPLETED; the Studio's Re-render
  // button is offered there, so the API has to accept it.
  test('a finished job whose scenes were just saved (SCRIPT_COMPLETED) can be re-rendered', () => {
    expect(attempt(JOB_STATUS.SCRIPT_COMPLETED)).not.toThrow();
  });

  test.each([
    JOB_STATUS.QUEUED,
    JOB_STATUS.AWAITING_APPROVAL,
    JOB_STATUS.GENERATING_AUDIO,
    JOB_STATUS.GENERATING_IMAGES,
    JOB_STATUS.RENDERING,
    JOB_STATUS.CANCELLED,
  ])('%s cannot be re-rendered', (status) => {
    expect(attempt(status)).toThrow(`cannot re-render from ${status}`);
  });
});
