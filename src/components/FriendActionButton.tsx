import { Check, Clock, UserCheck, UserPlus } from 'lucide-react';
import type { FriendshipStatus } from '../types';

interface FriendActionButtonProps {
  handle: string;
  status: FriendshipStatus;
  onAction: (handle: string) => void;
  compact?: boolean;
}

export function FriendActionButton({
  handle,
  status,
  onAction,
  compact = false,
}: FriendActionButtonProps) {
  const sizeClass = compact ? 'h-7 px-2 text-[11px]' : 'h-8 px-2.5 text-xs';

  if (status === 'friends') {
    return (
      <span
        aria-label={`${handle} is in your friends list`}
        className={`inline-flex ${sizeClass} items-center gap-1 rounded-lg border border-[#22D3EE]/30 bg-[#22D3EE]/10 font-medium text-[#A5F3FC] whitespace-nowrap shrink-0`}
      >
        <UserCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>Friends</span>
      </span>
    );
  }

  if (status === 'pending_outgoing') {
    return (
      <span
        aria-label={`Friend request pending for ${handle}`}
        className={`inline-flex ${sizeClass} items-center gap-1 rounded-lg border border-[#FF9F43]/30 bg-[#FF9F43]/10 font-medium text-[#FFBE76] whitespace-nowrap shrink-0`}
      >
        <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>Pending</span>
      </span>
    );
  }

  if (status === 'pending_incoming') {
    return (
      <button
        type="button"
        onClick={() => onAction(handle)}
        aria-label={`Accept friend request from ${handle}`}
        className={`tactile-btn inline-flex ${sizeClass} items-center gap-1 rounded-lg bg-gradient-to-r from-[#FF6B35] to-[#FF3E8A] font-semibold text-white hover:brightness-110 whitespace-nowrap shrink-0`}
      >
        <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>Accept</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onAction(handle)}
      aria-label={`Add ${handle} as friend`}
      className={`tactile-btn inline-flex ${sizeClass} items-center gap-1 rounded-lg border border-white/14 bg-white/[0.05] font-medium text-[#EDE8F8] hover:border-[#FF6B35]/50 hover:bg-[#FF6B35]/15 hover:text-white whitespace-nowrap shrink-0`}
    >
      <UserPlus className="h-3.5 w-3.5 shrink-0 text-[#FF9F43]" aria-hidden="true" />
      <span>Add Friend</span>
    </button>
  );
}
