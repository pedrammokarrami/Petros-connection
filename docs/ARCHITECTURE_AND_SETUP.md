# AIGAMERIA Backend, P2P, Local Streaming & Zero-Disk Cloud Architecture

Zero-cost, privacy-first, modular personal node engine for the **AIGAMERIA** text-based gaming social platform.

## 1. Modular Folder Architecture

| Directory | Responsibility |
| --- | --- |
| `crypto/` | Node Ed25519 signing/verification, X25519 ECDH + HKDF-SHA256 + AES-256-GCM peer E2EE, encrypted-at-rest SQLite helpers, `scrypt` passphrase hashing, HMAC-SHA256 tokens, and `ReplayGuard`. |
| `p2p/` | Zero-storage WebSocket signaling server (`/ws/signal`), WebRTC SDP/ICE & ephemeral ciphertext relay, free STUN + optional self-hosted `coturn` HMAC credentials, and UDP multicast LAN discovery (`lanDiscovery.ts`). |
| `personal-server/` | Local encrypted-at-rest SQLite metadata store (`localStore.ts`), service lifecycle controller (`nodeController.ts`), automated failover health monitor, and `/api/node/*` REST routes. |
| `streaming/` | Low-latency local streaming engine (`streamEngine.ts`, `streamRouter.ts`) supporting direct WebRTC peer streaming and zero-disk LAN HLS rolling ring-buffer playback (`/api/streams/:id/live.m3u8`). |
| `telegram-bot/` | Automated Telegram Bot controller (`botBridge.ts`, `commandAuth.ts`) supporting authenticated webhooks, zero-URL long-polling, HMAC signed commands, remote service/stream management, and automatic failover takeover alerts. |
| `cloud-uploader/` | Pluggable free cloud adapter architecture (`types.ts`, `providers.ts`, `uploadPipeline.ts`) routing temporary (Litterbox, Tmpfiles) and permanent (GitHub Releases, IPFS/Pinata, Catbox) uploads directly without writing file bytes to the main server disk. |
| `link-router/` | Custom server-branded link resolver (`router.ts`) serving `/s/:slug` and `/f/:id` via zero-bandwidth 302 redirects or optional `?proxy=1` zero-disk pass-through streaming. |
| `src/services/` | Browser WebCrypto E2EE keypair + IndexedDB encrypted-at-rest vault (`browserCrypto.ts`) and live WebSocket/WebRTC P2P client (`p2pClient.ts`). |

---

## 2. Privacy & Zero-Storage Guarantees

1. **Private DMs & Private Squads:** Encrypted end-to-end on client devices and delivered peer-to-peer over WebRTC DataChannels. If symmetric NAT blocks direct UDP, `/ws/signal` forwards opaque client-encrypted envelopes in memory without logging or saving them.
2. **Public Discovery Feed:** Opt-in public posts only (`/api/node/public-feed` & `public:post` WS events).
3. **Zero Main Server Disk Usage for Files:** `/api/upload/stream` routes incoming streams straight into free temporary/permanent cloud providers and records only tiny metadata pointers (`slug -> targetUrl`) in local SQLite.

---

## 3. REST & WebSocket API Contracts

### WebSocket Signaling (`/ws/signal`)
- **Client → Server:** `peer:register`, `room:join`, `room:leave`, `rtc:offer`, `rtc:answer`, `rtc:ice`, `p2p:sealed-relay`, `public:post`, `ping`
- **Server → Client:** `welcome` (includes STUN/TURN `iceServers` & peer list), `peer:list`, `peer:joined`, `peer:left`, `rtc:offer`, `rtc:answer`, `rtc:ice`, `p2p:sealed-relay`, `public:post`, `pong`, `error`

### REST Endpoints
- `GET /api/health` — Node health probe used by failover monitors.
- `GET /api/node/status` — Node identity fingerprint, service states, P2P stats, LAN discovery, failover endpoints, and storage policy.
- `POST /api/node/auth/claim` — One-time first-run operator passphrase setup (disabled automatically if `NODE_CONTROL_SECRET` is configured).
- `POST /api/node/auth/login` — Exchange passphrase for an in-memory `Authorization: Bearer <token>` session.
- `POST /api/node/services/:name/:action` — Start, stop, or restart `p2p-signaling`, `lan-discovery`, `local-streaming`, `telegram-bridge`, or `link-router`.
- `GET/POST/DELETE /api/node/failover/endpoints`, `POST /api/node/failover/check`, `POST /api/node/failover/switch` — Manage failover nodes and trigger takeover.
- `GET/POST/DELETE /api/streams`, `GET /api/streams/:id/live.m3u8`, `PUT/GET /api/streams/:id/segments/:name` — Local WebRTC & zero-disk LAN HLS streaming.
- `GET /api/upload/providers`, `POST /api/upload/stream` — Direct stream upload to temporary/permanent free cloud providers.
- `GET/POST/DELETE /api/links`, `GET /s/:slug`, `GET /f/:id` — Custom server-branded links (`?proxy=1` for zero-disk pass-through).
- `GET /api/telegram/status`, `POST /api/telegram/webhook`, `POST /api/telegram/signed-command`, `POST /api/telegram/command` — Telegram Bot control bridge.

---

## 4. Zero-Cost Self-Hosting Quick Start

### Option A: Single-Command Local Launch (macOS / Linux / WSL)
```bash
bash scripts/start-personal-node.sh
```

### Option B: Docker / Docker Compose (with optional free `coturn` NAT relay)
```bash
cp .env.example .env
docker compose up -d --build
# Optional strict-NAT relay:
docker compose --profile relay up -d
```

### Option C: Connect a Free Telegram Bot Controller
1. Message `@BotFather` on Telegram → `/newbot` → copy the token into `TELEGRAM_BOT_TOKEN`.
2. Add your numeric Telegram user ID to `TELEGRAM_ALLOWED_CHAT_IDS`.
3. Set `TELEGRAM_MODE=polling` (works behind home routers with no public IP!) or set `TELEGRAM_MODE=webhook` + `TELEGRAM_WEBHOOK_SECRET` and point Telegram's webhook to `https://your-node-domain/api/telegram/webhook`.
4. Send `/status`, `/services`, `/restart local-streaming`, `/stream start`, `/failover`, or `/upload <url> <slug>` directly from Telegram.
