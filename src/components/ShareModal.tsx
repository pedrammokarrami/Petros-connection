import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Hash, MessageCircle, Send, Share2, X } from 'lucide-react';
import { Avatar } from './Avatar';
import { ClubIcon } from './Sidebar';
import type { Club, PlayerProfile, SharePayload } from '../types';

interface ShareModalProps {
  payload: SharePayload | null;
  clubs: Club[];
  friends: PlayerProfile[];
  onClose: () => void;
  onCopyLink: (payload: SharePayload) => void;
  onShareToClub: (clubId: string, payload: SharePayload, note: string) => void;
  onShareToFriend: (friendHandle: string, payload: SharePayload, note: string) => void;
}

export function ShareModal({
  payload,
  clubs,
  friends,
  onClose,
  onCopyLink,
  onShareToClub,
  onShareToFriend,
}: ShareModalProps) {
  const [note, setNote] = useState('');
  const [activeTab, setActiveTab] = useState<'dm' | 'club'>('dm');
  const [copied, setCopied] = useState(false);
  const [sentConfirmation, setSentConfirmation] = useState<string | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!payload) return;
    setNote('');
    setCopied(false);
    setSentConfirmation(null);
  }, [payload?.shareUrl]);

  useEffect(() => {
    if (!payload) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [Boolean(payload)]);

  if (!payload) return null;

  const joinedClubs = clubs.filter((c) => c.joined);

  const handleCopy = () => {
    onCopyLink(payload);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const handleSendToFriend = (friend: PlayerProfile) => {
    onShareToFriend(friend.handle, payload, note);
    setSentConfirmation(`Sent to ${friend.handle}`);
    window.setTimeout(() => {
      onClose();
    }, 650);
  };

  const handleSendToClub = (club: Club) => {
    onShareToClub(club.id, payload, note);
    setSentConfirmation(`Shared in ${club.tag}`);
    window.setTimeout(() => {
      onClose();
    }, 650);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        onClick={onClose}
        className="animate-backdrop-fade fixed inset-0 bg-[#07040F]/75 backdrop-blur-sm"
      />

      <div className="animate-modal-pop glass-panel-elevated relative z-10 w-full max-w-md rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Share2 className="h-4 w-4 text-[#FF9F43]" aria-hidden="true" />
            <h2 id="share-modal-title" className="text-lg font-bold text-white">
              Share {payload.kind === 'post' ? 'Post' : payload.kind === 'club' ? 'Club Invite' : 'Profile'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close share modal"
            className="tactile-btn rounded-xl p-2 text-[#9B8FB8] hover:bg-white/[0.08] hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Item Preview */}
        <div className="rounded-xl border border-white/10 bg-[#0D091A]/80 p-3.5 space-y-1">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-white truncate">{payload.title}</span>
            <span className="text-[#FF9F43] font-medium whitespace-nowrap">{payload.subtitle}</span>
          </div>
          <p className="text-xs text-[#C2B7D9] line-clamp-2 leading-relaxed">
            {payload.previewText}
          </p>
        </div>

        {/* Copy Link Action */}
        <div className="flex items-center gap-2">
          <div className="flex-1 truncate rounded-xl border border-white/10 bg-[#0D091A]/75 px-3 py-2.5 font-mono text-xs text-[#A79BC2]">
            {payload.shareUrl}
          </div>
          <button
            type="button"
            onClick={handleCopy}
            className={`tactile-btn inline-flex h-10 items-center gap-1.5 rounded-xl border px-3.5 text-xs font-semibold whitespace-nowrap ${
              copied
                ? 'border-[#22D3EE]/50 bg-[#22D3EE]/15 text-[#A5F3FC]'
                : 'border-white/15 bg-white/[0.06] text-white hover:bg-white/[0.12]'
            }`}
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Copy Link</span>
              </>
            )}
          </button>
        </div>

        {/* Optional Note */}
        <div className="space-y-1">
          <label htmlFor="share-note" className="block text-xs font-medium text-[#C2B7D9]">
            Add a quick note (optional)
          </label>
          <input
            id="share-note"
            type="text"
            maxLength={140}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Check this strat out before tonight's queue..."
            className="h-10 w-full rounded-xl border border-white/12 bg-[#0D091A] px-3.5 text-sm text-white placeholder:text-[#7E7299] focus:border-[#22D3EE]/60"
          />
        </div>

        {/* Target Switcher: Direct Message vs Club */}
        <div
          role="tablist"
          aria-label="Share destination"
          className="grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-[#0D091A]/70 p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'dm'}
            onClick={() => setActiveTab('dm')}
            className={`tactile-btn inline-flex h-9 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${
              activeTab === 'dm'
                ? 'bg-[#FF6B35]/20 text-white border border-[#FF6B35]/40'
                : 'text-[#A79BC2] hover:text-white border border-transparent'
            }`}
          >
            <MessageCircle className="h-3.5 w-3.5 text-[#22D3EE]" aria-hidden="true" />
            <span>Direct Message</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'club'}
            onClick={() => setActiveTab('club')}
            className={`tactile-btn inline-flex h-9 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${
              activeTab === 'club'
                ? 'bg-[#FF6B35]/20 text-white border border-[#FF6B35]/40'
                : 'text-[#A79BC2] hover:text-white border border-transparent'
            }`}
          >
            <Hash className="h-3.5 w-3.5 text-[#FF9F43]" aria-hidden="true" />
            <span>Share to Club</span>
          </button>
        </div>

        {sentConfirmation ? (
          <div
            role="status"
            className="flex items-center justify-center gap-2 rounded-xl border border-[#22D3EE]/40 bg-[#22D3EE]/12 py-3 text-xs font-semibold text-[#A5F3FC]"
          >
            <Check className="h-4 w-4" aria-hidden="true" />
            <span>{sentConfirmation}</span>
          </div>
        ) : activeTab === 'dm' ? (
          <ul className="max-h-48 space-y-1.5 overflow-y-auto pr-0.5">
            {friends.length === 0 ? (
              <li className="py-4 text-center text-xs text-[#9B8FB8]">
                Add friends in Explore or Social to send direct messages.
              </li>
            ) : (
              friends.map((friend) => (
                <li
                  key={friend.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar src={friend.avatar} name={friend.name} size="xs" />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-white">{friend.handle}</p>
                      <p className="truncate text-[11px] text-[#9B8FB8]">
                        {friend.currentGame ?? friend.status}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSendToFriend(friend)}
                    aria-label={`Send to ${friend.handle}`}
                    className="tactile-btn inline-flex h-8 items-center gap-1 rounded-lg bg-gradient-to-r from-[#FF6B35] to-[#FF3E8A] px-3 text-xs font-semibold text-white hover:brightness-110 whitespace-nowrap shrink-0"
                  >
                    <Send className="h-3 w-3" aria-hidden="true" />
                    <span>Send</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : (
          <ul className="max-h-48 space-y-1.5 overflow-y-auto pr-0.5">
            {joinedClubs.map((club) => (
              <li
                key={club.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <ClubIcon icon={club.icon} className="h-4 w-4 text-[#FF9F43] shrink-0" />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-white">
                      {club.category === 'general' ? `# ${club.name}` : club.tag}
                    </p>
                    <p className="truncate text-[11px] text-[#9B8FB8] font-mono tabular-nums">
                      {club.onlineCount} online
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleSendToClub(club)}
                  aria-label={`Share to ${club.name}`}
                  className="tactile-btn inline-flex h-8 items-center gap-1 rounded-lg border border-[#22D3EE]/40 bg-[#22D3EE]/12 px-3 text-xs font-semibold text-[#A5F3FC] hover:bg-[#22D3EE]/22 whitespace-nowrap shrink-0"
                >
                  <Send className="h-3 w-3" aria-hidden="true" />
                  <span>Share</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
