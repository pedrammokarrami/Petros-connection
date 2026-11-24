import type {
  IceServerConfig,
  PeerDescriptor,
  SignalClientEvent,
  SignalServerEvent,
} from '../../p2p/protocol';
import {
  getBrowserIdentitySnapshot,
  sealBrowserPeerEnvelope,
  unsealBrowserPeerEnvelope,
  type BrowserIdentitySnapshot,
} from './browserCrypto';

export interface P2PClientState {
  status: 'disconnected' | 'connecting' | 'connected';
  nodeId: string | null;
  latencyMs: number | null;
  peers: PeerDescriptor[];
  activeDataChannels: number;
  identity: BrowserIdentitySnapshot | null;
}

export interface IncomingP2PMessage {
  roomId: string;
  senderHandle: string;
  senderFingerprint: string;
  content: string;
  transport: 'webrtc-datachannel' | 'e2ee-relay';
  timestamp: number;
}

type StateListener = (state: P2PClientState) => void;
type MessageListener = (msg: IncomingP2PMessage) => void;

/**
 * Browser P2P Networking Client:
 * - Connects to the Personal Node WebSocket signaling server at `/ws/signal`.
 * - Negotiates real direct WebRTC DataChannels (with free STUN + optional TURN fallback).
 * - Encrypts private messages end-to-end using WebCrypto ECDH + AES-256-GCM + ECDSA.
 * - Auto-reconnects cleanly if the network drops.
 */
export class AigameriaP2PClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private iceServers: IceServerConfig[] = [];
  private readonly peerConnections = new Map<string, RTCPeerConnection>();
  private readonly dataChannels = new Map<string, RTCDataChannel>();
  private readonly stateListeners = new Set<StateListener>();
  private readonly messageListeners = new Set<MessageListener>();
  private seenNonces = new Set<string>();
  private handle = 'AIGAMERIA_OP';
  private closedManually = false;

  private state: P2PClientState = {
    status: 'disconnected',
    nodeId: null,
    latencyMs: null,
    peers: [],
    activeDataChannels: 0,
    identity: null,
  };

  public getState(): P2PClientState {
    return this.state;
  }

  public subscribeState(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => this.stateListeners.delete(listener);
  }

  public subscribeMessages(listener: MessageListener): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  public async connect(handle: string): Promise<void> {
    this.handle = handle;
    this.closedManually = false;

    const identity = await getBrowserIdentitySnapshot();
    this.patchState({ identity, status: 'connecting' });

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${window.location.host}/ws/signal`;

    try {
      const ws = new WebSocket(wsUrl);
      this.ws = ws;

      ws.onopen = () => {
        this.patchState({ status: 'connected' });
        this.sendSignal({
          type: 'peer:register',
          peerId: identity.peerId,
          handle: this.handle,
          fingerprint: identity.fingerprint,
          exchangePublicKeyJwk: identity.exchangePublicKeyJwk,
          signingPublicKeyJwk: identity.signingPublicKeyJwk,
        });
        this.sendSignal({ type: 'ping', sentAt: Date.now() });

        if (this.pingTimer) clearInterval(this.pingTimer);
        this.pingTimer = setInterval(() => {
          this.sendSignal({ type: 'ping', sentAt: Date.now() });
        }, 15_000);
      };

      ws.onmessage = (ev) => {
        try {
          const event = JSON.parse(String(ev.data)) as SignalServerEvent;
          void this.handleServerEvent(event);
        } catch {
          // Ignore invalid frames
        }
      };

      ws.onclose = () => {
        this.patchState({ status: 'disconnected' });
        if (this.pingTimer) {
          clearInterval(this.pingTimer);
          this.pingTimer = null;
        }
        if (!this.closedManually) {
          this.reconnectTimer = setTimeout(() => {
            void this.connect(this.handle);
          }, 4000);
        }
      };
    } catch {
      this.patchState({ status: 'disconnected' });
    }
  }

  public disconnect(): void {
    this.closedManually = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    for (const pc of this.peerConnections.values()) {
      pc.close();
    }
    this.peerConnections.clear();
    this.dataChannels.clear();
    this.ws?.close();
    this.ws = null;
    this.patchState({ status: 'disconnected', activeDataChannels: 0 });
  }

  public joinRoom(roomId: string): void {
    this.sendSignal({ type: 'room:join', roomId });
  }

  /**
   * Sends an E2EE private message directly via WebRTC DataChannel if open,
   * or falls back to sealed zero-storage ciphertext relay over WebSocket.
   */
  public async sendPrivateMessage(roomId: string, content: string): Promise<number> {
    const myPeerId = this.state.identity?.peerId;
    const remotePeers = this.state.peers.filter(
      (p) => p.peerId !== myPeerId && p.exchangePublicKeyJwk,
    );
    let delivered = 0;

    for (const peer of remotePeers) {
      if (!peer.exchangePublicKeyJwk) continue;
      const envelope = await sealBrowserPeerEnvelope(
        content,
        peer.exchangePublicKeyJwk,
        this.handle,
      );

      const dc = this.dataChannels.get(peer.peerId);
      if (dc && dc.readyState === 'open') {
        dc.send(JSON.stringify({ kind: 'e2ee-msg', roomId, envelope }));
        delivered += 1;
      } else {
        this.sendSignal({
          type: 'p2p:sealed-relay',
          targetPeerId: peer.peerId,
          roomId,
          envelope,
        });
        delivered += 1;
      }
    }

    return delivered;
  }

  public async initiatePeerConnection(remotePeerId: string, roomId = 'lobby'): Promise<void> {
    if (typeof RTCPeerConnection === 'undefined') return;
    if (this.peerConnections.has(remotePeerId)) return;

    const pc = this.createPeerConnection(remotePeerId, roomId);
    const dc = pc.createDataChannel('aigameria-e2ee', { ordered: true });
    this.bindDataChannel(remotePeerId, dc);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.sendSignal({
      type: 'rtc:offer',
      targetPeerId: remotePeerId,
      roomId,
      sdp: offer,
      mediaMode: 'data',
    });
  }

  private createPeerConnection(remotePeerId: string, roomId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection({
      iceServers: this.iceServers.length
        ? (this.iceServers as RTCIceServer[])
        : [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        this.sendSignal({
          type: 'rtc:ice',
          targetPeerId: remotePeerId,
          roomId,
          candidate: ev.candidate.toJSON(),
        });
      }
    };

    pc.ondatachannel = (ev) => {
      this.bindDataChannel(remotePeerId, ev.channel);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.peerConnections.delete(remotePeerId);
        this.dataChannels.delete(remotePeerId);
        this.updateChannelCount();
      }
    };

    this.peerConnections.set(remotePeerId, pc);
    return pc;
  }

  private bindDataChannel(remotePeerId: string, dc: RTCDataChannel): void {
    this.dataChannels.set(remotePeerId, dc);
    dc.onopen = () => this.updateChannelCount();
    dc.onclose = () => {
      this.dataChannels.delete(remotePeerId);
      this.updateChannelCount();
    };
    dc.onmessage = (ev) => {
      try {
        const packet = JSON.parse(String(ev.data)) as {
          kind?: string;
          roomId?: string;
          envelope?: {
            id: string;
            senderHandle: string;
            senderFingerprint: string;
            iv: string;
            ciphertext: string;
            signature: string;
            nonce: string;
            timestamp: number;
          };
        };
        if (packet.kind === 'e2ee-msg' && packet.envelope && packet.roomId) {
          void this.handleIncomingEncryptedEnvelope(
            remotePeerId,
            packet.roomId,
            packet.envelope,
            'webrtc-datachannel',
          );
        }
      } catch {
        // Ignore non-JSON frames
      }
    };
  }

  private async handleIncomingEncryptedEnvelope(
    fromPeerId: string,
    roomId: string,
    envelope: {
      id: string;
      senderHandle: string;
      senderFingerprint: string;
      iv: string;
      ciphertext: string;
      signature: string;
      nonce: string;
      timestamp: number;
    },
    transport: 'webrtc-datachannel' | 'e2ee-relay',
  ): Promise<void> {
    if (this.seenNonces.has(envelope.nonce)) return;
    this.seenNonces.add(envelope.nonce);
    if (this.seenNonces.size > 2000) {
      this.seenNonces.clear();
    }

    const remotePeer = this.state.peers.find((p) => p.peerId === fromPeerId);
    if (!remotePeer?.exchangePublicKeyJwk) return;

    const plaintext = await unsealBrowserPeerEnvelope(
      envelope,
      remotePeer.exchangePublicKeyJwk,
      remotePeer.signingPublicKeyJwk,
    );
    if (!plaintext) return;

    for (const listener of this.messageListeners) {
      listener({
        roomId,
        senderHandle: envelope.senderHandle,
        senderFingerprint: envelope.senderFingerprint,
        content: plaintext,
        transport,
        timestamp: envelope.timestamp,
      });
    }
  }

  private async handleServerEvent(event: SignalServerEvent): Promise<void> {
    switch (event.type) {
      case 'welcome':
        this.iceServers = event.iceServers;
        this.patchState({ nodeId: event.nodeId, peers: event.connectedPeers });
        break;
      case 'peer:list':
        this.patchState({ peers: event.peers });
        break;
      case 'peer:joined': {
        const exists = this.state.peers.some((p) => p.peerId === event.peer.peerId);
        const nextPeers = exists
          ? this.state.peers.map((p) => (p.peerId === event.peer.peerId ? event.peer : p))
          : [...this.state.peers, event.peer];
        this.patchState({ peers: nextPeers });
        // Deterministic offer tie-breaker so only one peer initiates WebRTC DataChannel
        if (
          this.state.identity &&
          this.state.identity.peerId < event.peer.peerId &&
          event.peer.peerId !== this.state.identity.peerId
        ) {
          void this.initiatePeerConnection(event.peer.peerId);
        }
        break;
      }
      case 'peer:left':
        this.peerConnections.get(event.peerId)?.close();
        this.peerConnections.delete(event.peerId);
        this.dataChannels.delete(event.peerId);
        this.patchState({
          peers: this.state.peers.filter((p) => p.peerId !== event.peerId),
          activeDataChannels: this.countOpenChannels(),
        });
        break;
      case 'rtc:offer': {
        if (typeof RTCPeerConnection === 'undefined') return;
        const pc = this.peerConnections.get(event.fromPeerId) ?? this.createPeerConnection(event.fromPeerId, event.roomId);
        await pc.setRemoteDescription(new RTCSessionDescription(event.sdp as RTCSessionDescriptionInit));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.sendSignal({
          type: 'rtc:answer',
          targetPeerId: event.fromPeerId,
          roomId: event.roomId,
          sdp: answer,
        });
        break;
      }
      case 'rtc:answer': {
        const pc = this.peerConnections.get(event.fromPeerId);
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(event.sdp as RTCSessionDescriptionInit));
        }
        break;
      }
      case 'rtc:ice': {
        const pc = this.peerConnections.get(event.fromPeerId);
        if (pc && event.candidate) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(event.candidate as RTCIceCandidateInit));
          } catch {
            // Ignore race candidates before remote description
          }
        }
        break;
      }
      case 'p2p:sealed-relay':
        await this.handleIncomingEncryptedEnvelope(
          event.fromPeerId,
          event.roomId,
          event.envelope,
          'e2ee-relay',
        );
        break;
      case 'pong':
        this.patchState({ latencyMs: Math.max(1, Date.now() - event.sentAt) });
        break;
    }
  }

  private countOpenChannels(): number {
    let count = 0;
    for (const dc of this.dataChannels.values()) {
      if (dc.readyState === 'open') count += 1;
    }
    return count;
  }

  private updateChannelCount(): void {
    this.patchState({ activeDataChannels: this.countOpenChannels() });
  }

  private sendSignal(event: SignalClientEvent): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(event));
    }
  }

  private patchState(patch: Partial<P2PClientState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.stateListeners) {
      listener(this.state);
    }
  }
}

export const p2pClient = new AigameriaP2PClient();
