jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn(), success: jest.fn(), render: jest.fn(),
}));
jest.mock('../../src/services/common/ActivityLogService', () => ({ add: jest.fn().mockResolvedValue() }));
jest.mock('../../src/services/common/JobEventService', () => ({ append: jest.fn().mockResolvedValue({}) }));
jest.mock('../../src/services/qc/LayoutQcService', () => ({ run: jest.fn() }));

const config = require('../../src/config');
const ActivityLogService = require('../../src/services/common/ActivityLogService');
const JobEventService = require('../../src/services/common/JobEventService');
const MockedService = require('../../src/services/qc/LayoutQcService');
const { runLayoutQc, describe: describeIssues } = require('../../src/services/qc/runLayoutQc');

// The real class, for the pure parts (the module above is mocked for runLayoutQc).
const LayoutQcService = jest.requireActual('../../src/services/qc/LayoutQcService');

const original = { ...config.qc };
afterAll(() => Object.assign(config.qc, original));

describe('LayoutQcService.parseOutput', () => {
  const report = (scene, issues = []) => `VIREON_QC ${JSON.stringify({ scene, issues })}`;

  it('reads one report per scene out of a noisy render log', () => {
    const log = [
      'Rendered 0/4',
      `chrome INFO:CONSOLE:25203] "${report(1)}", source: http://localhost:3000/bundle.js (25203)`,
      'Fetching Roboto font {"style":"normal"} handle was cleared after 110ms',
      `Tab 2, console.log() "${report(2, [{ type: 'clipped', severity: 'error', message: 'cut off' }])}"`,
    ].join('\n');

    const reports = LayoutQcService.parseOutput(log);
    expect([...reports.keys()]).toEqual([1, 2]);
    expect(reports.get(2).issues[0].type).toBe('clipped');
  });

  it('keeps the first copy when Remotion echoes a browser log twice', () => {
    const log = `${report(1, [{ type: 'a', severity: 'warn', message: 'first' }])}\n${report(1, [{ type: 'b', severity: 'warn', message: 'second' }])}`;
    expect(LayoutQcService.parseOutput(log).get(1).issues[0].type).toBe('a');
  });

  it('skips a truncated line without failing', () => {
    const log = `VIREON_QC {"scene":1,"issues":[{"type":"clip\n${report(2)}`;
    expect([...LayoutQcService.parseOutput(log).keys()]).toEqual([2]);
  });

  it('returns nothing for output with no QC lines', () => {
    expect(LayoutQcService.parseOutput('').size).toBe(0);
    expect(LayoutQcService.parseOutput(undefined).size).toBe(0);
    expect(LayoutQcService.parseOutput('Rendered 4/4').size).toBe(0);
  });
});

describe('LayoutQcService.summarize', () => {
  it('flattens per-scene reports, worst first within each scene, with totals', () => {
    const reports = new Map([
      [1, { scene: 1, issues: [{ type: 'small-text', severity: 'warn', message: 'w' }, { type: 'clipped', severity: 'error', message: 'e' }] }],
      [2, { scene: 2, issues: [] }],
    ]);
    const summary = LayoutQcService.summarize({ expectedScenes: [1, 2], reports });

    expect(summary).toMatchObject({ scenesChecked: 2, errors: 1, warnings: 1 });
    expect(summary.issues.map((i) => [i.scene, i.type])).toEqual([[1, 'clipped'], [1, 'small-text']]);
  });

  it('notes a scene that never reported, and one the measurer could not handle', () => {
    const reports = new Map([[1, { scene: 1, issues: [], error: 'boom' }]]);
    const summary = LayoutQcService.summarize({ expectedScenes: [1, 2], reports });
    expect(summary.issues.map((i) => i.type)).toEqual(['qc-error', 'qc-no-result']);
    expect(summary.errors).toBe(0); // a QC problem is a warning, never an error about the video
  });

  it('includes image problems found before the render', () => {
    const summary = LayoutQcService.summarize({
      expectedScenes: [1],
      reports: new Map([[1, { scene: 1, issues: [] }]]),
      imageIssues: [{ scene: 1, type: 'image-failed', severity: 'error', message: 'the image returned HTTP 404' }],
    });
    expect(summary.errors).toBe(1);
  });
});

describe('LayoutQcService.probeImage', () => {
  const lookup = async () => [{ address: '93.184.216.34' }];
  const response = (status, type, destroy = jest.fn()) => ({ status, headers: { 'content-type': type }, data: { destroy } });

  it('accepts a reachable image and does not download it', async () => {
    const destroy = jest.fn();
    const http = { get: jest.fn().mockResolvedValue(response(200, 'image/png', destroy)) };
    expect(await LayoutQcService.probeImage('https://cdn.example.com/a.png', { http, lookup })).toBeNull();
    expect(destroy).toHaveBeenCalled();
  });

  it('reports HTTP errors and non-images', async () => {
    expect(await LayoutQcService.probeImage('https://cdn.example.com/a.png', { http: { get: async () => response(404, 'text/html') }, lookup })).toBe('returned HTTP 404');
    expect(await LayoutQcService.probeImage('https://cdn.example.com/a.png', { http: { get: async () => response(200, 'text/html') }, lookup })).toMatch(/is not an image/);
  });

  it('reports a network failure without throwing', async () => {
    const http = { get: jest.fn().mockRejectedValue(Object.assign(new Error('x'), { code: 'ECONNREFUSED' })) };
    expect(await LayoutQcService.probeImage('https://cdn.example.com/a.png', { http, lookup })).toMatch(/ECONNREFUSED/);
  });

  it('applies the same private-address guard the render does, without making a request', async () => {
    const http = { get: jest.fn() };
    expect(await LayoutQcService.probeImage('http://169.254.169.254/latest', { http })).toMatch(/not allowed/);
    expect(http.get).not.toHaveBeenCalled();
  });

  it('skips data URIs and relative paths', async () => {
    const http = { get: jest.fn() };
    expect(await LayoutQcService.probeImage('data:image/png;base64,AAAA', { http })).toBeNull();
    expect(await LayoutQcService.probeImage('/public/job/a.png', { http, lookup })).toBeNull();
    expect(http.get).not.toHaveBeenCalled();
  });
});

describe('LayoutQcService.buildProps', () => {
  const lookup = async () => [{ address: '93.184.216.34' }];
  const scene = (n, over = {}) => ({ sceneNumber: n, imageUrl: '', elements: { title: 'T' }, ...over });

  it('blanks a bad image in the copy only, and reports a URL once however many fields use it', async () => {
    const assets = { resolution: '1920x1080', scenes: [scene(1, { imageUrl: 'https://cdn.example.com/dead.png', elements: { image: 'https://cdn.example.com/dead.png' } })] };
    const http = { get: async () => ({ status: 404, headers: {}, data: { destroy() {} } }) };
    const before = JSON.stringify(assets);

    const { props, imageIssues } = await LayoutQcService.buildProps({ jobId: 'job-1', assets, http, lookup });

    expect(imageIssues).toHaveLength(1);
    expect(imageIssues[0]).toMatchObject({ scene: 1, type: 'image-failed', severity: 'error' });
    expect(props.assets.scenes[0].imageUrl).toBe('');
    expect(props.assets.scenes[0].elements.image).toBe('');
    expect(JSON.stringify(assets)).toBe(before); // the caller's assets are untouched
  });

  it('keeps good images and probes each distinct URL once', async () => {
    const assets = { scenes: [scene(1, { elements: { image: 'https://cdn.example.com/a.png' } }), scene(2, { elements: { image: 'https://cdn.example.com/a.png' } })] };
    const http = { get: jest.fn().mockResolvedValue({ status: 200, headers: { 'content-type': 'image/png' }, data: { destroy() {} } }) };
    const { props, imageIssues } = await LayoutQcService.buildProps({ jobId: 'job-1', assets, http, lookup });

    expect(imageIssues).toEqual([]);
    expect(props.assets.scenes.map((s) => s.elements.image)).toEqual(['https://cdn.example.com/a.png', 'https://cdn.example.com/a.png']);
    expect(http.get).toHaveBeenCalledTimes(1);
  });

  it('stringifies the job id for the composition', async () => {
    const { props } = await LayoutQcService.buildProps({ jobId: 42, assets: { scenes: [] } });
    expect(props.jobId).toBe('42');
  });
});

describe('runLayoutQc', () => {
  const assets = { scenes: [{ sceneNumber: 1 }] };
  const result = (over = {}) => ({ scenesChecked: 1, errors: 0, warnings: 0, durationMs: 5000, issues: [], ...over });
  const issue = (over = {}) => ({ scene: 1, type: 'clipped', severity: 'error', message: 'title is cut off', ...over });

  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(config.qc, original, { enabled: true, failOnError: false });
    MockedService.run.mockResolvedValue(result());
  });

  it('does nothing unless QC_ENABLED', async () => {
    config.qc.enabled = false;
    expect(await runLayoutQc({ id: 'job-1', assets })).toBeNull();
    expect(MockedService.run).not.toHaveBeenCalled();
  });

  it('logs a pass to the activity log and records the event', async () => {
    await runLayoutQc({ id: 'job-1', assets });
    expect(ActivityLogService.add).toHaveBeenCalledWith('job-1', expect.stringContaining('Layout check passed'));
    expect(JobEventService.append).toHaveBeenCalledWith('job-1', 'layoutQc', expect.objectContaining({ errors: 0, scenesChecked: 1 }));
  });

  it('reports problems but still lets the render go ahead by default', async () => {
    MockedService.run.mockResolvedValue(result({ errors: 1, issues: [issue()] }));
    const out = await runLayoutQc({ id: 'job-1', assets });

    expect(out.errors).toBe(1);
    expect(ActivityLogService.add).toHaveBeenCalledWith('job-1', expect.stringMatching(/1 error\(s\).*scene 1: title is cut off/));
  });

  it('refuses to continue on errors when QC_FAIL_ON_ERROR is set, but never on warnings alone', async () => {
    config.qc.failOnError = true;
    MockedService.run.mockResolvedValue(result({ warnings: 1, issues: [issue({ severity: 'warn', type: 'small-text' })] }));
    await expect(runLayoutQc({ id: 'job-1', assets })).resolves.toMatchObject({ warnings: 1 });

    MockedService.run.mockResolvedValue(result({ errors: 1, issues: [issue()] }));
    await expect(runLayoutQc({ id: 'job-1', assets })).rejects.toThrow(/Layout check failed with 1 error/);
  });

  it('never blocks a render because the check itself broke', async () => {
    config.qc.failOnError = true;
    MockedService.run.mockRejectedValue(new Error('Layout check render failed: no chrome'));
    expect(await runLayoutQc({ id: 'job-1', assets })).toBeNull();
    expect(ActivityLogService.add).toHaveBeenCalledWith('job-1', expect.stringContaining('Layout check skipped'));
  });

  it('lets a cancellation through', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    MockedService.run.mockRejectedValue(abort);
    await expect(runLayoutQc({ id: 'job-1', assets })).rejects.toBe(abort);
  });

  it('survives the event log being unavailable', async () => {
    JobEventService.append.mockRejectedValue(new Error('mongo down'));
    await expect(runLayoutQc({ id: 'job-1', assets })).resolves.toMatchObject({ scenesChecked: 1 });
  });
});

describe('describe', () => {
  it('lists the worst few and counts the rest', () => {
    const issues = Array.from({ length: 8 }, (_, i) => ({ scene: i + 1, message: `problem ${i + 1}` }));
    const text = describeIssues(issues, 3);
    expect(text).toBe('scene 1: problem 1; scene 2: problem 2; scene 3: problem 3; ...and 5 more');
  });
});
