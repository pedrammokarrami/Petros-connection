import { Menu, Volume2, VolumeX, Wifi, WifiOff } from 'lucide-react';
import { Avatar } from './Avatar';
import { PWAInstallButton } from './PWAInstallButton';
import { CURRENT_USER } from '../data/seedData';
import type { NetworkMetrics } from '../utils/appLogic';

interface TopBarProps {
  activeSection: string;
  network: NetworkMetrics;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onOpenProfile: () => void;
  onGoHome: () => void;
  onToggleMobileMenu: () => void;
}

export function TopBar({
  activeSection,
  network,
  soundEnabled,
  onToggleSound,
  onOpenProfile,
  onGoHome,
  onToggleMobileMenu,
}: TopBarProps) {
  const isOnline = network.label !== 'Offline';
  const isProfileActive = activeSection === 'profile';

  return (
    <header className="sticky top-0 z-30 pt-[env(safe-area-inset-top)] border-b border-white/[0.08] bg-[#0D091A]/88 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-2.5 sm:gap-4 px-3.5 sm:px-6">
        {/* Zone 1: Top-Left Hamburger Menu + Brand Wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onToggleMobileMenu}
            aria-label="Open menu and local settings"
            className="tactile-btn lg:hidden inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-[#F7F4FF] hover:bg-white/[0.09]"
          >
            <Menu className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={onGoHome}
            className="tactile-btn group flex items-center gap-2.5 text-left whitespace-nowrap shrink-0"
          >
            <span
              aria-hidden="true"
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#FF6B35] via-[#FF3E8A] to-[#22D3EE] text-sm font-bold text-[#0D091A] shadow-sm shadow-[#FF3E8A]/30"
            >
              A
            </span>
            <span className="font-[var(--font-display)] text-xl font-bold tracking-[0.06em] bg-gradient-to-r from-[#FFF5F0] via-[#FF9F43] to-[#FF3E8A] bg-clip-text text-transparent">
              AIGAMERIA
            </span>
          </button>
        </div>

        {/* Zone 2: Live Online / Ping Readout */}
        <div
          aria-label="Connection status"
          className="hidden sm:flex items-center gap-2.5 text-xs text-[#C7BEDB] whitespace-nowrap shrink-0"
        >
          {isOnline ? (
            <Wifi className="h-3.5 w-3.5 text-[#22D3EE]" aria-hidden="true" />
          ) : (
            <WifiOff className="h-3.5 w-3.5 text-[#FF6B35]" aria-hidden="true" />
          )}
          <span className="font-medium text-[#F7F4FF]">
            {isOnline ? 'Online' : 'Local Offline'}
          </span>
          <span className="text-white/25" aria-hidden="true">
            ·
          </span>
          <span className="font-mono tabular-nums text-[#22D3EE]">
            {network.estimatedPingMs} ms
          </span>
          <span className="text-white/25 hidden md:inline" aria-hidden="true">
            ·
          </span>
          <span className="hidden md:inline font-mono tabular-nums text-[#9B8FB8]">
            {network.activePeers} peers
          </span>
        </div>

        {/* Zone 3: Install App + Sound Toggle + Top-Right Profile Avatar Button */}
        <div className="flex items-center gap-2 shrink-0">
          <PWAInstallButton compact />

          <button
            type="button"
            onClick={onToggleSound}
            aria-label={soundEnabled ? 'Mute interface sounds' : 'Unmute interface sounds'}
            aria-pressed={soundEnabled}
            className={`tactile-btn inline-flex h-9 sm:h-10 items-center gap-2 rounded-xl border px-2.5 sm:px-3 text-xs font-medium whitespace-nowrap shrink-0 ${
              soundEnabled
                ? 'border-[#22D3EE]/35 bg-[#22D3EE]/10 text-[#A5F3FC] hover:bg-[#22D3EE]/15'
                : 'border-white/10 bg-white/[0.04] text-[#9B8FB8] hover:text-[#F7F4FF] hover:bg-white/[0.08]'
            }`}
          >
            {soundEnabled ? (
              <Volume2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <VolumeX className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            <span className="hidden sm:inline">{soundEnabled ? 'SFX On' : 'SFX Muted'}</span>
          </button>

          <button
            type="button"
            onClick={onOpenProfile}
            aria-label={`Open profile ${CURRENT_USER.handle}`}
            aria-current={isProfileActive ? 'page' : undefined}
            className={`tactile-btn inline-flex h-10 items-center gap-2.5 rounded-xl border pl-1.5 pr-2.5 sm:pr-3 whitespace-nowrap shrink-0 ${
              isProfileActive
                ? 'border-[#FF6B35]/60 bg-[#FF6B35]/18'
                : 'border-white/10 bg-white/[0.04] hover:border-[#FF6B35]/40 hover:bg-white/[0.08]'
            }`}
          >
            <Avatar src={CURRENT_USER.avatar} name={CURRENT_USER.handle} size="xs" />
            <span className="hidden md:inline text-xs font-semibold text-[#F7F4FF]">
              {CURRENT_USER.handle}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
