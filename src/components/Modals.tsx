import { useEffect, useState } from 'react';
import { Eye, Heart, Send, X } from 'lucide-react';
import { Avatar } from './Avatar';
import { ClubIcon } from './Sidebar';
import { CURRENT_USER } from '../data/seedData';
import type { Club, ClubIconKey, Post } from '../types';
import {
  formatClubTag,
  validateClubForm,
  validatePostForm,
  validateRuleForm,
} from '../utils/appLogic';

function useEscapeClose(isOpen: boolean, onClose: () => void) {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);
}

/* ==========================================================================
   1. New Text Post Modal / Composer
   ========================================================================== */

interface CreatePostModalProps {
  isOpen: boolean;
  clubs: Club[];
  defaultTag?: string | null;
  onClose: () => void;
  onPublish: (data: { gameTag: string; content: string }) => void;
}

export function CreatePostModal({
  isOpen,
  clubs,
  defaultTag,
  onClose,
  onPublish,
}: CreatePostModalProps) {
  const availableTags = clubs.filter((c) => c.category !== 'general').map((c) => c.tag);
  const [gameTag, setGameTag] = useState(defaultTag || availableTags[0] || '#Games');
  const [content, setContent] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEscapeClose(isOpen, onClose);

  useEffect(() => {
    if (isOpen) {
      setGameTag(defaultTag || availableTags[0] || '#Games');
      setError(null);
      setShowPreview(false);
    }
  }, [isOpen, defaultTag]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validatePostForm(content, gameTag);
    if (validationError) {
      setError(validationError);
      return;
    }
    onPublish({ gameTag, content: content.trim() });
    setContent('');
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-post-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        onClick={onClose}
        className="animate-backdrop-fade fixed inset-0 bg-[#07040F]/75 backdrop-blur-sm"
      />

      <div className="animate-modal-pop glass-panel-elevated relative z-10 w-full max-w-lg rounded-2xl p-5 sm:p-6 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <h2 id="create-post-title" className="text-lg font-bold text-white">
                Create Text Post
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close post composer"
                className="tactile-btn rounded-xl p-2 text-[#9B8FB8] hover:bg-white/[0.08] hover:text-white"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              {/* Tag Selector */}
              <div className="space-y-1.5">
                <label htmlFor="post-game-tag" className="block text-xs font-medium text-[#C2B7D9]">
                  Game Club Tag
                </label>
                <select
                  id="post-game-tag"
                  value={gameTag}
                  onChange={(e) => setGameTag(e.target.value)}
                  className="h-10 w-full rounded-xl border border-white/12 bg-[#0D091A] px-3 text-sm text-white focus:border-[#22D3EE]/60"
                >
                  {availableTags.map((tag) => (
                    <option key={tag} value={tag} className="bg-[#140E27] text-white">
                      {tag}
                    </option>
                  ))}
                </select>
              </div>

              {/* Post Body */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="post-body" className="block text-xs font-medium text-[#C2B7D9]">
                    Post Message
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPreview((prev) => !prev)}
                    className="tactile-btn inline-flex items-center gap-1 text-xs font-medium text-[#22D3EE] hover:underline"
                  >
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{showPreview ? 'Edit Text' : 'Preview'}</span>
                  </button>
                </div>

                {showPreview ? (
                  <div className="rounded-xl border border-white/10 bg-[#0D091A]/75 p-4 space-y-2.5 min-h-[124px]">
                    <div className="flex items-center gap-2.5">
                      <Avatar src={CURRENT_USER.avatar} name={CURRENT_USER.handle} size="sm" />
                      <div>
                        <p className="text-xs font-semibold text-white">{CURRENT_USER.handle}</p>
                        <p className="text-xs text-[#FF9F43]">{gameTag}</p>
                      </div>
                    </div>
                    <p className="text-sm text-[#EDE8F8] whitespace-pre-line leading-relaxed">
                      {content.trim() || 'Your formatted post preview will appear here.'}
                    </p>
                  </div>
                ) : (
                  <textarea
                    id="post-body"
                    rows={4}
                    maxLength={500}
                    value={content}
                    onChange={(e) => {
                      setContent(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="Share a strategy, LFG callout, or clean match takeaway..."
                    className="w-full rounded-xl border border-white/12 bg-[#0D091A]/85 p-3.5 text-sm text-white placeholder:text-[#7E7299] focus:border-[#22D3EE]/60 resize-none"
                  />
                )}

                <div className="flex items-center justify-between text-xs">
                  {error ? (
                    <span role="alert" className="text-[#FF6DA6] font-medium">
                      {error}
                    </span>
                  ) : (
                    <span className="text-[#8F83AB]">Text-only feed · crisp and readable</span>
                  )}
                  <span className="font-mono tabular-nums text-[#8F83AB]">
                    {content.length}/500
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="tactile-btn h-10 rounded-xl border border-white/12 bg-white/[0.05] px-4 text-xs font-semibold text-[#D6CEE8] hover:bg-white/[0.1]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="tactile-btn h-10 rounded-xl bg-gradient-to-r from-[#FF6B35] to-[#FF3E8A] px-5 text-xs font-semibold text-white hover:brightness-110"
                >
                  Publish Post
                </button>
              </div>
            </form>
      </div>
    </div>
  );
}

/* ==========================================================================
   2. Reply / Comment Thread Drawer
   ========================================================================== */

interface ReplyDrawerProps {
  post: Post | null;
  onClose: () => void;
  onAddReply: (postId: string, content: string) => void;
  onToggleLikeReply: (postId: string, replyId: string) => void;
}

export function ReplyDrawer({
  post,
  onClose,
  onAddReply,
  onToggleLikeReply,
}: ReplyDrawerProps) {
  const [replyText, setReplyText] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEscapeClose(Boolean(post), onClose);

  useEffect(() => {
    setReplyText('');
    setError(null);
  }, [post?.id]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!post) return;
    if (!replyText.trim()) {
      setError('Write a reply before sending.');
      return;
    }
    onAddReply(post.id, replyText.trim());
    setReplyText('');
    setError(null);
  };

  if (!post) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reply-drawer-title"
      className="fixed inset-0 z-50 flex justify-end"
    >
      <div
        onClick={onClose}
        className="animate-backdrop-fade fixed inset-0 bg-[#07040F]/70 backdrop-blur-sm"
      />

      <div className="animate-drawer-right glass-panel-elevated relative z-10 flex h-full w-full max-w-md flex-col border-l border-white/12 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
              <div>
                <h2 id="reply-drawer-title" className="text-base font-bold text-white">
                  Reply Thread
                </h2>
                <p className="text-xs text-[#9B8FB8] font-mono tabular-nums">
                  {post.gameTag} · {post.replies.length}{' '}
                  {post.replies.length === 1 ? 'reply' : 'replies'}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close reply thread"
                className="tactile-btn rounded-xl p-2 text-[#9B8FB8] hover:bg-white/[0.08] hover:text-white"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {/* Thread Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Original Post */}
              <div className="rounded-2xl border border-white/10 bg-[#0D091A]/75 p-4 space-y-2.5">
                <div className="flex items-center gap-2.5">
                  <Avatar src={post.avatar} name={post.author} size="sm" />
                  <div>
                    <p className="text-sm font-semibold text-white">{post.handle}</p>
                    <p className="text-xs text-[#9B8FB8] font-mono tabular-nums">
                      {post.gameTag} · {post.timestamp}
                    </p>
                  </div>
                </div>
                <p className="text-sm text-[#EDE8F8] leading-relaxed">{post.content}</p>
              </div>

              {/* Replies List */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-[#9B8FB8]">Replies</h3>
                {post.replies.length === 0 ? (
                  <p className="text-sm text-[#9B8FB8] py-4">
                    No replies yet. Start the discussion below.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {post.replies.map((reply) => (
                      <li
                        key={reply.id}
                        className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3.5 space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <Avatar src={reply.avatar} name={reply.author} size="xs" />
                            <span className="truncate text-xs font-semibold text-white">
                              {reply.handle}
                            </span>
                            <span className="font-mono tabular-nums text-[11px] text-[#8F83AB]">
                              {reply.timestamp}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => onToggleLikeReply(post.id, reply.id)}
                            aria-label={`Like reply by ${reply.handle}`}
                            className={`tactile-btn inline-flex items-center gap-1 text-xs font-mono tabular-nums ${
                              reply.likedByMe
                                ? 'text-[#FF3E8A]'
                                : 'text-[#9B8FB8] hover:text-white'
                            }`}
                          >
                            <Heart className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>{reply.likes}</span>
                          </button>
                        </div>
                        <p className="text-sm text-[#E6E0F5] leading-relaxed">{reply.content}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Reply Form */}
            <form
              onSubmit={handleSubmit}
              className="border-t border-white/[0.08] bg-[#100A20]/85 p-4 space-y-2"
            >
              {error ? (
                <p role="alert" className="text-xs text-[#FF6DA6] font-medium">
                  {error}
                </p>
              ) : null}
              <div className="flex items-center gap-2">
                <label htmlFor="reply-input" className="sr-only">
                  Write a text reply
                </label>
                <input
                  id="reply-input"
                  type="text"
                  value={replyText}
                  onChange={(e) => {
                    setReplyText(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="Write a clean text reply..."
                  className="h-11 flex-1 rounded-xl border border-white/12 bg-[#0D091A] px-3.5 text-sm text-white placeholder:text-[#7E7299] focus:border-[#22D3EE]/60"
                />
                <button
                  type="submit"
                  aria-label="Send reply"
                  className="tactile-btn inline-flex h-11 items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#FF6B35] to-[#FF3E8A] px-4 text-xs font-semibold text-white whitespace-nowrap"
                >
                  <Send className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Reply</span>
                </button>
              </div>
            </form>
      </div>
    </div>
  );
}

/* ==========================================================================
   3. Create Club Modal
   ========================================================================== */

interface CreateClubModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateClub: (data: {
    name: string;
    tag: string;
    description: string;
    icon: ClubIconKey;
    category: 'game' | 'event';
  }) => void;
}

const ICON_OPTIONS: { key: ClubIconKey; label: string }[] = [
  { key: 'gamepad', label: 'Arcade' },
  { key: 'crosshair', label: 'Shooter' },
  { key: 'flame', label: 'Ranked' },
  { key: 'trophy', label: 'Sports' },
  { key: 'zap', label: 'Event' },
  { key: 'shield', label: 'Squad' },
];

export function CreateClubModal({ isOpen, onClose, onCreateClub }: CreateClubModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState<ClubIconKey>('gamepad');
  const [category, setCategory] = useState<'game' | 'event'>('game');
  const [error, setError] = useState<string | null>(null);

  useEscapeClose(isOpen, onClose);

  useEffect(() => {
    if (isOpen) {
      setError(null);
    }
  }, [isOpen]);

  const previewTag = formatClubTag(name) || '#NewClub';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateClubForm(name, description);
    if (validationError) {
      setError(validationError);
      return;
    }
    const tag = formatClubTag(name);
    onCreateClub({
      name: name.trim(),
      tag,
      description: description.trim() || `Text lounge and match queues for ${name.trim()}.`,
      icon,
      category,
    });
    setName('');
    setDescription('');
    setIcon('gamepad');
    setCategory('game');
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-club-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        onClick={onClose}
        className="animate-backdrop-fade fixed inset-0 bg-[#07040F]/75 backdrop-blur-sm"
      />

      <div className="animate-modal-pop glass-panel-elevated relative z-10 w-full max-w-md rounded-2xl p-5 sm:p-6 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <h2 id="create-club-title" className="text-lg font-bold text-white">
                Create New Club
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close create club modal"
                className="tactile-btn rounded-xl p-2 text-[#9B8FB8] hover:bg-white/[0.08] hover:text-white"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="club-name" className="text-xs font-medium text-[#C2B7D9]">
                    Club Name
                  </label>
                  <span className="font-mono text-xs text-[#22D3EE]">{previewTag}</span>
                </div>
                <input
                  id="club-name"
                  type="text"
                  maxLength={28}
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="e.g. Valorant, Rocket League, Friday Scrims"
                  className="h-10 w-full rounded-xl border border-white/12 bg-[#0D091A] px-3.5 text-sm text-white placeholder:text-[#7E7299] focus:border-[#22D3EE]/60"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="club-desc" className="block text-xs font-medium text-[#C2B7D9]">
                  Short Topic (optional)
                </label>
                <input
                  id="club-desc"
                  type="text"
                  maxLength={120}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What is this club room focused on?"
                  className="h-10 w-full rounded-xl border border-white/12 bg-[#0D091A] px-3.5 text-sm text-white placeholder:text-[#7E7299] focus:border-[#22D3EE]/60"
                />
              </div>

              <div className="space-y-1.5">
                <span className="block text-xs font-medium text-[#C2B7D9]">Room Type</span>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { id: 'game', label: 'Game Club' },
                      { id: 'event', label: 'Temporary Event' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setCategory(opt.id)}
                      className={`tactile-btn h-9 rounded-xl border text-xs font-semibold ${
                        category === opt.id
                          ? 'border-[#FF6B35]/50 bg-[#FF6B35]/18 text-white'
                          : 'border-white/10 bg-white/[0.04] text-[#B5A9CE] hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="block text-xs font-medium text-[#C2B7D9]">Club Icon</span>
                <div className="grid grid-cols-3 gap-2">
                  {ICON_OPTIONS.map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setIcon(opt.key)}
                      className={`tactile-btn flex h-10 items-center justify-center gap-2 rounded-xl border text-xs font-medium ${
                        icon === opt.key
                          ? 'border-[#22D3EE]/50 bg-[#22D3EE]/14 text-white'
                          : 'border-white/10 bg-white/[0.04] text-[#B5A9CE] hover:text-white'
                      }`}
                    >
                      <ClubIcon icon={opt.key} className="h-3.5 w-3.5 text-[#FF9F43]" />
                      <span>{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {error ? (
                <p role="alert" className="text-xs font-medium text-[#FF6DA6]">
                  {error}
                </p>
              ) : null}

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="tactile-btn h-10 rounded-xl border border-white/12 bg-white/[0.05] px-4 text-xs font-semibold text-[#D6CEE8] hover:bg-white/[0.1]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="tactile-btn h-10 rounded-xl bg-gradient-to-r from-[#FF6B35] to-[#FF3E8A] px-5 text-xs font-semibold text-white hover:brightness-110"
                >
                  Add Club
                </button>
              </div>
            </form>
      </div>
    </div>
  );
}

/* ==========================================================================
   4. Create Automation Rule Modal
   ========================================================================== */

interface CreateRuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateRule: (data: {
    name: string;
    trigger: string;
    action: string;
    messagePreview: string;
  }) => void;
}

const TRIGGERS = [
  'Player joins club',
  'Achievement unlocked',
  'Match starts',
  '15 mins before scheduled scrim',
  'Daily lobby reset',
];

const ACTIONS = [
  'Send welcome message',
  'Post summary to feed',
  'Notify squad chat',
  'Pin event reminder',
];

export function CreateRuleModal({ isOpen, onClose, onCreateRule }: CreateRuleModalProps) {
  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState(TRIGGERS[0]);
  const [action, setAction] = useState(ACTIONS[0]);
  const [messagePreview, setMessagePreview] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEscapeClose(isOpen, onClose);

  useEffect(() => {
    if (isOpen) {
      setError(null);
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateRuleForm(name, trigger, action, messagePreview);
    if (validationError) {
      setError(validationError);
      return;
    }
    onCreateRule({
      name: name.trim(),
      trigger,
      action,
      messagePreview: messagePreview.trim(),
    });
    setName('');
    setTrigger(TRIGGERS[0]);
    setAction(ACTIONS[0]);
    setMessagePreview('');
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-rule-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        onClick={onClose}
        className="animate-backdrop-fade fixed inset-0 bg-[#07040F]/75 backdrop-blur-sm"
      />

      <div className="animate-modal-pop glass-panel-elevated relative z-10 w-full max-w-md rounded-2xl p-5 sm:p-6 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <h2 id="create-rule-title" className="text-lg font-bold text-white">
                Create Automation Rule
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close automation rule modal"
                className="tactile-btn rounded-xl p-2 text-[#9B8FB8] hover:bg-white/[0.08] hover:text-white"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="rule-name" className="block text-xs font-medium text-[#C2B7D9]">
                  Rule Name
                </label>
                <input
                  id="rule-name"
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="e.g. Squad Ready Reminder"
                  className="h-10 w-full rounded-xl border border-white/12 bg-[#0D091A] px-3.5 text-sm text-white placeholder:text-[#7E7299] focus:border-[#22D3EE]/60"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="rule-trigger" className="block text-xs font-medium text-[#C2B7D9]">
                  When this happens (Trigger)
                </label>
                <select
                  id="rule-trigger"
                  value={trigger}
                  onChange={(e) => setTrigger(e.target.value)}
                  className="h-10 w-full rounded-xl border border-white/12 bg-[#0D091A] px-3 text-sm text-white focus:border-[#22D3EE]/60"
                >
                  {TRIGGERS.map((t) => (
                    <option key={t} value={t} className="bg-[#140E27] text-white">
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="rule-action" className="block text-xs font-medium text-[#C2B7D9]">
                  Do this (Text Action)
                </label>
                <select
                  id="rule-action"
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                  className="h-10 w-full rounded-xl border border-white/12 bg-[#0D091A] px-3 text-sm text-white focus:border-[#22D3EE]/60"
                >
                  {ACTIONS.map((a) => (
                    <option key={a} value={a} className="bg-[#140E27] text-white">
                      {a}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="rule-message" className="block text-xs font-medium text-[#C2B7D9]">
                  Message Text
                </label>
                <textarea
                  id="rule-message"
                  rows={3}
                  value={messagePreview}
                  onChange={(e) => {
                    setMessagePreview(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="Type the message AIGAMERIA should post automatically..."
                  className="w-full rounded-xl border border-white/12 bg-[#0D091A] p-3 text-sm text-white placeholder:text-[#7E7299] focus:border-[#22D3EE]/60 resize-none"
                />
              </div>

              {error ? (
                <p role="alert" className="text-xs font-medium text-[#FF6DA6]">
                  {error}
                </p>
              ) : null}

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="tactile-btn h-10 rounded-xl border border-white/12 bg-white/[0.05] px-4 text-xs font-semibold text-[#D6CEE8] hover:bg-white/[0.1]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="tactile-btn h-10 rounded-xl bg-gradient-to-r from-[#FF6B35] to-[#FF3E8A] px-5 text-xs font-semibold text-white hover:brightness-110"
                >
                  Save Rule
                </button>
              </div>
            </form>
      </div>
    </div>
  );
}
