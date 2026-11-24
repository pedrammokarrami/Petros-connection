import crypto from 'node:crypto';

export interface NodeKeyPairBundle {
  nodeId: string;
  signingPublicKeyPem: string;
  signingPrivateKeyPem: string;
  exchangePublicKeyPem: string;
  exchangePrivateKeyPem: string;
  fingerprint: string;
}

export interface SignedEnvelope<T = unknown> {
  id: string;
  senderId: string;
  senderSigningPublicKeyPem: string;
  nonce: string;
  timestamp: number;
  payload: T;
  signature: string;
}

export interface EncryptedPayload {
  alg: 'X25519-HKDF-AES-256-GCM';
  senderExchangePublicKeyPem: string;
  iv: string;
  authTag: string;
  ciphertext: string;
  aad?: string;
}

/**
 * Generates an Ed25519 signing key pair and an X25519 Diffie-Hellman key pair
 * using Node's native OpenSSL crypto primitives (zero external dependencies).
 */
export function generateNodeKeyPairBundle(nodeId?: string): NodeKeyPairBundle {
  const signing = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const exchange = crypto.generateKeyPairSync('x25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const fingerprint = computePublicKeyFingerprint(signing.publicKey);
  const resolvedId = nodeId ?? `node_${fingerprint.slice(0, 12)}`;

  return {
    nodeId: resolvedId,
    signingPublicKeyPem: signing.publicKey,
    signingPrivateKeyPem: signing.privateKey,
    exchangePublicKeyPem: exchange.publicKey,
    exchangePrivateKeyPem: exchange.privateKey,
    fingerprint,
  };
}

export function computePublicKeyFingerprint(publicKeyPem: string): string {
  return crypto.createHash('sha256').update(publicKeyPem, 'utf8').digest('hex').slice(0, 32);
}

/**
 * Produces a deterministic canonical JSON representation so signature checks
 * are immune to object property ordering differences.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .filter((k) => record[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(record[k])}`)
    .join(',')}}`;
}

export function signPayload<T>(
  payload: T,
  identity: Pick<NodeKeyPairBundle, 'nodeId' | 'signingPublicKeyPem' | 'signingPrivateKeyPem'>,
): SignedEnvelope<T> {
  const id = crypto.randomUUID();
  const nonce = crypto.randomBytes(16).toString('base64url');
  const timestamp = Date.now();
  const signingInput = canonicalJson({
    id,
    senderId: identity.nodeId,
    nonce,
    timestamp,
    payload,
  });

  const signature = crypto
    .sign(null, Buffer.from(signingInput, 'utf8'), identity.signingPrivateKeyPem)
    .toString('base64url');

  return {
    id,
    senderId: identity.nodeId,
    senderSigningPublicKeyPem: identity.signingPublicKeyPem,
    nonce,
    timestamp,
    payload,
    signature,
  };
}

export function verifySignedEnvelope<T>(envelope: SignedEnvelope<T>): boolean {
  try {
    if (
      !envelope ||
      typeof envelope.id !== 'string' ||
      typeof envelope.senderId !== 'string' ||
      typeof envelope.senderSigningPublicKeyPem !== 'string' ||
      typeof envelope.nonce !== 'string' ||
      typeof envelope.timestamp !== 'number' ||
      typeof envelope.signature !== 'string'
    ) {
      return false;
    }

    const signingInput = canonicalJson({
      id: envelope.id,
      senderId: envelope.senderId,
      nonce: envelope.nonce,
      timestamp: envelope.timestamp,
      payload: envelope.payload,
    });

    return crypto.verify(
      null,
      Buffer.from(signingInput, 'utf8'),
      envelope.senderSigningPublicKeyPem,
      Buffer.from(envelope.signature, 'base64url'),
    );
  } catch {
    return false;
  }
}

/**
 * Derives a 256-bit symmetric session key via X25519 ECDH + HKDF-SHA256.
 */
export function deriveSharedSecretKey(
  localExchangePrivateKeyPem: string,
  remoteExchangePublicKeyPem: string,
  context = 'aigameria-p2p-e2ee-v1',
): Buffer {
  const privateKey = crypto.createPrivateKey(localExchangePrivateKeyPem);
  const publicKey = crypto.createPublicKey(remoteExchangePublicKeyPem);
  const sharedSecret = crypto.diffieHellman({ privateKey, publicKey });

  return Buffer.from(
    crypto.hkdfSync(
      'sha256',
      sharedSecret,
      Buffer.from('aigameria-hkdf-salt-v1', 'utf8'),
      Buffer.from(context, 'utf8'),
      32,
    ),
  );
}

/**
 * End-to-end encrypts plaintext for a specific peer using X25519 + AES-256-GCM.
 */
export function encryptForPeer(
  plaintext: string,
  senderExchangePrivateKeyPem: string,
  senderExchangePublicKeyPem: string,
  recipientExchangePublicKeyPem: string,
  aad?: string,
): EncryptedPayload {
  const key = deriveSharedSecretKey(senderExchangePrivateKeyPem, recipientExchangePublicKeyPem);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  if (aad) {
    cipher.setAAD(Buffer.from(aad, 'utf8'));
  }

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    alg: 'X25519-HKDF-AES-256-GCM',
    senderExchangePublicKeyPem,
    iv: iv.toString('base64url'),
    authTag: authTag.toString('base64url'),
    ciphertext: encrypted.toString('base64url'),
    aad,
  };
}

/**
 * Decrypts an X25519 + AES-256-GCM peer envelope. Throws if tampered or wrong key.
 */
export function decryptFromPeer(
  encrypted: EncryptedPayload,
  recipientExchangePrivateKeyPem: string,
): string {
  const key = deriveSharedSecretKey(
    recipientExchangePrivateKeyPem,
    encrypted.senderExchangePublicKeyPem,
  );
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(encrypted.iv, 'base64url'),
  );
  if (encrypted.aad) {
    decipher.setAAD(Buffer.from(encrypted.aad, 'utf8'));
  }
  decipher.setAuthTag(Buffer.from(encrypted.authTag, 'base64url'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, 'base64url')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

/**
 * Symmetric AES-256-GCM encryption for local SQLite storage at rest.
 */
export function encryptAtRest(plaintext: string, keyBytes: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBytes, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${enc.toString('base64url')}`;
}

export function decryptAtRest(sealed: string, keyBytes: Buffer): string {
  const parts = sealed.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('Unsupported encrypted-at-rest format');
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    keyBytes,
    Buffer.from(ivB64, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64url')),
    decipher.final(),
  ]);
  return dec.toString('utf8');
}

/**
 * Password / passphrase hashing via Node scrypt with per-secret random salt.
 */
export function hashSecretScrypt(secret: string): string {
  const salt = crypto.randomBytes(16).toString('base64url');
  const derived = crypto.scryptSync(secret, salt, 32).toString('base64url');
  return `scrypt$1$${salt}$${derived}`;
}

export function verifySecretScrypt(secret: string, storedHash: string): boolean {
  const parts = storedHash.split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt' || parts[1] !== '1') {
    return false;
  }
  const [, , salt, expectedB64] = parts;
  const candidate = crypto.scryptSync(secret, salt, 32);
  const expected = Buffer.from(expectedB64, 'base64url');
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

/**
 * Constant-time HMAC-SHA256 signing & verification for Bearer tokens and Telegram commands.
 */
export function signHmacToken(data: string, secret: Buffer | string): string {
  return crypto.createHmac('sha256', secret).update(data, 'utf8').digest('base64url');
}

export function verifyHmacToken(data: string, signature: string, secret: Buffer | string): boolean {
  const expected = signHmacToken(data, secret);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Replay protection guard rejecting expired timestamps and duplicate nonces.
 */
export class ReplayGuard {
  private readonly seen = new Map<string, number>();
  private readonly windowMs: number;
  private readonly maxEntries: number;

  constructor(windowMs = 5 * 60 * 1000, maxEntries = 5000) {
    this.windowMs = windowMs;
    this.maxEntries = maxEntries;
  }

  public checkAndRecord(nonce: string, timestamp: number, now = Date.now()): boolean {
    if (!nonce || nonce.length < 8 || !Number.isFinite(timestamp)) {
      return false;
    }
    if (Math.abs(now - timestamp) > this.windowMs) {
      return false;
    }

    this.prune(now);
    if (this.seen.has(nonce)) {
      return false;
    }

    if (this.seen.size >= this.maxEntries) {
      const oldestKey = this.seen.keys().next().value;
      if (oldestKey) this.seen.delete(oldestKey);
    }

    this.seen.set(nonce, now + this.windowMs);
    return true;
  }

  private prune(now: number): void {
    for (const [key, expiresAt] of this.seen.entries()) {
      if (expiresAt <= now) {
        this.seen.delete(key);
      }
    }
  }
}
