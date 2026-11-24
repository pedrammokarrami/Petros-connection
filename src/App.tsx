import { useEffect, useMemo, useState } from 'react';
import { Bell, Compass, Home, Users, X } from 'lucide-react';
import { TopBar } from './components/TopBar';
import { Sidebar } from './components/Sidebar';
import { RightPanel } from './components/RightPanel';
import { FeedView } from './components/FeedView';
import { SquadChatView } from './components/SquadChatView';
import { ProfileView } from './components/ProfileView';
import { SettingsView } from './components/SettingsView';
import { NotificationsView } from './components/NotificationsView';
import {
  CreateClubModal,
  CreatePostModal,
  CreateRuleModal,
  ReplyDrawer,
} from './components/Modals';
import { ShareModal } from './components/ShareModal';
import { InviteGateLanding, type InviteChannel } from './components/InviteGateLanding';
import { MediaLightboxModal } from './components/MediaLightboxModal';
import { PlayerProfileModal } from './components/PlayerProfileModal';
import { OfflineIndicator } from './components/OfflineIndicator';
import {
  CURRENT_USER,
  INITIAL_ACHIEVEMENTS,
  INITIAL_AUTOMATION_RULES,
  INITIAL_CHAT_MESSAGES,
  INITIAL_CLUBS,
  INITIAL_DIRECT_MESSAGES,
  INITIAL_DM_UNREAD,
  INITIAL_FRIEND_REQUESTS,
  INITIAL_NOTIFICATIONS,
  INITIAL_PLAYERS,
  INITIAL_POSTS,
  INITIAL_SETTINGS,
} from './data/seedData';
import type {
  AutomationRule,
  ChatMessage,
  Club,
  ClubIconKey,
  DirectMessage,
  FriendRequest,
  LocalBridgeSettings,
  NavSection,
  NotificationItem,
  PlayerProfile,
  Post,
  SharePayload,
  SocialSubTab,
} from './types';
import {
  computeNetworkStrength,
  filterAndSortPosts,
  formatSharedTextMessage,
  generateDirectMessageReply,
  generateSquadReply,
  nextFriendshipStatus,
  toggleVote,
  type FeedSortMode,
} from './utils/appLogic';
import { soundEngine } from './utils/soundEngine';
import type { ParsedMediaLink } from './utils/mediaParser';
import { p2pClient } from './services/p2pClient';
import { saveEncryptedVaultRecord } from './services/browserCrypto';

const STORAGE_KEY = 'aigameria_state_v2';
const UNLOCK_STORAGE_KEY = 'aigameria_unlocked_v1';

interface PersistedState {
  posts: Post[];
  clubs: Club[];
  players: PlayerProfile[];
  friendRequests: FriendRequest[];
  messagesByClub: Record<string, ChatMessage[]>;
  directMessagesByHandle: Record<string, DirectMessage[]>;
  dmUnreadByHandle?: Record<string, number>;
  settings: LocalBridgeSettings;
  rules: AutomationRule[];
  notifications: NotificationItem[];
}

function loadInitialUnlockState(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') return true;
    const raw = window.localStorage.getItem(UNLOCK_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { unlocked?: boolean };
    return parsed?.unlocked === true;
  } catch {
    return false;
  }
}

function loadPersistedState(): PersistedState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    if (!Array.isArray(parsed.posts) || !Array.isArray(parsed.clubs) || !parsed.settings) {
      return null;
    }
    return {
      posts: parsed.posts,
      clubs: parsed.clubs,
      players: Array.isArray(parsed.players) ? parsed.players : INITIAL_PLAYERS,
      friendRequests: Array.isArray(parsed.friendRequests)
        ? parsed.friendRequests
        : INITIAL_FRIEND_REQUESTS,
      messagesByClub: parsed.messagesByClub ?? INITIAL_CHAT_MESSAGES,
      directMessagesByHandle: parsed.directMessagesByHandle ?? INITIAL_DIRECT_MESSAGES,
      dmUnreadByHandle: parsed.dmUnreadByHandle ?? INITIAL_DM_UNREAD,
      settings: parsed.settings,
      rules: Array.isArray(parsed.rules) ? parsed.rules : INITIAL_AUTOMATION_RULES,
      notifications: Array.isArray(parsed.notifications)
        ? parsed.notifications
        : INITIAL_NOTIFICATIONS,
    };
  } catch {
    return null;
  }
}

function getCurrentTimeLabel(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function loadInitialNavSection(): NavSection {
  try {
    if (typeof window === 'undefined') return 'home';
    const tab = new URLSearchParams(window.location.search).get('tab');
    if (tab === 'home' || tab === 'explore' || tab === 'social' || tab === 'alerts' || tab === 'profile' || tab === 'settings') {
      return tab;
    }
  } catch {
    // ignore
  }
  return 'home';
}

export default function App() {
  const saved = useMemo(() => (typeof window !== 'undefined' ? loadPersistedState() : null), []);

  // Invite-only gate state ('locked' -> 'revealing' -> 'unlocked')
  const [gatePhase, setGatePhase] = useState<'locked' | 'revealing' | 'unlocked'>(() =>
    loadInitialUnlockState() ? 'unlocked' : 'locked',
  );

  const [activeSection, setActiveSection] = useState<NavSection>(() => loadInitialNavSection());
  const [posts, setPosts] = useState<Post[]>(() => saved?.posts ?? INITIAL_POSTS);
  const [clubs, setClubs] = useState<Club[]>(() => saved?.clubs ?? INITIAL_CLUBS);
  const [players, setPlayers] = useState<PlayerProfile[]>(
    () => saved?.players ?? INITIAL_PLAYERS,
  );
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>(
    () => saved?.friendRequests ?? INITIAL_FRIEND_REQUESTS,
  );
  const [messagesByClub, setMessagesByClub] = useState<Record<string, ChatMessage[]>>(
    () => saved?.messagesByClub ?? INITIAL_CHAT_MESSAGES,
  );
  const [directMessagesByHandle, setDirectMessagesByHandle] = useState<
    Record<string, DirectMessage[]>
  >(() => saved?.directMessagesByHandle ?? INITIAL_DIRECT_MESSAGES);
  const [dmUnreadByHandle, setDmUnreadByHandle] = useState<Record<string, number>>(
    () => saved?.dmUnreadByHandle ?? INITIAL_DM_UNREAD,
  );
  const [settings, setSettings] = useState<LocalBridgeSettings>(
    () => saved?.settings ?? INITIAL_SETTINGS,
  );
  const [rules, setRules] = useState<AutomationRule[]>(
    () => saved?.rules ?? INITIAL_AUTOMATION_RULES,
  );
  const [notifications, setNotifications] = useState<NotificationItem[]>(
    () => saved?.notifications ?? INITIAL_NOTIFICATIONS,
  );

  // Feed filters & Social Hub state
  const [activeClubFilter, setActiveClubFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<FeedSortMode>('latest');
  const [socialSubTab, setSocialSubTab] = useState<SocialSubTab>('clubs');
  const [activeChatClubId, setActiveChatClubId] = useState<string>('general-chat');
  const [activeDmHandle, setActiveDmHandle] = useState<string | null>('Nova_Strike');
  const [mobileChatOpen, setMobileChatOpen] = useState(false);

  // Modals & drawers
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  const [isClubModalOpen, setIsClubModalOpen] = useState(false);
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [replyPostId, setReplyPostId] = useState<string | null>(null);
  const [sharePayload, setSharePayload] = useState<SharePayload | null>(null);
  const [fullscreenMedia, setFullscreenMedia] = useState<ParsedMediaLink | null>(null);
  const [inspectedPlayerHandle, setInspectedPlayerHandle] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Sync Web Audio mute state
  useEffect(() => {
    soundEngine.setEnabled(settings.soundEnabled);
  }, [settings.soundEnabled]);

  // Connect real WebSocket/WebRTC P2P signaling & receive E2EE peer messages
  useEffect(() => {
    if (gatePhase !== 'unlocked' || !settings.p2pEnabled) {
      p2pClient.disconnect();
      return;
    }
    void p2pClient.connect(CURRENT_USER.handle);
    const unsub = p2pClient.subscribeMessages((incoming) => {
      if (incoming.roomId.startsWith('dm:')) {
        const friendHandle = incoming.senderHandle;
        setDirectMessagesByHandle((prev) => ({
          ...prev,
          [friendHandle]: [
            ...(prev[friendHandle] ?? []),
            {
              id: `p2p-dm-${incoming.timestamp}`,
              friendHandle,
              senderHandle: incoming.senderHandle,
              senderName: incoming.senderHandle,
              senderAvatar: '',
              content: incoming.content,
              timestamp: getCurrentTimeLabel(),
            },
          ],
        }));
      }
    });
    return () => {
      unsub();
    };
  }, [gatePhase, settings.p2pEnabled]);

  // Mirror private DMs into local AES-256-GCM encrypted-at-rest IndexedDB vault
  useEffect(() => {
    if (typeof indexedDB === 'undefined') return;
    void saveEncryptedVaultRecord('private_dms_v1', directMessagesByHandle).catch(() => {});
  }, [directMessagesByHandle]);

  // Native desktop keyboard navigation shortcuts (Windows & macOS)
  useEffect(() => {
    if (gatePhase !== 'unlocked') return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        soundEngine.playNavTick();
        setActiveSection('explore');
        window.setTimeout(() => {
          document.getElementById('explore-player-search')?.focus();
        }, 60);
        return;
      }

      if (isTyping || !e.altKey) return;
      if (e.key === '1') {
        e.preventDefault();
        soundEngine.playNavTick();
        setActiveSection('home');
      } else if (e.key === '2') {
        e.preventDefault();
        soundEngine.playNavTick();
        setActiveSection('explore');
      } else if (e.key === '3') {
        e.preventDefault();
        soundEngine.playNavTick();
        setActiveSection('social');
      } else if (e.key === '4') {
        e.preventDefault();
        soundEngine.playNavTick();
        setActiveSection('alerts');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [gatePhase]);

  // Persist user state cleanly to localStorage
  useEffect(() => {
    try {
      const payload: PersistedState = {
        posts,
        clubs,
        players,
        friendRequests,
        messagesByClub,
        directMessagesByHandle,
        dmUnreadByHandle,
        settings,
        rules,
        notifications,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage quota errors cleanly
    }
  }, [
    posts,
    clubs,
    players,
    friendRequests,
    messagesByClub,
    directMessagesByHandle,
    dmUnreadByHandle,
    settings,
    rules,
    notifications,
  ]);

  const networkMetrics = useMemo(
    () =>
      computeNetworkStrength({
        p2pEnabled: settings.p2pEnabled,
        maxPeers: settings.maxPeers,
        relayBridgeEnabled: settings.relayBridgeEnabled,
      }),
    [settings.p2pEnabled, settings.maxPeers, settings.relayBridgeEnabled],
  );

  const visiblePosts = useMemo(
    () =>
      filterAndSortPosts(posts, {
        clubTag: activeClubFilter,
        searchQuery,
        sortMode,
      }),
    [posts, activeClubFilter, searchQuery, sortMode],
  );

  const friendsList = useMemo(
    () => players.filter((p) => p.friendship === 'friends'),
    [players],
  );

  const trendingTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const club of clubs) {
      if (club.category !== 'general') {
        counts.set(club.tag, 0);
      }
    }
    for (const post of posts) {
      counts.set(post.gameTag, (counts.get(post.gameTag) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([tag, postCount]) => ({ tag, postCount }))
      .sort((a, b) => b.postCount - a.postCount)
      .slice(0, 6);
  }, [posts, clubs]);

  const userPosts = useMemo(
    () => posts.filter((p) => p.handle === CURRENT_USER.handle),
    [posts],
  );

  const alertCount = useMemo(
    () => notifications.filter((n) => !n.read).length + friendRequests.length,
    [notifications, friendRequests],
  );

  const socialUnreadCount = useMemo(() => {
    const clubUnread = clubs.reduce((acc, c) => acc + (c.unreadCount ?? 0), 0);
    const dmUnread = friendsList.reduce(
      (acc, f) => acc + (dmUnreadByHandle[f.handle] ?? 0),
      0,
    );
    return clubUnread + dmUnread;
  }, [clubs, friendsList, dmUnreadByHandle]);

  const activeReplyPost = useMemo(
    () => (replyPostId ? posts.find((p) => p.id === replyPostId) ?? null : null),
    [posts, replyPostId],
  );

  const inspectedPlayer = useMemo(
    () =>
      inspectedPlayerHandle
        ? players.find((p) => p.handle === inspectedPlayerHandle) ?? null
        : null,
    [players, inspectedPlayerHandle],
  );

  // Invite-only gate unlock & reveal trigger
  const handleTriggerInviteUnlock = (channel: InviteChannel, recipientNote: string) => {
    soundEngine.playUnlockReveal();
    try {
      window.localStorage.setItem(
        UNLOCK_STORAGE_KEY,
        JSON.stringify({
          unlocked: true,
          channel,
          recipientNote: recipientNote || undefined,
          unlockedAt: Date.now(),
        }),
      );
    } catch {
      // Ignore storage errors cleanly
    }
    setGatePhase('revealing');
    window.setTimeout(() => {
      setGatePhase('unlocked');
    }, 1060);
  };

  // Navigation & Sound Handlers
  const handleNavigate = (section: NavSection) => {
    soundEngine.playNavTick();
    setActiveSection(section);
    setIsMobileMenuOpen(false);
    if (section === 'social') {
      setMobileChatOpen(false);
    }
  };

  const handleToggleSound = () => {
    const next = !settings.soundEnabled;
    setSettings((prev) => ({ ...prev, soundEnabled: next }));
    soundEngine.setEnabled(next);
    if (next) {
      soundEngine.playToggle(true);
    }
  };

  const handleSelectClubFromSidebar = (club: Club) => {
    soundEngine.playNavTick();
    setIsMobileMenuOpen(false);
    if (activeSection === 'social') {
      setSocialSubTab('clubs');
      handleSelectChatClub(club.id);
      setMobileChatOpen(true);
      return;
    }
    setActiveSection('home');
    setActiveClubFilter((prev) => (prev === club.tag ? null : club.tag));
  };

  const handleSelectTag = (tag: string) => {
    soundEngine.playNavTick();
    setActiveSection('home');
    setActiveClubFilter((prev) => (prev === tag ? null : tag));
  };

  // Friend System Handlers
  const handleFriendAction = (handle: string) => {
    const target = players.find((p) => p.handle === handle);
    if (!target) return;

    const nextStatus = nextFriendshipStatus(target.friendship);
    if (nextStatus === target.friendship) return;

    soundEngine.playConfirm();
    setPlayers((prev) =>
      prev.map((p) => (p.handle === handle ? { ...p, friendship: nextStatus } : p)),
    );

    if (nextStatus === 'friends') {
      setFriendRequests((prev) => prev.filter((r) => r.handle !== handle));
    }
  };

  const handleAcceptFriendRequest = (req: FriendRequest) => {
    soundEngine.playConfirm();
    setFriendRequests((prev) => prev.filter((r) => r.id !== req.id));
    setPlayers((prev) =>
      prev.map((p) => (p.handle === req.handle ? { ...p, friendship: 'friends' } : p)),
    );
    setNotifications((prev) => [
      {
        id: `n-acc-${Date.now()}`,
        type: 'squad',
        actor: req.handle,
        avatar: req.avatar,
        message: 'is now in your Friends list. You can start a private DM anytime.',
        timestamp: 'Just now',
        read: false,
      },
      ...prev,
    ]);
  };

  const handleDeclineFriendRequest = (req: FriendRequest) => {
    soundEngine.playSoftBack();
    setFriendRequests((prev) => prev.filter((r) => r.id !== req.id));
    setPlayers((prev) =>
      prev.map((p) => (p.handle === req.handle ? { ...p, friendship: 'none' } : p)),
    );
  };

  const handleSelectDmFriend = (handle: string) => {
    soundEngine.playNavTick();
    setActiveDmHandle(handle);
    setDmUnreadByHandle((prev) => ({ ...prev, [handle]: 0 }));
  };

  const handleOpenMessageFriend = (handle: string) => {
    soundEngine.playNavTick();
    setActiveDmHandle(handle);
    setDmUnreadByHandle((prev) => ({ ...prev, [handle]: 0 }));
    setSocialSubTab('dms');
    setActiveSection('social');
    setMobileChatOpen(true);
  };

  const handleInspectPlayer = (handle: string) => {
    if (handle === CURRENT_USER.handle) {
      handleNavigate('profile');
      return;
    }
    soundEngine.playToggle(true);
    setInspectedPlayerHandle(handle);
  };

  // Post & Reply Handlers
  const handleVote = (postId: string, direction: 'up' | 'down') => {
    soundEngine.playConfirm();
    setPosts((prev) =>
      prev.map((post) => {
        if (post.id !== postId) return post;
        const result = toggleVote(post.userVote, post.score, direction);
        return { ...post, score: result.score, userVote: result.userVote };
      }),
    );
  };

  const handlePublishPost = (data: { gameTag: string; content: string }) => {
    soundEngine.playConfirm();
    const newPost: Post = {
      id: `post-${Date.now()}`,
      author: CURRENT_USER.name,
      handle: CURRENT_USER.handle,
      avatar: CURRENT_USER.avatar,
      gameTag: data.gameTag,
      content: data.content,
      timestamp: 'Just now',
      createdAtMs: Date.now(),
      score: 1,
      userVote: 'up',
      replies: [],
      isFollowing: true,
    };
    setPosts((prev) => [newPost, ...prev]);
    // Opt-in public discovery feed sync (strictly public posts only; private chats NEVER touch the server)
    void fetch('/api/node/public-feed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: newPost.id,
        handle: newPost.handle,
        gameTag: newPost.gameTag,
        content: newPost.content,
      }),
    }).catch(() => {});
    if (activeSection !== 'home' && activeSection !== 'profile') {
      setActiveSection('home');
    }
    if (activeClubFilter && activeClubFilter.toLowerCase() !== data.gameTag.toLowerCase()) {
      setActiveClubFilter(null);
    }
  };

  const handleAddReply = (postId: string, content: string) => {
    soundEngine.playConfirm();
    const newReply = {
      id: `rep-${Date.now()}`,
      author: CURRENT_USER.name,
      handle: CURRENT_USER.handle,
      avatar: CURRENT_USER.avatar,
      content,
      timestamp: 'Just now',
      likes: 0,
      likedByMe: false,
    };
    setPosts((prev) =>
      prev.map((post) =>
        post.id === postId ? { ...post, replies: [...post.replies, newReply] } : post,
      ),
    );
  };

  const handleToggleLikeReply = (postId: string, replyId: string) => {
    soundEngine.playNavTick();
    setPosts((prev) =>
      prev.map((post) => {
        if (post.id !== postId) return post;
        return {
          ...post,
          replies: post.replies.map((rep) => {
            if (rep.id !== replyId) return rep;
            const liked = !rep.likedByMe;
            return {
              ...rep,
              likedByMe: liked,
              likes: liked ? rep.likes + 1 : Math.max(0, rep.likes - 1),
            };
          }),
        };
      }),
    );
  };

  // Share Modal Handlers (Posts, Clubs, and Profiles)
  const openSharePost = (post: Post) => {
    soundEngine.playToggle(true);
    setSharePayload({
      kind: 'post',
      title: post.handle,
      subtitle: post.gameTag,
      previewText: post.content,
      shareUrl: `https://aigameria.app/posts/${post.id}`,
    });
  };

  const openShareClub = (club: Club) => {
    soundEngine.playToggle(true);
    setSharePayload({
      kind: 'club',
      title: club.tag,
      subtitle: `${club.onlineCount} online`,
      previewText: club.description,
      shareUrl: `https://aigameria.app/clubs/${club.id}`,
    });
  };

  const openShareProfile = () => {
    soundEngine.playToggle(true);
    setSharePayload({
      kind: 'profile',
      title: CURRENT_USER.handle,
      subtitle: 'LIVE · Verified Operator',
      previewText: CURRENT_USER.bio,
      shareUrl: `https://aigameria.app/u/${CURRENT_USER.handle.toLowerCase()}`,
    });
  };

  const openSharePlayerProfile = (player: PlayerProfile) => {
    soundEngine.playToggle(true);
    setSharePayload({
      kind: 'profile',
      title: player.handle,
      subtitle: `${player.mainTag} · ${player.role}`,
      previewText: player.currentGame
        ? `Currently active in ${player.currentGame} on AIGAMERIA.`
        : `Squad player on AIGAMERIA (${player.role}).`,
      shareUrl: `https://aigameria.app/u/${player.handle.toLowerCase()}`,
    });
  };

  const handleCopyShareLink = (payload: SharePayload) => {
    soundEngine.playConfirm();
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(payload.shareUrl).catch(() => {});
    }
  };

  const handleShareToClub = (clubId: string, payload: SharePayload, note: string) => {
    const formatted = formatSharedTextMessage(payload, note);
    handleSendClubMessage(clubId, formatted);
  };

  const handleShareToFriend = (friendHandle: string, payload: SharePayload, note: string) => {
    const formatted = formatSharedTextMessage(payload, note);
    handleSendDirectMessage(friendHandle, formatted);
  };

  // Club & DM Chat Handlers
  const handleSelectChatClub = (clubId: string) => {
    soundEngine.playNavTick();
    setActiveChatClubId(clubId);
    setClubs((prev) =>
      prev.map((c) => (c.id === clubId ? { ...c, unreadCount: 0 } : c)),
    );
  };

  const handleOpenClubRoom = (clubId: string) => {
    soundEngine.playNavTick();
    setActiveChatClubId(clubId);
    setSocialSubTab('clubs');
    setActiveSection('social');
    setMobileChatOpen(true);
    setClubs((prev) =>
      prev.map((c) => (c.id === clubId ? { ...c, unreadCount: 0 } : c)),
    );
  };

  const handleSendClubMessage = (clubId: string, content: string) => {
    soundEngine.playConfirm();
    const outgoing: ChatMessage = {
      id: `msg-${Date.now()}`,
      clubId,
      author: CURRENT_USER.name,
      handle: CURRENT_USER.handle,
      avatar: CURRENT_USER.avatar,
      roleTag: 'Host',
      content,
      timestamp: getCurrentTimeLabel(),
      isCurrentUser: true,
    };

    setMessagesByClub((prev) => ({
      ...prev,
      [clubId]: [...(prev[clubId] ?? []), outgoing],
    }));

    const targetClub = clubs.find((c) => c.id === clubId);
    const clubLabel = targetClub?.tag ?? '#GeneralChat';
    window.setTimeout(() => {
      const replyData = generateSquadReply(clubLabel, content);
      const replyMsg: ChatMessage = {
        id: `msg-reply-${Date.now()}`,
        clubId,
        author: replyData.author,
        handle: replyData.handle,
        avatar: replyData.avatar,
        roleTag: replyData.roleTag,
        content: replyData.content,
        timestamp: getCurrentTimeLabel(),
      };
      setMessagesByClub((prev) => ({
        ...prev,
        [clubId]: [...(prev[clubId] ?? []), replyMsg],
      }));
    }, 900);
  };

  const handleSendDirectMessage = (friendHandle: string, content: string) => {
    soundEngine.playConfirm();
    const outgoing: DirectMessage = {
      id: `dm-${Date.now()}`,
      friendHandle,
      senderHandle: CURRENT_USER.handle,
      senderName: CURRENT_USER.name,
      senderAvatar: CURRENT_USER.avatar,
      content,
      timestamp: getCurrentTimeLabel(),
      isCurrentUser: true,
    };

    setDirectMessagesByHandle((prev) => ({
      ...prev,
      [friendHandle]: [...(prev[friendHandle] ?? []), outgoing],
    }));

    // Dispatch end-to-end encrypted P2P message over WebRTC DataChannel (zero server storage)
    if (settings.p2pEnabled) {
      void p2pClient.sendPrivateMessage(`dm:${friendHandle}`, content).catch(() => {});
    }

    const friend = players.find((p) => p.handle === friendHandle);
    if (friend) {
      window.setTimeout(() => {
        const replyText = generateDirectMessageReply(friend, content);
        const incoming: DirectMessage = {
          id: `dm-reply-${Date.now()}`,
          friendHandle,
          senderHandle: friend.handle,
          senderName: friend.name,
          senderAvatar: friend.avatar,
          content: replyText,
          timestamp: getCurrentTimeLabel(),
        };
        setDirectMessagesByHandle((prev) => ({
          ...prev,
          [friendHandle]: [...(prev[friendHandle] ?? []), incoming],
        }));
      }, 900);
    }
  };

  const handleCreateClub = (data: {
    name: string;
    tag: string;
    description: string;
    icon: ClubIconKey;
    category: 'game' | 'event';
  }) => {
    soundEngine.playConfirm();
    const id = `club-${Date.now()}`;
    const newClub: Club = {
      id,
      name: data.name,
      tag: data.tag,
      description: data.description,
      category: data.category,
      icon: data.icon,
      memberCount: 1,
      onlineCount: 1,
      joined: true,
      unreadCount: 0,
    };
    setClubs((prev) => [...prev, newClub]);
    setMessagesByClub((prev) => ({
      ...prev,
      [id]: [
        {
          id: `msg-welcome-${Date.now()}`,
          clubId: id,
          author: CURRENT_USER.name,
          handle: CURRENT_USER.handle,
          avatar: CURRENT_USER.avatar,
          roleTag: 'Founder',
          content: `Created ${data.tag} — welcome to the room!`,
          timestamp: getCurrentTimeLabel(),
          isCurrentUser: true,
        },
      ],
    }));
    setActiveChatClubId(id);
    setSocialSubTab('clubs');
    setActiveSection('social');
    setMobileChatOpen(true);
  };

  const handleToggleJoinClub = (clubId: string) => {
    const club = clubs.find((c) => c.id === clubId);
    soundEngine.playToggle(!club?.joined);
    setClubs((prev) =>
      prev.map((c) =>
        c.id === clubId
          ? {
              ...c,
              joined: !c.joined,
              memberCount: c.joined ? Math.max(0, c.memberCount - 1) : c.memberCount + 1,
            }
          : c,
      ),
    );
  };

  const handleUpdateSettings = (patch: Partial<LocalBridgeSettings>) => {
    const firstBool = Object.values(patch).find((v) => typeof v === 'boolean');
    if (typeof firstBool === 'boolean') {
      if ('soundEnabled' in patch) {
        soundEngine.setEnabled(Boolean(patch.soundEnabled));
      }
      soundEngine.playToggle(firstBool);
    } else {
      soundEngine.playNavTick();
    }
    setSettings((prev) => ({ ...prev, ...patch }));
  };

  const handleTogglePlatform = (platformId: string) => {
    const target = settings.platforms.find((p) => p.id === platformId);
    soundEngine.playToggle(!target?.connected);
    setSettings((prev) => ({
      ...prev,
      platforms: prev.platforms.map((p) =>
        p.id === platformId ? { ...p, connected: !p.connected } : p,
      ),
    }));
  };

  const handleToggleRule = (ruleId: string) => {
    const target = rules.find((r) => r.id === ruleId);
    soundEngine.playToggle(!target?.enabled);
    setRules((prev) =>
      prev.map((r) => (r.id === ruleId ? { ...r, enabled: !r.enabled } : r)),
    );
  };

  const handleDeleteRule = (ruleId: string) => {
    soundEngine.playSoftBack();
    setRules((prev) => prev.filter((r) => r.id !== ruleId));
  };

  const handleCreateRule = (data: {
    name: string;
    trigger: string;
    action: string;
    messagePreview: string;
  }) => {
    soundEngine.playConfirm();
    const newRule: AutomationRule = {
      id: `rule-${Date.now()}`,
      name: data.name,
      trigger: data.trigger,
      action: data.action,
      messagePreview: data.messagePreview,
      enabled: true,
      isCustom: true,
    };
    setRules((prev) => [newRule, ...prev]);
  };

  const handleMarkAllRead = () => {
    soundEngine.playConfirm();
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const handleOpenNotification = (item: NotificationItem) => {
    soundEngine.playNavTick();
    setNotifications((prev) =>
      prev.map((n) => (n.id === item.id ? { ...n, read: true } : n)),
    );
    if (item.targetPostId) {
      setActiveSection('home');
      setReplyPostId(item.targetPostId);
    } else if (item.targetClubId) {
      handleOpenClubRoom(item.targetClubId);
    }
  };

  const showRightPanel = activeSection === 'home' || activeSection === 'explore';

  // Completely block main app access while Invite-Only Gate is locked
  if (gatePhase === 'locked') {
    return (
      <InviteGateLanding
        phase="locked"
        onTriggerInvite={handleTriggerInviteUnlock}
      />
    );
  }

  return (
    <>
      {gatePhase === 'revealing' ? (
        <InviteGateLanding
          phase="revealing"
          onTriggerInvite={handleTriggerInviteUnlock}
        />
      ) : null}

      <div
        className={`min-h-dvh flex flex-col ${
          gatePhase === 'revealing' ? 'animate-app-surface-enter' : ''
        }`}
      >
        <TopBar
        activeSection={activeSection}
        network={networkMetrics}
        soundEnabled={settings.soundEnabled}
        onToggleSound={handleToggleSound}
        onOpenProfile={() => handleNavigate('profile')}
        onGoHome={() => {
          setActiveClubFilter(null);
          handleNavigate('home');
        }}
        onToggleMobileMenu={() => {
          soundEngine.playToggle(!isMobileMenuOpen);
          setIsMobileMenuOpen((prev) => !prev);
        }}
      />

      {/* Top-Left Hamburger Slide-Over Menu (contains Clubs + Bridge / Local Settings) */}
      {isMobileMenuOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            onClick={() => setIsMobileMenuOpen(false)}
            className="animate-backdrop-fade fixed inset-0 bg-[#07040F]/75 backdrop-blur-sm"
          />
          <div className="animate-drawer-left relative z-10 flex h-full w-72 max-w-[85vw] flex-col bg-[#120C24] border-r border-white/10 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-[var(--font-display)] text-base font-bold tracking-wider text-white">
                AIGAMERIA
              </span>
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(false)}
                aria-label="Close navigation menu"
                className="tactile-btn rounded-xl p-2 text-[#9B8FB8] hover:bg-white/[0.08] hover:text-white"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              <Sidebar
                activeSection={activeSection}
                activeClubFilter={activeClubFilter}
                socialUnread={socialUnreadCount}
                alertCount={alertCount}
                clubs={clubs}
                onNavigate={handleNavigate}
                onSelectClubFromSidebar={handleSelectClubFromSidebar}
                onOpenCreatePost={() => {
                  soundEngine.playToggle(true);
                  setIsMobileMenuOpen(false);
                  setIsPostModalOpen(true);
                }}
                onOpenCreateClub={() => {
                  soundEngine.playToggle(true);
                  setIsMobileMenuOpen(false);
                  setIsClubModalOpen(true);
                }}
              />
            </div>
          </div>
        </div>
      ) : null}

      {/* Main Desktop Responsive Grid */}
      <div className="mx-auto w-full max-w-[1440px] flex-1 px-4 sm:px-6 py-5 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-8">
        <div
          className={`grid grid-cols-1 gap-6 ${
            showRightPanel
              ? 'lg:grid-cols-[248px_minmax(0,1fr)_288px]'
              : 'lg:grid-cols-[248px_minmax(0,1fr)]'
          }`}
        >
          {/* Left Desktop Sidebar */}
          <div className="hidden lg:block sticky top-[5.25rem] self-start max-h-[calc(100dvh-6.25rem)]">
            <Sidebar
              activeSection={activeSection}
              activeClubFilter={activeClubFilter}
              socialUnread={socialUnreadCount}
              alertCount={alertCount}
              clubs={clubs}
              onNavigate={handleNavigate}
              onSelectClubFromSidebar={handleSelectClubFromSidebar}
              onOpenCreatePost={() => {
                soundEngine.playToggle(true);
                setIsPostModalOpen(true);
              }}
              onOpenCreateClub={() => {
                soundEngine.playToggle(true);
                setIsClubModalOpen(true);
              }}
            />
          </div>

          {/* Center Main Content Area */}
          <main className="min-w-0">
            <div key={activeSection} className="animate-panel-reveal">
              {activeSection === 'home' || activeSection === 'explore' ? (
                <FeedView
                  mode={activeSection}
                  posts={visiblePosts}
                  clubs={clubs}
                  players={players}
                  activeClubFilter={activeClubFilter}
                  searchQuery={searchQuery}
                  sortMode={sortMode}
                  onSearchChange={setSearchQuery}
                  onSortChange={(mode) => {
                    soundEngine.playNavTick();
                    setSortMode(mode);
                  }}
                  onClearClubFilter={() => {
                    soundEngine.playNavTick();
                    setActiveClubFilter(null);
                  }}
                  onSelectTag={handleSelectTag}
                  onVote={handleVote}
                  onOpenReply={(post) => {
                    soundEngine.playToggle(true);
                    setReplyPostId(post.id);
                  }}
                  onOpenSharePost={openSharePost}
                  onOpenShareClub={openShareClub}
                  onOpenCreatePost={() => {
                    soundEngine.playToggle(true);
                    setIsPostModalOpen(true);
                  }}
                  onToggleJoinClub={handleToggleJoinClub}
                  onOpenClubRoom={handleOpenClubRoom}
                  onFriendAction={handleFriendAction}
                  onMessageFriend={handleOpenMessageFriend}
                  onInspectPlayer={handleInspectPlayer}
                />
              ) : null}

              {activeSection === 'social' ? (
                <SquadChatView
                  subTab={socialSubTab}
                  onChangeSubTab={(tab) => {
                    soundEngine.playNavTick();
                    setSocialSubTab(tab);
                  }}
                  clubs={clubs}
                  activeClubId={activeChatClubId}
                  messagesByClub={messagesByClub}
                  players={players}
                  activeDmHandle={activeDmHandle}
                  directMessagesByHandle={directMessagesByHandle}
                  dmUnreadByHandle={dmUnreadByHandle}
                  mobileChatOpen={mobileChatOpen}
                  onSetMobileChatOpen={(open) => {
                    soundEngine.playNavTick();
                    setMobileChatOpen(open);
                  }}
                  onSelectClub={handleSelectChatClub}
                  onSendClubMessage={handleSendClubMessage}
                  onSelectDmFriend={handleSelectDmFriend}
                  onSendDirectMessage={handleSendDirectMessage}
                  onOpenCreateClub={() => {
                    soundEngine.playToggle(true);
                    setIsClubModalOpen(true);
                  }}
                  onOpenShareClub={openShareClub}
                  onFriendAction={handleFriendAction}
                  onOpenFullscreenMedia={(media) => {
                    soundEngine.playToggle(true);
                    setFullscreenMedia(media);
                  }}
                  onInspectPlayer={handleInspectPlayer}
                />
              ) : null}

              {activeSection === 'alerts' ? (
                <NotificationsView
                  friendRequests={friendRequests}
                  notifications={notifications}
                  onAcceptRequest={handleAcceptFriendRequest}
                  onDeclineRequest={handleDeclineFriendRequest}
                  onMarkAllRead={handleMarkAllRead}
                  onOpenNotification={handleOpenNotification}
                />
              ) : null}

              {activeSection === 'profile' ? (
                <ProfileView
                  achievements={INITIAL_ACHIEVEMENTS}
                  clubs={clubs}
                  userPosts={userPosts}
                  network={networkMetrics}
                  p2pEnabled={settings.p2pEnabled}
                  onOpenClubRoom={handleOpenClubRoom}
                  onOpenReply={(post) => {
                    soundEngine.playToggle(true);
                    setReplyPostId(post.id);
                  }}
                  onOpenSettings={() => handleNavigate('settings')}
                  onOpenCreatePost={() => {
                    soundEngine.playToggle(true);
                    setIsPostModalOpen(true);
                  }}
                  onShareProfile={openShareProfile}
                />
              ) : null}

              {activeSection === 'settings' ? (
                <SettingsView
                  settings={settings}
                  network={networkMetrics}
                  rules={rules}
                  onUpdateSettings={handleUpdateSettings}
                  onTogglePlatform={handleTogglePlatform}
                  onToggleRule={handleToggleRule}
                  onDeleteRule={handleDeleteRule}
                  onOpenCreateRule={() => {
                    soundEngine.playToggle(true);
                    setIsRuleModalOpen(true);
                  }}
                  onTestSound={() => soundEngine.playConfirm()}
                  onSendLinkToChat={(url) => {
                    handleSendClubMessage(activeChatClubId, `Shared via Personal Node: ${url}`);
                    setSocialSubTab('clubs');
                    setActiveSection('social');
                    setMobileChatOpen(true);
                  }}
                />
              ) : null}
            </div>
          </main>

          {/* Right Panel (Home & Explore) */}
          {showRightPanel ? (
            <div className="hidden lg:block sticky top-[5.25rem] self-start">
              <RightPanel
                friends={friendsList}
                trendingTags={trendingTags}
                activeTag={activeClubFilter}
                network={networkMetrics}
                p2pEnabled={settings.p2pEnabled}
                onSelectTag={handleSelectTag}
                onMessageFriend={handleOpenMessageFriend}
                onOpenSocialHub={() => handleNavigate('social')}
                onOpenSettings={() => handleNavigate('settings')}
              />
            </div>
          ) : null}
        </div>
      </div>

      {/* Clean 4-Tab Mobile Bottom Navigation Bar (iOS Home Indicator safe-area compliant) */}
      <nav
        aria-label="Mobile navigation"
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 pb-[env(safe-area-inset-bottom)] border-t border-white/[0.08] bg-[#0D091A]/94 backdrop-blur-md px-2"
      >
        <ul className="grid h-14 grid-cols-4 items-center">
          {(
            [
              { id: 'home', label: 'Home', icon: Home },
              { id: 'explore', label: 'Explore', icon: Compass },
              { id: 'social', label: 'Social', icon: Users, badge: socialUnreadCount },
              { id: 'alerts', label: 'Alerts', icon: Bell, badge: alertCount },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            const badge = 'badge' in item ? item.badge : 0;
            return (
              <li key={item.id} className="h-full">
                <button
                  type="button"
                  onClick={() => handleNavigate(item.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`tactile-btn relative flex h-full w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium whitespace-nowrap ${
                    active ? 'text-[#FF9F43]' : 'text-[#9B8FB8]'
                  }`}
                >
                  <span className="relative">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {badge > 0 ? (
                      <span className="absolute -right-2.5 -top-1.5 font-mono tabular-nums text-[10px] font-bold text-[#FF3E8A]">
                        {badge}
                      </span>
                    ) : null}
                  </span>
                  <span>{item.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Interactive Modals & Drawers */}
      <CreatePostModal
        isOpen={isPostModalOpen}
        clubs={clubs}
        defaultTag={activeClubFilter}
        onClose={() => {
          soundEngine.playSoftBack();
          setIsPostModalOpen(false);
        }}
        onPublish={handlePublishPost}
      />

      <ReplyDrawer
        post={activeReplyPost}
        onClose={() => {
          soundEngine.playSoftBack();
          setReplyPostId(null);
        }}
        onAddReply={handleAddReply}
        onToggleLikeReply={handleToggleLikeReply}
      />

      <CreateClubModal
        isOpen={isClubModalOpen}
        onClose={() => {
          soundEngine.playSoftBack();
          setIsClubModalOpen(false);
        }}
        onCreateClub={handleCreateClub}
      />

      <CreateRuleModal
        isOpen={isRuleModalOpen}
        onClose={() => {
          soundEngine.playSoftBack();
          setIsRuleModalOpen(false);
        }}
        onCreateRule={handleCreateRule}
      />

      <ShareModal
        payload={sharePayload}
        clubs={clubs}
        friends={friendsList}
        onClose={() => {
          soundEngine.playSoftBack();
          setSharePayload(null);
        }}
        onCopyLink={handleCopyShareLink}
        onShareToClub={handleShareToClub}
        onShareToFriend={handleShareToFriend}
      />

      <MediaLightboxModal
        media={fullscreenMedia}
        onClose={() => {
          soundEngine.playSoftBack();
          setFullscreenMedia(null);
        }}
      />

      <PlayerProfileModal
        player={inspectedPlayer}
        onClose={() => {
          soundEngine.playSoftBack();
          setInspectedPlayerHandle(null);
        }}
        onFriendAction={handleFriendAction}
        onMessageFriend={handleOpenMessageFriend}
        onSharePlayer={openSharePlayerProfile}
      />

      <OfflineIndicator />
      </div>
    </>
  );
}
