import express from 'express';
import type { P2PSignalingServer } from '../p2p/signalingServer';
import type { LocalNodeStore } from './localStore';
import type { ManagedServiceName, PersonalNodeController } from './nodeController';

const VALID_SERVICES: ManagedServiceName[] = [
  'p2p-signaling',
  'lan-discovery',
  'local-streaming',
  'telegram-bridge',
  'link-router',
];

export function createPersonalNodeRouter(
  controller: PersonalNodeController,
  store: LocalNodeStore,
  signaling: P2PSignalingServer,
): express.Router {
  const router = express.Router();

  // Public non-sensitive node telemetry & auth mode
  router.get('/status', (req, res) => {
    res.json(controller.getStatusSnapshot(req));
  });

  // First-run operator passphrase claim (locked automatically once claimed or when NODE_CONTROL_SECRET is set)
  router.post('/auth/claim', express.json({ limit: '8kb' }), (req, res) => {
    const passphrase = typeof req.body?.passphrase === 'string' ? req.body.passphrase : '';
    const result = controller.claimFirstRunPassphrase(passphrase);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.status(201).json({ ok: true, token: result.token, mode: 'claimed' });
  });

  // Operator login using configured NODE_CONTROL_SECRET or claimed passphrase
  router.post('/auth/login', express.json({ limit: '8kb' }), (req, res) => {
    const passphrase = typeof req.body?.passphrase === 'string' ? req.body.passphrase : '';
    if (!controller.verifyAdminPassphrase(passphrase)) {
      res.status(401).json({ error: 'Invalid node control passphrase.' });
      return;
    }
    res.json({ ok: true, token: controller.issueSessionToken() });
  });

  // Service lifecycle control (start / stop / restart)
  router.post(
    '/services/:name/:action',
    controller.requireOperatorAuth,
    (req, res) => {
      const name = String(req.params.name ?? '') as ManagedServiceName;
      const action = String(req.params.action ?? '');
      if (!VALID_SERVICES.includes(name)) {
        res.status(400).json({ error: `Unknown service "${name}".` });
        return;
      }
      if (action !== 'start' && action !== 'stop' && action !== 'restart') {
        res.status(400).json({ error: 'Action must be start, stop, or restart.' });
        return;
      }

      const updated = controller.controlService(name, action);
      res.json({ ok: true, service: updated });
    },
  );

  // Failover endpoint registry
  router.get('/failover', (_req, res) => {
    res.json({ endpoints: store.listFailoverEndpoints() });
  });

  router.post(
    '/failover/endpoints',
    controller.requireOperatorAuth,
    express.json({ limit: '16kb' }),
    (req, res) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const result = controller.registerFailoverEndpoint({
        label: typeof body.label === 'string' ? body.label : '',
        url: typeof body.url === 'string' ? body.url : '',
        priority: typeof body.priority === 'number' ? body.priority : undefined,
      });
      if (!result.ok) {
        res.status(400).json({ error: result.error });
        return;
      }
      res.status(201).json({ ok: true, endpoint: result.endpoint });
    },
  );

  router.delete('/failover/endpoints/:id', controller.requireOperatorAuth, (req, res) => {
    const id = String(req.params.id ?? '');
    if (id === 'primary-local') {
      res.status(400).json({ error: 'Cannot delete the built-in primary local node.' });
      return;
    }
    const removed = store.deleteFailoverEndpoint(id);
    if (!removed) {
      res.status(404).json({ error: 'Failover endpoint not found.' });
      return;
    }
    res.json({ ok: true, id });
  });

  router.post('/failover/check', controller.requireOperatorAuth, async (_req, res) => {
    const endpoints = await controller.checkAllEndpoints(true);
    res.json({ ok: true, endpoints });
  });

  router.post(
    '/failover/switch',
    controller.requireOperatorAuth,
    express.json({ limit: '8kb' }),
    (req, res) => {
      const targetId =
        typeof req.body?.endpointId === 'string' && req.body.endpointId.trim()
          ? req.body.endpointId.trim()
          : undefined;
      const result = controller.triggerFailover(targetId);
      if (!result.ok) {
        res.status(400).json({ error: result.error });
        return;
      }
      res.json({ ok: true, active: result.active, previous: result.previous });
    },
  );

  // Opt-in public discovery feed relay (strictly public posts only; private chats NEVER stored)
  router.get('/public-feed', (_req, res) => {
    res.json({
      privacyNotice: 'Public discovery posts only. Private DMs and private squads are strictly P2P.',
      posts: store.listPublicPosts(40),
    });
  });

  router.post('/public-feed', express.json({ limit: '16kb' }), (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const handle = typeof body.handle === 'string' ? body.handle.trim().slice(0, 40) : '';
    const gameTag = typeof body.gameTag === 'string' ? body.gameTag.trim().slice(0, 32) : '#Games';
    const content = typeof body.content === 'string' ? body.content.trim().slice(0, 1000) : '';
    if (!handle || !content) {
      res.status(400).json({ error: 'handle and content are required.' });
      return;
    }
    const post = {
      id: typeof body.id === 'string' ? body.id.slice(0, 64) : `pub-${Date.now()}`,
      handle,
      gameTag: gameTag.startsWith('#') ? gameTag : `#${gameTag}`,
      content,
      createdAtMs: Date.now(),
    };
    store.savePublicPost(post);
    signaling.broadcastPublicPost(post);
    res.status(201).json({ ok: true, post });
  });

  return router;
}
