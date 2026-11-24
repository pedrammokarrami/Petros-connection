import { useState } from 'react';
import {
  Check,
  Copy,
  Lock,
  Mail,
  MessageCircle,
  MessageSquare,
  Send,
  Sparkles,
} from 'lucide-react';
import { soundEngine } from '../utils/soundEngine';

export type InviteChannel = 'email' | 'sms' | 'whatsapp' | 'telegram';

interface InviteGateLandingProps {
  phase: 'locked' | 'revealing';
  onTriggerInvite: (channel: InviteChannel, recipientNote: string) => void;
}

const INVITE_URL = 'https://aigameria.app/invite/op-2026';
const HERO_BG = '/src/assets/images/locked_sunset_horizon_1795477469663.jpg';

const CHANNELS: {
  id: InviteChannel;
  label: string;
  subtitle: string;
  icon: typeof Mail;
  accentClass: string;
  iconClass: string;
}[] = [
  {
    id: 'email',
    label: 'Email',
    subtitle: 'Send invite link',
    icon: Mail,
    accentClass:
      'hover:border-[#FF6B35]/55 hover:bg-[#FF6B35]/14 focus-visible:border-[#FF6B35]',
    iconClass: 'text-[#FF9F43] bg-[#FF6B35]/18 border-[#FF6B35]/35',
  },
  {
    id: 'sms',
    label: 'SMS',
    subtitle: 'Text a teammate',
    icon: MessageSquare,
    accentClass:
      'hover:border-[#22D3EE]/55 hover:bg-[#22D3EE]/14 focus-visible:border-[#22D3EE]',
    iconClass: 'text-[#67E8F9] bg-[#22D3EE]/16 border-[#22D3EE]/35',
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    subtitle: 'Drop in squad chat',
    icon: MessageCircle,
    accentClass:
      'hover:border-[#34D399]/55 hover:bg-[#34D399]/14 focus-visible:border-[#34D399]',
    iconClass: 'text-[#6EE7B7] bg-[#34D399]/16 border-[#34D399]/35',
  },
  {
    id: 'telegram',
    label: 'Telegram',
    subtitle: 'Forward instant pass',
    icon: Send,
    accentClass:
      'hover:border-[#38BDF8]/55 hover:bg-[#38BDF8]/14 focus-visible:border-[#38BDF8]',
    iconClass: 'text-[#7DD3FC] bg-[#38BDF8]/16 border-[#38BDF8]/35',
  },
];

export function InviteGateLanding({ phase, onTriggerInvite }: InviteGateLandingProps) {
  const [recipient, setRecipient] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [dispatchedChannel, setDispatchedChannel] = useState<InviteChannel | null>(null);

  const isRevealing = phase === 'revealing';

  const handleCopyInvite = () => {
    soundEngine.playConfirm();
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(INVITE_URL).catch(() => {});
    }
    setCopiedLink(true);
    window.setTimeout(() => setCopiedLink(false), 1800);
  };

  const handleSelectChannel = (channel: InviteChannel) => {
    if (isRevealing) return;
    setDispatchedChannel(channel);
    const inviteCopy = recipient.trim()
      ? `Hey ${recipient.trim()} — join my squad on AIGAMERIA: ${INVITE_URL}`
      : `Join my gaming squad on AIGAMERIA (text-first clubs & DMs): ${INVITE_URL}`;

    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(inviteCopy).catch(() => {});
    }
    onTriggerInvite(channel, recipient.trim());
  };

  return (
    <div
      data-testid="invite-gate-screen"
      data-phase={phase}
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center overflow-y-auto px-4 py-8 ${
        isRevealing ? 'animate-gate-veil-part pointer-events-none' : ''
      }`}
    >
      {/* Atmospheric Sunset Horizon Backdrop */}
      <div aria-hidden="true" className="fixed inset-0 -z-10 overflow-hidden bg-[#0D091A]">
        <img
          src={HERO_BG}
          alt=""
          className={`h-full w-full object-cover object-center transition-transform duration-1000 ${
            isRevealing ? 'scale-110 opacity-45' : 'scale-100 opacity-55'
          }`}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0D091A]/90 via-[#120A24]/75 to-[#0D091A]/95" />
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 68% 45% at 50% 42%, rgba(255, 107, 53, 0.16), rgba(255, 62, 138, 0.08) 45%, transparent 72%)',
          }}
        />
      </div>

      {/* Central AIGAMERIA Brand Emblem (Expands & Rises on Reveal) */}
      <div
        className={`flex flex-col items-center text-center transition-all ${
          isRevealing ? 'animate-logo-expand-rise' : 'mb-6'
        }`}
      >
        <div className="relative flex items-center justify-center">
          <div
            aria-hidden="true"
            className={`absolute -inset-4 rounded-3xl bg-gradient-to-tr from-[#FF6B35]/35 via-[#FF3E8A]/30 to-[#22D3EE]/30 blur-2xl transition-opacity duration-500 ${
              isRevealing ? 'opacity-100' : 'opacity-65'
            }`}
          />
          <div className="relative flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-[#FF6B35] via-[#FF3E8A] to-[#22D3EE] p-[2px] shadow-2xl shadow-[#FF3E8A]/35">
            <div className="flex h-full w-full items-center justify-center rounded-[14px] bg-[#120A24]/90">
              <span className="font-[var(--font-display)] text-3xl sm:text-4xl font-extrabold tracking-tight bg-gradient-to-br from-white via-[#FFE3D3] to-[#67E8F9] bg-clip-text text-transparent">
                A
              </span>
            </div>
          </div>
        </div>

        <h1 className="mt-4 font-[var(--font-display)] text-3xl sm:text-4xl font-extrabold tracking-[0.16em] text-white">
          AI<span className="text-[#FF6B35]">GAME</span>
          <span className="text-[#FF3E8A]">RIA</span>
        </h1>

        {isRevealing ? (
          <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-[#A5F3FC]">
            <Sparkles className="h-4 w-4 text-[#FF9F43]" aria-hidden="true" />
            <span>
              Invite dispatched via{' '}
              {dispatchedChannel ? dispatchedChannel.toUpperCase() : 'SQUAD PASS'} — Entering
              lounge…
            </span>
          </p>
        ) : (
          <p className="mt-1.5 text-sm text-[#C7BEDB] max-w-md">
            Text-first gaming clubs, private squad rooms, and verified match comms.
          </p>
        )}
      </div>

      {/* Prominent Invite-Only Unlock Action Modal */}
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-gate-heading"
        className={`glass-panel-elevated w-full max-w-lg rounded-3xl p-5 sm:p-7 shadow-2xl border border-white/14 space-y-5 ${
          isRevealing ? 'animate-gate-card-dissolve' : 'animate-modal-pop'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#FF9F43]">
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Invite-Only Access</span>
            </div>
            <h2 id="invite-gate-heading" className="text-xl sm:text-2xl font-bold text-white">
              Invite 1 friend to unlock AIGAMERIA
            </h2>
            <p className="text-xs sm:text-sm text-[#B7ACD0] leading-relaxed">
              Send a squad pass through any channel below. The platform unlocks immediately once
              your invite is dispatched.
            </p>
          </div>
        </div>

        {/* Optional Friend Contact / Handle */}
        <div className="space-y-1.5">
          <label htmlFor="invite-friend-input" className="block text-xs font-medium text-[#D6CEE8]">
            Friend’s handle, email, or phone (optional)
          </label>
          <input
            id="invite-friend-input"
            type="text"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="e.g. Nova_Strike or alex@squad.gg"
            className="h-11 w-full rounded-xl border border-white/14 bg-[#0D091A]/85 px-3.5 text-sm text-white placeholder:text-[#7E7299] focus:border-[#22D3EE]/60"
          />
        </div>

        {/* 4 Required Invite Integration Options: Email, SMS, WhatsApp, Telegram */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-[#A79BC2]">Choose an invite channel to unlock:</p>
          <div className="grid grid-cols-2 gap-2.5">
            {CHANNELS.map((channel) => {
              const Icon = channel.icon;
              return (
                <button
                  key={channel.id}
                  type="button"
                  onClick={() => handleSelectChannel(channel.id)}
                  aria-label={`Invite a friend via ${channel.label} to unlock AIGAMERIA`}
                  className={`tactile-btn flex items-center gap-3 rounded-2xl border border-white/12 bg-white/[0.04] p-3 text-left ${channel.accentClass}`}
                >
                  <span
                    className={`flex h-10 w-10 items-center justify-center rounded-xl border shrink-0 ${channel.iconClass}`}
                  >
                    <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-white truncate">
                      {channel.label}
                    </span>
                    <span className="block text-[11px] text-[#9B8FB8] truncate">
                      {channel.subtitle}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Personal Squad Pass Link */}
        <div className="pt-2 border-t border-white/[0.08] flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-[#9B8FB8]">Your Personal Squad Pass</p>
            <p className="truncate font-mono text-xs text-[#D6CEE8]">{INVITE_URL}</p>
          </div>
          <button
            type="button"
            onClick={handleCopyInvite}
            aria-label="Copy invite link"
            className="tactile-btn inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/12 bg-white/[0.05] px-3 text-xs font-semibold text-white hover:bg-white/[0.1] whitespace-nowrap shrink-0"
          >
            {copiedLink ? (
              <>
                <Check className="h-3.5 w-3.5 text-[#22D3EE]" aria-hidden="true" />
                <span className="text-[#A5F3FC]">Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5 text-[#FF9F43]" aria-hidden="true" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </section>
    </div>
  );
}
