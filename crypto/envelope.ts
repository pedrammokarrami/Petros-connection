import {
  decryptFromPeer,
  encryptForPeer,
  ReplayGuard,
  signPayload,
  verifySignedEnvelope,
  type EncryptedPayload,
  type NodeKeyPairBundle,
  type SignedEnvelope,
} from './identity';

export interface SealedPeerMessage {
  roomId: string;
  channelType: 'dm' | 'private-squad';
  encrypted: EncryptedPayload;
}

export type SignedSealedMessage = SignedEnvelope<SealedPeerMessage>;

/**
 * Wraps a private DM or private squad message in X25519+AES-256-GCM encryption
 * and signs the outer envelope with the sender's Ed25519 key.
 * Neither the signaling server nor any relay can read or alter the message.
 */
export function sealAndSignPeerMessage(
  plaintext: string,
  roomId: string,
  channelType: 'dm' | 'private-squad',
  senderIdentity: NodeKeyPairBundle,
  recipientExchangePublicKeyPem: string,
): SignedSealedMessage {
  const aad = `${channelType}:${roomId}:${senderIdentity.nodeId}`;
  const encrypted = encryptForPeer(
    plaintext,
    senderIdentity.exchangePrivateKeyPem,
    senderIdentity.exchangePublicKeyPem,
    recipientExchangePublicKeyPem,
    aad,
  );

  return signPayload<SealedPeerMessage>(
    {
      roomId,
      channelType,
      encrypted,
    },
    senderIdentity,
  );
}

/**
 * Verifies Ed25519 signature + replay guard, then decrypts the E2EE payload.
 */
export function verifyAndUnsealPeerMessage(
  envelope: SignedSealedMessage,
  recipientExchangePrivateKeyPem: string,
  replayGuard: ReplayGuard,
): { ok: true; plaintext: string; senderId: string; timestamp: number } | { ok: false; reason: string } {
  if (!verifySignedEnvelope(envelope)) {
    return { ok: false, reason: 'Invalid Ed25519 signature' };
  }

  if (!replayGuard.checkAndRecord(envelope.nonce, envelope.timestamp)) {
    return { ok: false, reason: 'Replayed or expired message envelope' };
  }

  try {
    const plaintext = decryptFromPeer(envelope.payload.encrypted, recipientExchangePrivateKeyPem);
    return {
      ok: true,
      plaintext,
      senderId: envelope.senderId,
      timestamp: envelope.timestamp,
    };
  } catch {
    return { ok: false, reason: 'Failed to decrypt E2EE ciphertext' };
  }
}
