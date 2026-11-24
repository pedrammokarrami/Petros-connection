import crypto from 'node:crypto';
import type { Readable } from 'node:stream';
import { validatePublicHttpUrl } from '../src/utils/urlSecurity';
import type {
  CloudStorageProvider,
  ProviderUploadResult,
  StorageTier,
  UploadMetadata,
} from './types';

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB guard for free tiers
const DEFAULT_UPLOAD_TIMEOUT_MS = 20_000;

/**
 * Collects a bounded stream into memory ONLY when an upstream multipart endpoint
 * requires Content-Length; never touches server disk.
 */
async function collectStreamBounded(stream: Readable, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    total += buf.byteLength;
    if (total > maxBytes) {
      throw new Error(`Upload exceeds max allowed size (${Math.floor(maxBytes / (1024 * 1024))} MB).`);
    }
    chunks.push(buf);
  }
  if (total === 0) {
    throw new Error('Cannot upload an empty payload.');
  }
  return Buffer.concat(chunks, total);
}

function sanitizeFilename(raw: string): string {
  const base = raw.split(/[\\/]/).pop() || 'file.bin';
  return base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 96) || 'file.bin';
}

function createAbortSignal(timeoutMs = DEFAULT_UPLOAD_TIMEOUT_MS): {
  signal: AbortSignal;
  clear: () => void;
} {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer),
  };
}

/**
 * 1. Litterbox (Catbox Temporary Free Tier) — 1h / 12h / 24h / 72h zero-cost temporary shares.
 */
export class LitterboxProvider implements CloudStorageProvider {
  public readonly id = 'litterbox';
  public readonly name = 'Litterbox Free Temp';
  public readonly tier: StorageTier = 'temporary';
  public readonly maxBytes = MAX_UPLOAD_BYTES;
  public readonly requiresCredentials = false;

  public isConfigured(): boolean {
    return true;
  }

  public async uploadStream(stream: Readable, meta: UploadMetadata): Promise<ProviderUploadResult> {
    const filename = sanitizeFilename(meta.filename);
    const bytes = await collectStreamBounded(stream, this.maxBytes);
    const ttlHours = meta.ttlHours && meta.ttlHours <= 1 ? 1 : meta.ttlHours && meta.ttlHours <= 12 ? 12 : 24;
    const form = new FormData();
    form.append('reqtype', 'fileupload');
    form.append('time', `${ttlHours}h`);
    form.append('fileToUpload', new Blob([new Uint8Array(bytes)], { type: meta.mimeType }), filename);

    const { signal, clear } = createAbortSignal();
    try {
      const res = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', {
        method: 'POST',
        body: form,
        signal,
      });
      const text = (await res.text()).trim();
      const valid = validatePublicHttpUrl(text);
      if (!res.ok || !valid) {
        throw new Error(`Litterbox returned status ${res.status}`);
      }
      return {
        providerId: this.id,
        providerName: this.name,
        tier: this.tier,
        remoteUrl: valid.toString(),
        sizeBytes: bytes.byteLength,
        expiresAt: Date.now() + ttlHours * 3600 * 1000,
      };
    } finally {
      clear();
    }
  }
}

/**
 * 2. Tmpfiles.org — Zero-cost temporary file hosting (~60 min expiry).
 */
export class TmpfilesProvider implements CloudStorageProvider {
  public readonly id = 'tmpfiles';
  public readonly name = 'Tmpfiles.org Free Temp';
  public readonly tier: StorageTier = 'temporary';
  public readonly maxBytes = MAX_UPLOAD_BYTES;
  public readonly requiresCredentials = false;

  public isConfigured(): boolean {
    return true;
  }

  public async uploadStream(stream: Readable, meta: UploadMetadata): Promise<ProviderUploadResult> {
    const filename = sanitizeFilename(meta.filename);
    const bytes = await collectStreamBounded(stream, this.maxBytes);
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(bytes)], { type: meta.mimeType }), filename);

    const { signal, clear } = createAbortSignal();
    try {
      const res = await fetch('https://tmpfiles.org/api/v1/upload', {
        method: 'POST',
        body: form,
        signal,
      });
      if (!res.ok) throw new Error(`tmpfiles returned status ${res.status}`);
      const json = (await res.json()) as { data?: { url?: string } };
      const rawUrl = json?.data?.url?.replace('tmpfiles.org/', 'tmpfiles.org/dl/') ?? '';
      const valid = validatePublicHttpUrl(rawUrl);
      if (!valid) throw new Error('tmpfiles returned invalid URL');

      return {
        providerId: this.id,
        providerName: this.name,
        tier: this.tier,
        remoteUrl: valid.toString(),
        sizeBytes: bytes.byteLength,
        expiresAt: Date.now() + 60 * 60 * 1000,
      };
    } finally {
      clear();
    }
  }
}

/**
 * 3. Catbox.moe — Free permanent direct-link storage (no account required).
 */
export class CatboxProvider implements CloudStorageProvider {
  public readonly id = 'catbox';
  public readonly name = 'Catbox Free Permanent';
  public readonly tier: StorageTier = 'permanent';
  public readonly maxBytes = MAX_UPLOAD_BYTES;
  public readonly requiresCredentials = false;

  public isConfigured(): boolean {
    return true;
  }

  public async uploadStream(stream: Readable, meta: UploadMetadata): Promise<ProviderUploadResult> {
    const filename = sanitizeFilename(meta.filename);
    const bytes = await collectStreamBounded(stream, this.maxBytes);
    const form = new FormData();
    form.append('reqtype', 'fileupload');
    if (process.env.CATBOX_USERHASH?.trim()) {
      form.append('userhash', process.env.CATBOX_USERHASH.trim());
    }
    form.append('fileToUpload', new Blob([new Uint8Array(bytes)], { type: meta.mimeType }), filename);

    const { signal, clear } = createAbortSignal();
    try {
      const res = await fetch('https://catbox.moe/user/api.php', {
        method: 'POST',
        body: form,
        signal,
      });
      const text = (await res.text()).trim();
      const valid = validatePublicHttpUrl(text);
      if (!res.ok || !valid) {
        throw new Error(`Catbox returned status ${res.status}`);
      }
      return {
        providerId: this.id,
        providerName: this.name,
        tier: this.tier,
        remoteUrl: valid.toString(),
        sizeBytes: bytes.byteLength,
        expiresAt: null,
      };
    } finally {
      clear();
    }
  }
}

/**
 * 4. GitHub Releases Asset Storage — Permanent free storage hosted inside the user's own GitHub repo.
 * Requires server-side GITHUB_TOKEN + GITHUB_STORAGE_REPO ("owner/repo") + optional GITHUB_RELEASE_TAG.
 */
export class GitHubReleasesProvider implements CloudStorageProvider {
  public readonly id = 'github-releases';
  public readonly name = 'GitHub Releases Permanent';
  public readonly tier: StorageTier = 'permanent';
  public readonly maxBytes = MAX_UPLOAD_BYTES;
  public readonly requiresCredentials = true;

  public isConfigured(): boolean {
    return Boolean(process.env.GITHUB_TOKEN?.trim() && process.env.GITHUB_STORAGE_REPO?.trim());
  }

  public async uploadStream(stream: Readable, meta: UploadMetadata): Promise<ProviderUploadResult> {
    const token = process.env.GITHUB_TOKEN?.trim();
    const repo = process.env.GITHUB_STORAGE_REPO?.trim();
    const tag = process.env.GITHUB_RELEASE_TAG?.trim() || 'aigameria-vault';
    if (!token || !repo || !/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repo)) {
      throw new Error('GitHub Releases provider not configured.');
    }

    const bytes = await collectStreamBounded(stream, this.maxBytes);
    const uniqueName = `${Date.now()}_${crypto.randomBytes(3).toString('hex')}_${sanitizeFilename(meta.filename)}`;
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'AIGAMERIA-PersonalNode/1.0',
    };

    const { signal, clear } = createAbortSignal(25_000);
    try {
      // Ensure release exists
      let releaseRes = await fetch(`https://api.github.com/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`, {
        headers,
        signal,
      });

      if (releaseRes.status === 404) {
        releaseRes = await fetch(`https://api.github.com/repos/${repo}/releases`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tag_name: tag,
            name: 'AIGAMERIA Permanent Asset Vault',
            body: 'Automated zero-server-storage assets routed from AIGAMERIA personal node.',
            draft: false,
            prerelease: false,
          }),
          signal,
        });
      }

      if (!releaseRes.ok) {
        throw new Error(`GitHub release lookup failed (${releaseRes.status})`);
      }

      const releaseJson = (await releaseRes.json()) as { upload_url?: string };
      const uploadBase = (releaseJson.upload_url || '').replace(/\{[^}]+\}$/, '');
      const uploadUrl = `${uploadBase}?name=${encodeURIComponent(uniqueName)}`;

      const assetRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': meta.mimeType || 'application/octet-stream',
        },
        body: new Uint8Array(bytes),
        signal,
      });

      if (!assetRes.ok) {
        throw new Error(`GitHub asset upload failed (${assetRes.status})`);
      }

      const assetJson = (await assetRes.json()) as { browser_download_url?: string };
      const valid = validatePublicHttpUrl(assetJson.browser_download_url || '');
      if (!valid) {
        throw new Error('GitHub did not return a valid asset download URL.');
      }

      return {
        providerId: this.id,
        providerName: this.name,
        tier: this.tier,
        remoteUrl: valid.toString(),
        sizeBytes: bytes.byteLength,
        expiresAt: null,
      };
    } finally {
      clear();
    }
  }
}

/**
 * 5. IPFS / Pinata Free Gateway Adapter — Permanent content-addressed decentralized pinning.
 * Supports either Pinata free tier (`PINATA_JWT`) or a local/free IPFS Kubo API (`IPFS_API_URL`).
 */
export class IpfsPinningProvider implements CloudStorageProvider {
  public readonly id = 'ipfs-pinning';
  public readonly name = 'IPFS Free Gateway';
  public readonly tier: StorageTier = 'permanent';
  public readonly maxBytes = MAX_UPLOAD_BYTES;
  public readonly requiresCredentials = true;

  public isConfigured(): boolean {
    return Boolean(process.env.PINATA_JWT?.trim() || process.env.IPFS_API_URL?.trim());
  }

  public async uploadStream(stream: Readable, meta: UploadMetadata): Promise<ProviderUploadResult> {
    const filename = sanitizeFilename(meta.filename);
    const bytes = await collectStreamBounded(stream, this.maxBytes);
    const gateway = (process.env.IPFS_GATEWAY_URL?.trim() || 'https://ipfs.io/ipfs').replace(/\/+$/, '');
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(bytes)], { type: meta.mimeType }), filename);

    const { signal, clear } = createAbortSignal(25_000);
    try {
      if (process.env.PINATA_JWT?.trim()) {
        const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
          method: 'POST',
          headers: { Authorization: `Bearer ${process.env.PINATA_JWT.trim()}` },
          body: form,
          signal,
        });
        if (!res.ok) throw new Error(`Pinata pinning failed (${res.status})`);
        const json = (await res.json()) as { IpfsHash?: string };
        if (!json.IpfsHash) throw new Error('Missing IpfsHash from Pinata');
        return {
          providerId: this.id,
          providerName: this.name,
          tier: this.tier,
          remoteUrl: `${gateway}/${json.IpfsHash}`,
          sizeBytes: bytes.byteLength,
          expiresAt: null,
        };
      }

      const ipfsApi = process.env.IPFS_API_URL?.trim();
      if (!ipfsApi) throw new Error('IPFS API not configured.');
      const res = await fetch(`${ipfsApi.replace(/\/+$/, '')}/api/v0/add?pin=true`, {
        method: 'POST',
        body: form,
        signal,
      });
      if (!res.ok) throw new Error(`IPFS node returned ${res.status}`);
      const json = (await res.json()) as { Hash?: string };
      if (!json.Hash) throw new Error('Missing CID Hash from IPFS node');
      return {
        providerId: this.id,
        providerName: this.name,
        tier: this.tier,
        remoteUrl: `${gateway}/${json.Hash}`,
        sizeBytes: bytes.byteLength,
        expiresAt: null,
      };
    } finally {
      clear();
    }
  }
}

/**
 * 6. Zero-Disk Ephemeral LAN Buffer Adapter — Used ONLY as an offline/LAN fallback
 * when external free providers cannot be reached (strict 5 MB RAM cap, auto-expires,
 * zero writes to server disk).
 */
export interface EphemeralRamBlob {
  id: string;
  filename: string;
  mimeType: string;
  data: Buffer;
  expiresAt: number;
}

export class EphemeralRamStore {
  private readonly items = new Map<string, EphemeralRamBlob>();
  private readonly maxItems = 12;

  public put(filename: string, mimeType: string, data: Buffer, ttlMs = 30 * 60 * 1000): EphemeralRamBlob {
    this.prune();
    while (this.items.size >= this.maxItems) {
      const oldest = this.items.keys().next().value;
      if (oldest) this.items.delete(oldest);
    }
    const id = crypto.randomBytes(6).toString('hex');
    const blob: EphemeralRamBlob = {
      id,
      filename,
      mimeType,
      data,
      expiresAt: Date.now() + ttlMs,
    };
    this.items.set(id, blob);
    return blob;
  }

  public get(id: string): EphemeralRamBlob | null {
    this.prune();
    return this.items.get(id) ?? null;
  }

  private prune(): void {
    const now = Date.now();
    for (const [key, item] of this.items.entries()) {
      if (item.expiresAt <= now) {
        this.items.delete(key);
      }
    }
  }
}

export class EphemeralLanMemoryProvider implements CloudStorageProvider {
  public readonly id = 'lan-ephemeral-ram';
  public readonly name = 'Zero-Disk LAN Ephemeral Buffer';
  public readonly tier: StorageTier = 'temporary';
  public readonly maxBytes = 5 * 1024 * 1024;
  public readonly requiresCredentials = false;

  constructor(
    private readonly ramStore: EphemeralRamStore,
    private readonly getBaseUrl: () => string,
  ) {}

  public isConfigured(): boolean {
    return true;
  }

  public async uploadStream(stream: Readable, meta: UploadMetadata): Promise<ProviderUploadResult> {
    const filename = sanitizeFilename(meta.filename);
    const bytes = await collectStreamBounded(stream, this.maxBytes);
    const ttlMs = Math.min(60, Math.max(5, (meta.ttlHours ?? 0.5) * 60)) * 60 * 1000;
    const saved = this.ramStore.put(filename, meta.mimeType, bytes, ttlMs);
    return {
      providerId: this.id,
      providerName: this.name,
      tier: 'temporary',
      remoteUrl: `${this.getBaseUrl().replace(/\/+$/, '')}/api/upload/ephemeral/${saved.id}`,
      sizeBytes: bytes.byteLength,
      expiresAt: saved.expiresAt,
    };
  }
}
