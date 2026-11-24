import express from 'express';
import type { PersonalNodeController } from '../personal-server/nodeController';
import type { LocalStreamEngine } from './streamEngine';

export function createStreamRouter(
  engine: LocalStreamEngine,
  controller: PersonalNodeController,
): express.Router {
  const router = express.Router();

  router.get('/', (_req, res) => {
    res.json(engine.getSummary());
  });

  router.post('/', controller.requireOperatorAuth, express.json({ limit: '16kb' }), (req, res) => {
    if (!engine.isEnabled()) {
      res.status(503).json({ error: 'Local streaming engine is paused.' });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const title = typeof body.title === 'string' ? body.title : 'Local Squad Stream';
    const hostHandle = typeof body.hostHandle === 'string' ? body.hostHandle : 'AIGAMERIA_OP';
    const hostPeerId = typeof body.hostPeerId === 'string' ? body.hostPeerId : undefined;
    const mode = body.mode === 'lan-hls' ? 'lan-hls' : 'webrtc-p2p';

    const { session, ingestToken } = engine.createStream({
      title,
      hostHandle,
      hostPeerId,
      mode,
    });

    const baseUrl = controller.getPublicBaseUrl(req);
    const playlistUrl = `${baseUrl}/api/streams/${session.id}/live.m3u8`;
    const segmentPutBase = `${baseUrl}/api/streams/${session.id}/segments`;

    res.status(201).json({
      session,
      watchUrl: mode === 'lan-hls' ? playlistUrl : `${baseUrl}/?stream=${session.id}`,
      hlsPlaylistUrl: playlistUrl,
      ingestToken,
      ffmpegExample: `ffmpeg -re -i srt://0.0.0.0:9000?mode=listener -c copy -f hls -hls_time 2 -hls_list_size 5 -method PUT -headers "X-Stream-Token: ${ingestToken}\\r\\n" "${segmentPutBase}/seg_%03d.ts"`,
    });
  });

  router.delete('/:streamId', controller.requireOperatorAuth, (req, res) => {
    const streamId = String(req.params.streamId ?? '');
    if (!/^[a-zA-Z0-9_-]{3,40}$/.test(streamId)) {
      res.status(400).json({ error: 'Invalid stream ID' });
      return;
    }
    const stopped = engine.stopStream(streamId);
    if (!stopped) {
      res.status(404).json({ error: 'Stream not found' });
      return;
    }
    res.json({ ok: true, streamId });
  });

  // LAN HLS rolling playlist (zero disk storage)
  router.get('/:streamId/live.m3u8', (req, res) => {
    const streamId = String(req.params.streamId ?? '');
    const playlist = engine.buildHlsPlaylist(streamId);
    if (!playlist) {
      res.status(404).send('Stream not found');
      return;
    }
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Cache-Control', 'no-store');
    res.send(playlist);
  });

  // LAN HLS chunk ingest (authenticated via per-stream X-Stream-Token header)
  router.put(
    '/:streamId/segments/:segmentName',
    express.raw({ type: '*/*', limit: '4mb' }),
    (req, res) => {
      const streamId = String(req.params.streamId ?? '');
      const segmentName = String(req.params.segmentName ?? '');
      const token = req.get('x-stream-token') || '';
      if (!engine.verifyIngestToken(streamId, token)) {
        res.status(401).json({ error: 'Invalid stream ingest token' });
        return;
      }

      const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      const duration = Number(req.query.duration) || 2;
      const result = engine.pushHlsSegment(
        streamId,
        segmentName,
        buf,
        req.get('content-type') || 'video/mp2t',
        duration,
      );
      if (!result.ok) {
        res.status(400).json({ error: result.error });
        return;
      }
      res.status(204).end();
    },
  );

  // LAN HLS segment playback
  router.get('/:streamId/segments/:segmentName', (req, res) => {
    const streamId = String(req.params.streamId ?? '');
    const segmentName = String(req.params.segmentName ?? '');
    const seg = engine.getHlsSegment(streamId, segmentName);
    if (!seg) {
      res.status(404).send('Segment expired or not found');
      return;
    }
    res.setHeader('Content-Type', seg.contentType);
    res.setHeader('Cache-Control', 'public, max-age=10');
    res.send(seg.data);
  });

  return router;
}
