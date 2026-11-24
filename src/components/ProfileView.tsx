import {
  Award,
  CheckCircle2,
  ExternalLink,
  MessageSquare,
  Radio,
  Settings,
  Share2,
  ShieldCheck,
  ThumbsUp,
  Users,
} from 'lucide-react';
import { Avatar } from './Avatar';
import { ClubIcon } from './Sidebar';
import { CURRENT_USER } from '../data/seedData';
import type { Achievement, Club, Post } from '../types';
import type { NetworkMetrics } from '../utils/appLogic';

interface ProfileViewProps {
  achievements: Achievement[];
  clubs: Club[];
  userPosts: Post[];
  network: NetworkMetrics;
  p2pEnabled: boolean;
  onOpenClubRoom: (clubId: string) => void;
  onOpenReply: (post: Post) => void;
  onOpenSettings: () => void;
  onOpenCreatePost: () => void;
  onShareProfile: () => void;
}

const ACCENT_MAP: Record<Achievement['accent'], string> = {
  orange: 'text-[#FF9F43] border-[#FF6B35]/30 bg-[#FF6B35]/10',
  pink: 'text-[#FF6DA6] border-[#FF3E8A]/30 bg-[#FF3E8A]/10',
  cyan: 'text-[#67E8F9] border-[#22D3EE]/30 bg-[#22D3EE]/10',
};

export function ProfileView({
  achievements,
  clubs,
  userPosts,
  network,
  p2pEnabled,
  onOpenClubRoom,
  onOpenReply,
  onOpenSettings,
  onOpenCreatePost,
  onShareProfile,
}: ProfileViewProps) {
  const joinedSquads = clubs.filter((c) => c.joined);

  return (
    <div className="space-y-6">
      {/* Gamer Card Header */}
      <section className="glass-panel rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
          <div className="flex items-start sm:items-center gap-4">
            <Avatar src={CURRENT_USER.avatar} name={CURRENT_USER.handle} size="xl" ring />
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-2xl font-bold tracking-tight text-white">
                  {CURRENT_USER.handle}
                </h1>
                <span className="inline-flex items-center gap-1 rounded-md border border-[#FF3E8A]/40 bg-[#FF3E8A]/15 px-2 py-0.5 text-[11px] font-semibold tracking-wider text-[#FF8BB8]">
                  LIVE
                </span>
              </div>
              <p className="text-sm text-[#D6CEE8] max-w-xl leading-relaxed">
                {CURRENT_USER.bio}
              </p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#9B8FB8] pt-1">
                <span>{CURRENT_USER.region}</span>
                {CURRENT_USER.links.map((link) => (
                  <span key={link.label} className="inline-flex items-center gap-1">
                    <span className="text-white/25" aria-hidden="true">
                      ·
                    </span>
                    <span className="text-[#C7BEDB]">{link.value}</span>
                    <ExternalLink className="h-3 w-3 text-[#22D3EE]" aria-hidden="true" />
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onShareProfile}
              aria-label="Share profile"
              className="tactile-btn inline-flex h-10 items-center gap-1.5 rounded-xl border border-white/14 bg-white/[0.05] px-3.5 text-xs font-semibold text-white hover:bg-white/[0.1] whitespace-nowrap"
            >
              <Share2 className="h-3.5 w-3.5 text-[#22D3EE]" aria-hidden="true" />
              <span>Share</span>
            </button>
            <button
              type="button"
              onClick={onOpenSettings}
              className="tactile-btn inline-flex h-10 items-center gap-1.5 rounded-xl border border-white/14 bg-white/[0.05] px-3.5 text-xs font-semibold text-white hover:bg-white/[0.1] whitespace-nowrap"
            >
              <Settings className="h-3.5 w-3.5 text-[#FF9F43]" aria-hidden="true" />
              <span>Local Settings</span>
            </button>
            <button
              type="button"
              onClick={onOpenCreatePost}
              className="tactile-btn h-10 rounded-xl bg-gradient-to-r from-[#FF6B35] to-[#FF3E8A] px-4 text-xs font-semibold text-white whitespace-nowrap"
            >
              Post Update
            </button>
          </div>
        </div>
      </section>

      {/* Peer Reputation + Local Server Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="glass-panel rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-[#22D3EE]" aria-hidden="true" />
              <h2 className="text-base font-semibold text-white">Peer Reputation</h2>
            </div>
            <span className="font-mono tabular-nums text-lg font-bold text-[#22D3EE]">
              98 / 100
            </span>
          </div>

          <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#FF6B35] via-[#FF3E8A] to-[#22D3EE]"
              style={{ width: '98%' }}
            />
          </div>

          <dl className="grid grid-cols-3 gap-3 pt-1 text-center">
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] py-2.5 px-2">
              <dt className="text-[11px] text-[#9B8FB8]">Fair Play</dt>
              <dd className="mt-0.5 font-mono tabular-nums text-sm font-semibold text-white">
                99%
              </dd>
            </div>
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] py-2.5 px-2">
              <dt className="text-[11px] text-[#9B8FB8]">Team Comms</dt>
              <dd className="mt-0.5 font-mono tabular-nums text-sm font-semibold text-white">
                97%
              </dd>
            </div>
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] py-2.5 px-2">
              <dt className="text-[11px] text-[#9B8FB8]">Endorsements</dt>
              <dd className="mt-0.5 font-mono tabular-nums text-sm font-semibold text-white">
                342
              </dd>
            </div>
          </dl>
        </section>

        <section className="glass-panel rounded-2xl p-5 flex flex-col justify-between gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Radio className="h-5 w-5 text-[#FF9F43]" aria-hidden="true" />
              <h2 className="text-base font-semibold text-white">Local Server Status</h2>
            </div>
            <button
              type="button"
              onClick={onOpenSettings}
              className="tactile-btn text-xs font-medium text-[#22D3EE] hover:underline"
            >
              Bridge Settings
            </button>
          </div>

          <dl className="space-y-2.5 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-[#A79BC2]">Network Health</dt>
              <dd className="font-mono tabular-nums font-semibold text-white">
                {network.label} ({network.strengthPercent}%)
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-[#A79BC2]">Response Latency</dt>
              <dd className="font-mono tabular-nums font-semibold text-[#22D3EE]">
                {network.estimatedPingMs} ms
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-[#A79BC2]">Connected Peers</dt>
              <dd className="font-mono tabular-nums text-white">
                {p2pEnabled ? `${network.activePeers} direct peers` : 'Relay bridge mode'}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-[#A79BC2]">Text Channel Privacy</dt>
              <dd className="font-medium text-[#A5F3FC]">End-to-End Encrypted</dd>
            </div>
          </dl>
        </section>
      </div>

      {/* Verified Achievements */}
      <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <Award className="h-4 w-4 text-[#FF9F43]" aria-hidden="true" />
            <h2 className="text-base font-semibold text-white">Verified Achievements</h2>
          </div>
          <span className="font-mono tabular-nums text-xs text-[#9B8FB8]">
            {achievements.length} unlocked
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {achievements.map((ach) => (
            <article key={ach.id} className="glass-panel rounded-2xl p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-white">{ach.title}</h3>
                  <p className="text-xs text-[#9B8FB8]">
                    {ach.gameTag} · {ach.earnedDate}
                  </p>
                </div>
                <span
                  className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${ACCENT_MAP[ach.accent]}`}
                >
                  <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span>{ach.verifiedLabel}</span>
                </span>
              </div>
              <p className="text-xs leading-relaxed text-[#CFC6E3]">{ach.description}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Connected Squads & Recent Posts */}
      <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-4">
        <section className="glass-panel rounded-2xl p-4 space-y-3 h-fit">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-[#22D3EE]" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-white">Connected Squads</h2>
          </div>

          <ul className="divide-y divide-white/[0.06]">
            {joinedSquads.map((club) => (
              <li key={club.id} className="py-2.5 first:pt-0 last:pb-0">
                <button
                  type="button"
                  onClick={() => onOpenClubRoom(club.id)}
                  className="tactile-btn flex w-full items-center justify-between gap-2 rounded-xl px-1.5 py-1 text-left hover:bg-white/[0.05]"
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <ClubIcon icon={club.icon} className="h-4 w-4 text-[#FF8C42] shrink-0" />
                    <span className="truncate text-sm font-medium text-[#EDE8F8]">
                      {club.name}
                    </span>
                  </span>
                  <span className="font-mono tabular-nums text-xs text-[#9B8FB8] whitespace-nowrap">
                    {club.onlineCount} online
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="glass-panel rounded-2xl p-4 sm:p-5 space-y-3.5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Recent Posts</h2>
            <span className="font-mono tabular-nums text-xs text-[#9B8FB8]">
              {userPosts.length} {userPosts.length === 1 ? 'post' : 'posts'}
            </span>
          </div>

          {userPosts.length === 0 ? (
            <p className="text-sm text-[#9B8FB8] py-4">
              You have not published any text posts yet.
            </p>
          ) : (
            <ul className="divide-y divide-white/[0.07]">
              {userPosts.map((post) => (
                <li key={post.id} className="py-3.5 first:pt-0 last:pb-0 space-y-2">
                  <div className="flex items-center justify-between gap-2 text-xs text-[#9B8FB8]">
                    <span className="font-medium text-[#FF9F43]">{post.gameTag}</span>
                    <span className="font-mono tabular-nums">{post.timestamp}</span>
                  </div>
                  <p className="text-sm text-[#EDE8F8] leading-relaxed">{post.content}</p>
                  <div className="flex items-center gap-4 text-xs text-[#A79BC2]">
                    <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
                      <ThumbsUp className="h-3.5 w-3.5 text-[#FF8C42]" aria-hidden="true" />
                      {post.score} {post.score === 1 ? 'vote' : 'votes'}
                    </span>
                    <button
                      type="button"
                      onClick={() => onOpenReply(post)}
                      className="tactile-btn inline-flex items-center gap-1.5 font-mono tabular-nums hover:text-white"
                    >
                      <MessageSquare className="h-3.5 w-3.5 text-[#22D3EE]" aria-hidden="true" />
                      {post.replies.length} {post.replies.length === 1 ? 'comment' : 'comments'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
