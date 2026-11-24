export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface PeerDescriptor {
  peerId: string;
  handle: string;
  fingerprint: string;
  exchangePublicKeyJwk?: JsonWebKey;
  signingPublicKeyJwk?: JsonWebKey;
  rooms: string[];
  connectedAt: number;
}

/**
 * Events sent from Browser / Local Node clients to the signaling WebSocket server.
 * Note: Private DM / Private Squad plaintext is NEVER sent over WebSocket signaling;
 * only WebRTC SDP/ICE descriptors or E2EE-sealed ciphertext frames traverse the wire.
 */
export type SignalClientEvent =
  | {
      type: 'peer:register';
      peerId: string;
      handle: string;
      fingerprint: string;
      exchangePublicKeyJwk?: JsonWebKey;
      signingPublicKeyJwk?: JsonWebKey;
    }
  | {
      type: 'room:join';
      roomId: string;
    }
  | {
      type: 'room:leave';
      roomId: string;
    }
  | {
      type: 'rtc:offer';
      targetPeerId: string;
      roomId: string;
      sdp: unknown;
      mediaMode?: 'data' | 'stream';
    }
  | {
      type: 'rtc:answer';
      targetPeerId: string;
      roomId: string;
      sdp: unknown;
    }
  | {
      type: 'rtc:ice';
      targetPeerId: string;
      roomId: string;
      candidate: unknown;
    }
  | {
      /**
       * Ephemeral zero-storage fallback when direct WebRTC DataChannel is blocked
       * by symmetric NAT. Payload MUST be E2EE ciphertext sealed by the client.
       * Server forwards immediately in memory and NEVER logs or persists it.
       */
      type: 'p2p:sealed-relay';
      targetPeerId?: string;
      roomId: string;
      envelope: {
        id: string;
        senderHandle: string;
        senderFingerprint: string;
        iv: string;
        ciphertext: string;
        signature: string;
        nonce: string;
        timestamp: number;
      };
    }
  | {
      type: 'public:post';
      post: {
        id: string;
        handle: string;
        gameTag: string;
        content: string;
        createdAtMs: number;
      };
    }
  | {
      type: 'ping';
      sentAt: number;
    };

/**
 * Events sent from the Signaling WebSocket server to connected peers.
 */
export type SignalServerEvent =
  | {
      type: 'welcome';
      nodeId: string;
      iceServers: IceServerConfig[];
      connectedPeers: PeerDescriptor[];
    }
  | {
      type: 'peer:list';
      peers: PeerDescriptor[];
    }
  | {
      type: 'peer:joined';
      peer: PeerDescriptor;
    }
  | {
      type: 'peer:left';
      peerId: string;
    }
  | {
      type: 'rtc:offer';
      fromPeerId: string;
      roomId: string;
      sdp: unknown;
      mediaMode?: 'data' | 'stream';
    }
  | {
      type: 'rtc:answer';
      fromPeerId: string;
      roomId: string;
      sdp: unknown;
    }
  | {
      type: 'rtc:ice';
      fromPeerId: string;
      roomId: string;
      candidate: unknown;
    }
  | {
      type: 'p2p:sealed-relay';
      fromPeerId: string;
      roomId: string;
      envelope: {
        id: string;
        senderHandle: string;
        senderFingerprint: string;
        iv: string;
        ciphertext: string;
        signature: string;
        nonce: string;
        timestamp: number;
      };
    }
  | {
      type: 'public:post';
      post: {
        id: string;
        handle: string;
        gameTag: string;
        content: string;
        createdAtMs: number;
      };
    }
  | {
      type: 'pong';
      sentAt: number;
      serverTime: number;
    }
  | {
      type: 'error';
      message: string;
    };
