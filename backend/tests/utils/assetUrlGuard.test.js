const { checkImageUrl, buildAllowedHosts, isBlockedAddress } = require('../../src/utils/assetUrlGuard');

// A resolver that never touches the network: maps hostnames to fixed addresses.
const resolver = (table) => async (hostname) => {
  if (!(hostname in table)) {
    const err = new Error(`getaddrinfo ENOTFOUND ${hostname}`);
    err.code = 'ENOTFOUND';
    throw err;
  }
  return table[hostname].map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
};

describe('isBlockedAddress', () => {
  it.each([
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.7', '169.254.169.254',
    '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255', '::1', '::', 'fe80::1', 'fd12:3456::1',
    '::ffff:127.0.0.1', '::ffff:10.0.0.5', 'not-an-ip',
  ])('blocks %s', (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it.each(['8.8.8.8', '1.1.1.1', '172.15.0.1', '172.32.0.1', '193.0.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8'])(
    'allows public %s',
    (ip) => {
      expect(isBlockedAddress(ip)).toBe(false);
    }
  );
});

describe('checkImageUrl', () => {
  const lookup = resolver({
    'cdn.example.com': ['93.184.216.34'],
    'sneaky.example.com': ['93.184.216.34', '10.0.0.8'],
    'internal.corp': ['192.168.1.20'],
    localhost: ['127.0.0.1'],
  });

  it('accepts empty values and relative paths', async () => {
    expect(await checkImageUrl('', { lookup })).toBeNull();
    expect(await checkImageUrl(undefined, { lookup })).toBeNull();
    expect(await checkImageUrl('/public/job-1/img.png', { lookup })).toBeNull();
    expect(await checkImageUrl('images/a.png', { lookup })).toBeNull();
  });

  it('accepts a public https image', async () => {
    expect(await checkImageUrl('https://cdn.example.com/a.png', { lookup })).toBeNull();
  });

  it('rejects non-http schemes', async () => {
    expect(await checkImageUrl('file:///C:/secrets.txt', { lookup })).toMatch(/scheme/);
    expect(await checkImageUrl('ftp://cdn.example.com/a.png', { lookup })).toMatch(/scheme/);
    expect(await checkImageUrl('javascript:alert(1)', { lookup })).toMatch(/scheme/);
  });

  it('rejects IP literals in private ranges, including the cloud metadata address', async () => {
    expect(await checkImageUrl('http://169.254.169.254/latest/meta-data/', { lookup })).toMatch(/private or internal/);
    expect(await checkImageUrl('http://127.0.0.1:9000/x.png', { lookup })).toMatch(/private or internal/);
    expect(await checkImageUrl('http://[::1]/x.png', { lookup })).toMatch(/private or internal/);
  });

  it('rejects hostnames that resolve to a private address, even if another record is public', async () => {
    expect(await checkImageUrl('http://localhost:3000/admin', { lookup })).toMatch(/resolves to a private/);
    expect(await checkImageUrl('http://internal.corp/x.png', { lookup })).toMatch(/resolves to a private/);
    expect(await checkImageUrl('https://sneaky.example.com/x.png', { lookup })).toMatch(/resolves to a private/);
  });

  it('treats protocol-relative URLs as absolute, not relative', async () => {
    expect(await checkImageUrl('//internal.corp/x.png', { lookup })).toMatch(/resolves to a private/);
    expect(await checkImageUrl('//cdn.example.com/x.png', { lookup })).toBeNull();
  });

  it('rejects embedded credentials and malformed URLs', async () => {
    expect(await checkImageUrl('https://user:pw@cdn.example.com/a.png', { lookup })).toMatch(/credentials/);
    expect(await checkImageUrl('http://', { lookup })).toMatch(/valid URL/);
  });

  it('reports an unresolvable host instead of throwing', async () => {
    expect(await checkImageUrl('https://nope.example.invalid/a.png', { lookup })).toMatch(/could not be resolved/);
  });

  it('lets allow-listed internal hosts through (by hostname or host:port)', async () => {
    expect(await checkImageUrl('http://127.0.0.1:9000/vireon-scenes/a.png', { lookup, allowedHosts: ['127.0.0.1:9000'] })).toBeNull();
    expect(await checkImageUrl('http://internal.corp/x.png', { lookup, allowedHosts: ['internal.corp'] })).toBeNull();
    // Allowing one port must not open the whole host.
    expect(await checkImageUrl('http://127.0.0.1:3000/x', { lookup, allowedHosts: ['127.0.0.1:9000'] })).toMatch(/private or internal/);
  });
});

describe('buildAllowedHosts', () => {
  it('always includes MinIO\'s public host and honours the env list', () => {
    const hosts = buildAllowedHosts({
      minio: { publicUrl: 'http://127.0.0.1:9000' },
      security: { imageAllowedHosts: ['images.lan'] },
    });
    expect(hosts).toEqual(expect.arrayContaining(['127.0.0.1:9000', 'images.lan']));
  });

  it('tolerates a missing security block', () => {
    expect(buildAllowedHosts({ minio: { publicUrl: 'http://minio.local:9000' } })).toContain('minio.local');
  });
});
