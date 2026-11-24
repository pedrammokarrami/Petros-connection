import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decryptAtRest,
  encryptAtRest,
  generateNodeKeyPairBundle,
  hashSecretScrypt,
  ReplayGuard,
  signPayload,
  verifySecretScrypt,
  verifySignedEnvelope,
} from './identity';
import { sealAndSignPeerMessage, verifyAndUnsealPeerMessage } from './envelope';
import crypto from 'node:crypto';

test('Ed25519 signPayload and verifySignedEnvelope detect tampering', () => {
  const alice = generateNodeKeyPairBundle('alice_node');
  const signed = signPayload({ action: 'failover', target: 'backup-1' }, alice);
  assert.equal(verifySignedEnvelope(signed), true);

  const tampered = { ...signed, payload: { action: 'failover', target: 'evil-node' } };
  assert.equal(verifySignedEnvelope(tampered), false);
});

test('X25519 + AES-256-GCM E2EE envelope encrypts, verifies, and rejects replay & wrong keys', () => {
  const alice = generateNodeKeyPairBundle('alice_node');
  const bob = generateNodeKeyPairBundle('bob_node');
  const eve = generateNodeKeyPairBundle('eve_node');
  const replayGuard = new ReplayGuard();

  const sealed = sealAndSignPeerMessage(
    'Meet on B site in 30 seconds — private strat!',
    'dm:alice:bob',
    'dm',
    alice,
    bob.exchangePublicKeyPem,
  );

  // Valid decryption by Bob
  const ok = verifyAndUnsealPeerMessage(sealed, bob.exchangePrivateKeyPem, replayGuard);
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.plaintext, 'Meet on B site in 30 seconds — private strat!');
    assert.equal(ok.senderId, 'alice_node');
  }

  // Replaying exact same envelope is rejected
  const replayed = verifyAndUnsealPeerMessage(sealed, bob.exchangePrivateKeyPem, replayGuard);
  assert.equal(replayed.ok, false);

  // Wrong recipient (Eve) cannot decrypt even with fresh replay guard
  const eveGuard = new ReplayGuard();
  const wrongKey = verifyAndUnsealPeerMessage(sealed, eve.exchangePrivateKeyPem, eveGuard);
  assert.equal(wrongKey.ok, false);
});

test('AES-256-GCM at-rest encryption and scrypt passphrase verification work cleanly', () => {
  const key = crypto.randomBytes(32);
  const sealed = encryptAtRest('sensitive-node-config', key);
  assert.notEqual(sealed, 'sensitive-node-config');
  assert.equal(decryptAtRest(sealed, key), 'sensitive-node-config');

  const hash = hashSecretScrypt('SuperSecretSquadPass99');
  assert.equal(verifySecretScrypt('SuperSecretSquadPass99', hash), true);
  assert.equal(verifySecretScrypt('WrongPassword', hash), false);
});
