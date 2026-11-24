import { Readable } from 'node:stream';
import type {
  CloudStorageProvider,
  ProviderUploadResult,
  StorageTier,
  UploadMetadata,
} from './types';

export interface PipelineUploadResult extends ProviderUploadResult {
  attemptedProviders: string[];
  zeroDiskVerified: true;
}

/**
 * Automated Free-Cloud Routing Pipeline:
 * - Selects the best configured providers for the requested tier ('temporary' vs 'permanent').
 * - Supports explicit provider selection OR automatic failover chaining across free providers.
 * - Zero writes to main server disk: buffers/pipes streams purely in memory or directly upstream.
 */
export class CloudUploadPipeline {
  constructor(private readonly providers: CloudStorageProvider[]) {}

  public listProviders() {
    return this.providers.map((p) => ({
      id: p.id,
      name: p.name,
      tier: p.tier,
      maxBytes: p.maxBytes,
      requiresCredentials: p.requiresCredentials,
      configured: p.isConfigured(),
    }));
  }

  public resolveChain(tier: StorageTier, preferredProviderId?: string): CloudStorageProvider[] {
    const configured = this.providers.filter((p) => p.isConfigured());
    if (preferredProviderId && preferredProviderId !== 'auto') {
      const explicit = configured.find((p) => p.id === preferredProviderId);
      if (explicit) {
        const rest = configured.filter((p) => p.id !== explicit.id && p.tier === tier);
        return [explicit, ...rest];
      }
    }

    const tierMatches = configured.filter((p) => p.tier === tier);
    const fallbacks = configured.filter((p) => p.tier !== tier && p.id === 'lan-ephemeral-ram');
    return [...tierMatches, ...fallbacks];
  }

  /**
   * Streams incoming payload into the first healthy provider in the failover chain.
   * For single-provider attempts, streams straight through without extra copies;
   * if multiple failover providers are chained, holds bounded bytes in RAM only (never disk)
   * so retries succeed cleanly if a free endpoint rate-limits or times out.
   */
  public async upload(
    source: Readable | Buffer,
    meta: UploadMetadata,
    preferredProviderId?: string,
  ): Promise<PipelineUploadResult> {
    const chain = this.resolveChain(meta.tier, preferredProviderId);
    if (chain.length === 0) {
      throw new Error(`No configured free cloud storage providers available for tier "${meta.tier}".`);
    }

    // If only 1 provider in chain and source is already a Readable, pass straight through
    if (chain.length === 1 && !Buffer.isBuffer(source)) {
      const provider = chain[0];
      const result = await provider.uploadStream(source, meta);
      return {
        ...result,
        attemptedProviders: [provider.id],
        zeroDiskVerified: true,
      };
    }

    // Read once into bounded RAM (zero disk usage) so failover chain can retry cleanly
    const payloadBuf = Buffer.isBuffer(source) ? source : await this.readBounded(source, 50 * 1024 * 1024);
    const attempted: string[] = [];
    const errors: string[] = [];

    for (const provider of chain) {
      if (payloadBuf.byteLength > provider.maxBytes) {
        errors.push(`${provider.id}: exceeds max size`);
        continue;
      }
      attempted.push(provider.id);
      try {
        const result = await provider.uploadStream(Readable.from(payloadBuf), {
          ...meta,
          sizeBytes: payloadBuf.byteLength,
        });
        return {
          ...result,
          attemptedProviders: attempted,
          zeroDiskVerified: true,
        };
      } catch (err) {
        errors.push(`${provider.id}: ${err instanceof Error ? err.message : 'upload failed'}`);
      }
    }

    throw new Error(`All free cloud providers failed (${errors.join(' | ')})`);
  }

  private async readBounded(stream: Readable, maxBytes: number): Promise<Buffer> {
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of stream) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
      total += buf.byteLength;
      if (total > maxBytes) {
        throw new Error('Upload payload exceeds maximum 50 MB zero-disk limit.');
      }
      chunks.push(buf);
    }
    if (total === 0) {
      throw new Error('Upload payload is empty.');
    }
    return Buffer.concat(chunks, total);
  }
}
