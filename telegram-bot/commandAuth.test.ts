import assert from 'node:assert/strict';
import test from 'node:test';
import { ReplayGuard } from '../crypto/identity';
import {
  isAuthorizedTelegramChat,
  parseTelegramCommand,
  signTelegramControlCommand,
  verifySignedTelegramControlCommand,
  verifyTelegramWebhookSecret,
} from './commandAuth';

test('Telegram webhook secret & allowed chat ID checks enforce strict authorization', () => {
  assert.equal(verifyTelegramWebhookSecret('secret-token-123', 'secret-token-123'), true);
  assert.equal(verifyTelegramWebhookSecret('wrong-token', 'secret-token-123'), false);
  assert.equal(verifyTelegramWebhookSecret('secret-token-123', ''), false);

  assert.equal(isAuthorizedTelegramChat(987654321, '111222, 987654321'), true);
  assert.equal(isAuthorizedTelegramChat(555555, '111222, 987654321'), false);
  assert.equal(isAuthorizedTelegramChat(987654321, ''), false);
});

test('parseTelegramCommand handles bot mentions and arguments cleanly', () => {
  const parsed = parseTelegramCommand('/failover@AigameriaNodeBot backup-eu-1');
  assert.ok(parsed);
  assert.equal(parsed.command, 'failover');
  assert.deepEqual(parsed.args, ['backup-eu-1']);

  assert.equal(parseTelegramCommand('/unknowncmd'), null);
  assert.equal(parseTelegramCommand('hello world'), null);
});

test('Signed Telegram control commands verify HMAC and block replays', () => {
  const guard = new ReplayGuard();
  const secret = 'node-webhook-signing-secret';
  const signed = signTelegramControlCommand({ chatId: '12345', text: '/restart local-streaming' }, secret);

  assert.equal(verifySignedTelegramControlCommand(signed, secret, guard).ok, true);
  // Second attempt with same nonce is blocked
  assert.equal(verifySignedTelegramControlCommand(signed, secret, guard).ok, false);
  // Tampered command text is rejected
  const tampered = { ...signed, text: '/stop p2p-signaling', nonce: 'fresh-nonce-123456' };
  assert.equal(verifySignedTelegramControlCommand(tampered, secret, guard).ok, false);
});
