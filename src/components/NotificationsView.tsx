import { ArrowUpRight, Bell, Check, CheckCheck, UserPlus, X } from 'lucide-react';
import { Avatar } from './Avatar';
import type { FriendRequest, NotificationItem } from '../types';

interface NotificationsViewProps {
  friendRequests: FriendRequest[];
  notifications: NotificationItem[];
  onAcceptRequest: (request: FriendRequest) => void;
  onDeclineRequest: (request: FriendRequest) => void;
  onMarkAllRead: () => void;
  onOpenNotification: (item: NotificationItem) => void;
}

export function NotificationsView({
  friendRequests,
  notifications,
  onAcceptRequest,
  onDeclineRequest,
  onMarkAllRead,
  onOpenNotification,
}: NotificationsViewProps) {
  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="space-y-5">
      <header className="glass-panel rounded-2xl p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">Alerts</h1>
          <p className="mt-0.5 text-sm text-[#A79BC2]">
            Friend requests, replies, upvotes, and squad mentions.
          </p>
        </div>

        <button
          type="button"
          disabled={unreadCount === 0}
          onClick={onMarkAllRead}
          className="tactile-btn inline-flex h-10 items-center gap-2 rounded-xl border border-white/12 bg-white/[0.05] px-3.5 text-xs font-semibold text-white hover:bg-white/[0.1] disabled:opacity-40 whitespace-nowrap"
        >
          <CheckCheck className="h-4 w-4 text-[#22D3EE]" aria-hidden="true" />
          <span>Mark all read</span>
        </button>
      </header>

      {/* Friend Requests Section at Top of Alerts */}
      <section aria-label="Friend requests" className="glass-panel rounded-2xl p-5 space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-[#FF9F43]" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-white">Friend Requests</h2>
          </div>
          <span className="font-mono tabular-nums text-xs text-[#9B8FB8]">
            {friendRequests.length} pending
          </span>
        </div>

        {friendRequests.length === 0 ? (
          <p className="py-3 text-xs text-[#9B8FB8]">
            No pending friend requests. Discover squadmates in Explore or Social.
          </p>
        ) : (
          <ul className="divide-y divide-white/[0.07]">
            {friendRequests.map((req) => (
              <li
                key={req.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <Avatar src={req.avatar} name={req.name} size="md" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-sm font-semibold text-white">{req.handle}</span>
                      <span className="text-xs font-medium text-[#FF9F43]">{req.gameTag}</span>
                      <span className="text-xs font-mono tabular-nums text-[#8F83AB]">
                        · {req.timestamp}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-[#CFC6E3] leading-relaxed">{req.note}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onAcceptRequest(req)}
                    aria-label={`Accept friend request from ${req.handle}`}
                    className="tactile-btn inline-flex h-9 items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#FF6B35] to-[#FF3E8A] px-3.5 text-xs font-semibold text-white hover:brightness-110 whitespace-nowrap"
                  >
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Accept</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeclineRequest(req)}
                    aria-label={`Decline friend request from ${req.handle}`}
                    className="tactile-btn inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/12 bg-white/[0.05] px-3 text-xs font-medium text-[#C2B7D9] hover:bg-white/[0.1] hover:text-white whitespace-nowrap"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Decline</span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Activity Notifications */}
      <section aria-label="Activity notifications" className="glass-panel rounded-2xl overflow-hidden divide-y divide-white/[0.07]">
        {notifications.length === 0 ? (
          <div className="p-8 text-center">
            <Bell className="mx-auto h-6 w-6 text-[#8F83AB]" aria-hidden="true" />
            <p className="mt-2 text-sm text-[#A79BC2]">You are all caught up.</p>
          </div>
        ) : (
          notifications.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onOpenNotification(item)}
              className={`tactile-btn flex w-full items-start justify-between gap-4 p-4 text-left hover:bg-white/[0.05] ${
                !item.read ? 'bg-[#FF6B35]/[0.06]' : ''
              }`}
            >
              <div className="flex items-start gap-3 min-w-0">
                <Avatar src={item.avatar} name={item.actor} size="sm" />
                <div className="min-w-0">
                  <p className="text-sm text-[#EDE8F8] leading-snug">
                    <strong className="font-semibold text-white">{item.actor}</strong>{' '}
                    {item.message}
                  </p>
                  <p className="mt-1 text-xs font-mono tabular-nums text-[#9B8FB8]">
                    {item.timestamp}
                    {!item.read ? ' · Unread' : ''}
                  </p>
                </div>
              </div>
              <ArrowUpRight className="h-4 w-4 shrink-0 text-[#8F83AB] mt-0.5" aria-hidden="true" />
            </button>
          ))
        )}
      </section>
    </div>
  );
}
