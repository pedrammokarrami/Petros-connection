import type { Readable } from 'node:stream';

export type StorageTier = 'temporary' | 'permanent';

export interface UploadMetadata {
  filename: string;
  mimeType: string;
  sizeBytes?: number;
  tier: StorageTier;
  ttlHours?: number;
}

export interface ProviderUploadResult {
  providerId: string;
  providerName: string;
  tier: StorageTier;
  remoteUrl: string;
  sizeBytes: number;
  expiresAt: number | null;
}

/**
 * Clean pluggable adapter contract so free temporary & permanent cloud storage
 * providers can be swapped, reordered, or chained with automatic failover.
 * Implementations MUST stream/pipe bytes directly without writing user files to disk.
 */
export interface CloudStorageProvider {
  readonly id: string;
  readonly name: string;
  readonly tier: StorageTier;
  readonly maxBytes: number;
  readonly requiresCredentials: boolean;
  isConfigured(): boolean;
  uploadStream(stream: Readable, meta: UploadMetadata): Promise<ProviderUploadResult>;
}
