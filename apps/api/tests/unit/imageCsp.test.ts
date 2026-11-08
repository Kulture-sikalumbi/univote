import type { AddressInfo } from 'node:net';
import { createApp } from '../../src/app';

async function getImagePolicy(): Promise<string> {
  const app = createApp();
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    return response.headers.get('content-security-policy') ?? '';
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

describe('image content security policy', () => {
  const originalStorageURL = process.env.SUPABASE_URL;

  afterEach(() => {
    if (originalStorageURL === undefined) {
      delete process.env.SUPABASE_URL;
    } else {
      process.env.SUPABASE_URL = originalStorageURL;
    }
  });

  it('allows images from the configured Supabase origin only', async () => {
    process.env.SUPABASE_URL = 'https://storage.example.test/project';

    const policy = await getImagePolicy();

    expect(policy).toContain("img-src 'self' data: https://storage.example.test");
    expect(policy).not.toContain('https://untrusted.example.test');
    expect(policy).toContain("script-src 'self'");
  });

  it('keeps the default same-origin image policy when storage is not configured', async () => {
    delete process.env.SUPABASE_URL;

    const policy = await getImagePolicy();

    expect(policy).toContain("img-src 'self' data:");
    expect(policy).not.toContain('https://storage.example.test');
  });
});
