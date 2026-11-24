import type { FriendshipStatus, PlayerProfile, Post, SharePayload, VoteState } from '../types';

export interface VoteResult {
  score: number;
  userVote: VoteState;
}

/**
 * Pure vote toggle logic for post upvoting/downvoting.
 */
export function toggleVote(
  currentVote: VoteState,
  currentScore: number,
  direction: 'up' | 'down',
): VoteResult {
  if (currentVote === direction) {
    // Undo existing vote
    return {
      score: direction === 'up' ? currentScore - 1 : currentScore + 1,
      userVote: null,
    };
  }

  if (currentVote === null) {
    return {
      score: direction === 'up' ? currentScore + 1 : currentScore - 1,
      userVote: direction,
    };
  }

  // Switching from up -> down or down -> up changes score by 2
  return {
    score: direction === 'up' ? currentScore + 2 : currentScore - 2,
    userVote: direction,
  };
}

export type FeedSortMode = 'latest' | 'top' | 'following';

export interface PostFilterOptions {
  clubTag: string | null;
  searchQuery: string;
  sortMode: FeedSortMode;
}

/**
 * Filters and sorts posts deterministically.
 */
export function filterAndSortPosts(posts: Post[], options: PostFilterOptions): Post[] {
  const normalizedQuery = options.searchQuery.trim().toLowerCase();
  const normalizedTag = options.clubTag ? options.clubTag.toLowerCase() : null;

  const filtered = posts.filter((post) => {
    if (normalizedTag && post.gameTag.toLowerCase() !== normalizedTag) {
      return false;
    }
    if (options.sortMode === 'following' && !post.isFollowing && post.handle !== 'AIGAMERIA_OP') {
      return false;
    }
    if (normalizedQuery) {
      const matchesContent = post.content.toLowerCase().includes(normalizedQuery);
      const matchesAuthor = post.author.toLowerCase().includes(normalizedQuery);
      const matchesHandle = post.handle.toLowerCase().includes(normalizedQuery);
      const matchesTag = post.gameTag.toLowerCase().includes(normalizedQuery);
      if (!matchesContent && !matchesAuthor && !matchesHandle && !matchesTag) {
        return false;
      }
    }
    return true;
  });

  return [...filtered].sort((a, b) => {
    if (options.sortMode === 'top') {
      if (b.score !== a.score) return b.score - a.score;
    }
    return b.createdAtMs - a.createdAtMs;
  });
}

export interface NetworkMetrics {
  strengthPercent: number;
  label: 'Offline' | 'Standard' | 'Strong' | 'Optimal';
  estimatedPingMs: number;
  activePeers: number;
}

/**
 * Calculates local mesh network health from user settings.
 */
export function computeNetworkStrength(config: {
  p2pEnabled: boolean;
  maxPeers: number;
  relayBridgeEnabled: boolean;
}): NetworkMetrics {
  const clampedPeers = Math.max(4, Math.min(64, Math.round(config.maxPeers)));

  if (!config.p2pEnabled && !config.relayBridgeEnabled) {
    return {
      strengthPercent: 18,
      label: 'Offline',
      estimatedPingMs: 92,
      activePeers: 0,
    };
  }

  let strength = 0;
  if (config.p2pEnabled) {
    strength += 45 + Math.round(((clampedPeers - 4) / 60) * 35);
  } else {
    strength += 36;
  }

  if (config.relayBridgeEnabled) {
    strength += 18;
  }

  const strengthPercent = Math.max(20, Math.min(100, strength));
  const label: NetworkMetrics['label'] =
    strengthPercent >= 85 ? 'Optimal' : strengthPercent >= 62 ? 'Strong' : 'Standard';

  const estimatedPingMs = Math.max(
    11,
    Math.round(52 - strengthPercent * 0.36 + (config.relayBridgeEnabled ? -3 : 4)),
  );

  const activePeers = config.p2pEnabled
    ? Math.max(2, Math.min(clampedPeers, Math.round(clampedPeers * 0.62)))
    : config.relayBridgeEnabled
      ? 4
      : 0;

  return {
    strengthPercent,
    label,
    estimatedPingMs,
    activePeers,
  };
}

/**
 * Normalizes a club name into a clean #Tag string.
 */
export function formatClubTag(rawName: string): string {
  const cleaned = rawName
    .trim()
    .replace(/^#+/, '')
    .replace(/[^a-zA-Z0-9\s_-]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

  return cleaned ? `#${cleaned}` : '';
}

export function validatePostForm(content: string, gameTag: string): string | null {
  const trimmed = content.trim();
  if (!trimmed) {
    return 'Write a message before publishing your post.';
  }
  if (trimmed.length < 4) {
    return 'Your post should be at least 4 characters long.';
  }
  if (trimmed.length > 500) {
    return 'Posts are limited to 500 characters to keep feeds crisp.';
  }
  if (!gameTag.trim()) {
    return 'Choose a game tag for your post.';
  }
  return null;
}

export function validateClubForm(name: string, description: string): string | null {
  const trimmedName = name.trim();
  if (!trimmedName) {
    return 'Give your club a clear name.';
  }
  if (trimmedName.length < 2) {
    return 'Club name must be at least 2 characters.';
  }
  if (trimmedName.length > 28) {
    return 'Keep club names under 28 characters.';
  }
  if (!formatClubTag(trimmedName)) {
    return 'Club name must contain letters or numbers.';
  }
  if (description.trim().length > 120) {
    return 'Description should stay under 120 characters.';
  }
  return null;
}

export function validateRuleForm(
  name: string,
  trigger: string,
  action: string,
  messagePreview: string,
): string | null {
  if (!name.trim()) {
    return 'Enter a name for your automation rule.';
  }
  if (!trigger.trim() || !action.trim()) {
    return 'Select both a trigger and a text action.';
  }
  if (!messagePreview.trim()) {
    return 'Add the text message this rule should post.';
  }
  return null;
}

/**
 * Generates a contextual, friendly squadmate reply for live-feeling text chat.
 */
export function generateSquadReply(clubName: string, userMessage: string): {
  author: string;
  handle: string;
  roleTag: string;
  content: string;
  avatar: string;
} {
  const lower = userMessage.toLowerCase();
  if (lower.includes('lfg') || lower.includes('queue') || lower.includes('ready') || lower.includes('squad')) {
    return {
      author: 'Nova_Strike',
      handle: 'Nova_Strike',
      roleTag: 'Squad Lead',
      avatar: '/src/assets/images/avatar_squad_nova_1795473084646.jpg',
      content: `Count me in for ${clubName}! Wrapping up warmup now, invite in 2 mins.`,
    };
  }
  if (lower.includes('gg') || lower.includes('win') || lower.includes('clutch')) {
    return {
      author: 'Kairo_GG',
      handle: 'Kairo_GG',
      roleTag: 'Analyst',
      avatar: '/src/assets/images/avatar_squad_kairo_1795473083913.jpg',
      content: 'Clean play! Drop the match recap in the main feed too so the club sees it.',
    };
  }
  return {
    author: 'Vega_Pulse',
    handle: 'Vega_Pulse',
    roleTag: 'Club Mod',
    avatar: '/src/assets/images/avatar_squad_vega_1795473084815.jpg',
    content: `Copy that in ${clubName} — squad channel is active tonight if anyone wants to run sets.`,
  };
}

/**
 * Transitions friendship status when clicking the Add Friend / Pending / Accept control.
 */
export function nextFriendshipStatus(current: FriendshipStatus): FriendshipStatus {
  if (current === 'none') return 'pending_outgoing';
  if (current === 'pending_incoming') return 'friends';
  return current;
}

/**
 * Filters players by handle, display name, or game tag.
 */
export function searchPlayersByHandle(players: PlayerProfile[], query: string): PlayerProfile[] {
  const q = query.trim().toLowerCase();
  if (!q) return players;
  return players.filter(
    (p) =>
      p.handle.toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q) ||
      p.mainTag.toLowerCase().includes(q) ||
      (p.currentGame?.toLowerCase().includes(q) ?? false),
  );
}

/**
 * Formats a clean text-only shared message for Club chat or Direct Message delivery.
 */
export function formatSharedTextMessage(payload: SharePayload, note?: string): string {
  const header =
    payload.kind === 'post'
      ? `Shared Post (${payload.subtitle}): "${payload.previewText}"`
      : payload.kind === 'club'
        ? `Club Invite — ${payload.title} (${payload.subtitle}): ${payload.previewText}`
        : `Player Profile — ${payload.title} (${payload.subtitle}): ${payload.previewText}`;
  const trimmedNote = note?.trim();
  return trimmedNote ? `${trimmedNote} — ${header}` : header;
}

/**
 * Generates a friendly 1-on-1 DM reply from a squad friend.
 */
export function generateDirectMessageReply(friend: PlayerProfile, userMessage: string): string {
  const lower = userMessage.toLowerCase();
  if (lower.includes('shared post') || lower.includes('club invite') || lower.includes('player profile')) {
    return `Got it! Just checked that out — appreciate the share.`;
  }
  if (lower.includes('lfg') || lower.includes('queue') || lower.includes('ready') || lower.includes('match')) {
    return `I'm down! Give me 3 minutes to finish settings and send the lobby invite.`;
  }
  if (lower.includes('gg')) {
    return `GGs! Solid rounds tonight — same time tomorrow?`;
  }
  return `Sounds good! ${friend.currentGame ? `Wrapping up ${friend.currentGame} soon, ` : ''}I'll keep this DM open.`;
}

