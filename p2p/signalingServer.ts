import crypto from 'node:crypto';
import type http from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import type {
  IceServerConfig,
  PeerDescriptor,
  SignalClientEvent,
  SignalServerEvent,
} from './protocol';

interface ConnectedPeerSession {
  ws: WebSocket;
  descriptor: PeerDescriptor;
}

export interface SignalingServerOptions {
  nodeId: string;
  onPublicPost?: (post: {
    id: string;
    handle: string;
    gameTag: string;
    content: string;
    createdAtMs: number;
  }) => void;
}

/**
 * Builds free STUN + optional self-hosted TURN (coturn RFC 5766 / REST API HMAC) ICE config.
 */
export function buildIceServersFromEnv(): IceServerConfig[] {
  const stunRaw =
    process.env.STUN_URLS ||
    'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302,stun:stun.cloudflare.com:3478';

  const servers: IceServerConfig[] = stunRaw
    .split(',')
    .map((u) => u.trim())
    .filter((u) => u.startsWith('stun:') || u.startsWith('stuns:'))
    .map((urls) => ({ urls }));

  const turnUrl = process.env.TURN_URL?.trim();
  const turnSecret = process.env.TURN_SECRET?.trim();
  if (turnUrl && turnSecret) {
    // Standard coturn time-limited HMAC-SHA1 ephemeral credentials (valid 12h)
    const unixExpiry = Math.floor(Date.now() / 1000) + 12 * 3600;
    const username = `${unixExpiry}:aigameria`;
    const credential = crypto.createHmac('sha1', turnSecret).update(username).digest('base64');
    servers.push({
      urls: turnUrl,
      username,
      credential,
    });
  }

  return servers;
}

/**
 * Zero-storage WebRTC Signaling & Ephemeral E2EE Relay Server.
 *
 * Privacy Guarantees:
 * 1. Private DMs and Private Squad messages NEVER get written to disk, SQLite, or console logs.
 * 2. Direct peer-to-peer WebRTC DataChannels are always preferred; `p2p:sealed-relay` only
 *    forwards opaque client-encrypted ciphertext frames in memory when NAT blocks direct UDP.
 * 3. Only opt-in `public:post` discovery broadcasts may be indexed by the lightweight public feed.
 */
export class P2PSignalingServer {
  private wss: WebSocketServer | null = null;
  private readonly peers = new Map<string, ConnectedPeerSession>();
  private readonly wsToPeerId = new Map<WebSocket, string>();
  private active = true;
  private totalRelayedCipherFrames = 0;

  constructor(private readonly options: SignalingServerOptions) {}

  public attach(httpServer: http.Server, path = '/ws/signal'): void {
    if (this.wss) return;
    this.wss = new WebSocketServer({ noServer: true, maxPayload: 128 * 1024 });

    httpServer.on('upgrade', (req, socket, head) => {
      const reqUrl = new URL(req.url ?? '/', 'http://localhost');
      if (reqUrl.pathname !== path) {
        return;
      }

      if (!this.active) {
        socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
        socket.destroy();
        return;
      }

      this.wss?.handleUpgrade(req, socket, head, (ws) => {
        this.wss?.emit('connection', ws, req);
      });
    });

    this.wss.on('connection', (ws) => {
      this.sendEvent(ws, {
        type: 'welcome',
        nodeId: this.options.nodeId,
        iceServers: buildIceServersFromEnv(),
        connectedPeers: this.listPeers(),
      });

      ws.on('message', (raw) => {
        if (!this.active) return;
        try {
          const parsed = JSON.parse(raw.toString('utf8')) as SignalClientEvent;
          this.handleClientEvent(ws, parsed);
        } catch {
          this.sendEvent(ws, { type: 'error', message: 'Invalid JSON signaling frame' });
        }
      });

      ws.on('close', () => {
        const peerId = this.wsToPeerId.get(ws);
        if (peerId) {
          this.wsToPeerId.delete(ws);
          this.peers.delete(peerId);
          this.broadcast({ type: 'peer:left', peerId });
        }
      });
    });
  }

  public setActive(next: boolean): void {
    this.active = next;
    if (!next) {
      for (const session of this.peers.values()) {
        session.ws.close(1012, 'Signaling service paused by node operator');
      }
      this.peers.clear();
      this.wsToPeerId.clear();
    }
  }

  public getStatus() {
    return {
      running: this.active,
      connectedPeers: this.peers.size,
      peers: this.listPeers(),
      iceServerCount: buildIceServersFromEnv().length,
      relayedCipherFrames: this.totalRelayedCipherFrames,
      zeroStoragePolicy: 'strict-no-private-storage',
    };
  }

  public listPeers(): PeerDescriptor[] {
    return Array.from(this.peers.values()).map((s) => s.descriptor);
  }

  public broadcastPublicPost(post: {
    id: string;
    handle: string;
    gameTag: string;
    content: string;
    createdAtMs: number;
  }): void {
    this.broadcast({ type: 'public:post', post });
  }

  private handleClientEvent(ws: WebSocket, event: SignalClientEvent): void {
    if (!event || typeof event.type !== 'string') return;

    if (event.type === 'ping') {
      this.sendEvent(ws, {
        type: 'pong',
        sentAt: typeof event.sentAt === 'number' ? event.sentAt : Date.now(),
        serverTime: Date.now(),
      });
      return;
    }

    if (event.type === 'peer:register') {
      const peerId = String(event.peerId || '').slice(0, 64);
      const handle = String(event.handle || 'Player').slice(0, 40);
      const fingerprint = String(event.fingerprint || '').slice(0, 64);
      if (!peerId) return;

      const descriptor: PeerDescriptor = {
        peerId,
        handle,
        fingerprint,
        exchangePublicKeyJwk: event.exchangePublicKeyJwk,
        signingPublicKeyJwk: event.signingPublicKeyJwk,
        rooms: ['lobby'],
        connectedAt: Date.now(),
      };

      this.peers.set(peerId, { ws, descriptor });
      this.wsToPeerId.set(ws, peerId);

      this.sendEvent(ws, { type: 'peer:list', peers: this.listPeers() });
      this.broadcast({ type: 'peer:joined', peer: descriptor }, peerId);
      return;
    }

    const fromPeerId = this.wsToPeerId.get(ws);
    if (!fromPeerId) {
      this.sendEvent(ws, { type: 'error', message: 'Register peer identity before signaling' });
      return;
    }

    const session = this.peers.get(fromPeerId);
    if (!session) return;

    if (event.type === 'room:join') {
      const roomId = String(event.roomId || '').slice(0, 64);
      if (roomId && !session.descriptor.rooms.includes(roomId)) {
        session.descriptor.rooms.push(roomId);
      }
      return;
    }

    if (event.type === 'room:leave') {
      const roomId = String(event.roomId || '').slice(0, 64);
      session.descriptor.rooms = session.descriptor.rooms.filter((r) => r !== roomId);
      return;
    }

    if (event.type === 'rtc:offer') {
      const target = this.peers.get(event.targetPeerId);
      if (target) {
        this.sendEvent(target.ws, {
          type: 'rtc:offer',
          fromPeerId,
          roomId: event.roomId,
          sdp: event.sdp,
          mediaMode: event.mediaMode,
        });
      }
      return;
    }

    if (event.type === 'rtc:answer') {
      const target = this.peers.get(event.targetPeerId);
      if (target) {
        this.sendEvent(target.ws, {
          type: 'rtc:answer',
          fromPeerId,
          roomId: event.roomId,
          sdp: event.sdp,
        });
      }
      return;
    }

    if (event.type === 'rtc:ice') {
      const target = this.peers.get(event.targetPeerId);
      if (target) {
        this.sendEvent(target.ws, {
          type: 'rtc:ice',
          fromPeerId,
          roomId: event.roomId,
          candidate: event.candidate,
        });
      }
      return;
    }

    if (event.type === 'p2p:sealed-relay') {
      // Ephemeral ciphertext forwarding ONLY: never stored, never inspected, never logged.
      this.totalRelayedCipherFrames += 1;
      const frame: SignalServerEvent = {
        type: 'p2p:sealed-relay',
        fromPeerId,
        roomId: event.roomId,
        envelope: event.envelope,
      };
      if (event.targetPeerId) {
        const target = this.peers.get(event.targetPeerId);
        if (target) this.sendEvent(target.ws, frame);
      } else {
        for (const [pid, peerSession] of this.peers.entries()) {
          if (pid !== fromPeerId && peerSession.descriptor.rooms.includes(event.roomId)) {
            this.sendEvent(peerSession.ws, frame);
          }
        }
      }
      return;
    }

    if (event.type === 'public:post' && event.post) {
      const cleanPost = {
        id: String(event.post.id || `pub-${Date.now()}`).slice(0, 64),
        handle: String(event.post.handle || session.descriptor.handle).slice(0, 40),
        gameTag: String(event.post.gameTag || '#Games').slice(0, 32),
        content: String(event.post.content || '').slice(0, 1000),
        createdAtMs: Number(event.post.createdAtMs) || Date.now(),
      };
      if (!cleanPost.content.trim()) return;
      this.options.onPublicPost?.(cleanPost);
      this.broadcast({ type: 'public:post', post: cleanPost }, fromPeerId);
    }
  }

  private sendEvent(ws: WebSocket, event: SignalServerEvent): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    }
  }

  private broadcast(event: SignalServerEvent, excludePeerId?: string): void {
    const encoded = JSON.stringify(event);
    for (const [peerId, session] of this.peers.entries()) {
      if (peerId !== excludePeerId && session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(encoded);
      }
    }
  }
}
