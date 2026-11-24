import { useMemo, useState } from 'react';
import {
  ArrowBigDown,
  ArrowBigUp,
  MessageCircle,
  MessageSquare,
  PenSquare,
  Search,
  Share2,
  UserPlus,
  X,
} from 'lucide-react';
import { Avatar } from './Avatar';
import { ClubIcon } from './Sidebar';
import { FriendActionButton } from './FriendActionButton';
import { CURRENT_USER } from '../data/seedData';
import type { Club, FriendshipStatus, PlayerProfile, Post } from '../types';
import { searchPlayersByHandle, type FeedSortMode } from '../utils/appLogic';

interface FeedViewProps {
  mode: 'home' | 'explore';
  posts: Post[];
  clubs: Club[];
  players: PlayerProfile[];
  activeClubFilter: string | null;
  searchQuery: string;
  sortMode: FeedSortMode;
  onSearchChange: (value: string) => void;
  onSortChange: (mode: FeedSortMode) => void;
  onClearClubFilter: () => void;
  onSelectTag: (tag: string) => void;
  onVote: (postId: string, direction: 'up' | 'down') => void;
  onOpenReply: (post: Post) => void;
  onOpenSharePost: (post: Post) => void;
  onOpenShareClub: (club: Club) => void;
  onOpenCreatePost: () => void;
  onToggleJoinClub: (clubId: string) => void;
  onOpenClubRoom: (clubId: string) => void;
  onFriendAction: (handle: string) => void;
  onMessageFriend: (handle: string) => void;
  onInspectPlayer: (handle: string) => void;
}

export function FeedView({
  mode,
  posts,
  clubs,
  players,
  activeClubFilter,
  searchQuery,
  sortMode,
  onSearchChange,
  onSortChange,
  onClearClubFilter,
  onSelectTag,
  onVote,
  onOpenReply,
  onOpenSharePost,
  onOpenShareClub,
  onOpenCreatePost,
  onToggleJoinClub,
  onOpenClubRoom,
  onFriendAction,
  onMessageFriend,
  onInspectPlayer,
}: FeedViewProps) {
  const [playerSearch, setPlayerSearch] = useState('');

  const friendshipByHandle = useMemo(() => {
    const map = new Map<string, FriendshipStatus>();
    for (const p of players) {
      map.set(p.handle, p.friendship);
    }
    return map;
  }, [players]);

  const matchingPlayers = useMemo(
    () => searchPlayersByHandle(players, playerSearch),
    [players, playerSearch],
  );

  return (
    <div className="space-y-5">
      {/* Header & Filter Bar */}
      <section className="glass-panel rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              {mode === 'home' ? 'Home Feed' : 'Explore Community'}
            </h1>
            <p className="mt-0.5 text-sm text-[#A79BC2]">
              {mode === 'home'
                ? 'Clean text posts, squad callouts, and match strategies.'
                : 'Discover active game clubs, find players to add, and browse top threads.'}
            </p>
          </div>

          <button
            type="button"
            onClick={onOpenCreatePost}
            className="tactile-btn sm:hidden inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-[#FF6B35] to-[#FF3E8A] px-4 text-xs font-semibold text-white whitespace-nowrap"
          >
            <PenSquare className="h-3.5 w-3.5" aria-hidden="true" />
            <span>New Post</span>
          </button>
        </div>

        {/* Search + Sort Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8F83AB]"
              aria-hidden="true"
            />
            <label htmlFor="feed-search" className="sr-only">
              Search posts, players, or game tags
            </label>
            <input
              id="feed-search"
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search text posts, players, or #tags..."
              className="h-10 w-full rounded-xl border border-white/10 bg-[#0D091A]/75 pl-10 pr-4 text-sm text-[#F7F4FF] placeholder:text-[#7E7299] focus:border-[#22D3EE]/60"
            />
          </div>

          <div
            role="tablist"
            aria-label="Sort posts"
            className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-[#0D091A]/65 p-1 shrink-0"
          >
            {(
              [
                { id: 'latest', label: 'Latest' },
                { id: 'top', label: 'Top' },
                { id: 'following', label: 'Following' },
              ] as const
            ).map((tab) => {
              const active = sortMode === tab.id;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  type="button"
                  aria-selected={active}
                  onClick={() => onSortChange(tab.id)}
                  className={`tactile-btn rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
                    active
                      ? 'bg-[#FF6B35]/20 text-white border border-[#FF6B35]/40'
                      : 'text-[#A79BC2] hover:text-white border border-transparent'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Active Club Filter Notice */}
        {activeClubFilter ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-[#22D3EE]/30 bg-[#22D3EE]/10 px-3.5 py-2 text-xs">
            <span className="text-[#CFFAFE]">
              Filtering feed by <strong className="font-semibold text-white">{activeClubFilter}</strong>
            </span>
            <button
              type="button"
              onClick={onClearClubFilter}
              aria-label={`Clear ${activeClubFilter} filter`}
              className="tactile-btn inline-flex items-center gap-1 font-medium text-[#22D3EE] hover:text-white whitespace-nowrap"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Show all</span>
            </button>
          </div>
        ) : null}
      </section>

      {/* Explore Mode: Find Players + Active Game Clubs */}
      {mode === 'explore' ? (
        <>
          <section aria-label="Find players" className="glass-panel rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-[#22D3EE]" aria-hidden="true" />
                <h2 className="text-base font-semibold text-white">Find Players</h2>
              </div>
              <div className="relative w-full sm:w-64">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8F83AB]"
                  aria-hidden="true"
                />
                <label htmlFor="explore-player-search" className="sr-only">
                  Search players by handle or game tag
                </label>
                <input
                  id="explore-player-search"
                  type="search"
                  value={playerSearch}
                  onChange={(e) => setPlayerSearch(e.target.value)}
                  placeholder="Search by handle or #game..."
                  className="h-9 w-full rounded-xl border border-white/10 bg-[#0D091A]/80 pl-8 pr-3 text-xs text-white placeholder:text-[#7E7299] focus:border-[#22D3EE]/60"
                />
              </div>
            </div>

            {matchingPlayers.length === 0 ? (
              <p className="py-4 text-center text-xs text-[#9B8FB8]">
                No players matched “{playerSearch}”.
              </p>
            ) : (
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {matchingPlayers.map((player) => (
                  <li
                    key={player.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-[#120C24]/70 p-3"
                  >
                    <button
                      type="button"
                      onClick={() => onInspectPlayer(player.handle)}
                      aria-label={`View ${player.handle} profile`}
                      className="flex items-center gap-2.5 min-w-0 text-left group"
                    >
                      <Avatar src={player.avatar} name={player.name} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white group-hover:text-[#FF9F43] transition-colors">
                          {player.handle}
                        </p>
                        <p className="truncate text-xs text-[#9B8FB8]">
                          {player.mainTag} · {player.currentGame ?? player.role}
                        </p>
                      </div>
                    </button>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {player.friendship === 'friends' ? (
                        <button
                          type="button"
                          onClick={() => onMessageFriend(player.handle)}
                          aria-label={`Message ${player.handle}`}
                          className="tactile-btn inline-flex h-8 items-center gap-1 rounded-lg border border-[#22D3EE]/35 bg-[#22D3EE]/12 px-2.5 text-xs font-medium text-[#A5F3FC] hover:bg-[#22D3EE]/20 whitespace-nowrap"
                        >
                          <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Message</span>
                        </button>
                      ) : (
                        <FriendActionButton
                          handle={player.handle}
                          status={player.friendship}
                          onAction={onFriendAction}
                        />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label="Discover clubs" className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-sm font-semibold text-white">Active Game Clubs</h2>
              <span className="text-xs text-[#9B8FB8] font-mono tabular-nums">
                {clubs.length} rooms
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {clubs.map((club) => (
                <article
                  key={club.id}
                  className="glass-panel rounded-2xl p-4 flex flex-col justify-between gap-3"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <ClubIcon icon={club.icon} className="h-4 w-4 text-[#FF8C42] shrink-0" />
                        <h3 className="truncate text-base font-semibold text-white">{club.name}</h3>
                      </div>
                      <span className="font-mono tabular-nums text-xs text-[#22D3EE] whitespace-nowrap">
                        {club.onlineCount} online
                      </span>
                    </div>
                    <p className="text-xs text-[#A79BC2] leading-relaxed">{club.description}</p>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/[0.06]">
                    <span className="text-xs text-[#9B8FB8] font-mono tabular-nums">
                      {club.tag} · {club.memberCount.toLocaleString()}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onOpenShareClub(club)}
                        aria-label={`Share ${club.name} club`}
                        className="tactile-btn inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-[#C2B7D9] hover:bg-white/[0.09] hover:text-white"
                      >
                        <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenClubRoom(club.id)}
                        className="tactile-btn rounded-lg border border-white/12 bg-white/[0.04] px-2.5 py-1.5 text-xs font-medium text-[#E4DDF5] hover:bg-white/[0.09] whitespace-nowrap"
                      >
                        Open Chat
                      </button>
                      <button
                        type="button"
                        onClick={() => onToggleJoinClub(club.id)}
                        className={`tactile-btn rounded-lg px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap ${
                          club.joined
                            ? 'border border-[#22D3EE]/35 bg-[#22D3EE]/12 text-[#A5F3FC]'
                            : 'bg-gradient-to-r from-[#FF6B35] to-[#FF3E8A] text-white'
                        }`}
                      >
                        {club.joined ? 'Joined' : 'Join'}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      ) : null}

      {/* Text Post Stream */}
      <section aria-label="Text posts" className="space-y-3.5">
        {posts.length === 0 ? (
          <div className="glass-panel rounded-2xl p-8 text-center space-y-3">
            <h2 className="text-base font-semibold text-white">No matching posts yet</h2>
            <p className="text-sm text-[#A79BC2] max-w-md mx-auto">
              Try clearing your filter or start the conversation yourself with a new text post.
            </p>
            <div className="flex items-center justify-center gap-3 pt-1">
              {activeClubFilter || searchQuery ? (
                <button
                  type="button"
                  onClick={() => {
                    onClearClubFilter();
                    onSearchChange('');
                  }}
                  className="tactile-btn rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2 text-xs font-medium text-white hover:bg-white/[0.1]"
                >
                  Reset Filters
                </button>
              ) : null}
              <button
                type="button"
                onClick={onOpenCreatePost}
                className="tactile-btn rounded-xl bg-gradient-to-r from-[#FF6B35] to-[#FF3E8A] px-4 py-2 text-xs font-semibold text-white"
              >
                Create Post
              </button>
            </div>
          </div>
        ) : (
          posts.map((post, idx) => {
            const isOwnPost = post.handle === CURRENT_USER.handle;
            const friendStatus = friendshipByHandle.get(post.handle) ?? 'none';

            return (
              <article
                key={post.id}
                style={{ animationDelay: `${Math.min(idx * 28, 140)}ms` }}
                className="animate-panel-reveal glass-panel rounded-2xl p-4 sm:p-5 transition-colors hover:border-white/[0.15]"
              >
                {/* Post Header with Player Profile trigger & Friend Action */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {!isOwnPost ? (
                      <button
                        type="button"
                        onClick={() => onInspectPlayer(post.handle)}
                        aria-label={`Open ${post.handle} profile`}
                        className="shrink-0 rounded-full focus-visible:outline-none"
                      >
                        <Avatar src={post.avatar} name={post.author} size="md" />
                      </button>
                    ) : (
                      <Avatar src={post.avatar} name={post.author} size="md" />
                    )}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        {!isOwnPost ? (
                          <button
                            type="button"
                            onClick={() => onInspectPlayer(post.handle)}
                            className="text-sm font-semibold text-white hover:text-[#FF9F43] transition-colors truncate"
                          >
                            {post.handle}
                          </button>
                        ) : (
                          <span className="text-sm font-semibold text-white truncate">
                            {post.handle}
                          </span>
                        )}
                        <span className="text-white/25 text-xs" aria-hidden="true">
                          ·
                        </span>
                        <span className="text-xs text-[#9B8FB8] font-mono tabular-nums">
                          {post.timestamp}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onSelectTag(post.gameTag)}
                        className="mt-0.5 text-xs font-medium text-[#FF9F43] hover:text-[#22D3EE] transition-colors"
                      >
                        {post.gameTag}
                      </button>
                    </div>
                  </div>

                  {!isOwnPost ? (
                    <FriendActionButton
                      handle={post.handle}
                      status={friendStatus}
                      onAction={onFriendAction}
                      compact
                    />
                  ) : null}
                </div>

                {/* Post Body Text */}
                <p className="mt-3.5 text-[15px] leading-relaxed text-[#EDE8F8] whitespace-pre-line">
                  {post.content}
                </p>

                {/* Post Actions Bar */}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/[0.06]">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onVote(post.id, 'up')}
                      aria-label={`Upvote post by ${post.handle}`}
                      aria-pressed={post.userVote === 'up'}
                      className={`tactile-btn inline-flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold ${
                        post.userVote === 'up'
                          ? 'bg-[#FF6B35]/20 text-[#FF9F43] border border-[#FF6B35]/40'
                          : 'text-[#B5A9CE] hover:bg-white/[0.06] hover:text-white border border-transparent'
                      }`}
                    >
                      <ArrowBigUp className="h-4 w-4" aria-hidden="true" />
                      <span>Upvote</span>
                    </button>

                    <span
                      aria-label={`Score ${post.score}`}
                      className="min-w-[2.25rem] text-center font-mono tabular-nums text-xs font-semibold text-white"
                    >
                      {post.score}
                    </span>

                    <button
                      type="button"
                      onClick={() => onVote(post.id, 'down')}
                      aria-label={`Downvote post by ${post.handle}`}
                      aria-pressed={post.userVote === 'down'}
                      className={`tactile-btn inline-flex h-9 items-center gap-1 rounded-xl px-2 text-xs font-medium ${
                        post.userVote === 'down'
                          ? 'bg-[#FF3E8A]/20 text-[#FF6DA6] border border-[#FF3E8A]/40'
                          : 'text-[#9B8FB8] hover:bg-white/[0.06] hover:text-white border border-transparent'
                      }`}
                    >
                      <ArrowBigDown className="h-4 w-4" aria-hidden="true" />
                      <span className="sr-only">Downvote</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenReply(post)}
                      aria-label={`Open replies for ${post.handle}'s post (${post.replies.length} ${post.replies.length === 1 ? 'reply' : 'replies'})`}
                      className="tactile-btn inline-flex h-9 items-center gap-1.5 rounded-xl border border-transparent px-3 text-xs font-medium text-[#C2B7D9] hover:border-white/10 hover:bg-white/[0.06] hover:text-white whitespace-nowrap"
                    >
                      <MessageSquare className="h-4 w-4 text-[#22D3EE]" aria-hidden="true" />
                      <span className="font-mono tabular-nums">{post.replies.length}</span>
                      <span>{post.replies.length === 1 ? 'Reply' : 'Replies'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onOpenSharePost(post)}
                      aria-label={`Share post by ${post.handle}`}
                      className="tactile-btn inline-flex h-9 items-center gap-1.5 rounded-xl border border-transparent px-3 text-xs font-medium text-[#C2B7D9] hover:border-white/10 hover:bg-white/[0.06] hover:text-white whitespace-nowrap"
                    >
                      <Share2 className="h-4 w-4" aria-hidden="true" />
                      <span>Share</span>
                    </button>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
