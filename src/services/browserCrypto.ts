/**
 * Browser-side WebCrypto E2EE Identity & Encrypted-at-Rest IndexedDB Vault.
 *
 * - Generates persistent ECDSA P-256 (signing) and ECDH P-256 (key agreement) keypairs
 *   plus a non-extractable AES-256-GCM master vault key stored inside IndexedDB.
 * - Private DMs & private squad messages can be encrypted at rest locally on the
 *   user's device and sealed end-to-end before leaving the browser.
 */

const DB_NAME = 'aigameria_e2ee_vault_v1';
const STORE_KEYS = 'crypto_keys';
const STORE_VAULT = 'encrypted_records';

export interface BrowserIdentitySnapshot {
  peerId: string;
  fingerprint: string;
  signingPublicKeyJwk: JsonWebKey;
  exchangePublicKeyJwk: JsonWebKey;
  vaultReady: boolean;
}

interface StoredKeyBundle {
  peerId: string;
  fingerprint: string;
  signingPair: CryptoKeyPair;
  exchangePair: CryptoKeyPair;
  vaultMasterKey: CryptoKey;
  signingPublicKeyJwk: JsonWebKey;
  exchangePublicKeyJwk: JsonWebKey;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(b64: string): Uint8Array {
  const padded = b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function openVaultDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_KEYS)) {
        db.createObjectStore(STORE_KEYS);
      }
      if (!db.objectStoreNames.contains(STORE_VAULT)) {
        db.createObjectStore(STORE_VAULT);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB vault'));
  });
}

async function idbGet<T>(db: IDBDatabase, storeName: string, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut<T>(db: IDBDatabase, storeName: string, key: string, value: T): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function idbClear(db: IDBDatabase, storeName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

let cachedBundle: StoredKeyBundle | null = null;

export async function getOrCreateBrowserIdentity(): Promise<StoredKeyBundle> {
  if (cachedBundle) return cachedBundle;

  const db = await openVaultDb();
  const existing = await idbGet<StoredKeyBundle>(db, STORE_KEYS, 'primary_identity');
  if (existing && existing.fingerprint && existing.vaultMasterKey) {
    cachedBundle = existing;
    return existing;
  }

  const signingPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign', 'verify'],
  );

  const exchangePair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveKey'],
  );

  const vaultMasterKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );

  const signingPublicKeyJwk = await crypto.subtle.exportKey('jwk', signingPair.publicKey);
  const exchangePublicKeyJwk = await crypto.subtle.exportKey('jwk', exchangePair.publicKey);

  const hashBuf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(signingPublicKeyJwk)),
  );
  const fingerprint = Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);

  const bundle: StoredKeyBundle = {
    peerId: `peer_${fingerprint.slice(0, 12)}`,
    fingerprint,
    signingPair,
    exchangePair,
    vaultMasterKey,
    signingPublicKeyJwk,
    exchangePublicKeyJwk,
  };

  await idbPut(db, STORE_KEYS, 'primary_identity', bundle);
  cachedBundle = bundle;
  return bundle;
}

export async function getBrowserIdentitySnapshot(): Promise<BrowserIdentitySnapshot> {
  const b = await getOrCreateBrowserIdentity();
  return {
    peerId: b.peerId,
    fingerprint: b.fingerprint,
    signingPublicKeyJwk: b.signingPublicKeyJwk,
    exchangePublicKeyJwk: b.exchangePublicKeyJwk,
    vaultReady: true,
  };
}

/**
 * Encrypts a private payload at rest inside local IndexedDB (AES-256-GCM).
 */
export async function saveEncryptedVaultRecord(recordKey: string, data: unknown): Promise<void> {
  const bundle = await getOrCreateBrowserIdentity();
  const db = await openVaultDb();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(data));
  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    bundle.vaultMasterKey,
    encoded,
  );

  await idbPut(db, STORE_VAULT, recordKey, {
    iv: bytesToBase64Url(iv),
    ciphertext: bytesToBase64Url(new Uint8Array(cipherBuf)),
    updatedAt: Date.now(),
  });
}

export async function readEncryptedVaultRecord<T>(recordKey: string): Promise<T | null> {
  const bundle = await getOrCreateBrowserIdentity();
  const db = await openVaultDb();
  const stored = await idbGet<{ iv: string; ciphertext: string }>(db, STORE_VAULT, recordKey);
  if (!stored) return null;

  try {
    const ivBytes = base64UrlToBytes(stored.iv);
    const cipherBytes = base64UrlToBytes(stored.ciphertext);
    const plainBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(ivBytes) },
      bundle.vaultMasterKey,
      new Uint8Array(cipherBytes),
    );
    return JSON.parse(new TextDecoder().decode(plainBuf)) as T;
  } catch {
    return null;
  }
}

export async function wipeEncryptedVaultRecords(): Promise<void> {
  const db = await openVaultDb();
  await idbClear(db, STORE_VAULT);
}

/**
 * End-to-end encrypts & signs a P2P chat message for a remote peer using ECDH P-256 + AES-256-GCM + ECDSA.
 */
export async function sealBrowserPeerEnvelope(
  plaintext: string,
  remoteExchangePublicKeyJwk: JsonWebKey,
  senderHandle: string,
): Promise<{
  id: string;
  senderHandle: string;
  senderFingerprint: string;
  iv: string;
  ciphertext: string;
  signature: string;
  nonce: string;
  timestamp: number;
}> {
  const bundle = await getOrCreateBrowserIdentity();
  const remotePub = await crypto.subtle.importKey(
    'jwk',
    remoteExchangePublicKeyJwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );

  const sharedAesKey = await crypto.subtle.deriveKey(
    { name: 'ECDH', public: remotePub },
    bundle.exchangePair.privateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    sharedAesKey,
    new TextEncoder().encode(plaintext),
  );

  const id = crypto.randomUUID();
  const nonce = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(12)));
  const timestamp = Date.now();
  const ivB64 = bytesToBase64Url(iv);
  const cipherB64 = bytesToBase64Url(new Uint8Array(cipherBuf));

  const sigInput = `${id}|${senderHandle}|${bundle.fingerprint}|${nonce}|${timestamp}|${ivB64}|${cipherB64}`;
  const sigBuf = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    bundle.signingPair.privateKey,
    new TextEncoder().encode(sigInput),
  );

  return {
    id,
    senderHandle,
    senderFingerprint: bundle.fingerprint,
    iv: ivB64,
    ciphertext: cipherB64,
    signature: bytesToBase64Url(new Uint8Array(sigBuf)),
    nonce,
    timestamp,
  };
}

export async function unsealBrowserPeerEnvelope(
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
  remoteExchangePublicKeyJwk: JsonWebKey,
  remoteSigningPublicKeyJwk?: JsonWebKey,
): Promise<string | null> {
  try {
    if (Math.abs(Date.now() - envelope.timestamp) > 5 * 60 * 1000) {
      return null;
    }

    if (remoteSigningPublicKeyJwk) {
      const verifyKey = await crypto.subtle.importKey(
        'jwk',
        remoteSigningPublicKeyJwk,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify'],
      );
      const sigInput = `${envelope.id}|${envelope.senderHandle}|${envelope.senderFingerprint}|${envelope.nonce}|${envelope.timestamp}|${envelope.iv}|${envelope.ciphertext}`;
      const sigBytes = base64UrlToBytes(envelope.signature);
      const valid = await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        verifyKey,
        new Uint8Array(sigBytes),
        new TextEncoder().encode(sigInput),
      );
      if (!valid) return null;
    }

    const bundle = await getOrCreateBrowserIdentity();
    const remotePub = await crypto.subtle.importKey(
      'jwk',
      remoteExchangePublicKeyJwk,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      [],
    );
    const sharedAesKey = await crypto.subtle.deriveKey(
      { name: 'ECDH', public: remotePub },
      bundle.exchangePair.privateKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt'],
    );

    const ivBytes = base64UrlToBytes(envelope.iv);
    const cipherBytes = base64UrlToBytes(envelope.ciphertext);
    const plainBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(ivBytes) },
      sharedAesKey,
      new Uint8Array(cipherBytes),
    );
    return new TextDecoder().decode(plainBuf);
  } catch {
    return null;
  }
}
