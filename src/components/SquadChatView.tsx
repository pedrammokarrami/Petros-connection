import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Hash,
  Link2,
  MessageCircle,
  Plus,
  Search,
  Send,
  Share2,
  Users,
} from 'lucide-react';
import { Avatar } from './Avatar';
import { ClubIcon } from './Sidebar';
import { FriendActionButton } from './FriendActionButton';
import { ChatMessageContent } from './ChatMediaPreview';
import type {
  ChatMessage,
  Club,
  DirectMessage,
  PlayerProfile,
  SocialSubTab,
} from '../types';
import { searchPlayersByHandle } from '../utils/appLogic';
import type { ParsedMediaLink } from '../utils/mediaParser';

interface SquadChatViewProps {
  subTab: SocialSubTab;
  onChangeSubTab: (tab: SocialSubTab) => void;
  clubs: Club[];
  activeClubId: string;
  messagesByClub: Record<string, ChatMessage[]>;
  players: PlayerProfile[];
  activeDmHandle: string | null;
  directMessagesByHandle: Record<string, DirectMessage[]>;
  dmUnreadByHandle: Record<string, number>;
  mobileChatOpen: boolean;
  onSetMobileChatOpen: (open: boolean) => void;
  onSelectClub: (clubId: string) => void;
  onSendClubMessage: (clubId: string, content: string) => void;
  onSelectDmFriend: (handle: string) => void;
  onSendDirectMessage: (friendHandle: string, content: string) => void;
  onOpenCreateClub: () => void;
  onOpenShareClub: (club: Club) => void;
  onFriendAction: (handle: string) => void;
  onOpenFullscreenMedia: (media: ParsedMediaLink) => void;
  onInspectPlayer: (handle: string) => void;
}

const CLUB_QUICK_HELPERS = ['GG', 'GLHF', 'LFG', 'Ready', '🔥', '🎯'];
const DM_QUICK_HELPERS = ['GG', 'LFG', 'Ready', 'In 5m', 'Invite me'];
const SAMPLE_VIDEO_URL = 'https://youtu.be/aqz-KE-bpKQ';

const STATUS_META: Record<PlayerProfile['status'], { label: string; color: string; dot: string }> = {
  'in-game': { label: 'In-Game', color: 'text-[#FF9F43]', dot: 'bg-[#FF9F43]' },
  online: { label: 'Online', color: 'text-[#22D3EE]', dot: 'bg-[#22D3EE]' },
  away: { label: 'Away', color: 'text-[#9B8FB8]', dot: 'bg-[#9B8FB8]' },
  offline: { label: 'Offline', color: 'text-[#6D6288]', dot: 'bg-[#6D6288]' },
};

export function SquadChatView({
  subTab,
  onChangeSubTab,
  clubs,
  activeClubId,
  messagesByClub,
  players,
  activeDmHandle,
  directMessagesByHandle,
  dmUnreadByHandle,
  mobileChatOpen,
  onSetMobileChatOpen,
  onSelectClub,
  onSendClubMessage,
  onSelectDmFriend,
  onSendDirectMessage,
  onOpenCreateClub,
  onOpenShareClub,
  onFriendAction,
  onOpenFullscreenMedia,
  onInspectPlayer,
}: SquadChatViewProps) {
  const [clubDraft, setClubDraft] = useState('');
  const [dmDraft, setDmDraft] = useState('');
  const [friendSearch, setFriendSearch] = useState('');
  const [showMobileMembers, setShowMobileMembers] = useState(false);

  const clubBottomRef = useRef<HTMLDivElement | null>(null);
  const dmBottomRef = useRef<HTMLDivElement | null>(null);

  const activeClub = clubs.find((c) => c.id === activeClubId) ?? clubs[0];
  const clubMessages = activeClub ? messagesByClub[activeClub.id] ?? [] : [];

  const friends = useMemo(
    () => players.filter((p) => p.friendship === 'friends'),
    [players],
  );

  const nonFriendsMatchingSearch = useMemo(() => {
    const q = friendSearch.trim();
    if (!q) return [];
    return searchPlayersByHandle(
      players.filter((p) => p.friendship !== 'friends'),
      q,
    );
  }, [players, friendSearch]);

  const filteredFriends = useMemo(
    () => searchPlayersByHandle(friends, friendSearch),
    [friends, friendSearch],
  );

  const activeFriend =
    friends.find((f) => f.handle === activeDmHandle) ?? friends[0] ?? null;

  const dmMessages = activeFriend
    ? directMessagesByHandle[activeFriend.handle] ?? []
    : [];

  useEffect(() => {
    clubBottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [activeClub?.id, clubMessages.length, subTab]);

  useEffect(() => {
    dmBottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [activeFriend?.handle, dmMessages.length, subTab]);

  const handleClubSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeClub || !clubDraft.trim()) return;
    onSendClubMessage(activeClub.id, clubDraft.trim());
    setClubDraft('');
  };

  const handleDmSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeFriend || !dmDraft.trim()) return;
    onSendDirectMessage(activeFriend.handle, dmDraft.trim());
    setDmDraft('');
  };

  const inGameMembers = players.filter((m) => m.status === 'in-game');
  const onlineMembers = players.filter((m) => m.status === 'online' || m.status === 'away');
  const offlineMembers = players.filter((m) => m.status === 'offline');

  const totalClubUnread = useMemo(
    () => clubs.reduce((acc, c) => acc + (c.unreadCount ?? 0), 0),
    [clubs],
  );
  const totalDmUnread = useMemo(
    () =>
      friends.reduce((acc, f) => acc + (dmUnreadByHandle[f.handle] ?? 0), 0),
    [friends, dmUnreadByHandle],
  );

  return (
    <div className="space-y-4">
      {/* Top Dual-View Toggle: Clubs & Squad Rooms vs. Direct Messages (DMs) */}
      <div
        className={`glass-panel rounded-2xl p-2 flex items-center justify-between gap-2 ${
          mobileChatOpen ? 'hidden lg:flex' : 'flex'
        }`}
      >
        <div
          role="tablist"
          aria-label="Social view switcher"
          className="grid w-full sm:w-auto grid-cols-2 gap-1.5"
        >
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'clubs'}
            onClick={() => {
              onChangeSubTab('clubs');
              onSetMobileChatOpen(false);
            }}
            className={`tactile-btn inline-flex h-10 items-center justify-center gap-1.5 sm:gap-2 rounded-xl px-2.5 sm:px-4 text-xs sm:text-sm font-semibold whitespace-nowrap overflow-hidden ${
              subTab === 'clubs'
                ? 'bg-gradient-to-r from-[#FF6B35]/25 via-[#FF3E8A]/20 to-transparent text-white border border-[#FF6B35]/45'
                : 'text-[#B5A9CE] hover:bg-white/[0.06] hover:text-white border border-transparent'
            }`}
          >
            <Hash className="h-4 w-4 text-[#FF9F43] shrink-0" aria-hidden="true" />
            <span className="sm:hidden">Clubs</span>
            <span className="hidden sm:inline">Clubs &amp; Squad Rooms</span>
            {totalClubUnread > 0 ? (
              <span className="rounded-md bg-[#FF3E8A]/25 px-1.5 py-0.5 font-mono tabular-nums text-[10px] font-bold text-[#FF8BB8] shrink-0">
                {totalClubUnread}
              </span>
            ) : null}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'dms'}
            onClick={() => {
              onChangeSubTab('dms');
              onSetMobileChatOpen(false);
            }}
            className={`tactile-btn inline-flex h-10 items-center justify-center gap-1.5 sm:gap-2 rounded-xl px-2.5 sm:px-4 text-xs sm:text-sm font-semibold whitespace-nowrap overflow-hidden ${
              subTab === 'dms'
                ? 'bg-gradient-to-r from-[#22D3EE]/22 via-[#FF3E8A]/14 to-transparent text-white border border-[#22D3EE]/45'
                : 'text-[#B5A9CE] hover:bg-white/[0.06] hover:text-white border border-transparent'
            }`}
          >
            <MessageCircle className="h-4 w-4 text-[#22D3EE] shrink-0" aria-hidden="true" />
            <span className="sm:hidden">DMs</span>
            <span className="hidden sm:inline">Direct Messages (DMs)</span>
            {totalDmUnread > 0 ? (
              <span
                aria-label={`${totalDmUnread} unread direct messages`}
                className="rounded-md bg-[#22D3EE]/25 px-1.5 py-0.5 font-mono tabular-nums text-[10px] font-bold text-[#A5F3FC] shrink-0"
              >
                {totalDmUnread}
              </span>
            ) : (
              <span className="font-mono tabular-nums text-[11px] text-[#A5F3FC] shrink-0">
                {friends.length}
              </span>
            )}
          </button>
        </div>

        <button
          type="button"
          onClick={onOpenCreateClub}
          className="tactile-btn hidden sm:inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#FF6B35]/15 border border-[#FF6B35]/35 px-3 text-xs font-semibold text-[#FFB088] hover:bg-[#FF6B35]/25 whitespace-nowrap shrink-0"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Add Club</span>
        </button>
      </div>

      {/* ====================================================================
          MODE 1: CLUBS & ROOMS
         ==================================================================== */}
      {subTab === 'clubs' ? (
        <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)_264px] gap-4 min-h-[calc(100dvh-11.5rem)]">
          {/* Left Column: Clubs List (full-height screen on mobile when chat is closed) */}
          <section
            aria-label="Club channels"
            className={`glass-panel rounded-2xl p-3 flex-col lg:max-h-[calc(100dvh-11.5rem)] ${
              mobileChatOpen ? 'hidden lg:flex' : 'flex min-h-[calc(100dvh-13.5rem)]'
            }`}
          >
            <div className="mb-3 flex items-center justify-between px-1.5">
              <h1 className="text-sm font-semibold text-white">Clubs &amp; Rooms</h1>
              <button
                type="button"
                onClick={onOpenCreateClub}
                className="tactile-btn inline-flex items-center gap-1 rounded-lg bg-[#FF6B35]/15 border border-[#FF6B35]/35 px-2.5 py-1 text-xs font-semibold text-[#FFB088] hover:bg-[#FF6B35]/25 whitespace-nowrap"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Add Club</span>
              </button>
            </div>

            <ul className="space-y-1.5 overflow-y-auto pr-0.5 flex-1">
              {clubs.map((club) => {
                const isActive = activeClub?.id === club.id;
                return (
                  <li key={club.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectClub(club.id);
                        onSetMobileChatOpen(true);
                      }}
                      aria-current={isActive ? 'true' : undefined}
                      className={`tactile-btn flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-sm ${
                        isActive
                          ? 'bg-gradient-to-r from-[#FF6B35]/20 via-[#FF3E8A]/12 to-transparent text-white border border-[#FF6B35]/40'
                          : 'text-[#CFC6E3] hover:bg-white/[0.06] hover:text-white border border-transparent'
                      }`}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <ClubIcon
                          icon={club.icon}
                          className={`h-4 w-4 shrink-0 ${
                            isActive ? 'text-[#FF9F43]' : 'text-[#8F83AB]'
                          }`}
                        />
                        <span className="truncate font-medium">
                          {club.category === 'general' ? `# ${club.name}` : club.tag}
                        </span>
                      </span>
                      {club.unreadCount && club.unreadCount > 0 && !isActive ? (
                        <span className="font-mono tabular-nums text-[11px] font-semibold text-[#FF3E8A]">
                          {club.unreadCount}
                        </span>
                      ) : (
                        <span className="font-mono tabular-nums text-[11px] text-[#7E7299]">
                          {club.onlineCount}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Center Column: Active Club Text Chat (full-height screen on mobile when opened) */}
          <section
            aria-label={activeClub ? `${activeClub.name} text chat` : 'Club text chat'}
            className={`glass-panel rounded-2xl flex-col lg:max-h-[calc(100dvh-11.5rem)] overflow-hidden ${
              mobileChatOpen ? 'flex h-[calc(100dvh-9.5rem)]' : 'hidden lg:flex'
            }`}
          >
            {/* Club Chat Header with Mobile Back + Share Club + Members toggle */}
            <div className="flex items-center justify-between gap-2 border-b border-white/[0.08] px-3.5 sm:px-4 py-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <button
                  type="button"
                  onClick={() => {
                    onSetMobileChatOpen(false);
                    setShowMobileMembers(false);
                  }}
                  aria-label="Back to clubs list"
                  className="tactile-btn lg:hidden inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/14 bg-white/[0.07] px-2.5 text-xs font-semibold text-white shrink-0"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  <span>Back</span>
                </button>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Hash className="h-4 w-4 text-[#22D3EE] shrink-0" aria-hidden="true" />
                    <h2 className="truncate text-base font-bold text-white">
                      {activeClub?.name ?? 'General Chat'}
                    </h2>
                    <span className="hidden sm:inline text-white/25 text-xs" aria-hidden="true">
                      ·
                    </span>
                    <span className="hidden sm:inline text-xs text-[#9B8FB8] font-mono tabular-nums whitespace-nowrap">
                      {activeClub?.onlineCount ?? 0} active
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-[#A79BC2]">
                    {activeClub?.description}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {activeClub ? (
                  <button
                    type="button"
                    onClick={() => onOpenShareClub(activeClub)}
                    aria-label={`Share ${activeClub.name} club`}
                    className="tactile-btn inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/12 bg-white/[0.05] px-3 text-xs font-medium text-[#E4DDF5] hover:bg-white/[0.1] hover:text-white whitespace-nowrap"
                  >
                    <Share2 className="h-3.5 w-3.5 text-[#FF9F43]" aria-hidden="true" />
                    <span className="hidden sm:inline">Share</span>
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={() => setShowMobileMembers((prev) => !prev)}
                  aria-label="Toggle members list"
                  className="tactile-btn lg:hidden inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-2.5 text-xs font-medium text-[#E4DDF5] whitespace-nowrap"
                >
                  <Users className="h-3.5 w-3.5 text-[#22D3EE]" aria-hidden="true" />
                  <span>Members</span>
                </button>
              </div>
            </div>

            {/* Messages Stream */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3.5">
              {clubMessages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center py-10">
                  <p className="text-sm font-medium text-white">
                    Start the conversation in {activeClub?.tag}
                  </p>
                  <p className="mt-1 text-xs text-[#9B8FB8]">
                    Send a quick text callout or invite your squad below.
                  </p>
                </div>
              ) : (
                clubMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`animate-panel-reveal flex items-start gap-3 ${
                      msg.isCurrentUser ? 'flex-row-reverse' : ''
                    }`}
                  >
                    <Avatar src={msg.avatar} name={msg.author} size="sm" />
                    <div
                      className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 ${
                        msg.isCurrentUser
                          ? 'bg-gradient-to-br from-[#FF6B35]/24 to-[#FF3E8A]/18 border border-[#FF6B35]/35 text-white'
                          : 'bg-white/[0.05] border border-white/[0.08] text-[#EDE8F8]'
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs mb-1">
                        <span className="font-semibold text-white">{msg.handle}</span>
                        {msg.roleTag ? (
                          <span className="text-[#22D3EE] font-medium">{msg.roleTag}</span>
                        ) : null}
                        <span className="font-mono tabular-nums text-[#8F83AB] text-[11px]">
                          {msg.timestamp}
                        </span>
                      </div>
                      <ChatMessageContent
                        content={msg.content}
                        onOpenFullscreen={onOpenFullscreenMedia}
                      />
                    </div>
                  </div>
                ))
              )}
              <div ref={clubBottomRef} />
            </div>

            {/* Quick Helpers + Sticky Composer */}
            <div className="sticky bottom-0 border-t border-white/[0.08] bg-[#100A20]/90 backdrop-blur-md p-3.5 space-y-2.5">
              <div className="flex flex-wrap items-center gap-1.5" aria-label="Quick text helpers">
                {CLUB_QUICK_HELPERS.map((token) => (
                  <button
                    key={token}
                    type="button"
                    onClick={() => setClubDraft((prev) => (prev ? `${prev} ${token}` : token))}
                    className="tactile-btn rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-[#D6CEE8] hover:border-[#22D3EE]/40 hover:bg-[#22D3EE]/12 hover:text-white whitespace-nowrap"
                  >
                    {token}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setClubDraft((prev) =>
                      prev ? `${prev} ${SAMPLE_VIDEO_URL}` : `Check this clip: ${SAMPLE_VIDEO_URL}`,
                    )
                  }
                  className="tactile-btn inline-flex items-center gap-1 rounded-lg border border-[#FF9F43]/30 bg-[#FF6B35]/12 px-2.5 py-1 text-xs font-medium text-[#FFBE76] hover:bg-[#FF6B35]/20 whitespace-nowrap"
                >
                  <Link2 className="h-3 w-3" aria-hidden="true" />
                  <span>Video Link</span>
                </button>
              </div>

              <form onSubmit={handleClubSubmit} className="flex items-center gap-2.5">
                <label htmlFor="squad-chat-input" className="sr-only">
                  Message {activeClub?.name}
                </label>
                <input
                  id="squad-chat-input"
                  type="text"
                  value={clubDraft}
                  onChange={(e) => setClubDraft(e.target.value)}
                  placeholder={`Message ${activeClub?.tag ?? '#GeneralChat'} or paste a media link...`}
                  className="h-11 flex-1 rounded-xl border border-white/12 bg-[#0D091A]/85 px-4 text-sm text-white placeholder:text-[#7E7299] focus:border-[#22D3EE]/60"
                />
                <button
                  type="submit"
                  disabled={!clubDraft.trim()}
                  aria-label="Send message"
                  className="tactile-btn inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-[#FF6B35] to-[#FF3E8A] px-4 text-sm font-semibold text-white disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  <Send className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">Send</span>
                </button>
              </form>
            </div>
          </section>

          {/* Right Column: Club Members with Add Friend / Message */}
          <section
            aria-label="Room members"
            className={`glass-panel rounded-2xl p-4 flex-col gap-4 lg:max-h-[calc(100dvh-11.5rem)] overflow-y-auto ${
              showMobileMembers && mobileChatOpen ? 'flex' : 'hidden lg:flex'
            }`}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Members</h2>
              <span className="font-mono tabular-nums text-xs text-[#9B8FB8]">
                {players.length} total
              </span>
            </div>

            {(
              [
                { title: 'In-Game', color: 'text-[#FF9F43]', list: inGameMembers },
                { title: 'Online', color: 'text-[#22D3EE]', list: onlineMembers },
                { title: 'Offline', color: 'text-[#7E7299]', list: offlineMembers },
              ] as const
            ).map((group, gIdx) => (
              <div
                key={group.title}
                className={`space-y-2.5 ${gIdx > 0 ? 'pt-2.5 border-t border-white/[0.06]' : ''}`}
              >
                <h3 className={`text-xs font-semibold ${group.color}`}>
                  {group.title} · {group.list.length}
                </h3>
                <ul className="space-y-2.5">
                  {group.list.map((member) => (
                    <li
                      key={member.id}
                      className={`flex items-center justify-between gap-2 ${
                        member.status === 'offline' ? 'opacity-70' : ''
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onInspectPlayer(member.handle)}
                        aria-label={`View ${member.handle} profile`}
                        className="flex items-center gap-2 min-w-0 text-left group"
                      >
                        <div className="relative shrink-0">
                          <Avatar src={member.avatar} name={member.name} size="xs" />
                          <span
                            aria-hidden="true"
                            className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#18112D] ${STATUS_META[member.status].dot}`}
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-white group-hover:text-[#FF9F43] transition-colors">
                            {member.handle}
                          </p>
                          <p className="truncate text-[11px] text-[#9B8FB8]">
                            {member.currentGame ?? member.role}
                          </p>
                        </div>
                      </button>

                      {member.friendship === 'friends' ? (
                        <button
                          type="button"
                          onClick={() => {
                            onChangeSubTab('dms');
                            onSelectDmFriend(member.handle);
                            onSetMobileChatOpen(true);
                          }}
                          aria-label={`Message ${member.handle}`}
                          className="tactile-btn inline-flex h-7 items-center gap-1 rounded-lg border border-[#22D3EE]/30 bg-[#22D3EE]/10 px-2 text-[11px] font-medium text-[#A5F3FC] hover:bg-[#22D3EE]/20 whitespace-nowrap shrink-0"
                        >
                          <MessageCircle className="h-3 w-3" aria-hidden="true" />
                          <span>DM</span>
                        </button>
                      ) : (
                        <FriendActionButton
                          handle={member.handle}
                          status={member.friendship}
                          onAction={onFriendAction}
                          compact
                        />
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        </div>
      ) : (
        /* ====================================================================
           MODE 2: DIRECT MESSAGES & FRIENDS LIST
           ==================================================================== */
        <div className="grid grid-cols-1 lg:grid-cols-[348px_minmax(0,1fr)] gap-4 min-h-[calc(100dvh-11.5rem)]">
          {/* Left Column: Friends List + Quick Search to Add Players */}
          <section
            aria-label="Friends list and direct messages"
            className={`glass-panel rounded-2xl p-4 flex-col gap-3.5 lg:max-h-[calc(100dvh-11.5rem)] ${
              mobileChatOpen ? 'hidden lg:flex' : 'flex min-h-[calc(100dvh-13.5rem)]'
            }`}
          >
            <div className="flex items-center justify-between">
              <h1 className="text-sm font-semibold text-white">Friends &amp; Direct Messages</h1>
              <span className="font-mono tabular-nums text-xs text-[#22D3EE]">
                {friends.filter((f) => f.status !== 'offline').length} online
              </span>
            </div>

            {/* Quick Search by Handle */}
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8F83AB]"
                aria-hidden="true"
              />
              <label htmlFor="friends-handle-search" className="sr-only">
                Search friends or add players by handle
              </label>
              <input
                id="friends-handle-search"
                type="search"
                value={friendSearch}
                onChange={(e) => setFriendSearch(e.target.value)}
                placeholder="Search friends or add @handle..."
                className="h-9 w-full rounded-xl border border-white/12 bg-[#0D091A]/85 pl-8 pr-3 text-xs text-white placeholder:text-[#7E7299] focus:border-[#22D3EE]/60"
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-0.5">
              {/* Friends List */}
              <div className="space-y-2">
                <h2 className="text-xs font-semibold text-[#9B8FB8]">
                  Friends · {filteredFriends.length}
                </h2>
                {filteredFriends.length === 0 ? (
                  <p className="py-3 text-xs text-[#9B8FB8]">
                    {friendSearch.trim()
                      ? 'No friends matched your search.'
                      : 'Add players below or accept requests in Alerts.'}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {filteredFriends.map((friend) => {
                      const isActive = activeFriend?.handle === friend.handle;
                      const statusMeta = STATUS_META[friend.status];
                      const thread = directMessagesByHandle[friend.handle] ?? [];
                      const lastMsg = thread[thread.length - 1];
                      const unread = dmUnreadByHandle[friend.handle] ?? 0;

                      return (
                        <li
                          key={friend.id}
                          className={`rounded-xl border p-2.5 transition-colors ${
                            isActive
                              ? 'border-[#22D3EE]/45 bg-[#22D3EE]/12'
                              : 'border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.06]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                onSelectDmFriend(friend.handle);
                                onSetMobileChatOpen(true);
                              }}
                              className="flex items-center gap-2.5 min-w-0 text-left flex-1"
                            >
                              <div className="relative shrink-0">
                                <Avatar src={friend.avatar} name={friend.name} size="sm" />
                                <span
                                  aria-label={statusMeta.label}
                                  className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#18112D] ${statusMeta.dot}`}
                                />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="truncate text-sm font-semibold text-white">
                                    {friend.handle}
                                  </p>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {lastMsg ? (
                                      <span className="font-mono tabular-nums text-[10px] text-[#8F83AB]">
                                        {lastMsg.timestamp}
                                      </span>
                                    ) : null}
                                    {unread > 0 ? (
                                      <span
                                        aria-label={`${unread} unread from ${friend.handle}`}
                                        className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-gradient-to-r from-[#FF6B35] to-[#FF3E8A] px-1.5 font-mono tabular-nums text-[10px] font-bold text-white"
                                      >
                                        {unread}
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                                <p className="truncate text-xs text-[#9B8FB8]">
                                  <span className={`font-medium ${statusMeta.color}`}>
                                    {statusMeta.label}
                                  </span>
                                  <span className="text-white/25 mx-1" aria-hidden="true">
                                    ·
                                  </span>
                                  <span>
                                    {lastMsg ? lastMsg.content : friend.currentGame ?? friend.role}
                                  </span>
                                </p>
                              </div>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                onSelectDmFriend(friend.handle);
                                onSetMobileChatOpen(true);
                              }}
                              aria-label={`Message ${friend.handle}`}
                              className="tactile-btn inline-flex h-8 items-center gap-1 rounded-lg border border-[#22D3EE]/35 bg-[#22D3EE]/12 px-2.5 text-xs font-semibold text-[#A5F3FC] hover:bg-[#22D3EE]/22 whitespace-nowrap shrink-0"
                            >
                              <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>Message</span>
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Search Results for Non-Friend Players to Add */}
              {nonFriendsMatchingSearch.length > 0 ? (
                <div className="space-y-2 pt-2 border-t border-white/[0.07]">
                  <h2 className="text-xs font-semibold text-[#FF9F43]">
                    Add Players Matching “{friendSearch.trim()}”
                  </h2>
                  <ul className="space-y-2">
                    {nonFriendsMatchingSearch.map((player) => (
                      <li
                        key={player.id}
                        className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.07] bg-[#120C24]/70 p-2.5"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Avatar src={player.avatar} name={player.name} size="xs" />
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-white">
                              {player.handle}
                            </p>
                            <p className="truncate text-[11px] text-[#9B8FB8]">
                              {player.mainTag} · {STATUS_META[player.status].label}
                            </p>
                          </div>
                        </div>
                        <FriendActionButton
                          handle={player.handle}
                          status={player.friendship}
                          onAction={onFriendAction}
                          compact
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </section>

          {/* Right Column: Private 1-on-1 Direct Message Chat (full-height screen on mobile when opened) */}
          <section
            aria-label={
              activeFriend ? `Direct message with ${activeFriend.handle}` : 'Direct message thread'
            }
            className={`glass-panel rounded-2xl flex-col lg:max-h-[calc(100dvh-11.5rem)] overflow-hidden ${
              mobileChatOpen ? 'flex h-[calc(100dvh-9.5rem)]' : 'hidden lg:flex'
            }`}
          >
            {activeFriend ? (
              <>
                {/* DM Header */}
                <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] px-3.5 sm:px-4 py-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <button
                      type="button"
                      onClick={() => onSetMobileChatOpen(false)}
                      aria-label="Back to friends list"
                      className="tactile-btn lg:hidden inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/14 bg-white/[0.07] px-2.5 text-xs font-semibold text-white shrink-0"
                    >
                      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                      <span>Back</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onInspectPlayer(activeFriend.handle)}
                      aria-label={`View ${activeFriend.handle} profile`}
                      className="relative shrink-0"
                    >
                      <Avatar src={activeFriend.avatar} name={activeFriend.name} size="sm" />
                      <span
                        aria-hidden="true"
                        className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#18112D] ${STATUS_META[activeFriend.status].dot}`}
                      />
                    </button>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="truncate text-base font-bold text-white">
                          {activeFriend.handle}
                        </h2>
                        <span
                          className={`text-xs font-medium whitespace-nowrap ${
                            STATUS_META[activeFriend.status].color
                          }`}
                        >
                          {STATUS_META[activeFriend.status].label}
                        </span>
                      </div>
                      <p className="truncate text-xs text-[#9B8FB8]">
                        Private 1-on-1 Chat · {activeFriend.currentGame ?? activeFriend.role}
                      </p>
                    </div>
                  </div>

                  <span className="hidden sm:inline text-xs font-mono text-[#A5F3FC] whitespace-nowrap">
                    E2E Private
                  </span>
                </div>

                {/* DM Stream */}
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3.5">
                  {dmMessages.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center text-center py-10">
                      <p className="text-sm font-medium text-white">
                        Say hello to {activeFriend.handle}
                      </p>
                      <p className="mt-1 text-xs text-[#9B8FB8]">
                        Coordinate queues, trade loadouts, or share a match recap privately.
                      </p>
                    </div>
                  ) : (
                    dmMessages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`animate-panel-reveal flex items-start gap-3 ${
                          msg.isCurrentUser ? 'flex-row-reverse' : ''
                        }`}
                      >
                        <Avatar src={msg.senderAvatar} name={msg.senderName} size="sm" />
                        <div
                          className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 ${
                            msg.isCurrentUser
                              ? 'bg-gradient-to-br from-[#FF6B35]/24 to-[#FF3E8A]/18 border border-[#FF6B35]/35 text-white'
                              : 'bg-white/[0.05] border border-white/[0.08] text-[#EDE8F8]'
                          }`}
                        >
                          <div className="flex items-center gap-2 text-xs mb-1">
                            <span className="font-semibold text-white">{msg.senderHandle}</span>
                            <span className="font-mono tabular-nums text-[11px] text-[#8F83AB]">
                              {msg.timestamp}
                            </span>
                          </div>
                          <ChatMessageContent
                            content={msg.content}
                            onOpenFullscreen={onOpenFullscreenMedia}
                          />
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={dmBottomRef} />
                </div>

                {/* DM Quick Helpers + Sticky Input */}
                <div className="sticky bottom-0 border-t border-white/[0.08] bg-[#100A20]/90 backdrop-blur-md p-3.5 space-y-2.5">
                  <div className="flex flex-wrap items-center gap-1.5" aria-label="Quick DM replies">
                    {DM_QUICK_HELPERS.map((token) => (
                      <button
                        key={token}
                        type="button"
                        onClick={() => setDmDraft((prev) => (prev ? `${prev} ${token}` : token))}
                        className="tactile-btn rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-[#D6CEE8] hover:border-[#22D3EE]/40 hover:bg-[#22D3EE]/12 hover:text-white whitespace-nowrap"
                      >
                        {token}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        setDmDraft((prev) =>
                          prev ? `${prev} ${SAMPLE_VIDEO_URL}` : `Check this clip: ${SAMPLE_VIDEO_URL}`,
                        )
                      }
                      className="tactile-btn inline-flex items-center gap-1 rounded-lg border border-[#FF9F43]/30 bg-[#FF6B35]/12 px-2.5 py-1 text-xs font-medium text-[#FFBE76] hover:bg-[#FF6B35]/20 whitespace-nowrap"
                    >
                      <Link2 className="h-3 w-3" aria-hidden="true" />
                      <span>Video Link</span>
                    </button>
                  </div>

                  <form onSubmit={handleDmSubmit} className="flex items-center gap-2.5">
                    <label htmlFor="dm-chat-input" className="sr-only">
                      Message {activeFriend.handle}
                    </label>
                    <input
                      id="dm-chat-input"
                      type="text"
                      value={dmDraft}
                      onChange={(e) => setDmDraft(e.target.value)}
                      placeholder={`Message ${activeFriend.handle} or paste a link...`}
                      className="h-11 flex-1 rounded-xl border border-white/12 bg-[#0D091A]/85 px-4 text-sm text-white placeholder:text-[#7E7299] focus:border-[#22D3EE]/60"
                    />
                    <button
                      type="submit"
                      disabled={!dmDraft.trim()}
                      aria-label="Send direct message"
                      className="tactile-btn inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-[#FF6B35] to-[#FF3E8A] px-4 text-sm font-semibold text-white disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      <Send className="h-4 w-4" aria-hidden="true" />
                      <span className="hidden sm:inline">Send</span>
                    </button>
                  </form>
                </div>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
                <p className="text-base font-semibold text-white">No friends selected</p>
                <p className="mt-1 text-xs text-[#9B8FB8]">
                  Add players from Explore or accept a request in Alerts to start a private chat.
                </p>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
