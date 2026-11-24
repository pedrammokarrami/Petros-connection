import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import express, { type Request, type Response } from 'express';
import type { CloudUploadPipeline } from '../cloud-uploader/uploadPipeline';
import type { EphemeralRamStore } from '../cloud-uploader/providers';
import type { StorageTier } from '../cloud-uploader/types';
import type { BrandedLinkRecord, LocalNodeStore } from '../personal-server/localStore';
import type { PersonalNodeController } from '../personal-server/nodeController';
import { validatePublicHttpUrl } from '../src/utils/urlSecurity';

const SLUG_REGEX = /^[a-zA-Z0-9_-]{3,48}$/;

export function normalizeSlug(raw?: string): string {
  const cleaned = (raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 44);
  if (cleaned.length >= 3 && SLUG_REGEX.test(cleaned)) {
    return cleaned;
  }
  return `clip-${crypto.randomBytes(3).toString('hex')}`;
}

export interface LinkRouterDeps {
  store: LocalNodeStore;
  pipeline: CloudUploadPipeline;
  ramStore: EphemeralRamStore;
  controller: PersonalNodeController;
}

/**
 * Custom Server-Branded Links & Zero-Disk Stream Upload Router:
 * - Public short links: GET /s/:slug and GET /f/:id (302 redirect by default, or ?proxy=1 zero-disk streaming proxy)
 * - Authenticated stream uploader: POST /api/upload/stream (pipes directly to free temp/permanent cloud providers)
 * - Authenticated pointer registration: POST /api/links (create branded link for any verified remote URL)
 */
export function createLinkAndUploadRouters(deps: LinkRouterDeps) {
  const apiRouter = express.Router();
  const publicRouter = express.Router();

  const buildPublicUrls = (record: BrandedLinkRecord, req?: Request) => {
    const base = deps.controller.getPublicBaseUrl(req);
    return {
      ...record,
      brandedSlugUrl: `${base}/s/${record.slug}`,
      brandedIdUrl: `${base}/f/${record.id}`,
      proxyUrl: `${base}/s/${record.slug}?proxy=1`,
    };
  };

  // List available free cloud storage providers & active branded link pointers
  apiRouter.get('/upload/providers', (_req, res) => {
    res.json({
      zeroMainServerDiskUsage: true,
      providers: deps.pipeline.listProviders(),
    });
  });

  // Zero-disk RAM fallback fetch endpoint (only used when offline LAN buffer is active)
  apiRouter.get('/upload/ephemeral/:blobId', (req, res) => {
    const blobId = String(req.params.blobId ?? '');
    if (!/^[a-f0-9]{12}$/.test(blobId)) {
      res.status(400).send('Invalid ephemeral asset ID');
      return;
    }
    const blob = deps.ramStore.get(blobId);
    if (!blob) {
      res.status(404).send('Ephemeral LAN share expired or not found');
      return;
    }
    res.setHeader('Content-Type', blob.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${blob.filename.replace(/"/g, '')}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(blob.data);
  });

  // Direct stream upload: pipes incoming HTTP body straight to free cloud provider (ZERO disk writes!)
  apiRouter.post('/upload/stream', deps.controller.requireOperatorAuth, async (req, res) => {
    try {
      const filename = String(req.get('x-file-name') || req.query.filename || 'shared-asset.bin').slice(0, 100);
      const mimeType = String(req.get('content-type') || 'application/octet-stream').split(';')[0].trim();
      const tier: StorageTier =
        String(req.get('x-storage-tier') || req.query.tier) === 'permanent' ? 'permanent' : 'temporary';
      const preferredProvider = String(req.get('x-storage-provider') || req.query.provider || 'auto');
      const requestedSlug = String(req.get('x-custom-slug') || req.query.slug || '');
      const ttlHours = Number(req.get('x-ttl-hours') || req.query.ttlHours || 24);

      const uploadResult = await deps.pipeline.upload(
        req,
        {
          filename,
          mimeType,
          tier,
          ttlHours: Number.isFinite(ttlHours) ? ttlHours : 24,
        },
        preferredProvider,
      );

      let slug = normalizeSlug(requestedSlug);
      if (deps.store.findLinkBySlug(slug)) {
        slug = `${slug.slice(0, 36)}-${crypto.randomBytes(2).toString('hex')}`;
      }

      const record: BrandedLinkRecord = {
        id: crypto.randomBytes(5).toString('hex'),
        slug,
        provider: uploadResult.providerId,
        tier: uploadResult.tier,
        targetUrl: uploadResult.remoteUrl,
        filename,
        mimeType,
        sizeBytes: uploadResult.sizeBytes,
        createdAt: Date.now(),
        expiresAt: uploadResult.expiresAt,
        hits: 0,
      };
      deps.store.saveBrandedLink(record);

      res.status(201).json({
        ok: true,
        zeroDiskVerified: true,
        attemptedProviders: uploadResult.attemptedProviders,
        link: buildPublicUrls(record, req),
      });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Streaming upload failed',
      });
    }
  });

  // List custom branded links
  apiRouter.get('/links', (req, res) => {
    const links = deps.store.listBrandedLinks(50).map((r) => buildPublicUrls(r, req));
    res.json({ links });
  });

  // Register a custom branded link pointing to any verified remote media/file URL (zero server storage)
  apiRouter.post('/links', deps.controller.requireOperatorAuth, express.json({ limit: '16kb' }), (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const rawTarget = typeof body.targetUrl === 'string' ? body.targetUrl.trim() : '';
    const valid = validatePublicHttpUrl(rawTarget);
    if (!valid) {
      res.status(400).json({ error: 'Target URL must be a valid public http(s) URL.' });
      return;
    }

    const tier: StorageTier = body.tier === 'temporary' ? 'temporary' : 'permanent';
    const ttlHours = tier === 'temporary' ? Math.max(1, Math.min(168, Number(body.ttlHours) || 24)) : null;
    let slug = normalizeSlug(typeof body.slug === 'string' ? body.slug : undefined);
    if (deps.store.findLinkBySlug(slug)) {
      slug = `${slug.slice(0, 36)}-${crypto.randomBytes(2).toString('hex')}`;
    }

    const record: BrandedLinkRecord = {
      id: crypto.randomBytes(5).toString('hex'),
      slug,
      provider: typeof body.provider === 'string' ? body.provider.slice(0, 40) : 'external-pointer',
      tier,
      targetUrl: valid.toString(),
      filename: typeof body.filename === 'string' ? body.filename.slice(0, 96) : valid.pathname.split('/').pop() || 'shared-link',
      mimeType: typeof body.mimeType === 'string' ? body.mimeType.slice(0, 64) : 'application/octet-stream',
      sizeBytes: Number(body.sizeBytes) || 0,
      createdAt: Date.now(),
      expiresAt: ttlHours ? Date.now() + ttlHours * 3600 * 1000 : null,
      hits: 0,
    };

    deps.store.saveBrandedLink(record);
    res.status(201).json({ ok: true, link: buildPublicUrls(record, req) });
  });

  apiRouter.delete('/links/:id', deps.controller.requireOperatorAuth, (req, res) => {
    const id = String(req.params.id ?? '');
    if (!/^[a-zA-Z0-9_-]{3,40}$/.test(id)) {
      res.status(400).json({ error: 'Invalid link ID' });
      return;
    }
    const deleted = deps.store.deleteBrandedLink(id);
    if (!deleted) {
      res.status(404).json({ error: 'Link not found' });
      return;
    }
    res.json({ ok: true, id });
  });

  // Public custom server-branded resolution handler (/s/:slug and /f/:id)
  const resolveLink = async (record: BrandedLinkRecord | null, req: Request, res: Response) => {
    if (!deps.controller.isLinkRouterActive()) {
      res.status(503).send('Link router service is currently paused.');
      return;
    }
    if (!record) {
      res.status(404).send('Branded link not found or expired.');
      return;
    }

    deps.store.incrementLinkHits(record.id);

    // Local ephemeral RAM fallback URL (zero disk)
    const epMatch = record.targetUrl.match(/\/api\/upload\/ephemeral\/([a-f0-9]{12})$/);
    if (epMatch) {
      const blob = deps.ramStore.get(epMatch[1]);
      if (!blob) {
        res.status(410).send('Temporary share expired.');
        return;
      }
      res.setHeader('Content-Type', blob.mimeType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `inline; filename="${blob.filename.replace(/"/g, '')}"`);
      res.send(blob.data);
      return;
    }

    const safeTarget = validatePublicHttpUrl(record.targetUrl);
    if (!safeTarget) {
      res.status(400).send('Unsafe link destination blocked.');
      return;
    }

    // Optional zero-disk streaming proxy (?proxy=1)
    if (req.query.proxy === '1') {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      try {
        const upstream = await fetch(safeTarget.toString(), {
          signal: controller.signal,
          headers: { 'User-Agent': 'AIGAMERIA-LinkRouter/1.0' },
        });
        if (!upstream.ok || !upstream.body) {
          res.redirect(302, safeTarget.toString());
          return;
        }
        const ctype = upstream.headers.get('content-type') || record.mimeType || 'application/octet-stream';
        res.setHeader('Content-Type', ctype);
        res.setHeader('X-AIGAMERIA-Provider', record.provider);
        res.setHeader('Cache-Control', 'public, max-age=300');
        const nodeStream = Readable.fromWeb(upstream.body as unknown as import('node:stream/web').ReadableStream);
        nodeStream.pipe(res);
      } catch {
        res.redirect(302, safeTarget.toString());
      } finally {
        clearTimeout(timer);
      }
      return;
    }

    // Default: ultra-fast zero-bandwidth HTTP 302 redirect
    res.redirect(302, safeTarget.toString());
  };

  publicRouter.get('/s/:slug', async (req, res) => {
    const slug = String(req.params.slug ?? '');
    if (!SLUG_REGEX.test(slug)) {
      res.status(400).send('Invalid link slug');
      return;
    }
    const record = deps.store.findLinkBySlug(slug);
    await resolveLink(record, req, res);
  });

  publicRouter.get('/f/:id', async (req, res) => {
    const id = String(req.params.id ?? '');
    if (!/^[a-zA-Z0-9_-]{3,40}$/.test(id)) {
      res.status(400).send('Invalid file ID');
      return;
    }
    const record = deps.store.findLinkById(id);
    await resolveLink(record, req, res);
  });

  return { apiRouter, publicRouter };
}
