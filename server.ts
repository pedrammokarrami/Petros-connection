import 'dotenv/config';
import dns from 'node:dns/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import {
  CatboxProvider,
  EphemeralLanMemoryProvider,
  EphemeralRamStore,
  GitHubReleasesProvider,
  IpfsPinningProvider,
  LitterboxProvider,
  TmpfilesProvider,
} from './cloud-uploader/providers';
import { CloudUploadPipeline } from './cloud-uploader/uploadPipeline';
import { createLinkAndUploadRouters } from './link-router/router';
import { LanDiscoveryService } from './p2p/lanDiscovery';
import { P2PSignalingServer } from './p2p/signalingServer';
import { LocalNodeStore } from './personal-server/localStore';
import { PersonalNodeController } from './personal-server/nodeController';
import { createPersonalNodeRouter } from './personal-server/nodeRouter';
import { LocalStreamEngine } from './streaming/streamEngine';
import { createStreamRouter } from './streaming/streamRouter';
import { TelegramBotBridge } from './telegram-bot/botBridge';
import { isBlockedIpAddress, validatePublicHttpUrl } from './src/utils/urlSecurity';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const FETCH_TIMEOUT_MS = 4000;
const MAX_BODY_BYTES = 256 * 1024;

interface PreviewResponse {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  author?: string;
}

const previewCache = new Map<string, { expiresAt: number; data: PreviewResponse }>();

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCharCode(code) : '';
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCharCode(code) : '';
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function extractMetaTag(html: string, key: string): string | undefined {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']{1,500})["'][^>]*>`,
      'i',
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']{1,500})["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`,
      'i',
    ),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) {
      return decodeHtmlEntities(m[1]);
    }
  }
  return undefined;
}

function extractHtmlTitle(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([^<]{1,240})<\/title>/i);
  return m?.[1] ? decodeHtmlEntities(m[1]) : undefined;
}

async function assertHostResolvesPublic(hostname: string): Promise<boolean> {
  try {
    const records = await dns.lookup(hostname, { all: true });
    if (!records.length) return false;
    return records.every((rec) => !isBlockedIpAddress(rec.address));
  } catch {
    return false;
  }
}

async function safeFetchText(
  initialUrl: URL,
  accept: string,
  maxRedirects = 2,
): Promise<{ text: string; contentType: string; finalUrl: URL } | null> {
  let currentUrl = initialUrl;

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const isPublic = await assertHostResolvesPublic(currentUrl.hostname);
    if (!isPublic) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const res = await fetch(currentUrl.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          Accept: accept,
          'User-Agent': 'AIGAMERIA-LinkPreview/1.0',
        },
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (!location || hop === maxRedirects) return null;
        const nextUrl = validatePublicHttpUrl(new URL(location, currentUrl).toString());
        if (!nextUrl) return null;
        currentUrl = nextUrl;
        continue;
      }

      if (!res.ok) return null;

      const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
      const reader = res.body?.getReader();
      if (!reader) return null;

      const chunks: Uint8Array[] = [];
      let total = 0;
      while (total < MAX_BODY_BYTES) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        const remaining = MAX_BODY_BYTES - total;
        const slice = value.byteLength > remaining ? value.subarray(0, remaining) : value;
        chunks.push(slice);
        total += slice.byteLength;
      }
      void reader.cancel().catch(() => {});

      const buffer = Buffer.concat(chunks);
      return {
        text: buffer.toString('utf8'),
        contentType,
        finalUrl: currentUrl,
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  return null;
}

async function fetchLinkMetadata(targetUrl: URL): Promise<PreviewResponse> {
  const canonical = targetUrl.toString();
  const cached = previewCache.get(canonical);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const host = targetUrl.hostname.toLowerCase().replace(/^www\./, '');
  let result: PreviewResponse = {
    url: canonical,
    siteName: host,
  };

  if (host === 'youtube.com' || host === 'youtu.be' || host === 'm.youtube.com') {
    const oembedUrl = new URL(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(canonical)}&format=json`,
    );
    const fetched = await safeFetchText(oembedUrl, 'application/json');
    if (fetched && fetched.contentType.includes('application/json')) {
      try {
        const json = JSON.parse(fetched.text) as Record<string, unknown>;
        result = {
          url: canonical,
          title: typeof json.title === 'string' ? json.title.slice(0, 180) : undefined,
          author: typeof json.author_name === 'string' ? json.author_name.slice(0, 80) : undefined,
          description:
            typeof json.author_name === 'string' ? `Channel: ${json.author_name}` : undefined,
          image:
            typeof json.thumbnail_url === 'string' && validatePublicHttpUrl(json.thumbnail_url)
              ? json.thumbnail_url
              : undefined,
          siteName: 'YouTube',
        };
      } catch {
        // fallback below
      }
    }
  } else if (host === 'vimeo.com') {
    const oembedUrl = new URL(
      `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(canonical)}`,
    );
    const fetched = await safeFetchText(oembedUrl, 'application/json');
    if (fetched && fetched.contentType.includes('application/json')) {
      try {
        const json = JSON.parse(fetched.text) as Record<string, unknown>;
        result = {
          url: canonical,
          title: typeof json.title === 'string' ? json.title.slice(0, 180) : undefined,
          author: typeof json.author_name === 'string' ? json.author_name.slice(0, 80) : undefined,
          description:
            typeof json.description === 'string' ? json.description.slice(0, 220) : undefined,
          image:
            typeof json.thumbnail_url === 'string' && validatePublicHttpUrl(json.thumbnail_url)
              ? json.thumbnail_url
              : undefined,
          siteName: 'Vimeo',
        };
      } catch {
        // fallback below
      }
    }
  }

  if (!result.title) {
    const fetched = await safeFetchText(targetUrl, 'text/html,application/xhtml+xml');
    if (fetched && fetched.contentType.includes('text/html')) {
      const title =
        extractMetaTag(fetched.text, 'og:title') ??
        extractMetaTag(fetched.text, 'twitter:title') ??
        extractHtmlTitle(fetched.text);
      const description =
        extractMetaTag(fetched.text, 'og:description') ??
        extractMetaTag(fetched.text, 'twitter:description') ??
        extractMetaTag(fetched.text, 'description');
      const siteName = extractMetaTag(fetched.text, 'og:site_name') ?? host;
      const rawImage =
        extractMetaTag(fetched.text, 'og:image') ?? extractMetaTag(fetched.text, 'twitter:image');

      let safeImage: string | undefined;
      if (rawImage) {
        try {
          const resolvedImg = validatePublicHttpUrl(new URL(rawImage, fetched.finalUrl).toString());
          if (resolvedImg) safeImage = resolvedImg.toString();
        } catch {
          safeImage = undefined;
        }
      }

      result = {
        url: canonical,
        title: title?.slice(0, 180),
        description: description?.slice(0, 240),
        image: safeImage,
        siteName: siteName?.slice(0, 60),
      };
    }
  }

  previewCache.set(canonical, {
    expiresAt: Date.now() + 10 * 60 * 1000,
    data: result,
  });

  return result;
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  const httpServer = http.createServer(app);

  // 1. Local Encrypted-at-Rest SQLite Metadata Store (Zero Private Chat Storage, Zero File Blobs)
  const store = new LocalNodeStore();
  const nodeIdentity = store.getOrCreateNodeIdentity();

  // 2. Real WebSocket Signaling & Zero-Storage Ephemeral E2EE Relay (/ws/signal)
  const signaling = new P2PSignalingServer({
    nodeId: nodeIdentity.nodeId,
    onPublicPost: (post) => store.savePublicPost(post),
  });
  signaling.attach(httpServer, '/ws/signal');

  // 3. LAN Peer Discovery & Local Low-Latency Streaming Engine
  const lanDiscovery = new LanDiscoveryService(nodeIdentity.nodeId, PORT, nodeIdentity.fingerprint);
  if (process.env.LAN_DISCOVERY_ENABLED !== 'false') {
    lanDiscovery.start();
  }
  const streamEngine = new LocalStreamEngine();

  // 4. Personal Node Controller + Telegram Bot Bridge (with automatic failover alerts)
  let telegramBridge: TelegramBotBridge | null = null;
  const controller = new PersonalNodeController({
    store,
    identity: nodeIdentity,
    signaling,
    lanDiscovery,
    streamEngine,
    onTelegramToggle: (running) => telegramBridge?.setRunning(running),
    onFailoverTriggered: (prev, next) => {
      void telegramBridge?.notifyFailover(
        prev?.label ?? 'Primary Node',
        next.label,
        next.url,
      );
    },
  });
  telegramBridge = new TelegramBotBridge({ controller, store, streamEngine });
  telegramBridge.startIfConfigured();
  controller.startHealthMonitor(60_000);

  // 5. Automated Zero-Disk Free Cloud Upload Pipeline + Custom Server-Branded Link Router
  const ramStore = new EphemeralRamStore();
  const uploadPipeline = new CloudUploadPipeline([
    new LitterboxProvider(),
    new TmpfilesProvider(),
    new GitHubReleasesProvider(),
    new IpfsPinningProvider(),
    new CatboxProvider(),
    new EphemeralLanMemoryProvider(ramStore, () => controller.getPublicBaseUrl()),
  ]);

  const { apiRouter: linkApiRouter, publicRouter: brandedLinkRouter } =
    createLinkAndUploadRouters({
      store,
      pipeline: uploadPipeline,
      ramStore,
      controller,
    });

  // ---- Core Health & Link Preview Routes ----
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      nodeId: nodeIdentity.nodeId,
      fingerprint: nodeIdentity.fingerprint,
      uptimeSec: controller.getStatusSnapshot().uptimeSec,
      zeroStoragePolicy: true,
    });
  });

  app.get('/api/link-preview', async (req, res) => {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url : '';
    const validUrl = validatePublicHttpUrl(rawUrl);
    if (!validUrl) {
      res.status(400).json({ error: 'Invalid or unsupported URL' });
      return;
    }

    try {
      const metadata = await fetchLinkMetadata(validUrl);
      res.json(metadata);
    } catch {
      res.json({ url: validUrl.toString(), siteName: validUrl.hostname.replace(/^www\./, '') });
    }
  });

  // ---- Mount Modular Backend Engines ----
  app.use('/api/node', createPersonalNodeRouter(controller, store, signaling));
  app.use('/api/streams', createStreamRouter(streamEngine, controller));
  app.use('/api/telegram', telegramBridge.createRouter());
  app.use('/api', linkApiRouter);

  // ---- Mount Public Server-Branded Short Links (/s/:slug & /f/:id) ----
  app.use('/', brandedLinkRouter);

  // ---- Frontend SPA / Vite Dev Middleware ----
  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(
      `AIGAMERIA Personal Node (${nodeIdentity.nodeId}) listening on http://0.0.0.0:${PORT} (WS: /ws/signal)`,
    );
  });
}

void startServer();
