import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  decryptAtRest,
  encryptAtRest,
  generateNodeKeyPairBundle,
  type NodeKeyPairBundle,
} from '../crypto/identity';

export interface BrandedLinkRecord {
  id: string;
  slug: string;
  provider: string;
  tier: 'temporary' | 'permanent';
  targetUrl: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: number;
  expiresAt: number | null;
  hits: number;
}

export interface FailoverEndpointRecord {
  id: string;
  label: string;
  url: string;
  priority: number;
  active: boolean;
  healthy: boolean;
  latencyMs: number | null;
  lastCheckedAt: number | null;
}

export interface PublicFeedPostRecord {
  id: string;
  handle: string;
  gameTag: string;
  content: string;
  createdAtMs: number;
}

/**
 * Local SQLite metadata & pointer store with AES-256-GCM encryption at rest
 * for sensitive node config values.
 *
 * Strict Zero-Storage Policy:
 * - Private DMs and Private Squad chats are NEVER stored in this database.
 * - Uploaded file bytes are NEVER stored in this database or on server disk;
 *   only lightweight metadata pointers (slug -> free cloud URL) are saved.
 */
export class LocalNodeStore {
  private readonly db: DatabaseSync;
  private readonly storageKey: Buffer;
  public readonly dbPath: string;

  constructor(dbPath?: string) {
    const resolvedPath =
      dbPath ||
      process.env.SQLITE_DB_PATH?.trim() ||
      path.resolve(process.cwd(), '.aigameria-node', 'node-meta.sqlite');

    this.dbPath = resolvedPath;
    if (resolvedPath !== ':memory:') {
      fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    }

    // Derive deterministic 256-bit at-rest encryption key from env secret or process machine entropy
    const keySeed =
      process.env.NODE_STORAGE_KEY?.trim() ||
      process.env.NODE_CONTROL_SECRET?.trim() ||
      `aigameria-local-node-${resolvedPath}`;
    this.storageKey = crypto.createHash('sha256').update(keySeed, 'utf8').digest();

    this.db = new DatabaseSync(resolvedPath);
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS node_kv (
        key TEXT PRIMARY KEY,
        value_encrypted TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS branded_links (
        id TEXT PRIMARY KEY,
        slug TEXT UNIQUE NOT NULL,
        provider TEXT NOT NULL,
        tier TEXT NOT NULL,
        target_url TEXT NOT NULL,
        filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER,
        hits INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS failover_endpoints (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        url TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 10,
        active INTEGER NOT NULL DEFAULT 0,
        healthy INTEGER NOT NULL DEFAULT 1,
        latency_ms INTEGER,
        last_checked_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS public_discovery_posts (
        id TEXT PRIMARY KEY,
        handle TEXT NOT NULL,
        game_tag TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL
      );
    `);
  }

  public getEncryptedKV(key: string): string | null {
    const stmt = this.db.prepare('SELECT value_encrypted FROM node_kv WHERE key = ?');
    const row = stmt.get(key) as { value_encrypted?: string } | undefined;
    if (!row?.value_encrypted) return null;
    try {
      return decryptAtRest(row.value_encrypted, this.storageKey);
    } catch {
      return null;
    }
  }

  public setEncryptedKV(key: string, plaintext: string): void {
    const sealed = encryptAtRest(plaintext, this.storageKey);
    const stmt = this.db.prepare(`
      INSERT INTO node_kv (key, value_encrypted, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value_encrypted = excluded.value_encrypted, updated_at = excluded.updated_at
    `);
    stmt.run(key, sealed, Date.now());
  }

  public getOrCreateNodeIdentity(): NodeKeyPairBundle {
    const existing = this.getEncryptedKV('node_identity_v1');
    if (existing) {
      try {
        const parsed = JSON.parse(existing) as NodeKeyPairBundle;
        if (parsed.nodeId && parsed.signingPrivateKeyPem && parsed.exchangePrivateKeyPem) {
          return parsed;
        }
      } catch {
        // Regenerate if corrupted
      }
    }
    const created = generateNodeKeyPairBundle();
    this.setEncryptedKV('node_identity_v1', JSON.stringify(created));
    return created;
  }

  // ---- Admin Claim Hash (First-run fallback when NODE_CONTROL_SECRET is unset) ----

  public getClaimedAdminHash(): string | null {
    return this.getEncryptedKV('admin_passphrase_hash_v1');
  }

  public setClaimedAdminHash(scryptHash: string): boolean {
    if (this.getClaimedAdminHash()) return false;
    this.setEncryptedKV('admin_passphrase_hash_v1', scryptHash);
    return true;
  }

  // ---- Branded Link Pointers (Zero-Disk File Metadata) ----

  public saveBrandedLink(record: BrandedLinkRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO branded_links (
        id, slug, provider, tier, target_url, filename, mime_type, size_bytes, created_at, expires_at, hits
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        slug = excluded.slug,
        provider = excluded.provider,
        tier = excluded.tier,
        target_url = excluded.target_url,
        filename = excluded.filename,
        mime_type = excluded.mime_type,
        size_bytes = excluded.size_bytes,
        expires_at = excluded.expires_at
    `);
    stmt.run(
      record.id,
      record.slug,
      record.provider,
      record.tier,
      record.targetUrl,
      record.filename,
      record.mimeType,
      record.sizeBytes,
      record.createdAt,
      record.expiresAt,
      record.hits,
    );
  }

  public findLinkBySlug(slug: string): BrandedLinkRecord | null {
    this.pruneExpiredLinks();
    const stmt = this.db.prepare('SELECT * FROM branded_links WHERE slug = ? LIMIT 1');
    const row = stmt.get(slug) as Record<string, unknown> | undefined;
    return row ? this.mapLinkRow(row) : null;
  }

  public findLinkById(id: string): BrandedLinkRecord | null {
    this.pruneExpiredLinks();
    const stmt = this.db.prepare('SELECT * FROM branded_links WHERE id = ? LIMIT 1');
    const row = stmt.get(id) as Record<string, unknown> | undefined;
    return row ? this.mapLinkRow(row) : null;
  }

  public incrementLinkHits(id: string): void {
    const stmt = this.db.prepare('UPDATE branded_links SET hits = hits + 1 WHERE id = ?');
    stmt.run(id);
  }

  public listBrandedLinks(limit = 50): BrandedLinkRecord[] {
    this.pruneExpiredLinks();
    const stmt = this.db.prepare(
      'SELECT * FROM branded_links ORDER BY created_at DESC LIMIT ?',
    );
    const rows = stmt.all(limit) as Record<string, unknown>[];
    return rows.map((r) => this.mapLinkRow(r));
  }

  public deleteBrandedLink(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM branded_links WHERE id = ?');
    const res = stmt.run(id);
    return Number(res.changes) > 0;
  }

  public pruneExpiredLinks(now = Date.now()): number {
    const stmt = this.db.prepare(
      'DELETE FROM branded_links WHERE expires_at IS NOT NULL AND expires_at <= ?',
    );
    const res = stmt.run(now);
    return Number(res.changes);
  }

  private mapLinkRow(row: Record<string, unknown>): BrandedLinkRecord {
    return {
      id: String(row.id),
      slug: String(row.slug),
      provider: String(row.provider),
      tier: row.tier === 'permanent' ? 'permanent' : 'temporary',
      targetUrl: String(row.target_url),
      filename: String(row.filename),
      mimeType: String(row.mime_type),
      sizeBytes: Number(row.size_bytes) || 0,
      createdAt: Number(row.created_at) || Date.now(),
      expiresAt: row.expires_at === null || row.expires_at === undefined ? null : Number(row.expires_at),
      hits: Number(row.hits) || 0,
    };
  }

  // ---- Failover Endpoints ----

  public upsertFailoverEndpoint(ep: FailoverEndpointRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO failover_endpoints (id, label, url, priority, active, healthy, latency_ms, last_checked_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        label = excluded.label,
        url = excluded.url,
        priority = excluded.priority,
        active = excluded.active,
        healthy = excluded.healthy,
        latency_ms = excluded.latency_ms,
        last_checked_at = excluded.last_checked_at
    `);
    stmt.run(
      ep.id,
      ep.label,
      ep.url,
      ep.priority,
      ep.active ? 1 : 0,
      ep.healthy ? 1 : 0,
      ep.latencyMs,
      ep.lastCheckedAt,
    );
  }

  public listFailoverEndpoints(): FailoverEndpointRecord[] {
    const stmt = this.db.prepare(
      'SELECT * FROM failover_endpoints ORDER BY priority ASC, id ASC',
    );
    const rows = stmt.all() as Record<string, unknown>[];
    return rows.map((row) => ({
      id: String(row.id),
      label: String(row.label),
      url: String(row.url),
      priority: Number(row.priority) || 10,
      active: Boolean(row.active),
      healthy: Boolean(row.healthy),
      latencyMs: row.latency_ms === null || row.latency_ms === undefined ? null : Number(row.latency_ms),
      lastCheckedAt:
        row.last_checked_at === null || row.last_checked_at === undefined
          ? null
          : Number(row.last_checked_at),
    }));
  }

  public setActiveEndpoint(endpointId: string): boolean {
    const existing = this.listFailoverEndpoints();
    if (!existing.some((e) => e.id === endpointId)) return false;
    this.db.prepare('UPDATE failover_endpoints SET active = 0').run();
    this.db.prepare('UPDATE failover_endpoints SET active = 1 WHERE id = ?').run(endpointId);
    return true;
  }

  public deleteFailoverEndpoint(endpointId: string): boolean {
    const res = this.db.prepare('DELETE FROM failover_endpoints WHERE id = ?').run(endpointId);
    return Number(res.changes) > 0;
  }

  // ---- Opt-in Public Discovery Feed Only (Never Private Chats) ----

  public savePublicPost(post: PublicFeedPostRecord): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO public_discovery_posts (id, handle, game_tag, content, created_at_ms)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(post.id, post.handle, post.gameTag, post.content, post.createdAtMs);
  }

  public listPublicPosts(limit = 40): PublicFeedPostRecord[] {
    const stmt = this.db.prepare(
      'SELECT * FROM public_discovery_posts ORDER BY created_at_ms DESC LIMIT ?',
    );
    const rows = stmt.all(limit) as Record<string, unknown>[];
    return rows.map((row) => ({
      id: String(row.id),
      handle: String(row.handle),
      gameTag: String(row.game_tag),
      content: String(row.content),
      createdAtMs: Number(row.created_at_ms) || Date.now(),
    }));
  }

  public close(): void {
    this.db.close();
  }
}
