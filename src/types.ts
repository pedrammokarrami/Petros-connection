export type NavSection = 'home' | 'explore' | 'social' | 'alerts' | 'profile' | 'settings';

export type SocialSubTab = 'clubs' | 'dms';

export type VoteState = 'up' | 'down' | null;

export type MemberStatus = 'in-game' | 'online' | 'away' | 'offline';

export type FriendshipStatus = 'none' | 'pending_outgoing' | 'pending_incoming' | 'friends';

export interface PlayerProfile {
  id: string;
  name: string;
  handle: string;
  avatar?: string;
  status: MemberStatus;
  currentGame?: string;
  role: string;
  mainTag: string;
  friendship: FriendshipStatus;
}

export interface FriendRequest {
  id: string;
  playerId: string;
  name: string;
  handle: string;
  avatar?: string;
  note: string;
  gameTag: string;
  timestamp: string;
}

export interface DirectMessage {
  id: string;
  friendHandle: string;
  senderHandle: string;
  senderName: string;
  senderAvatar?: string;
  content: string;
  timestamp: string;
  isCurrentUser?: boolean;
}

export interface SharePayload {
  kind: 'post' | 'club' | 'profile';
  title: string;
  subtitle: string;
  previewText: string;
  shareUrl: string;
}

export interface Reply {
  id: string;
  author: string;
  handle: string;
  avatar?: string;
  content: string;
  timestamp: string;
  likes: number;
  likedByMe?: boolean;
}

export interface Post {
  id: string;
  author: string;
  handle: string;
  avatar?: string;
  gameTag: string;
  content: string;
  timestamp: string;
  createdAtMs: number;
  score: number;
  userVote: VoteState;
  replies: Reply[];
  isFollowing?: boolean;
}

export type ClubIconKey = 'gamepad' | 'crosshair' | 'trophy' | 'flame' | 'zap' | 'shield' | 'message';

export interface Club {
  id: string;
  name: string;
  tag: string;
  description: string;
  category: 'general' | 'game' | 'event';
  icon: ClubIconKey;
  memberCount: number;
  onlineCount: number;
  joined: boolean;
  unreadCount?: number;
}

export interface ChatMessage {
  id: string;
  clubId: string;
  author: string;
  handle: string;
  avatar?: string;
  roleTag?: string;
  content: string;
  timestamp: string;
  isCurrentUser?: boolean;
}

export interface Achievement {
  id: string;
  title: string;
  gameTag: string;
  description: string;
  verifiedLabel: string;
  earnedDate: string;
  accent: 'orange' | 'pink' | 'cyan';
}

export interface AutomationRule {
  id: string;
  name: string;
  trigger: string;
  action: string;
  messagePreview: string;
  enabled: boolean;
  isCustom?: boolean;
}

export interface GamePlatform {
  id: string;
  name: string;
  installedGames: number;
  connected: boolean;
}

export interface LocalBridgeSettings {
  soundEnabled: boolean;
  p2pEnabled: boolean;
  maxPeers: number;
  relayBridgeEnabled: boolean;
  autoDetectGames: boolean;
  syncGameProgress: boolean;
  allowApiOverlay: boolean;
  platforms: GamePlatform[];
}

export interface NotificationItem {
  id: string;
  type: 'reply' | 'upvote' | 'squad' | 'club';
  actor: string;
  avatar?: string;
  message: string;
  timestamp: string;
  read: boolean;
  targetPostId?: string;
  targetClubId?: string;
}
