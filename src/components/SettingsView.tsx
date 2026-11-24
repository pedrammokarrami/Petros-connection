import {
  Bot,
  Gamepad2,
  Network,
  Plus,
  Trash2,
  Volume2,
} from 'lucide-react';
import type { AutomationRule, LocalBridgeSettings } from '../types';
import type { NetworkMetrics } from '../utils/appLogic';
import { PersonalNodeHub } from './PersonalNodeHub';

interface SettingsViewProps {
  settings: LocalBridgeSettings;
  network: NetworkMetrics;
  rules: AutomationRule[];
  onUpdateSettings: (patch: Partial<LocalBridgeSettings>) => void;
  onTogglePlatform: (platformId: string) => void;
  onToggleRule: (ruleId: string) => void;
  onDeleteRule: (ruleId: string) => void;
  onOpenCreateRule: () => void;
  onTestSound: () => void;
  onSendLinkToChat?: (url: string) => void;
}

interface SwitchRowProps {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}

function SwitchRow({ id, label, description, checked, onChange }: SwitchRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <label htmlFor={id} className="block text-sm font-medium text-white cursor-pointer">
          {label}
        </label>
        <p className="mt-0.5 text-xs text-[#9B8FB8]">{description}</p>
      </div>

      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`tactile-btn relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors ${
          checked
            ? 'border-[#FF6B35]/60 bg-gradient-to-r from-[#FF6B35] to-[#FF3E8A]'
            : 'border-white/15 bg-white/10'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}

export function SettingsView({
  settings,
  network,
  rules,
  onUpdateSettings,
  onTogglePlatform,
  onToggleRule,
  onDeleteRule,
  onOpenCreateRule,
  onTestSound,
  onSendLinkToChat,
}: SettingsViewProps) {
  const strengthColor =
    network.label === 'Optimal'
      ? 'from-[#22D3EE] to-[#34D399]'
      : network.label === 'Strong'
        ? 'from-[#FF9F43] to-[#22D3EE]'
        : network.label === 'Standard'
          ? 'from-[#FF6B35] to-[#FF9F43]'
          : 'from-[#FF3E8A] to-[#FF6B35]';

  return (
    <div className="space-y-6">
      <header className="glass-panel rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
            Settings &amp; Local Bridge
          </h1>
          <p className="mt-0.5 text-sm text-[#A79BC2]">
            Simple controls for your local connection, game sync, audio feedback, and text automation.
          </p>
        </div>

        <button
          type="button"
          onClick={onTestSound}
          className="tactile-btn inline-flex h-10 items-center gap-2 rounded-xl border border-[#22D3EE]/35 bg-[#22D3EE]/10 px-3.5 text-xs font-semibold text-[#A5F3FC] hover:bg-[#22D3EE]/18 whitespace-nowrap"
        >
          <Volume2 className="h-4 w-4" aria-hidden="true" />
          <span>Test Click Audio</span>
        </button>
      </header>

      {/* Local Node & Sound */}
      <section className="glass-panel rounded-2xl p-5 space-y-5">
        <div className="flex items-center gap-2.5">
          <Network className="h-5 w-5 text-[#22D3EE]" aria-hidden="true" />
          <h2 className="text-base font-semibold text-white">Local Node</h2>
        </div>

        <div className="divide-y divide-white/[0.06]">
          <SwitchRow
            id="toggle-p2p"
            label="Local P2P Connection"
            description="Connect directly with nearby squadmates for faster text sync and lower latency."
            checked={settings.p2pEnabled}
            onChange={(next) => onUpdateSettings({ p2pEnabled: next })}
          />

          <div className="py-4 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="slider-max-peers" className="text-sm font-medium text-white">
                Max Network Peers
              </label>
              <span className="font-mono tabular-nums text-sm font-semibold text-[#FF9F43]">
                {settings.maxPeers} peers
              </span>
            </div>
            <input
              id="slider-max-peers"
              type="range"
              min={4}
              max={64}
              step={2}
              value={settings.maxPeers}
              onChange={(e) => onUpdateSettings({ maxPeers: Number(e.target.value) })}
              className="sunset-slider w-full cursor-pointer"
            />
            <div className="flex justify-between text-[11px] font-mono tabular-nums text-[#8F83AB]">
              <span>4 (Light)</span>
              <span>32 (Balanced)</span>
              <span>64 (Max Mesh)</span>
            </div>
          </div>

          <SwitchRow
            id="toggle-relay"
            label="Relay Bridge"
            description="Keep rooms reachable even when a teammate is behind strict router settings."
            checked={settings.relayBridgeEnabled}
            onChange={(next) => onUpdateSettings({ relayBridgeEnabled: next })}
          />

          <SwitchRow
            id="toggle-sfx-settings"
            label="Interface Click Sounds"
            description="Play subtle synthesized feedback ticks on navigation, votes, and switches."
            checked={settings.soundEnabled}
            onChange={(next) => onUpdateSettings({ soundEnabled: next })}
          />
        </div>

        {/* Network Strength Indicator */}
        <div className="rounded-xl border border-white/[0.08] bg-[#0D091A]/65 p-4 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-medium text-[#C7BEDB]">Network Strength</span>
            <span className="font-mono tabular-nums font-semibold text-white">
              {network.label} · {network.strengthPercent}% · {network.estimatedPingMs} ms
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full rounded-full bg-gradient-to-r ${strengthColor} transition-all duration-200`}
              style={{ width: `${network.strengthPercent}%` }}
            />
          </div>
        </div>
      </section>

      {/* Game Integrations */}
      <section className="glass-panel rounded-2xl p-5 space-y-5">
        <div className="flex items-center gap-2.5">
          <Gamepad2 className="h-5 w-5 text-[#FF9F43]" aria-hidden="true" />
          <h2 className="text-base font-semibold text-white">Game Integrations</h2>
        </div>

        <div className="divide-y divide-white/[0.06]">
          <SwitchRow
            id="toggle-auto-detect"
            label="Auto-Detect Installed Games"
            description="Automatically show your active title to squadmates when you launch a game."
            checked={settings.autoDetectGames}
            onChange={(next) => onUpdateSettings({ autoDetectGames: next })}
          />
          <SwitchRow
            id="toggle-sync-progress"
            label="Sync Game Progress"
            description="Verify match milestones and display clean achievement badges on your profile."
            checked={settings.syncGameProgress}
            onChange={(next) => onUpdateSettings({ syncGameProgress: next })}
          />
          <SwitchRow
            id="toggle-api-overlay"
            label="Allow Game API Overlay"
            description="Enable a minimal text-only squad notification strip while playing fullscreen."
            checked={settings.allowApiOverlay}
            onChange={(next) => onUpdateSettings({ allowApiOverlay: next })}
          />
        </div>

        <div className="space-y-2.5 pt-2">
          <h3 className="text-xs font-semibold text-[#A79BC2]">Connected Game Platforms</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
            {settings.platforms.map((platform) => (
              <button
                key={platform.id}
                type="button"
                aria-pressed={platform.connected}
                onClick={() => onTogglePlatform(platform.id)}
                className={`tactile-btn rounded-xl border p-3 text-left transition-colors ${
                  platform.connected
                    ? 'border-[#22D3EE]/45 bg-[#22D3EE]/12 text-white'
                    : 'border-white/10 bg-white/[0.03] text-[#B5A9CE] hover:bg-white/[0.07]'
                }`}
              >
                <p className="text-sm font-semibold truncate">{platform.name}</p>
                <p className="mt-1 text-xs font-mono tabular-nums text-[#9B8FB8]">
                  {platform.connected ? `Connected · ${platform.installedGames}` : 'Disconnected'}
                </p>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Text Automation Rules */}
      <section className="glass-panel rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Bot className="h-5 w-5 text-[#FF3E8A]" aria-hidden="true" />
            <div>
              <h2 className="text-base font-semibold text-white">Text Automation Rules</h2>
              <p className="text-xs text-[#9B8FB8]">
                Automate friendly club greetings, achievement logs, and scrim reminders.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenCreateRule}
            className="tactile-btn inline-flex h-10 items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#FF6B35] to-[#FF3E8A] px-4 text-xs font-semibold text-white whitespace-nowrap"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>Create Custom Rule</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {rules.map((rule) => (
            <article
              key={rule.id}
              className="rounded-xl border border-white/[0.09] bg-[#120C24]/75 p-4 flex flex-col justify-between gap-3"
            >
              <div className="space-y-1.5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm font-semibold text-white">{rule.name}</h3>
                  <div className="flex items-center gap-2 shrink-0">
                    {rule.isCustom ? (
                      <button
                        type="button"
                        onClick={() => onDeleteRule(rule.id)}
                        aria-label={`Delete rule ${rule.name}`}
                        className="tactile-btn rounded-lg p-1 text-[#9B8FB8] hover:bg-white/[0.08] hover:text-[#FF6DA6]"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={rule.enabled}
                      aria-label={`Toggle ${rule.name}`}
                      onClick={() => onToggleRule(rule.id)}
                      className={`tactile-btn relative inline-flex h-6 w-11 items-center rounded-full border transition-colors ${
                        rule.enabled
                          ? 'border-[#22D3EE]/60 bg-[#22D3EE]/35'
                          : 'border-white/15 bg-white/10'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          rule.enabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                <p className="text-xs text-[#A79BC2]">
                  <span className="text-[#FF9F43] font-medium">When:</span> {rule.trigger}{' '}
                  <span className="text-white/25" aria-hidden="true">
                    ·
                  </span>{' '}
                  <span className="text-[#22D3EE] font-medium">Then:</span> {rule.action}
                </p>
              </div>

              <p className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2 text-xs text-[#DDD5F0] leading-relaxed">
                “{rule.messagePreview}”
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* Personal Server, E2EE P2P, Local Streaming, Zero-Disk Cloud Uploader & Telegram Bridge */}
      <PersonalNodeHub onSendLinkToChat={onSendLinkToChat} />
    </div>
  );
}
