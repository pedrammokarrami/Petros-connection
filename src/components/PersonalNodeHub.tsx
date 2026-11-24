import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  Bot,
  Check,
  CloudUpload,
  Copy,
  KeyRound,
  Link2,
  Lock,
  Play,
  Radio,
  RefreshCw,
  Server,
  ShieldCheck,
  Square,
  Terminal,
  Trash2,
  Unlock,
} from 'lucide-react';
import { p2pClient, type P2PClientState } from '../services/p2pClient';
import { wipeEncryptedVaultRecords } from '../services/browserCrypto';
import { soundEngine } from '../utils/soundEngine';

interface ServiceItem {
  name: string;
  running: boolean;
  restarts: number;
  detail?: string;
}

interface EndpointItem {
  id: string;
  label: string;
  url: string;
  priority: number;
  active: boolean;
  healthy: boolean;
  latencyMs: number | null;
}

interface StreamSessionItem {
  id: string;
  title: string;
  hostHandle: string;
  mode: 'webrtc-p2p' | 'lan-hls';
  status: 'live' | 'ended';
  createdAt: number;
}

interface BrandedLinkItem {
  id: string;
  slug: string;
  provider: string;
  tier: 'temporary' | 'permanent';
  targetUrl: string;
  filename: string;
  sizeBytes: number;
  hits: number;
  brandedSlugUrl: string;
  proxyUrl: string;
}

interface ProviderItem {
  id: string;
  name: string;
  tier: 'temporary' | 'permanent';
  configured: boolean;
  requiresCredentials: boolean;
}

interface NodeStatusPayload {
  nodeId: string;
  fingerprint: string;
  publicBaseUrl: string;
  uptimeSec: number;
  auth: {
    mode: 'env-secret' | 'claimed' | 'unclaimed';
    requiresSetup: boolean;
  };
  services: ServiceItem[];
  p2p: {
    running: boolean;
    connectedPeers: number;
    iceServerCount: number;
    relayedCipherFrames: number;
  };
  lanDiscovery: {
    running: boolean;
    port: number;
    localAddresses: string[];
    discoveredNodes: Array<{ nodeId: string; address: string; port: number }>;
  };
  streaming: {
    running: boolean;
    liveCount: number;
    sessions: StreamSessionItem[];
  };
  endpoints: EndpointItem[];
  activeEndpoint: EndpointItem | null;
}

interface TelegramStatusPayload {
  configured: boolean;
  mode: 'webhook' | 'polling' | 'standby';
  pollingActive: boolean;
  webhookSecretConfigured: boolean;
  allowedChatsCount: number;
  webhookPath: string;
  recentCommands: Array<{ id: string; command: string; replyPreview: string; source: string }>;
}

interface PersonalNodeHubProps {
  onSendLinkToChat?: (url: string) => void;
}

export function PersonalNodeHub({ onSendLinkToChat }: PersonalNodeHubProps) {
  // Session Bearer token held strictly in React memory (never persisted to localStorage)
  const [operatorToken, setOperatorToken] = useState<string | null>(null);
  const [passphraseInput, setPassphraseInput] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  const [nodeStatus, setNodeStatus] = useState<NodeStatusPayload | null>(null);
  const [telegramStatus, setTelegramStatus] = useState<TelegramStatusPayload | null>(null);
  const [providers, setProviders] = useState<ProviderItem[]>([]);
  const [links, setLinks] = useState<BrandedLinkItem[]>([]);
  const [p2pState, setP2pState] = useState<P2PClientState>(() => p2pClient.getState());

  // Stream creator state
  const [streamTitle, setStreamTitle] = useState('LAN Squad Gameplay Feed');
  const [streamMode, setStreamMode] = useState<'webrtc-p2p' | 'lan-hls'>('lan-hls');
  const [createdStreamGuide, setCreatedStreamGuide] = useState<{
    watchUrl: string;
    ffmpegExample: string;
  } | null>(null);

  // Failover form state
  const [newEndpointLabel, setNewEndpointLabel] = useState('');
  const [newEndpointUrl, setNewEndpointUrl] = useState('');

  // Zero-disk uploader & custom branded link state
  const [uploadTier, setUploadTier] = useState<'temporary' | 'permanent'>('temporary');
  const [selectedProvider, setSelectedProvider] = useState('auto');
  const [customSlug, setCustomSlug] = useState('');
  const [pointerUrl, setPointerUrl] = useState('');
  const [uploadBusy, setUploadBusy] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Telegram remote command console
  const [tgCommand, setTgCommand] = useState('/status');
  const [tgReply, setTgReply] = useState<string | null>(null);

  const fetchAllStatus = useCallback(async () => {
    try {
      const [nodeRes, tgRes, provRes, linkRes] = await Promise.all([
        fetch('/api/node/status'),
        fetch('/api/telegram/status'),
        fetch('/api/upload/providers'),
        fetch('/api/links'),
      ]);
      if (nodeRes.ok) setNodeStatus((await nodeRes.json()) as NodeStatusPayload);
      if (tgRes.ok) setTelegramStatus((await tgRes.json()) as TelegramStatusPayload);
      if (provRes.ok) {
        const d = (await provRes.json()) as { providers?: ProviderItem[] };
        setProviders(d.providers ?? []);
      }
      if (linkRes.ok) {
        const d = (await linkRes.json()) as { links?: BrandedLinkItem[] };
        setLinks(d.links ?? []);
      }
    } catch {
      // Offline or restarting
    }
  }, []);

  useEffect(() => {
    void fetchAllStatus();
    const unsub = p2pClient.subscribeState(setP2pState);
    const timer = window.setInterval(() => void fetchAllStatus(), 15_000);
    return () => {
      unsub();
      window.clearInterval(timer);
    };
  }, [fetchAllStatus]);

  const copyText = (key: string, value: string) => {
    soundEngine.playConfirm();
    void navigator.clipboard?.writeText(value).catch(() => {});
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 1600);
  };

  const authHeaders = (): Record<string, string> =>
    operatorToken ? { Authorization: `Bearer ${operatorToken}` } : {};

  const handleOperatorAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (passphraseInput.trim().length < 8) {
      setAuthError('Enter a passphrase of at least 8 characters.');
      return;
    }
    setAuthBusy(true);
    try {
      const endpoint =
        nodeStatus?.auth.requiresSetup ? '/api/node/auth/claim' : '/api/node/auth/login';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passphrase: passphraseInput.trim() }),
      });
      const json = (await res.json()) as { ok?: boolean; token?: string; error?: string };
      if (!res.ok || !json.token) {
        setAuthError(json.error ?? 'Authentication failed.');
        return;
      }
      soundEngine.playConfirm();
      setOperatorToken(json.token);
      setPassphraseInput('');
      setStatusNotice('Operator controls unlocked for this session.');
      await fetchAllStatus();
    } catch {
      setAuthError('Unable to reach local node server.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleControlService = async (name: string, action: 'start' | 'stop' | 'restart') => {
    if (!operatorToken) {
      setStatusNotice('Unlock operator controls above to manage services.');
      return;
    }
    soundEngine.playToggle(action !== 'stop');
    const res = await fetch(`/api/node/services/${encodeURIComponent(name)}/${action}`, {
      method: 'POST',
      headers: authHeaders(),
    });
    if (res.ok) {
      setStatusNotice(`Service "${name}" ${action} completed.`);
      await fetchAllStatus();
    }
  };

  const handleAddFailover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!operatorToken) return;
    soundEngine.playConfirm();
    const res = await fetch('/api/node/failover/endpoints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ label: newEndpointLabel, url: newEndpointUrl }),
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) {
      setStatusNotice(json.error ?? 'Could not add failover endpoint.');
      return;
    }
    setNewEndpointLabel('');
    setNewEndpointUrl('');
    setStatusNotice('Failover backup node registered.');
    await fetchAllStatus();
  };

  const handleCheckFailover = async () => {
    if (!operatorToken) return;
    soundEngine.playNavTick();
    await fetch('/api/node/failover/check', { method: 'POST', headers: authHeaders() });
    setStatusNotice('Health & latency probes updated.');
    await fetchAllStatus();
  };

  const handleSwitchFailover = async (endpointId?: string) => {
    if (!operatorToken) return;
    soundEngine.playConfirm();
    const res = await fetch('/api/node/failover/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ endpointId }),
    });
    if (res.ok) {
      setStatusNotice('Active failover endpoint switched.');
      await fetchAllStatus();
    }
  };

  const handleStartStream = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!operatorToken) return;
    soundEngine.playConfirm();
    const res = await fetch('/api/streams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ title: streamTitle, mode: streamMode }),
    });
    const json = (await res.json()) as {
      watchUrl?: string;
      ffmpegExample?: string;
      error?: string;
    };
    if (!res.ok) {
      setStatusNotice(json.error ?? 'Failed to start local stream.');
      return;
    }
    if (json.watchUrl && json.ffmpegExample) {
      setCreatedStreamGuide({ watchUrl: json.watchUrl, ffmpegExample: json.ffmpegExample });
    }
    setStatusNotice('Local stream session is LIVE.');
    await fetchAllStatus();
  };

  const handleStopStream = async (streamId: string) => {
    if (!operatorToken) return;
    soundEngine.playSoftBack();
    await fetch(`/api/streams/${encodeURIComponent(streamId)}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    await fetchAllStatus();
  };

  const handleFileUpload = async (file: File) => {
    if (!operatorToken) {
      setStatusNotice('Unlock operator controls above before streaming uploads.');
      return;
    }
    setUploadBusy(true);
    setStatusNotice(null);
    try {
      const res = await fetch('/api/upload/stream', {
        method: 'POST',
        headers: {
          ...authHeaders(),
          'Content-Type': file.type || 'application/octet-stream',
          'X-File-Name': file.name,
          'X-Storage-Tier': uploadTier,
          'X-Storage-Provider': selectedProvider,
          'X-Custom-Slug': customSlug.trim(),
        },
        body: file,
      });
      const json = (await res.json()) as {
        link?: BrandedLinkItem;
        error?: string;
      };
      if (!res.ok || !json.link) {
        setStatusNotice(json.error ?? 'Upload failed.');
        return;
      }
      soundEngine.playConfirm();
      setCustomSlug('');
      setStatusNotice(
        `Streamed directly to ${json.link.provider} (0 B main server disk). Link ready: ${json.link.brandedSlugUrl}`,
      );
      await fetchAllStatus();
    } catch {
      setStatusNotice('Network error during zero-disk stream upload.');
    } finally {
      setUploadBusy(false);
    }
  };

  const handleCreateBrandedPointer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!operatorToken || !pointerUrl.trim()) return;
    setUploadBusy(true);
    try {
      const res = await fetch('/api/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          targetUrl: pointerUrl.trim(),
          slug: customSlug.trim() || undefined,
          tier: uploadTier,
        }),
      });
      const json = (await res.json()) as { link?: BrandedLinkItem; error?: string };
      if (!res.ok || !json.link) {
        setStatusNotice(json.error ?? 'Could not create branded link.');
        return;
      }
      soundEngine.playConfirm();
      setPointerUrl('');
      setCustomSlug('');
      setStatusNotice(`Branded link created: ${json.link.brandedSlugUrl}`);
      await fetchAllStatus();
    } finally {
      setUploadBusy(false);
    }
  };

  const handleDeleteLink = async (id: string) => {
    if (!operatorToken) return;
    soundEngine.playSoftBack();
    await fetch(`/api/links/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    await fetchAllStatus();
  };

  const handleRunTelegramCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!operatorToken || !tgCommand.trim()) return;
    soundEngine.playConfirm();
    const res = await fetch('/api/telegram/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ text: tgCommand.trim() }),
    });
    const json = (await res.json()) as { reply?: string; error?: string };
    setTgReply(json.reply ?? json.error ?? 'No response');
    await fetchAllStatus();
  };

  const handleWipeVault = async () => {
    soundEngine.playSoftBack();
    await wipeEncryptedVaultRecords();
    setStatusNotice('Local encrypted IndexedDB chat vault wiped cleanly.');
  };

  const visibleProviders = providers.filter((p) => p.tier === uploadTier || p.id === 'lan-ephemeral-ram');

  return (
    <div className="space-y-6">
      {/* 1. Personal Server & Operator Auth Lock */}
      <section className="glass-panel rounded-2xl p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Server className="h-5 w-5 text-[#FF9F43]" aria-hidden="true" />
            <div>
              <h2 className="text-base font-semibold text-white">
                Personal Server Engine &amp; Failover
              </h2>
              <p className="text-xs text-[#9B8FB8]">
                Zero-cost self-hosted node · Node ID:{' '}
                <span className="font-mono text-[#E4DDF5]">{nodeStatus?.nodeId ?? 'connecting...'}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium ${
                operatorToken
                  ? 'border-[#34D399]/40 bg-[#34D399]/12 text-[#6EE7B7]'
                  : 'border-[#FF9F43]/40 bg-[#FF9F43]/12 text-[#FFBE76]'
              }`}
            >
              {operatorToken ? (
                <>
                  <Unlock className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Operator Unlocked</span>
                </>
              ) : (
                <>
                  <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Read-Only</span>
                </>
              )}
            </span>

            <button
              type="button"
              onClick={() => void fetchAllStatus()}
              aria-label="Refresh personal node status"
              className="tactile-btn rounded-xl border border-white/12 bg-white/[0.04] p-2 text-[#C7BEDB] hover:bg-white/[0.1] hover:text-white"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* First-Run Claim or Operator Passphrase Unlock */}
        {!operatorToken ? (
          <form
            onSubmit={handleOperatorAuth}
            className="rounded-xl border border-[#FF6B35]/30 bg-[#120A24]/80 p-4 space-y-3"
          >
            <div className="flex items-center gap-2 text-xs font-semibold text-[#FFBE76]">
              <KeyRound className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                {nodeStatus?.auth.requiresSetup
                  ? 'First-Run Setup: Claim your Personal Server Passphrase'
                  : 'Unlock Personal Server Controls'}
              </span>
            </div>
            <p className="text-xs text-[#A79BC2]">
              {nodeStatus?.auth.requiresSetup
                ? 'Choose a passphrase (8+ characters) stored hashed on your server to protect service controls, streaming, uploads, and failover.'
                : 'Enter your personal node passphrase (or NODE_CONTROL_SECRET) to control services, streams, and uploads.'}
            </p>
            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                type="password"
                value={passphraseInput}
                onChange={(e) => setPassphraseInput(e.target.value)}
                placeholder={
                  nodeStatus?.auth.requiresSetup
                    ? 'Create operator passphrase (8+ chars)...'
                    : 'Enter operator passphrase...'
                }
                className="h-10 flex-1 rounded-xl border border-white/12 bg-[#0D091A] px-3.5 text-sm text-white placeholder:text-[#7E7299]"
              />
              <button
                type="submit"
                disabled={authBusy}
                className="tactile-btn h-10 rounded-xl bg-gradient-to-r from-[#FF6B35] to-[#FF3E8A] px-4 text-xs font-semibold text-white whitespace-nowrap disabled:opacity-50"
              >
                {nodeStatus?.auth.requiresSetup ? 'Claim & Unlock Node' : 'Unlock Controls'}
              </button>
            </div>
            {authError ? <p className="text-xs text-[#FF6DA6]">{authError}</p> : null}
          </form>
        ) : null}

        {statusNotice ? (
          <div className="rounded-xl border border-[#22D3EE]/30 bg-[#22D3EE]/10 px-3.5 py-2.5 text-xs text-[#A5F3FC] flex items-center justify-between gap-2">
            <span className="break-all">{statusNotice}</span>
            <button
              type="button"
              onClick={() => setStatusNotice(null)}
              className="text-[11px] font-semibold text-white/80 hover:text-white shrink-0"
            >
              Dismiss
            </button>
          </div>
        ) : null}

        {/* Managed Services Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(nodeStatus?.services ?? []).map((svc) => (
            <div
              key={svc.name}
              className="rounded-xl border border-white/[0.08] bg-[#120C24]/75 p-3.5 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${svc.running ? 'bg-[#34D399]' : 'bg-[#FF3E8A]'}`}
                  />
                  <p className="text-xs font-semibold text-white truncate font-mono">{svc.name}</p>
                </div>
                <p className="mt-0.5 text-[11px] text-[#9B8FB8] truncate">{svc.detail}</p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  disabled={!operatorToken}
                  onClick={() => void handleControlService(svc.name, svc.running ? 'stop' : 'start')}
                  className="tactile-btn rounded-lg border border-white/12 bg-white/[0.05] px-2.5 py-1 text-[11px] font-medium text-[#E4DDF5] hover:bg-white/[0.1] disabled:opacity-40"
                >
                  {svc.running ? 'Stop' : 'Start'}
                </button>
                <button
                  type="button"
                  disabled={!operatorToken}
                  onClick={() => void handleControlService(svc.name, 'restart')}
                  className="tactile-btn rounded-lg border border-[#22D3EE]/30 bg-[#22D3EE]/10 px-2 py-1 text-[11px] font-medium text-[#A5F3FC] hover:bg-[#22D3EE]/20 disabled:opacity-40"
                >
                  Restart
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Failover Endpoints */}
        <div className="rounded-xl border border-white/[0.08] bg-[#0D091A]/65 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-[#22D3EE]" aria-hidden="true" />
              <h3 className="text-xs font-semibold text-white">Failover &amp; Takeover Nodes</h3>
            </div>
            <button
              type="button"
              disabled={!operatorToken}
              onClick={() => void handleCheckFailover()}
              className="tactile-btn rounded-lg border border-white/12 bg-white/[0.05] px-2.5 py-1 text-[11px] font-medium text-[#C7BEDB] hover:text-white disabled:opacity-40"
            >
              Run Health Probe
            </button>
          </div>

          <ul className="space-y-2">
            {(nodeStatus?.endpoints ?? []).map((ep) => (
              <li
                key={ep.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white">{ep.label}</span>
                    {ep.active ? (
                      <span className="rounded bg-[#34D399]/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#6EE7B7]">
                        ACTIVE
                      </span>
                    ) : null}
                  </div>
                  <p className="font-mono text-[11px] text-[#9B8FB8] truncate">
                    {ep.url} · {ep.healthy ? `OK (${ep.latencyMs ?? 1} ms)` : 'Offline'}
                  </p>
                </div>

                {!ep.active ? (
                  <button
                    type="button"
                    disabled={!operatorToken}
                    onClick={() => void handleSwitchFailover(ep.id)}
                    className="tactile-btn rounded-lg border border-[#FF9F43]/35 bg-[#FF6B35]/15 px-2.5 py-1 text-[11px] font-semibold text-[#FFBE76] disabled:opacity-40"
                  >
                    Switch Active
                  </button>
                ) : null}
              </li>
            ))}
          </ul>

          <form onSubmit={handleAddFailover} className="grid grid-cols-1 sm:grid-cols-[1fr_1.4fr_auto] gap-2">
            <input
              type="text"
              value={newEndpointLabel}
              onChange={(e) => setNewEndpointLabel(e.target.value)}
              placeholder="Backup node name (e.g. Home Backup)"
              disabled={!operatorToken}
              className="h-9 rounded-lg border border-white/12 bg-[#120A24] px-3 text-xs text-white placeholder:text-[#7E7299] disabled:opacity-40"
            />
            <input
              type="url"
              value={newEndpointUrl}
              onChange={(e) => setNewEndpointUrl(e.target.value)}
              placeholder="https://backup-node.example.com"
              disabled={!operatorToken}
              className="h-9 rounded-lg border border-white/12 bg-[#120A24] px-3 text-xs text-white placeholder:text-[#7E7299] disabled:opacity-40"
            />
            <button
              type="submit"
              disabled={!operatorToken || !newEndpointLabel.trim() || !newEndpointUrl.trim()}
              className="tactile-btn h-9 rounded-lg border border-[#22D3EE]/35 bg-[#22D3EE]/12 px-3 text-xs font-semibold text-[#A5F3FC] disabled:opacity-40 whitespace-nowrap"
            >
              Add Backup
            </button>
          </form>
        </div>

        {/* One-Command Self-Host Snippet */}
        <div className="rounded-xl border border-white/[0.08] bg-[#0D091A]/80 p-3.5 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-[#A79BC2]">
              Spin up your free personal server anywhere (Linux / macOS / Docker):
            </p>
            <code className="mt-1 block font-mono text-xs text-[#67E8F9] truncate">
              bash scripts/start-personal-node.sh # or: docker compose up -d
            </code>
          </div>
          <button
            type="button"
            onClick={() => copyText('cli', 'bash scripts/start-personal-node.sh')}
            className="tactile-btn inline-flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.05] px-2.5 py-1.5 text-xs text-[#E4DDF5]"
          >
            {copiedKey === 'cli' ? <Check className="h-3.5 w-3.5 text-[#34D399]" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copiedKey === 'cli' ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </section>

      {/* 2. E2EE P2P Transport & Encrypted Local IndexedDB Vault */}
      <section className="glass-panel rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-5 w-5 text-[#34D399]" aria-hidden="true" />
            <div>
              <h2 className="text-base font-semibold text-white">
                E2EE P2P Messaging &amp; Encrypted Device Vault
              </h2>
              <p className="text-xs text-[#9B8FB8]">
                Private DMs &amp; squad rooms travel peer-to-peer (ECDH + AES-256-GCM + ECDSA) with zero central server storage.
              </p>
            </div>
          </div>
          <span className="rounded-lg border border-[#34D399]/35 bg-[#34D399]/10 px-2.5 py-1 font-mono text-xs text-[#6EE7B7]">
            WS: {p2pState.status.toUpperCase()}
            {p2pState.latencyMs ? ` · ${p2pState.latencyMs}ms` : ''}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="rounded-xl border border-white/[0.08] bg-[#120C24]/75 p-3">
            <p className="text-[#9B8FB8]">Device Key Fingerprint</p>
            <p className="mt-1 font-mono text-[#67E8F9] truncate">
              {p2pState.identity?.fingerprint ?? 'Initializing WebCrypto...'}
            </p>
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-[#120C24]/75 p-3">
            <p className="text-[#9B8FB8]">Live P2P Signaling</p>
            <p className="mt-1 font-mono text-white">
              {p2pState.peers.length} peer(s) · {p2pState.activeDataChannels} WebRTC channel(s)
            </p>
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-[#120C24]/75 p-3 flex items-center justify-between gap-2">
            <div>
              <p className="text-[#9B8FB8]">IndexedDB Vault</p>
              <p className="mt-1 font-mono text-[#6EE7B7]">AES-256-GCM At Rest</p>
            </div>
            <button
              type="button"
              onClick={() => void handleWipeVault()}
              className="tactile-btn rounded-lg border border-[#FF3E8A]/35 bg-[#FF3E8A]/10 px-2.5 py-1 text-[11px] font-semibold text-[#FF8BB8] hover:bg-[#FF3E8A]/20"
            >
              Wipe Local
            </button>
          </div>
        </div>
      </section>

      {/* 3. Local Low-Latency Streaming Engine */}
      <section className="glass-panel rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2.5">
          <Radio className="h-5 w-5 text-[#FF3E8A]" aria-hidden="true" />
          <div>
            <h2 className="text-base font-semibold text-white">
              Local Streaming Engine (LAN HLS &amp; WebRTC P2P)
            </h2>
            <p className="text-xs text-[#9B8FB8]">
              Stream gameplay across your LAN or directly to squadmates via WebRTC — zero paid cloud streaming servers, zero disk writes.
            </p>
          </div>
        </div>

        <form onSubmit={handleStartStream} className="grid grid-cols-1 sm:grid-cols-[1.5fr_auto_auto] gap-2.5">
          <input
            type="text"
            value={streamTitle}
            onChange={(e) => setStreamTitle(e.target.value)}
            placeholder="Stream title..."
            disabled={!operatorToken}
            className="h-10 rounded-xl border border-white/12 bg-[#0D091A] px-3.5 text-sm text-white disabled:opacity-40"
          />
          <select
            value={streamMode}
            onChange={(e) => setStreamMode(e.target.value as 'webrtc-p2p' | 'lan-hls')}
            disabled={!operatorToken}
            className="h-10 rounded-xl border border-white/12 bg-[#0D091A] px-3 text-xs text-white disabled:opacity-40"
          >
            <option value="lan-hls">LAN HLS (OBS / FFmpeg)</option>
            <option value="webrtc-p2p">WebRTC P2P Direct</option>
          </select>
          <button
            type="submit"
            disabled={!operatorToken}
            className="tactile-btn inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#FF6B35] to-[#FF3E8A] px-4 text-xs font-semibold text-white disabled:opacity-40 whitespace-nowrap"
          >
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Start Stream</span>
          </button>
        </form>

        {createdStreamGuide ? (
          <div className="rounded-xl border border-[#22D3EE]/30 bg-[#0D091A]/80 p-3.5 space-y-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-[#67E8F9]">Watch / Playlist URL:</span>
              <button
                type="button"
                onClick={() => copyText('stream-url', createdStreamGuide.watchUrl)}
                className="text-[11px] text-white/80 hover:text-white underline"
              >
                {copiedKey === 'stream-url' ? 'Copied!' : 'Copy URL'}
              </button>
            </div>
            <code className="block font-mono text-[11px] text-[#E4DDF5] break-all">
              {createdStreamGuide.watchUrl}
            </code>
            <p className="text-[11px] text-[#9B8FB8] pt-1">Local SRT → LAN HLS FFmpeg bridge command:</p>
            <code className="block font-mono text-[11px] text-[#FFBE76] break-all">
              {createdStreamGuide.ffmpegExample}
            </code>
          </div>
        ) : null}

        {(nodeStatus?.streaming.sessions ?? []).length > 0 ? (
          <ul className="space-y-2">
            {(nodeStatus?.streaming.sessions ?? []).slice(0, 5).map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.07] bg-[#120C24]/75 px-3.5 py-2.5 text-xs"
              >
                <div>
                  <span className="font-semibold text-white">{s.title}</span>{' '}
                  <span className="font-mono text-[11px] text-[#9B8FB8]">
                    ({s.mode} · {s.id})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`font-mono text-[11px] font-semibold ${
                      s.status === 'live' ? 'text-[#34D399]' : 'text-[#8F83AB]'
                    }`}
                  >
                    {s.status.toUpperCase()}
                  </span>
                  {s.status === 'live' ? (
                    <button
                      type="button"
                      disabled={!operatorToken}
                      onClick={() => void handleStopStream(s.id)}
                      className="tactile-btn inline-flex items-center gap-1 rounded-lg border border-[#FF3E8A]/35 bg-[#FF3E8A]/12 px-2 py-1 text-[11px] text-[#FF8BB8] disabled:opacity-40"
                    >
                      <Square className="h-3 w-3" aria-hidden="true" />
                      <span>Stop</span>
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {/* 4. Zero-Server-Disk Free Cloud Uploader & Custom Branded Links */}
      <section className="glass-panel rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <CloudUpload className="h-5 w-5 text-[#22D3EE]" aria-hidden="true" />
            <div>
              <h2 className="text-base font-semibold text-white">
                Zero-Disk Free Cloud Uploader &amp; Custom Branded Links
              </h2>
              <p className="text-xs text-[#9B8FB8]">
                Streams files directly to free temp/permanent cloud providers (0 bytes stored on main server disk) and mints clean <code className="text-[#67E8F9]">/s/&lt;slug&gt;</code> links.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <select
            value={uploadTier}
            onChange={(e) => {
              setUploadTier(e.target.value as 'temporary' | 'permanent');
              setSelectedProvider('auto');
            }}
            className="h-10 rounded-xl border border-white/12 bg-[#0D091A] px-3 text-xs text-white"
          >
            <option value="temporary">Temporary Free Cloud (Clips / Shares)</option>
            <option value="permanent">Permanent Free Cloud (GitHub / IPFS / Catbox)</option>
          </select>

          <select
            value={selectedProvider}
            onChange={(e) => setSelectedProvider(e.target.value)}
            className="h-10 rounded-xl border border-white/12 bg-[#0D091A] px-3 text-xs text-white"
          >
            <option value="auto">Auto Failover Chain (Recommended)</option>
            {visibleProviders.map((p) => (
              <option key={p.id} value={p.id} disabled={!p.configured}>
                {p.name} {p.configured ? '' : '(set env key)'}
              </option>
            ))}
          </select>

          <input
            type="text"
            value={customSlug}
            onChange={(e) => setCustomSlug(e.target.value)}
            placeholder="Custom slug (e.g. clutch-ace)"
            className="h-10 rounded-xl border border-white/12 bg-[#0D091A] px-3 text-xs text-white placeholder:text-[#7E7299]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFileUpload(file);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            disabled={!operatorToken || uploadBusy}
            onClick={() => fileInputRef.current?.click()}
            className="tactile-btn inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-[#FF6B35] to-[#FF3E8A] px-4 text-xs font-semibold text-white disabled:opacity-40"
          >
            <CloudUpload className="h-4 w-4" aria-hidden="true" />
            <span>{uploadBusy ? 'Streaming...' : 'Stream File to Free Cloud'}</span>
          </button>

          <form onSubmit={handleCreateBrandedPointer} className="flex flex-1 min-w-[220px] gap-2">
            <input
              type="url"
              value={pointerUrl}
              onChange={(e) => setPointerUrl(e.target.value)}
              placeholder="Or paste any public file/media URL to brand under /s/..."
              disabled={!operatorToken}
              className="h-10 flex-1 rounded-xl border border-white/12 bg-[#0D091A] px-3 text-xs text-white placeholder:text-[#7E7299] disabled:opacity-40"
            />
            <button
              type="submit"
              disabled={!operatorToken || !pointerUrl.trim() || uploadBusy}
              className="tactile-btn inline-flex h-10 items-center gap-1.5 rounded-xl border border-[#22D3EE]/35 bg-[#22D3EE]/12 px-3.5 text-xs font-semibold text-[#A5F3FC] disabled:opacity-40 whitespace-nowrap"
            >
              <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Mint Link</span>
            </button>
          </form>
        </div>

        {/* Active Custom Server-Branded Links */}
        {links.length > 0 ? (
          <ul className="space-y-2">
            {links.slice(0, 8).map((link) => (
              <li
                key={link.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.08] bg-[#120C24]/75 px-3.5 py-2.5 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <a
                    href={link.brandedSlugUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono font-semibold text-[#67E8F9] hover:underline break-all"
                  >
                    {link.brandedSlugUrl}
                  </a>
                  <p className="text-[11px] text-[#9B8FB8] truncate">
                    {link.filename} · {link.provider} ({link.tier}) · {link.hits} hits
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => copyText(link.id, link.brandedSlugUrl)}
                    className="tactile-btn rounded-lg border border-white/12 bg-white/[0.05] px-2.5 py-1 text-[11px] text-white"
                  >
                    {copiedKey === link.id ? 'Copied' : 'Copy'}
                  </button>
                  {onSendLinkToChat ? (
                    <button
                      type="button"
                      onClick={() => onSendLinkToChat(link.brandedSlugUrl)}
                      className="tactile-btn rounded-lg border border-[#FF9F43]/35 bg-[#FF6B35]/15 px-2.5 py-1 text-[11px] font-semibold text-[#FFBE76]"
                    >
                      Send to Chat
                    </button>
                  ) : null}
                  {operatorToken ? (
                    <button
                      type="button"
                      onClick={() => void handleDeleteLink(link.id)}
                      aria-label={`Delete link ${link.slug}`}
                      className="tactile-btn rounded-lg p-1.5 text-[#9B8FB8] hover:text-[#FF6DA6]"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-[#8F83AB]">
            No custom branded links minted yet. Stream a file or paste a public URL above to create your first <code className="text-[#C7BEDB]">/s/&lt;slug&gt;</code> link.
          </p>
        )}
      </section>

      {/* 5. Telegram Bot Control & Failover Automation Bridge */}
      <section className="glass-panel rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <Bot className="h-5 w-5 text-[#22D3EE]" aria-hidden="true" />
            <div>
              <h2 className="text-base font-semibold text-white">
                Telegram Bot Control &amp; Automatic Failover Bridge
              </h2>
              <p className="text-xs text-[#9B8FB8]">
                Mode: <span className="font-mono text-[#67E8F9]">{telegramStatus?.mode ?? 'standby'}</span> · Webhook:{' '}
                <code className="text-[#E4DDF5]">{telegramStatus?.webhookPath ?? '/api/telegram/webhook'}</code>
              </p>
            </div>
          </div>
          <span className="rounded-lg border border-white/12 bg-white/[0.04] px-2.5 py-1 font-mono text-[11px] text-[#C7BEDB]">
            {telegramStatus?.configured
              ? `${telegramStatus.allowedChatsCount} Authorized Chat(s)`
              : 'Set TELEGRAM_BOT_TOKEN in .env'}
          </span>
        </div>

        <form onSubmit={handleRunTelegramCommand} className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Terminal
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8F83AB]"
              aria-hidden="true"
            />
            <input
              type="text"
              value={tgCommand}
              onChange={(e) => setTgCommand(e.target.value)}
              placeholder="/status, /services, /failover, /stream start, /links"
              disabled={!operatorToken}
              className="h-10 w-full rounded-xl border border-white/12 bg-[#0D091A] pl-9 pr-3 font-mono text-xs text-white placeholder:text-[#7E7299] disabled:opacity-40"
            />
          </div>
          <button
            type="submit"
            disabled={!operatorToken}
            className="tactile-btn h-10 rounded-xl border border-[#22D3EE]/40 bg-[#22D3EE]/15 px-4 text-xs font-semibold text-[#A5F3FC] hover:bg-[#22D3EE]/25 disabled:opacity-40 whitespace-nowrap"
          >
            Run Bot Command
          </button>
        </form>

        <div className="flex flex-wrap gap-1.5">
          {['/status', '/services', '/stream start', '/failover', '/links', '/help'].map((cmd) => (
            <button
              key={cmd}
              type="button"
              onClick={() => setTgCommand(cmd)}
              className="tactile-btn rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[11px] text-[#C7BEDB] hover:border-[#22D3EE]/40 hover:text-white"
            >
              {cmd}
            </button>
          ))}
        </div>

        {tgReply ? (
          <pre className="rounded-xl border border-white/[0.08] bg-[#0D091A]/90 p-3.5 font-mono text-xs text-[#A5F3FC] whitespace-pre-wrap break-words">
            {tgReply}
          </pre>
        ) : null}
      </section>
    </div>
  );
}
