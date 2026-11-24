import {
  Bell,
  Compass,
  Crosshair,
  Flame,
  Gamepad2,
  Home,
  MessageSquare,
  PenSquare,
  Plus,
  Settings,
  Shield,
  Trophy,
  Users,
  Zap,
} from 'lucide-react';
import type { Club, ClubIconKey, NavSection } from '../types';
import { PWAInstallButton } from './PWAInstallButton';

interface SidebarProps {
  activeSection: NavSection;
  activeClubFilter: string | null;
  socialUnread: number;
  alertCount: number;
  clubs: Club[];
  onNavigate: (section: NavSection) => void;
  onSelectClubFromSidebar: (club: Club) => void;
  onOpenCreatePost: () => void;
  onOpenCreateClub: () => void;
}

export function ClubIcon({ icon, className = 'h-4 w-4' }: { icon: ClubIconKey; className?: string }) {
  switch (icon) {
    case 'crosshair':
      return <Crosshair className={className} aria-hidden="true" />;
    case 'flame':
      return <Flame className={className} aria-hidden="true" />;
    case 'trophy':
      return <Trophy className={className} aria-hidden="true" />;
    case 'zap':
      return <Zap className={className} aria-hidden="true" />;
    case 'shield':
      return <Shield className={className} aria-hidden="true" />;
    case 'message':
      return <MessageSquare className={className} aria-hidden="true" />;
    default:
      return <Gamepad2 className={className} aria-hidden="true" />;
  }
}

export function Sidebar({
  activeSection,
  activeClubFilter,
  socialUnread,
  alertCount,
  clubs,
  onNavigate,
  onSelectClubFromSidebar,
  onOpenCreatePost,
  onOpenCreateClub,
}: SidebarProps) {
  const navItems: { id: NavSection; label: string; icon: typeof Home; badge?: number }[] = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'explore', label: 'Explore', icon: Compass },
    { id: 'social', label: 'Social', icon: Users, badge: socialUnread },
    { id: 'alerts', label: 'Alerts', icon: Bell, badge: alertCount },
  ];

  const sidebarClubs = clubs.filter((c) => c.category !== 'general');

  return (
    <aside aria-label="Primary navigation" className="flex h-full flex-col gap-4">
      {/* Primary Create Post CTA */}
      <button
        type="button"
        onClick={onOpenCreatePost}
        className="tactile-btn flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#FF6B35] to-[#FF3E8A] px-4 text-sm font-semibold text-white shadow-lg shadow-[#FF3E8A]/20 hover:brightness-110 whitespace-nowrap shrink-0"
      >
        <PenSquare className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>Create Post</span>
      </button>

      {/* Clean 4-Section Primary Navigation */}
      <nav className="glass-panel rounded-2xl p-2">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`tactile-btn flex h-10 w-full items-center justify-between rounded-xl px-3 text-sm font-medium whitespace-nowrap ${
                    isActive
                      ? 'bg-gradient-to-r from-[#FF6B35]/20 via-[#FF3E8A]/15 to-transparent text-white border border-[#FF6B35]/35'
                      : 'text-[#C2B7D9] hover:bg-white/[0.06] hover:text-white border border-transparent'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <Icon
                      className={`h-4 w-4 shrink-0 ${
                        isActive ? 'text-[#FF8C42]' : 'text-[#8F83AB]'
                      }`}
                      aria-hidden="true"
                    />
                    <span>{item.label}</span>
                  </span>
                  {item.badge && item.badge > 0 ? (
                    <span className="font-mono tabular-nums text-xs font-semibold text-[#FF3E8A]">
                      {item.badge}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Clubs Section */}
      <div className="glass-panel rounded-2xl p-3 flex-1 min-h-0 flex flex-col">
        <div className="mb-2.5 flex items-center justify-between px-1.5">
          <h2 className="text-xs font-semibold tracking-wider text-[#9B8FB8]">Clubs</h2>
          <button
            type="button"
            onClick={onOpenCreateClub}
            aria-label="Add new club"
            className="tactile-btn inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-[#22D3EE] hover:bg-[#22D3EE]/12 whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Add</span>
          </button>
        </div>

        <ul className="space-y-1 overflow-y-auto pr-0.5 flex-1">
          {sidebarClubs.map((club) => {
            const isSelected = activeSection === 'home' && activeClubFilter === club.tag;
            return (
              <li key={club.id}>
                <button
                  type="button"
                  onClick={() => onSelectClubFromSidebar(club)}
                  className={`tactile-btn flex h-9 w-full items-center justify-between rounded-xl px-2.5 text-sm whitespace-nowrap ${
                    isSelected
                      ? 'bg-[#22D3EE]/14 text-[#A5F3FC] border border-[#22D3EE]/35'
                      : 'text-[#CFC6E3] hover:bg-white/[0.06] hover:text-white border border-transparent'
                  }`}
                >
                  <span className="flex items-center gap-2.5 truncate">
                    <ClubIcon
                      icon={club.icon}
                      className={`h-3.5 w-3.5 shrink-0 ${
                        isSelected ? 'text-[#22D3EE]' : 'text-[#FF8C42]/80'
                      }`}
                    />
                    <span className="truncate font-medium">{club.tag}</span>
                  </span>
                  <span className="font-mono tabular-nums text-[11px] text-[#8D80AA] ml-2">
                    {club.onlineCount}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {/* Secondary Bridge / Local Settings & Install PWA Footer */}
        <div className="mt-3 pt-2.5 border-t border-white/[0.07] space-y-2">
          <PWAInstallButton />
          <button
            type="button"
            onClick={() => onNavigate('settings')}
            aria-current={activeSection === 'settings' ? 'page' : undefined}
            className={`tactile-btn flex h-9 w-full items-center gap-2.5 rounded-xl px-2.5 text-xs font-medium whitespace-nowrap ${
              activeSection === 'settings'
                ? 'bg-[#22D3EE]/14 text-[#A5F3FC] border border-[#22D3EE]/35'
                : 'text-[#A79BC2] hover:bg-white/[0.06] hover:text-white border border-transparent'
            }`}
          >
            <Settings className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Bridge / Local Settings</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
