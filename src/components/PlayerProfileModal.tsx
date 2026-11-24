import { useEffect, useRef } from 'react';
import { Gamepad2, MessageCircle, Share2, ShieldCheck, X } from 'lucide-react';
import { Avatar } from './Avatar';
import { FriendActionButton } from './FriendActionButton';
import type { PlayerProfile } from '../types';

interface PlayerProfileModalProps {
  player: PlayerProfile | null;
  onClose: () => void;
  onFriendAction: (handle: string) => void;
  onMessageFriend: (handle: string) => void;
  onSharePlayer: (player: PlayerProfile) => void;
}

const STATUS_BADGE: Record<PlayerProfile['status'], { label: string; dot: string; text: string }> = {
  'in-game': { label: 'In-Game', dot: 'bg-[#FF9F43]', text: 'text-[#FF9F43]' },
  online: { label: 'Online', dot: 'bg-[#22D3EE]', text: 'text-[#22D3EE]' },
  away: { label: 'Away', dot: 'bg-[#9B8FB8]', text: 'text-[#9B8FB8]' },
  offline: { label: 'Offline', dot: 'bg-[#6D6288]', text: 'text-[#8F83AB]' },
};

export function PlayerProfileModal({
  player,
  onClose,
  onFriendAction,
  onMessageFriend,
  onSharePlayer,
}: PlayerProfileModalProps) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!player) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [Boolean(player)]);

  if (!player) return null;

  const status = STATUS_BADGE[player.status];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="player-profile-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        onClick={onClose}
        className="animate-backdrop-fade fixed inset-0 bg-[#07040F]/75 backdrop-blur-sm"
      />

      <div className="animate-modal-pop glass-panel-elevated relative z-10 w-full max-w-md rounded-2xl p-5 sm:p-6 shadow-2xl space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="relative shrink-0">
              <Avatar src={player.avatar} name={player.name} size="lg" />
              <span
                aria-hidden="true"
                className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-[#1F1638] ${status.dot}`}
              />
            </div>
            <div className="min-w-0">
              <h2
                id="player-profile-modal-title"
                className="truncate text-lg font-bold text-white"
              >
                {player.handle}
              </h2>
              <p className="truncate text-xs text-[#A79BC2]">{player.name}</p>
              <div className="mt-1 flex items-center gap-2 text-xs">
                <span className={`font-semibold ${status.text}`}>{status.label}</span>
                <span className="text-white/25" aria-hidden="true">
                  ·
                </span>
                <span className="font-medium text-[#FF9F43]">{player.mainTag}</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close player profile"
            className="tactile-btn rounded-xl p-2 text-[#9B8FB8] hover:bg-white/[0.08] hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-xl border border-white/[0.08] bg-[#0D091A]/75 p-3">
            <p className="text-[11px] text-[#8F83AB] flex items-center gap-1">
              <Gamepad2 className="h-3.5 w-3.5 text-[#FF9F43]" aria-hidden="true" />
              <span>Activity</span>
            </p>
            <p className="mt-1 truncate text-xs font-semibold text-white">
              {player.currentGame ?? 'Ready to Queue'}
            </p>
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-[#0D091A]/75 p-3">
            <p className="text-[11px] text-[#8F83AB] flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5 text-[#22D3EE]" aria-hidden="true" />
              <span>Squad Role</span>
            </p>
            <p className="mt-1 truncate text-xs font-semibold text-white">{player.role}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/[0.08]">
          <div className="flex items-center gap-2">
            <FriendActionButton
              handle={player.handle}
              status={player.friendship}
              onAction={onFriendAction}
            />
            {player.friendship === 'friends' ? (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onMessageFriend(player.handle);
                }}
                aria-label={`Direct message ${player.handle}`}
                className="tactile-btn inline-flex h-8 items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#FF6B35] to-[#FF3E8A] px-3 text-xs font-semibold text-white hover:brightness-110 whitespace-nowrap"
              >
                <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Message</span>
              </button>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => {
              onClose();
              onSharePlayer(player);
            }}
            aria-label={`Share ${player.handle} profile`}
            className="tactile-btn inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/14 bg-white/[0.05] px-3 text-xs font-medium text-[#E4DDF5] hover:bg-white/[0.1] hover:text-white whitespace-nowrap"
          >
            <Share2 className="h-3.5 w-3.5 text-[#22D3EE]" aria-hidden="true" />
            <span>Share</span>
          </button>
        </div>
      </div>
    </div>
  );
}
