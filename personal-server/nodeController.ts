import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import {
  hashSecretScrypt,
  signHmacToken,
  verifyHmacToken,
  verifySecretScrypt,
  type NodeKeyPairBundle,
} from '../crypto/identity';
import type { LanDiscoveryService } from '../p2p/lanDiscovery';
import type { P2PSignalingServer } from '../p2p/signalingServer';
import type { LocalStreamEngine } from '../streaming/streamEngine';
import { validatePublicHttpUrl } from '../src/utils/urlSecurity';
import type { FailoverEndpointRecord, LocalNodeStore } from './localStore';

export type ManagedServiceName =
  | 'p2p-signaling'
  | 'lan-discovery'
  | 'local-streaming'
  | 'telegram-bridge'
  | 'link-router';

export interface ServiceState {
  name: ManagedServiceName;
  running: boolean;
  restarts: number;
  updatedAt: number;
  detail?: string;
}

export interface NodeControllerDeps {
  store: LocalNodeStore;
  identity: NodeKeyPairBundle;
  signaling: P2PSignalingServer;
  lanDiscovery: LanDiscoveryService;
  streamEngine: LocalStreamEngine;
  onTelegramToggle?: (running: boolean) => void;
  onFailoverTriggered?: (from: FailoverEndpointRecord | null, to: FailoverEndpointRecord) => void;
}

/**
 * Orchestrates the self-hosted AIGAMERIA Personal Server:
 * - Service lifecycle (start / stop / restart)
 * - Automatic health & latency checks across primary + failover endpoints
 * - Automatic or remote Telegram failover takeover
 * - Secure operator authentication (env secret OR first-run claimed scrypt passphrase + Bearer tokens)
 */
export class PersonalNodeController {
  private readonly sessionSigningKey: Buffer;
  private readonly startedAt = Date.now();
  private readonly services = new Map<ManagedServiceName, ServiceState>();
  private healthTimer: ReturnType<typeof setInterval> | null = null;
  private linkRouterActive = true;

  constructor(private readonly deps: NodeControllerDeps) {
    // Ephemeral in-memory HMAC key for Bearer session tokens (never persisted in plaintext)
    this.sessionSigningKey = process.env.NODE_SESSION_SECRET?.trim()
      ? crypto.createHash('sha256').update(process.env.NODE_SESSION_SECRET.trim(), 'utf8').digest()
      : crypto.randomBytes(32);

    const now = Date.now();
    this.services.set('p2p-signaling', {
      name: 'p2p-signaling',
      running: true,
      restarts: 0,
      updatedAt: now,
      detail: 'WebRTC signaling + ephemeral E2EE relay (/ws/signal)',
    });
    this.services.set('lan-discovery', {
      name: 'lan-discovery',
      running: process.env.LAN_DISCOVERY_ENABLED !== 'false',
      restarts: 0,
      updatedAt: now,
      detail: 'UDP multicast/broadcast local peer discovery',
    });
    this.services.set('local-streaming', {
      name: 'local-streaming',
      running: true,
      restarts: 0,
      updatedAt: now,
      detail: 'WebRTC peer stream + zero-disk LAN HLS ring buffer',
    });
    this.services.set('telegram-bridge', {
      name: 'telegram-bridge',
      running: Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim()),
      restarts: 0,
      updatedAt: now,
      detail: process.env.TELEGRAM_BOT_TOKEN?.trim()
        ? 'Connected via Telegram Bot API'
        : 'Ready (set TELEGRAM_BOT_TOKEN to activate)',
    });
    this.services.set('link-router', {
      name: 'link-router',
      running: true,
      restarts: 0,
      updatedAt: now,
      detail: 'Zero-disk custom branded /s/:slug & /f/:id router',
    });

    this.ensureDefaultEndpoint();
  }

  public getPublicBaseUrl(req?: Request): string {
    const configured = process.env.NODE_PUBLIC_URL?.trim() || process.env.APP_URL?.trim();
    if (configured && configured !== 'MY_APP_URL') {
      return configured.replace(/\/+$/, '');
    }
    if (req) {
      const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
      const host = req.get('x-forwarded-host') || req.get('host') || 'localhost:3000';
      return `${proto}://${host}`;
    }
    return 'http://localhost:3000';
  }

  private ensureDefaultEndpoint(): void {
    const existing = this.deps.store.listFailoverEndpoints();
    if (existing.length === 0) {
      this.deps.store.upsertFailoverEndpoint({
        id: 'primary-local',
        label: 'Primary Personal Node (This Host)',
        url: this.getPublicBaseUrl(),
        priority: 1,
        active: true,
        healthy: true,
        latencyMs: 2,
        lastCheckedAt: Date.now(),
      });
    }
  }

  // ---- Authentication (SecureCoder first-run claim + env override) ----

  public getAuthStatus(): {
    mode: 'env-secret' | 'claimed' | 'unclaimed';
    requiresSetup: boolean;
  } {
    if (process.env.NODE_CONTROL_SECRET?.trim()) {
      return { mode: 'env-secret', requiresSetup: false };
    }
    if (this.deps.store.getClaimedAdminHash()) {
      return { mode: 'claimed', requiresSetup: false };
    }
    return { mode: 'unclaimed', requiresSetup: true };
  }

  public claimFirstRunPassphrase(passphrase: string): { ok: true; token: string } | { ok: false; error: string } {
    if (process.env.NODE_CONTROL_SECRET?.trim()) {
      return { ok: false, error: 'Node control secret is already configured via environment variables.' };
    }
    if (this.deps.store.getClaimedAdminHash()) {
      return { ok: false, error: 'Admin passphrase has already been claimed. Please sign in.' };
    }
    const clean = passphrase.trim();
    if (clean.length < 8 || clean.length > 128) {
      return { ok: false, error: 'Passphrase must be between 8 and 128 characters.' };
    }

    const hashed = hashSecretScrypt(clean);
    const saved = this.deps.store.setClaimedAdminHash(hashed);
    if (!saved) {
      return { ok: false, error: 'Admin passphrase was already claimed.' };
    }
    return { ok: true, token: this.issueSessionToken() };
  }

  public verifyAdminPassphrase(passphrase: string): boolean {
    const clean = passphrase.trim();
    if (!clean) return false;

    const envSecret = process.env.NODE_CONTROL_SECRET?.trim();
    if (envSecret) {
      const a = Buffer.from(clean, 'utf8');
      const b = Buffer.from(envSecret, 'utf8');
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    }

    const claimedHash = this.deps.store.getClaimedAdminHash();
    if (!claimedHash) return false;
    return verifySecretScrypt(clean, claimedHash);
  }

  public issueSessionToken(): string {
    const payload = Buffer.from(
      JSON.stringify({
        sub: this.deps.identity.nodeId,
        iat: Date.now(),
        exp: Date.now() + 12 * 60 * 60 * 1000,
        jti: crypto.randomBytes(8).toString('base64url'),
      }),
      'utf8',
    ).toString('base64url');
    const sig = signHmacToken(payload, this.sessionSigningKey);
    return `${payload}.${sig}`;
  }

  public verifySessionToken(token: string): boolean {
    if (!token || !token.includes('.')) return false;
    const [payloadB64, sig] = token.split('.');
    if (!payloadB64 || !sig) return false;
    if (!verifyHmacToken(payloadB64, sig, this.sessionSigningKey)) return false;

    try {
      const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
        exp?: number;
      };
      return typeof parsed.exp === 'number' && parsed.exp > Date.now();
    } catch {
      return false;
    }
  }

  public requireOperatorAuth = (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.get('authorization') || '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (bearer && this.verifySessionToken(bearer)) {
      next();
      return;
    }

    res.status(401).json({
      error: 'Operator authentication required',
      authStatus: this.getAuthStatus(),
    });
  };

  // ---- Service Lifecycle Management ----

  public isLinkRouterActive(): boolean {
    return this.linkRouterActive;
  }

  public controlService(
    name: ManagedServiceName,
    action: 'start' | 'stop' | 'restart',
  ): ServiceState | null {
    const current = this.services.get(name);
    if (!current) return null;

    const applyState = (running: boolean) => {
      if (name === 'p2p-signaling') {
        this.deps.signaling.setActive(running);
      } else if (name === 'lan-discovery') {
        if (running) {
          this.deps.lanDiscovery.start();
        } else {
          this.deps.lanDiscovery.stop();
        }
      } else if (name === 'local-streaming') {
        this.deps.streamEngine.setEnabled(running);
      } else if (name === 'telegram-bridge') {
        this.deps.onTelegramToggle?.(running);
      } else if (name === 'link-router') {
        this.linkRouterActive = running;
      }
    };

    if (action === 'restart') {
      applyState(false);
      applyState(true);
      const next: ServiceState = {
        ...current,
        running: true,
        restarts: current.restarts + 1,
        updatedAt: Date.now(),
      };
      this.services.set(name, next);
      return next;
    }

    const nextRunning = action === 'start';
    applyState(nextRunning);
    const next: ServiceState = {
      ...current,
      running: nextRunning,
      updatedAt: Date.now(),
    };
    this.services.set(name, next);
    return next;
  }

  // ---- Failover & Health Checking ----

  public registerFailoverEndpoint(input: {
    id?: string;
    label: string;
    url: string;
    priority?: number;
  }): { ok: true; endpoint: FailoverEndpointRecord } | { ok: false; error: string } {
    const cleanLabel = input.label.trim().slice(0, 60);
    if (!cleanLabel) return { ok: false, error: 'Endpoint label is required.' };

    const parsed = validatePublicHttpUrl(input.url.trim());
    if (!parsed) {
      return {
        ok: false,
        error: 'Failover URL must be a valid public http(s) endpoint.',
      };
    }

    const id =
      input.id?.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) ||
      `node-${crypto.randomBytes(4).toString('hex')}`;
    const record: FailoverEndpointRecord = {
      id,
      label: cleanLabel,
      url: parsed.toString().replace(/\/+$/, ''),
      priority: Number.isFinite(input.priority) ? Number(input.priority) : 20,
      active: false,
      healthy: true,
      latencyMs: null,
      lastCheckedAt: null,
    };

    this.deps.store.upsertFailoverEndpoint(record);
    return { ok: true, endpoint: record };
  }

  public async checkAllEndpoints(autoFailover = true): Promise<FailoverEndpointRecord[]> {
    const endpoints = this.deps.store.listFailoverEndpoints();
    const updated: FailoverEndpointRecord[] = [];

    for (const ep of endpoints) {
      if (ep.id === 'primary-local') {
        const selfEp: FailoverEndpointRecord = {
          ...ep,
          healthy: true,
          latencyMs: 1,
          lastCheckedAt: Date.now(),
        };
        this.deps.store.upsertFailoverEndpoint(selfEp);
        updated.push(selfEp);
        continue;
      }

      const checked = await this.probeEndpoint(ep);
      this.deps.store.upsertFailoverEndpoint(checked);
      updated.push(checked);
    }

    if (autoFailover) {
      const currentActive = updated.find((e) => e.active);
      if (currentActive && !currentActive.healthy) {
        const candidate = updated.find((e) => e.healthy && e.id !== currentActive.id);
        if (candidate) {
          this.triggerFailover(candidate.id);
        }
      }
    }

    return this.deps.store.listFailoverEndpoints();
  }

  private async probeEndpoint(ep: FailoverEndpointRecord): Promise<FailoverEndpointRecord> {
    const valid = validatePublicHttpUrl(ep.url);
    if (!valid) {
      return { ...ep, healthy: false, latencyMs: null, lastCheckedAt: Date.now() };
    }

    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    try {
      const healthUrl = `${valid.toString().replace(/\/+$/, '')}/api/health`;
      const res = await fetch(healthUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: { 'User-Agent': 'AIGAMERIA-NodeHealth/1.0' },
      });
      const latencyMs = Math.max(1, Date.now() - started);
      return {
        ...ep,
        healthy: res.ok,
        latencyMs: res.ok ? latencyMs : null,
        lastCheckedAt: Date.now(),
      };
    } catch {
      return {
        ...ep,
        healthy: false,
        latencyMs: null,
        lastCheckedAt: Date.now(),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  public triggerFailover(targetEndpointId?: string): {
    ok: boolean;
    active?: FailoverEndpointRecord;
    previous?: FailoverEndpointRecord | null;
    error?: string;
  } {
    const endpoints = this.deps.store.listFailoverEndpoints();
    const previous = endpoints.find((e) => e.active) ?? null;

    let target: FailoverEndpointRecord | undefined;
    if (targetEndpointId) {
      target = endpoints.find((e) => e.id === targetEndpointId);
      if (!target) {
        return { ok: false, error: `Endpoint "${targetEndpointId}" not found.` };
      }
    } else {
      target =
        endpoints.find((e) => e.id !== previous?.id && e.healthy) ||
        endpoints.find((e) => e.id !== previous?.id) ||
        endpoints[0];
      if (!target) {
        return { ok: false, error: 'No failover endpoints registered.' };
      }
    }

    this.deps.store.setActiveEndpoint(target.id);
    const refreshed = this.deps.store.listFailoverEndpoints().find((e) => e.id === target!.id)!;
    this.deps.onFailoverTriggered?.(previous, refreshed);
    return { ok: true, active: refreshed, previous };
  }

  public startHealthMonitor(intervalMs = 60_000): void {
    if (this.healthTimer) return;
    this.healthTimer = setInterval(() => {
      void this.checkAllEndpoints(true);
    }, intervalMs);
  }

  public stopHealthMonitor(): void {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
  }

  public getStatusSnapshot(req?: Request) {
    const endpoints = this.deps.store.listFailoverEndpoints();
    const activeEndpoint = endpoints.find((e) => e.active) ?? endpoints[0] ?? null;

    return {
      nodeId: this.deps.identity.nodeId,
      fingerprint: this.deps.identity.fingerprint,
      signingPublicKeyPem: this.deps.identity.signingPublicKeyPem,
      exchangePublicKeyPem: this.deps.identity.exchangePublicKeyPem,
      publicBaseUrl: this.getPublicBaseUrl(req),
      uptimeSec: Math.floor((Date.now() - this.startedAt) / 1000),
      auth: this.getAuthStatus(),
      services: Array.from(this.services.values()),
      p2p: this.deps.signaling.getStatus(),
      lanDiscovery: this.deps.lanDiscovery.getStatus(),
      streaming: this.deps.streamEngine.getSummary(),
      endpoints,
      activeEndpoint,
      storagePolicy: {
        privateMessagesStoredOnServer: false,
        filePayloadsStoredOnServerDisk: false,
        metadataEncryptedAtRest: true,
        sqliteMetadataOnly: true,
      },
    };
  }
}
