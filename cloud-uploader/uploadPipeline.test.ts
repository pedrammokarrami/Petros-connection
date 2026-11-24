import assert from 'node:assert/strict';
import test from 'node:test';
import type { Readable } from 'node:stream';
import { CloudUploadPipeline } from './uploadPipeline';
import type { CloudStorageProvider, ProviderUploadResult, StorageTier, UploadMetadata } from './types';
import { normalizeSlug } from '../link-router/router';

function createMockProvider(opts: {
  id: string;
  tier: StorageTier;
  configured?: boolean;
  shouldFail?: boolean;
  remoteUrl?: string;
}): CloudStorageProvider {
  return {
    id: opts.id,
    name: opts.id,
    tier: opts.tier,
    maxBytes: 10 * 1024 * 1024,
    requiresCredentials: false,
    isConfigured: () => opts.configured ?? true,
    async uploadStream(stream: Readable, meta: UploadMetadata): Promise<ProviderUploadResult> {
      let bytes = 0;
      for await (const chunk of stream) {
        bytes += Buffer.isBuffer(chunk) ? chunk.byteLength : Buffer.from(chunk as Uint8Array).byteLength;
      }
      if (opts.shouldFail) {
        throw new Error(`${opts.id} rate limited`);
      }
      return {
        providerId: opts.id,
        providerName: opts.id,
        tier: opts.tier,
        remoteUrl: opts.remoteUrl ?? `https://cdn.example.com/${opts.id}/${meta.filename}`,
        sizeBytes: bytes,
        expiresAt: opts.tier === 'temporary' ? Date.now() + 3600_000 : null,
      };
    },
  };
}

test('CloudUploadPipeline fails over automatically across free providers with zero disk writes', async () => {
  const failingTemp = createMockProvider({ id: 'litterbox', tier: 'temporary', shouldFail: true });
  const healthyTemp = createMockProvider({
    id: 'tmpfiles',
    tier: 'temporary',
    remoteUrl: 'https://tmpfiles.org/dl/12345/clip.mp4',
  });
  const permProvider = createMockProvider({
    id: 'github-releases',
    tier: 'permanent',
    remoteUrl: 'https://github.com/user/repo/releases/download/vault/clip.mp4',
  });

  const pipeline = new CloudUploadPipeline([failingTemp, healthyTemp, permProvider]);
  const res = await pipeline.upload(Buffer.from('zero-disk-stream-payload'), {
    filename: 'clip.mp4',
    mimeType: 'video/mp4',
    tier: 'temporary',
  });

  assert.equal(res.providerId, 'tmpfiles');
  assert.deepEqual(res.attemptedProviders, ['litterbox', 'tmpfiles']);
  assert.equal(res.zeroDiskVerified, true);
  assert.equal(res.sizeBytes, Buffer.byteLength('zero-disk-stream-payload'));

  const permRes = await pipeline.upload(Buffer.from('permanent-asset'), {
    filename: 'strat.png',
    mimeType: 'image/png',
    tier: 'permanent',
  });
  assert.equal(permRes.providerId, 'github-releases');
  assert.equal(permRes.expiresAt, null);
});

test('normalizeSlug strips unsafe characters and falls back cleanly', () => {
  assert.equal(normalizeSlug('  My Clutch Clip!! '), 'my-clutch-clip');
  assert.match(normalizeSlug('../etc/passwd'), /^[a-z0-9_-]{3,48}$/);
  assert.match(normalizeSlug('a'), /^clip-[a-f0-9]{6}$/);
});
