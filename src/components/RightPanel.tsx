import { ShieldCheck, Radio, Lock, ArrowUpRight } from 'lucide-react';
import { Avatar } from './Avatar';
import type { PlayerProfile } from '../types';
import type { NetworkMetrics } from '../utils/appLogic';

interface RightPanelProps {
  friends: PlayerProfile[];
  trendingTags: { tag: string; postCount: number }[];
  activeTag: string | null;
  network: NetworkMetrics;
  p2pEnabled: boolean;
  onSelectTag: (tag: string) => void;
  onMessageFriend: (handle: string) => void;
  onOpenSocialHub: () => void;
  onOpenSettings: () => void;
}

const STATUS_LABELS: Record<PlayerProfile['status'], { label: string; color: string }> = {
  'in-game': { label: 'In-Game', color: 'text-[#FF9F43]' },
  online: { label: 'Online', color: 'text-[#22D3EE]' },
  away: { label: 'Away', color: 'text-[#9B8FB8]' },
  offline: { label: 'Offline', color: 'text-[#6D6288]' },
};

export function RightPanel({
  friends,
  trendingTags,
  activeTag,
  network,
  p2pEnabled,
  onSelectTag,
  onMessageFriend,
  onOpenSocialHub,
  onOpenSettings,
}: RightPanelProps) {
  const activeFriends = friends.filter((m) => m.status !== 'offline');

  return (
    <aside aria-label="Squad and community summary" className="space-y-5">
      {/* Your Squad / Friends Online */}
      <section className="glass-panel rounded-2xl p-4">
        <div className="mb-3.5 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Your Squad</h2>
          <button
            type="button"
            onClick={onOpenSocialHub}
            className="tactile-btn inline-flex items-center gap-1 text-xs font-medium text-[#22D3EE] hover:text-[#67E8F9] whitespace-nowrap"
          >
            <span>Open Social</span>
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        <ul className="divide-y divide-white/[0.06]">
          {activeFriends.length === 0 ? (
            <li className="py-2 text-xs text-[#9B8FB8]">No friends online right now.</li>
          ) : (
            activeFriends.map((member) => {
              const statusInfo = STATUS_LABELS[member.status];
              return (
                <li key={member.id} className="py-2.5 first:pt-0 last:pb-0">
                  <button
                    type="button"
                    onClick={() => onMessageFriend(member.handle)}
                    aria-label={`Message ${member.handle}`}
                    className="tactile-btn flex w-full items-center justify-between gap-3 rounded-xl px-1.5 py-1 text-left hover:bg-white/[0.04]"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar src={member.avatar} name={member.name} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[#F7F4FF]">
                          {member.handle}
                        </p>
                        <p className="truncate text-xs text-[#9B8FB8]">
                          {member.currentGame ?? member.role}
                        </p>
                      </div>
                    </div>
                    <span className={`text-xs font-medium whitespace-nowrap shrink-0 ${statusInfo.color}`}>
                      {statusInfo.label}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </section>

      {/* Trending Tags */}
      <section className="glass-panel rounded-2xl p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Trending Tags</h2>
          {activeTag ? (
            <button
              type="button"
              onClick={() => onSelectTag(activeTag)}
              className="text-xs font-medium text-[#FF8C42] hover:underline"
            >
              Clear
            </button>
          ) : null}
        </div>

        <ul className="space-y-1">
          {trendingTags.map((item) => {
            const isSelected = activeTag?.toLowerCase() === item.tag.toLowerCase();
            return (
              <li key={item.tag}>
                <button
                  type="button"
                  onClick={() => onSelectTag(item.tag)}
                  className={`tactile-btn flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-sm ${
                    isSelected
                      ? 'bg-[#FF6B35]/15 text-white border border-[#FF6B35]/35'
                      : 'text-[#D6CEE8] hover:bg-white/[0.05] hover:text-white border border-transparent'
                  }`}
                >
                  <span className="font-medium truncate">{item.tag}</span>
                  <span className="font-mono tabular-nums text-xs text-[#9B8FB8] whitespace-nowrap">
                    {item.postCount} {item.postCount === 1 ? 'post' : 'posts'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* System Status */}
      <section className="glass-panel rounded-2xl p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">System Status</h2>
          <button
            type="button"
            onClick={onOpenSettings}
            className="text-xs font-medium text-[#9B8FB8] hover:text-white transition-colors"
          >
            Configure
          </button>
        </div>

        <dl className="space-y-2.5 text-xs">
          <div className="flex items-center justify-between gap-2">
            <dt className="flex items-center gap-2 text-[#A79BC2]">
              <Radio className="h-3.5 w-3.5 text-[#22D3EE]" aria-hidden="true" />
              <span>Local Server</span>
            </dt>
            <dd className="font-mono tabular-nums font-medium text-[#F7F4FF]">
              {network.label} · {network.estimatedPingMs} ms
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="flex items-center gap-2 text-[#A79BC2]">
              <Lock className="h-3.5 w-3.5 text-[#FF9F43]" aria-hidden="true" />
              <span>Text Encryption</span>
            </dt>
            <dd className="font-medium text-[#A5F3FC]">E2E Verified</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="flex items-center gap-2 text-[#A79BC2]">
              <ShieldCheck className="h-3.5 w-3.5 text-[#FF3E8A]" aria-hidden="true" />
              <span>P2P Mesh</span>
            </dt>
            <dd className="font-mono tabular-nums text-[#F7F4FF]">
              {p2pEnabled ? `${network.activePeers} Active` : 'Relay Only'}
            </dd>
          </div>
        </dl>
      </section>
    </aside>
  );
}
