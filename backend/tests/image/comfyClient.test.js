const ComfyUIClient = require('../../src/services/image/ComfyUIClient');

const makeClient = (http, extra = {}) => new ComfyUIClient({ baseUrl: 'http://comfy:8188/', http, pollIntervalMs: 1, ...extra });
const httpError = (data, message = 'Request failed with status code 400') => Object.assign(new Error(message), { response: { data } });

describe('ComfyUIClient.queue', () => {
  it('posts the workflow and returns the prompt id', async () => {
    const http = { post: jest.fn().mockResolvedValue({ data: { prompt_id: 'abc' } }) };
    const id = await makeClient(http).queue({ 3: {} }, 'client-1');
    expect(id).toBe('abc');
    expect(http.post).toHaveBeenCalledWith('http://comfy:8188/prompt', { prompt: { 3: {} }, client_id: 'client-1' }, expect.any(Object));
  });

  it('says which node ComfyUI objected to, not just "400"', async () => {
    const http = {
      post: jest.fn().mockRejectedValue(httpError({
        error: { message: 'Prompt outputs failed validation' },
        node_errors: { 4: { class_type: 'CheckpointLoaderSimple', errors: [{ message: 'Value not in list', details: 'ckpt_name: nope.safetensors' }] } },
      })),
    };
    await expect(makeClient(http).queue({}, 'c')).rejects.toThrow(/node 4 \(CheckpointLoaderSimple\): Value not in list - ckpt_name: nope\.safetensors/);
  });

  it('rejects a response without a prompt id', async () => {
    const http = { post: jest.fn().mockResolvedValue({ data: {} }) };
    await expect(makeClient(http).queue({}, 'c')).rejects.toThrow(/prompt_id/);
  });
});

describe('ComfyUIClient.waitForResult', () => {
  const done = { abc: { status: { status_str: 'success', completed: true }, outputs: { 9: { images: [{ filename: 'o.png', subfolder: '', type: 'output' }] } } } };

  it('polls until the history entry appears', async () => {
    const http = { get: jest.fn().mockResolvedValueOnce({ data: {} }).mockResolvedValueOnce({ data: {} }).mockResolvedValue({ data: done }) };
    const entry = await makeClient(http).waitForResult('abc', { timeoutMs: 5000 });
    expect(http.get).toHaveBeenCalledTimes(3);
    expect(entry.outputs[9].images[0].filename).toBe('o.png');
  });

  it('surfaces ComfyUI\'s own execution error', async () => {
    const http = {
      get: jest.fn().mockResolvedValue({
        data: { abc: { status: { status_str: 'error', messages: [['execution_error', { exception_message: 'CUDA out of memory\n' }]] } } },
      }),
    };
    await expect(makeClient(http).waitForResult('abc', { timeoutMs: 5000 })).rejects.toThrow(/failed to generate the image: CUDA out of memory$/);
  });

  it('times out and interrupts the job so the GPU is not left busy', async () => {
    const http = { get: jest.fn().mockResolvedValue({ data: {} }), post: jest.fn().mockResolvedValue({}) };
    await expect(makeClient(http).waitForResult('abc', { timeoutMs: 20 })).rejects.toThrow(/timed out/);
    expect(http.post).toHaveBeenCalledWith('http://comfy:8188/interrupt', {}, expect.any(Object));
  });

  it('aborts on signal, interrupting the running job', async () => {
    const http = { get: jest.fn().mockResolvedValue({ data: {} }), post: jest.fn().mockResolvedValue({}) };
    const controller = new AbortController();
    controller.abort();
    await expect(makeClient(http).waitForResult('abc', { timeoutMs: 5000, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(http.post).toHaveBeenCalledWith('http://comfy:8188/interrupt', {}, expect.any(Object));
  });
});

describe('ComfyUIClient.download / free', () => {
  it('fetches the image bytes through /view', async () => {
    const http = { get: jest.fn().mockResolvedValue({ data: Uint8Array.from([1, 2, 3]).buffer }) };
    const buf = await makeClient(http).download({ filename: 'o.png', subfolder: 'sub', type: 'output' });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect([...buf]).toEqual([1, 2, 3]);
    expect(http.get).toHaveBeenCalledWith('http://comfy:8188/view', expect.objectContaining({ params: { filename: 'o.png', subfolder: 'sub', type: 'output' }, responseType: 'arraybuffer' }));
  });

  it('asks ComfyUI to unload its models', async () => {
    const http = { post: jest.fn().mockResolvedValue({}) };
    await makeClient(http).free();
    expect(http.post).toHaveBeenCalledWith('http://comfy:8188/free', { unload_models: true, free_memory: true }, expect.any(Object));
  });
});

describe('ComfyUIClient against a fake ComfyUI server (real HTTP)', () => {
  const http = require('http');
  let server;
  let baseUrl;
  let polls;
  const seen = [];

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
        const url = new URL(req.url, 'http://x');
        seen.push({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), body });

        const json = (code, data) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
        if (req.method === 'POST' && url.pathname === '/prompt') {
          if (body.prompt.bad) return json(400, { error: { message: 'bad graph' }, node_errors: {} });
          return json(200, { prompt_id: 'p-1' });
        }
        if (url.pathname === '/history/p-1') {
          polls += 1;
          return json(200, polls < 3 ? {} : {
            'p-1': { status: { status_str: 'success', completed: true }, outputs: { 9: { images: [{ filename: 'vireon_00001_.png', subfolder: '', type: 'output' }] } } },
          });
        }
        if (url.pathname === '/view') { res.writeHead(200, { 'Content-Type': 'image/png' }); return res.end(Buffer.from([0x89, 0x50, 0x4e, 0x47])); }
        if (url.pathname === '/interrupt' || url.pathname === '/free') return json(200, {});
        return json(404, {});
      });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(() => new Promise((resolve) => server.close(resolve)));
  beforeEach(() => { polls = 0; seen.length = 0; });

  it('runs the whole queue -> wait -> download round trip', async () => {
    const client = new ComfyUIClient({ baseUrl, pollIntervalMs: 5 });
    const id = await client.queue({ 3: { class_type: 'KSampler' } }, 'client-9');
    const entry = await client.waitForResult(id, { timeoutMs: 5000 });
    const png = await client.download(entry.outputs[9].images[0]);

    expect(id).toBe('p-1');
    expect([...png]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(seen[0]).toMatchObject({ method: 'POST', path: '/prompt', body: { client_id: 'client-9', prompt: { 3: { class_type: 'KSampler' } } } });
    expect(seen.find((r) => r.path === '/view').query).toEqual({ filename: 'vireon_00001_.png', subfolder: '', type: 'output' });
    expect(polls).toBe(3);
  });

  it('turns a 400 into a readable error', async () => {
    const client = new ComfyUIClient({ baseUrl });
    await expect(client.queue({ bad: true }, 'c')).rejects.toThrow(/ComfyUI rejected the workflow: bad graph/);
  });

  it('frees models over HTTP', async () => {
    await new ComfyUIClient({ baseUrl }).free();
    expect(seen[0]).toMatchObject({ method: 'POST', path: '/free', body: { unload_models: true, free_memory: true } });
  });
});
