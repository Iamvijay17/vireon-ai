jest.mock('../../src/services/common/LoggerService', () => ({
  error: jest.fn(), info: jest.fn(), warn: jest.fn(), success: jest.fn(),
}));
jest.mock('../../src/config', () => ({ isDev: false, nodeEnv: 'test' }));

const errorHandler = require('../../src/middleware/errorHandler');
const LoggerService = require('../../src/services/common/LoggerService');
const {
  NotFoundError, ValidationError, ConflictError, SchemaValidationError,
} = require('../../src/utils/errors');

const runHandler = (err) => {
  const res = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  errorHandler(err, { method: 'GET', originalUrl: '/api/videos' }, res, jest.fn());
  return res;
};

describe('errorHandler', () => {
  it.each([
    [new NotFoundError('Job not found'), 404, 'Job not found'],
    [new ValidationError('Duration must be one of: 30, 60'), 400, 'Duration must be one of: 30, 60'],
    [new ConflictError('Video is in Rendering state, not Failed'), 409, 'Video is in Rendering state, not Failed'],
  ])('maps a typed error to its own status', (err, status, message) => {
    const res = runHandler(err);
    expect(res.statusCode).toBe(status);
    expect(res.body).toEqual({ error: message });
  });

  it('does not log a typed error as unhandled', () => {
    // A NotFoundError is an expected outcome, not a defect - logging it with
    // a stack trace is what made real failures hard to spot.
    runHandler(new NotFoundError('Job not found'));
    expect(LoggerService.error).not.toHaveBeenCalled();
  });

  it('keeps per-field details on a schema failure', () => {
    const details = [{ field: 'title', message: 'Required' }];
    const res = runHandler(new SchemaValidationError(details));
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Validation failed', details });
  });

  it('does not let the generic AppError branch swallow those details', () => {
    // SchemaValidationError IS an AppError, so branch order matters here.
    const res = runHandler(new SchemaValidationError([{ field: 'a', message: 'b' }]));
    expect(res.body.details).toBeDefined();
  });

  it('formats a Mongoose validation error per field', () => {
    const err = new Error('validation failed');
    err.name = 'ValidationError';
    err.errors = { title: { path: 'title', message: 'Path `title` is required.' } };

    const res = runHandler(err);
    expect(res.statusCode).toBe(400);
    expect(res.body.details).toEqual([{ field: 'title', message: 'Path `title` is required.' }]);
  });

  it('reports a duplicate key as a conflict naming the field', () => {
    const err = new Error('E11000');
    err.code = 11000;
    err.keyValue = { key: 'scene-1.wav' };

    const res = runHandler(err);
    expect(res.statusCode).toBe(409);
    expect(res.body.details).toEqual([{ field: 'key', message: 'key already exists' }]);
  });

  it('reports a bad ObjectId as a 400, not a 500', () => {
    const err = new Error('Cast to ObjectId failed');
    err.name = 'CastError';
    expect(runHandler(err).statusCode).toBe(400);
  });

  it.each([
    [{ code: 'LIMIT_FILE_SIZE' }, 'File too large'],
    [{ code: 'LIMIT_UNEXPECTED_FILE' }, 'Unexpected file field'],
  ])('maps a multer error to a 400', (props, message) => {
    const res = runHandler(Object.assign(new Error('multer'), props));
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe(message);
  });

  it('logs an unrecognised error and returns 500', () => {
    const res = runHandler(new Error('something nobody anticipated'));
    expect(res.statusCode).toBe(500);
    expect(LoggerService.error).toHaveBeenCalledWith('Unhandled error', expect.objectContaining({
      message: 'something nobody anticipated',
      url: '/api/videos',
    }));
  });

  it('withholds the stack outside development', () => {
    const res = runHandler(new Error('boom'));
    expect(res.body.stack).toBeUndefined();
  });
});
