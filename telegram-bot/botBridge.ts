import crypto from 'node:crypto';
import express from 'express';
import { ReplayGuard } from '../crypto/identity';
import type { LocalNodeStore } from '../personal-server/localStore';
import type {
  ManagedServiceName,
  PersonalNodeController,
} from '../personal-server/nodeController';
import type { LocalStreamEngine } from '../streaming/streamEngine';
import { validatePublicHttpUrl } from '../src/utils/urlSecurity';
import {
  isAuthorizedTelegramChat,
  parseTelegramCommand,
  verifySignedTelegramControlCommand,
  verifyTelegramWebhookSecret,
  type SignedTelegramCommandPayload,
} from './commandAuth';

export interface TelegramBridgeDeps {
  controller: PersonalNodeController;
  store: LocalNodeStore;
  streamEngine: LocalStreamEngine;
}

interface CommandAuditEntry {
  id: string;
  source: 'webhook' | 'polling' | 'signed-api' | 'operator-ui';
  chatId: string;
  command: string;
  replyPreview: string;
  timestamp: number;
}

const VALID_SERVICES: ManagedServiceName[] = [
  'p2p-signaling',
  'lan-discovery',
  'local-streaming',
  'telegram-bridge',
  'link-router',
];

/**
 * Automated Telegram Bot Bridge & Failover Takeover Controller:
 * - Connects to Telegram Bot API via authenticated webhook OR zero-URL long polling.
 * - Executes authenticated commands to inspect status, start/stop/restart services,
 *   toggle local streams, switch active failover endpoints, and register branded links.
 * - Sends automatic failover takeover notifications to authorized operator chats.
 */
export class TelegramBotBridge {
  private readonly replayGuard = new ReplayGuard(5 * 60 * 1000, 2000);
  private readonly recentLog: CommandAuditEntry[] = [];
  private pollingActive = false;
  private pollingTimer: ReturnType<typeof setTimeout> | null = null;
  private lastUpdateOffset = 0;

  constructor(private readonly deps: TelegramBridgeDeps) {}

  private getBotToken(): string {
    return process.env.TELEGRAM_BOT_TOKEN?.trim() || '';
  }

  private getWebhookSecret(): string {
    return process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || '';
  }

  private getAllowedChats(): string {
    return process.env.TELEGRAM_ALLOWED_CHAT_IDS?.trim() || '';
  }

  public getMode(): 'webhook' | 'polling' | 'standby' {
    if (!this.getBotToken()) return 'standby';
    return process.env.TELEGRAM_MODE?.trim().toLowerCase() === 'polling' ? 'polling' : 'webhook';
  }

  public startIfConfigured(): void {
    if (this.getMode() === 'polling') {
      this.startPolling();
    }
  }

  public setRunning(running: boolean): void {
    if (running && this.getMode() === 'polling') {
      this.startPolling();
    } else if (!running) {
      this.stopPolling();
    }
  }

  public startPolling(): void {
    if (this.pollingActive || !this.getBotToken()) return;
    this.pollingActive = true;
    const tick = async () => {
      if (!this.pollingActive) return;
      try {
        const token = this.getBotToken();
        const url = `https://api.telegram.org/bot${token}/getUpdates?timeout=20&offset=${this.lastUpdateOffset}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = (await res.json()) as {
            ok?: boolean;
            result?: Array<{
              update_id: number;
              message?: { chat?: { id?: number | string }; text?: string };
            }>;
          };
          for (const upd of data.result ?? []) {
            this.lastUpdateOffset = Math.max(this.lastUpdateOffset, upd.update_id + 1);
            const chatId = upd.message?.chat?.id;
            const text = upd.message?.text;
            if (chatId !== undefined && text) {
              if (isAuthorizedTelegramChat(chatId, this.getAllowedChats())) {
                const reply = await this.executeCommand(text, String(chatId), 'polling');
                await this.sendTelegramMessage(String(chatId), reply);
              }
            }
          }
        }
      } catch {
        // Retry gracefully after short delay
      } finally {
        if (this.pollingActive) {
          this.pollingTimer = setTimeout(() => void tick(), 2500);
        }
      }
    };
    void tick();
  }

  public stopPolling(): void {
    this.pollingActive = false;
    if (this.pollingTimer) {
      clearTimeout(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  public async notifyFailover(previousLabel: string, nextLabel: string, nextUrl: string): Promise<void> {
    const token = this.getBotToken();
    const chats = this.getAllowedChats()
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!token || chats.length === 0) return;

    const text = [
      'AIGAMERIA Automatic Failover Activated',
      `Previous: ${previousLabel}`,
      `Active Node: ${nextLabel}`,
      `Endpoint: ${nextUrl}`,
    ].join('\n');

    await Promise.allSettled(chats.map((chatId) => this.sendTelegramMessage(chatId, text)));
  }

  private async sendTelegramMessage(chatId: string, text: string): Promise<void> {
    const token = this.getBotToken();
    if (!token) return;
    try {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: text.slice(0, 3800),
        }),
      });
    } catch {
      // Non-fatal transport error
    }
  }

  public async executeCommand(
    rawText: string,
    chatId: string,
    source: CommandAuditEntry['source'],
  ): Promise<string> {
    const parsed = parseTelegramCommand(rawText);
    if (!parsed) {
      return 'Unknown command. Send /help to list available node controls.';
    }

    let reply = '';
    switch (parsed.command) {
      case 'help': {
        reply = [
          'AIGAMERIA Node Controller Commands:',
          '/status - Node health, active endpoint & peer count',
          '/services - List managed local services',
          '/start <service> - Start a service',
          '/stop <service> - Stop a service',
          '/restart <service> - Restart a service',
          '/stream start [title] | /stream stop <id> - Manage local stream',
          '/failover [endpointId] - Switch active failover server',
          '/upload <publicUrl> [slug] - Create server-branded zero-disk link',
          '/links - Show recent custom server links',
        ].join('\n');
        break;
      }

      case 'status': {
        const snap = this.deps.controller.getStatusSnapshot();
        reply = [
          `Node: ${snap.nodeId}`,
          `Uptime: ${snap.uptimeSec}s`,
          `Active Endpoint: ${snap.activeEndpoint?.label ?? 'Primary'} (${snap.activeEndpoint?.url ?? snap.publicBaseUrl})`,
          `P2P Peers: ${snap.p2p.connectedPeers} | Live Streams: ${snap.streaming.liveCount}`,
          `Zero-Storage Policy: Private chats P2P-only · Server disk uploads 0 B`,
        ].join('\n');
        break;
      }

      case 'services': {
        const snap = this.deps.controller.getStatusSnapshot();
        reply = snap.services
          .map((s) => `${s.running ? '[ON]' : '[OFF]'} ${s.name} (restarts: ${s.restarts})`)
          .join('\n');
        break;
      }

      case 'start':
      case 'stop':
      case 'restart': {
        const svc = parsed.args[0] as ManagedServiceName | undefined;
        if (!svc || !VALID_SERVICES.includes(svc)) {
          reply = `Specify a valid service: ${VALID_SERVICES.join(', ')}`;
          break;
        }
        const updated = this.deps.controller.controlService(svc, parsed.command);
        reply = updated
          ? `Service "${updated.name}" is now ${updated.running ? 'RUNNING' : 'STOPPED'}.`
          : `Service "${svc}" not found.`;
        break;
      }

      case 'stream': {
        const sub = (parsed.args[0] || '').toLowerCase();
        if (sub === 'start') {
          const title = parsed.args.slice(1).join(' ').trim() || 'Telegram Remote Stream';
          const { session } = this.deps.streamEngine.createStream({
            title,
            hostHandle: 'TelegramAdmin',
            mode: 'lan-hls',
          });
          const base = this.deps.controller.getPublicBaseUrl();
          reply = `Local stream started (${session.id}):\nHLS: ${base}/api/streams/${session.id}/live.m3u8`;
        } else if (sub === 'stop') {
          const streamId = parsed.args[1] || '';
          const ok = streamId ? this.deps.streamEngine.stopStream(streamId) : false;
          reply = ok ? `Stream ${streamId} stopped.` : 'Stream ID not found.';
        } else {
          const summary = this.deps.streamEngine.getSummary();
          reply = `Local streaming: ${summary.running ? 'ONLINE' : 'PAUSED'} (${summary.liveCount} live)`;
        }
        break;
      }

      case 'failover': {
        const targetId = parsed.args[0];
        const result = this.deps.controller.triggerFailover(targetId);
        reply =
          result.ok && result.active
            ? `Failover complete. Active endpoint: ${result.active.label} (${result.active.url})`
            : `Failover failed: ${result.error ?? 'Unknown error'}`;
        break;
      }

      case 'upload': {
        const targetUrl = parsed.args[0] || '';
        const safe = validatePublicHttpUrl(targetUrl);
        if (!safe) {
          reply = 'Usage: /upload <valid-public-https-url> [custom-slug]';
          break;
        }
        const slugBase = (parsed.args[1] || `tg-${crypto.randomBytes(3).toString('hex')}`)
          .toLowerCase()
          .replace(/[^a-z0-9_-]/g, '')
          .slice(0, 40);
        const slug = slugBase.length >= 3 ? slugBase : `tg-${crypto.randomBytes(3).toString('hex')}`;
        const id = crypto.randomBytes(5).toString('hex');
        this.deps.store.saveBrandedLink({
          id,
          slug,
          provider: 'telegram-remote-pointer',
          tier: 'permanent',
          targetUrl: safe.toString(),
          filename: safe.pathname.split('/').pop() || 'remote-asset',
          mimeType: 'application/octet-stream',
          sizeBytes: 0,
          createdAt: Date.now(),
          expiresAt: null,
          hits: 0,
        });
        const base = this.deps.controller.getPublicBaseUrl();
        reply = `Zero-disk branded link created:\n${base}/s/${slug}`;
        break;
      }

      case 'links': {
        const base = this.deps.controller.getPublicBaseUrl();
        const links = this.deps.store.listBrandedLinks(5);
        reply =
          links.length === 0
            ? 'No custom branded links yet.'
            : links.map((l) => `${base}/s/${l.slug} (${l.provider}, ${l.hits} hits)`).join('\n');
        break;
      }
    }

    this.recentLog.unshift({
      id: crypto.randomBytes(4).toString('hex'),
      source,
      chatId,
      command: parsed.raw,
      replyPreview: reply.slice(0, 180),
      timestamp: Date.now(),
    });
    if (this.recentLog.length > 20) this.recentLog.pop();

    return reply;
  }

  public getStatus() {
    return {
      configured: Boolean(this.getBotToken()),
      mode: this.getMode(),
      pollingActive: this.pollingActive,
      webhookSecretConfigured: Boolean(this.getWebhookSecret()),
      allowedChatsCount: this.getAllowedChats()
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean).length,
      webhookPath: '/api/telegram/webhook',
      recentCommands: this.recentLog.slice(0, 10),
    };
  }

  public createRouter(): express.Router {
    const router = express.Router();

    router.get('/status', (_req, res) => {
      res.json(this.getStatus());
    });

    // Official Telegram Webhook endpoint (verified via X-Telegram-Bot-Api-Secret-Token + allowlist)
    router.post('/webhook', express.json({ limit: '64kb' }), async (req, res) => {
      const secretHeader = req.get('x-telegram-bot-api-secret-token');
      if (!verifyTelegramWebhookSecret(secretHeader, this.getWebhookSecret())) {
        res.status(401).json({ error: 'Invalid Telegram webhook secret token' });
        return;
      }

      const update = req.body as {
        message?: { chat?: { id?: number | string }; text?: string };
      };
      const chatId = update?.message?.chat?.id;
      const text = update?.message?.text;
      if (chatId === undefined || typeof text !== 'string') {
        res.json({ ok: true, ignored: true });
        return;
      }

      if (!isAuthorizedTelegramChat(chatId, this.getAllowedChats())) {
        res.status(403).json({ error: 'Telegram chat ID is not authorized' });
        return;
      }

      const reply = await this.executeCommand(text, String(chatId), 'webhook');
      await this.sendTelegramMessage(String(chatId), reply);
      res.json({ ok: true, reply });
    });

    // Signed command automation endpoint (HMAC-SHA256 + ReplayGuard)
    router.post('/signed-command', express.json({ limit: '16kb' }), async (req, res) => {
      const secret = this.getWebhookSecret() || process.env.NODE_CONTROL_SECRET?.trim() || '';
      const payload = req.body as SignedTelegramCommandPayload;
      const verification = verifySignedTelegramControlCommand(payload, secret, this.replayGuard);
      if (!verification.ok) {
        res.status(401).json({ error: verification.reason });
        return;
      }
      const reply = await this.executeCommand(payload.text, payload.chatId, 'signed-api');
      res.json({ ok: true, reply });
    });

    // Authenticated Operator UI command runner (for testing commands directly from Settings)
    router.post(
      '/command',
      this.deps.controller.requireOperatorAuth,
      express.json({ limit: '16kb' }),
      async (req, res) => {
        const text = typeof req.body?.text === 'string' ? req.body.text : '';
        if (!text.trim().startsWith('/')) {
          res.status(400).json({ error: 'Command must start with / (e.g., /status or /failover)' });
          return;
        }
        const reply = await this.executeCommand(text, 'operator-console', 'operator-ui');
        res.json({ ok: true, reply });
      },
    );

    return router;
  }
}
