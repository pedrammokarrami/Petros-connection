import crypto from 'node:crypto';
import { ReplayGuard, signHmacToken, verifyHmacToken } from '../crypto/identity';

export type TelegramCommandType =
  | 'status'
  | 'services'
  | 'start'
  | 'stop'
  | 'restart'
  | 'stream'
  | 'failover'
  | 'links'
  | 'upload'
  | 'help';

export interface ParsedTelegramCommand {
  command: TelegramCommandType;
  args: string[];
  raw: string;
}

export interface SignedTelegramCommandPayload {
  chatId: string;
  text: string;
  nonce: string;
  timestamp: number;
  signature: string;
}

/**
 * Constant-time check for Telegram's X-Telegram-Bot-Api-Secret-Token header.
 */
export function verifyTelegramWebhookSecret(
  headerSecret: string | undefined,
  configuredSecret: string | undefined,
): boolean {
  if (!configuredSecret?.trim()) return false;
  if (!headerSecret) return false;
  const a = Buffer.from(headerSecret, 'utf8');
  const b = Buffer.from(configuredSecret.trim(), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Checks whether a Telegram chat ID is authorized in TELEGRAM_ALLOWED_CHAT_IDS.
 */
export function isAuthorizedTelegramChat(
  chatId: string | number,
  allowedCsv: string | undefined,
): boolean {
  if (!allowedCsv?.trim()) return false;
  const normalized = String(chatId).trim();
  const allowed = allowedCsv
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  return allowed.includes(normalized);
}

/**
 * Signs and verifies remote control commands with HMAC-SHA256 + ReplayGuard.
 */
export function signTelegramControlCommand(
  input: { chatId: string; text: string; nonce?: string; timestamp?: number },
  secret: string,
): SignedTelegramCommandPayload {
  const nonce = input.nonce ?? crypto.randomBytes(12).toString('base64url');
  const timestamp = input.timestamp ?? Date.now();
  const canonical = `${input.chatId}|${timestamp}|${nonce}|${input.text.trim()}`;
  const signature = signHmacToken(canonical, secret);
  return {
    chatId: input.chatId,
    text: input.text.trim(),
    nonce,
    timestamp,
    signature,
  };
}

export function verifySignedTelegramControlCommand(
  payload: SignedTelegramCommandPayload,
  secret: string,
  replayGuard: ReplayGuard,
): { ok: true } | { ok: false; reason: string } {
  if (!secret.trim()) {
    return { ok: false, reason: 'Command signing secret is not configured.' };
  }
  const canonical = `${payload.chatId}|${payload.timestamp}|${payload.nonce}|${payload.text.trim()}`;
  if (!verifyHmacToken(canonical, payload.signature, secret)) {
    return { ok: false, reason: 'Invalid command HMAC signature.' };
  }
  if (!replayGuard.checkAndRecord(payload.nonce, payload.timestamp)) {
    return { ok: false, reason: 'Command nonce replayed or timestamp expired.' };
  }
  return { ok: true };
}

/**
 * Parses slash commands cleanly (supports `/status@MyBotName arg1 arg2`).
 */
export function parseTelegramCommand(rawText: string): ParsedTelegramCommand | null {
  const trimmed = rawText.trim();
  if (!trimmed.startsWith('/')) return null;

  const parts = trimmed.split(/\s+/);
  const head = parts[0].slice(1).split('@')[0].toLowerCase();
  const args = parts.slice(1);

  const validCommands: TelegramCommandType[] = [
    'status',
    'services',
    'start',
    'stop',
    'restart',
    'stream',
    'failover',
    'links',
    'upload',
    'help',
  ];

  if (!validCommands.includes(head as TelegramCommandType)) {
    return null;
  }

  return {
    command: head as TelegramCommandType,
    args,
    raw: trimmed,
  };
}
