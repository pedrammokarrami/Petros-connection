import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Monitor, Share, Smartphone, X } from 'lucide-react';
import { usePWAInstall, type DetectedPlatform } from '../hooks/usePWAInstall';
import { soundEngine } from '../utils/soundEngine';

interface PWAInstallButtonProps {
  compact?: boolean;
}

const PLATFORM_GUIDES: Record<
  DetectedPlatform,
  { title: string; subtitle: string; steps: string[] }
> = {
  ios: {
    title: 'Install on iPhone & iPad',
    subtitle: 'Full-screen standalone app with zero browser bars.',
    steps: [
      'Tap the Share button at the bottom (or top) of Safari.',
      'Scroll down and tap Add to Home Screen.',
      'Tap Add in the top-right corner to launch AIGAMERIA like a native iOS app.',
    ],
  },
  android: {
    title: 'Install on Android',
    subtitle: 'Instant home screen icon with adaptive icon support & offline mode.',
    steps: [
      'Tap the three-dot menu (⋮) in the top-right corner of Chrome.',
      'Tap Install app or Add to Home screen.',
      'Confirm Install to launch AIGAMERIA in standalone fullscreen mode.',
    ],
  },
  macos: {
    title: 'Install on macOS',
    subtitle: 'Runs as a dedicated Dock app window with keyboard shortcuts.',
    steps: [
      'In Safari: open File → Add to Dock… from the top menu bar.',
      'In Chrome / Edge: click the Install icon in the right side of the address bar.',
      'Launch AIGAMERIA directly from your Dock or Spotlight.',
    ],
  },
  windows: {
    title: 'Install on Windows',
    subtitle: 'Pin to Taskbar or Start Menu as a native standalone window.',
    steps: [
      'In Chrome or Edge, click the Install app icon in the right edge of the address bar.',
      'Or open the browser menu (⋯ / ⋮) → Apps → Install AIGAMERIA.',
      'Pin AIGAMERIA to your Taskbar or Start Menu for one-click launch.',
    ],
  },
  desktop: {
    title: 'Install AIGAMERIA App',
    subtitle: 'Available as a standalone app on iOS, Android, Windows, and macOS.',
    steps: [
      'Desktop Chrome / Edge: Click the Install icon in the browser address bar.',
      'macOS Safari: Choose File → Add to Dock.',
      'iOS / Android: Tap Share (iOS) or Menu (Android) → Add to Home Screen.',
    ],
  },
};

export function PWAInstallButton({ compact = false }: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, platform, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    if (!showGuide) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        soundEngine.playSoftBack();
        setShowGuide(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showGuide]);

  // Automatically suppress install UI when already running as an installed standalone PWA
  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    soundEngine.playConfirm();
    if (isInstallable) {
      const accepted = await install();
      if (accepted) return;
    }
    setShowGuide(true);
  };

  const guide = PLATFORM_GUIDES[platform];
  const isMobileOS = platform === 'ios' || platform === 'android';

  const modalNode =
    showGuide && typeof document !== 'undefined'
      ? createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pwa-install-guide-title"
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div
              onClick={() => {
                soundEngine.playSoftBack();
                setShowGuide(false);
              }}
              className="animate-backdrop-fade fixed inset-0 bg-[#07040F]/75 backdrop-blur-sm"
            />

            <div className="animate-modal-pop glass-panel-elevated relative z-10 w-full max-w-md rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[#FF6B35] via-[#FF3E8A] to-[#22D3EE] p-[1.5px] shrink-0">
                    <div className="flex h-full w-full items-center justify-center rounded-[10px] bg-[#120A24]">
                      {isMobileOS ? (
                        <Smartphone className="h-5 w-5 text-[#67E8F9]" aria-hidden="true" />
                      ) : (
                        <Monitor className="h-5 w-5 text-[#67E8F9]" aria-hidden="true" />
                      )}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <h2 id="pwa-install-guide-title" className="text-lg font-bold text-white">
                      {guide.title}
                    </h2>
                    <p className="text-xs text-[#A79BC2]">{guide.subtitle}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playSoftBack();
                    setShowGuide(false);
                  }}
                  aria-label="Close install instructions"
                  className="tactile-btn rounded-xl p-2 text-[#9B8FB8] hover:bg-white/[0.08] hover:text-white"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              <ol className="space-y-2.5">
                {guide.steps.map((step, index) => (
                  <li
                    key={index}
                    className="flex items-start gap-3 rounded-xl border border-white/[0.08] bg-[#0D091A]/75 p-3 text-xs text-[#E4DDF5] leading-relaxed"
                  >
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#FF6B35]/20 border border-[#FF6B35]/40 font-mono text-[11px] font-bold text-[#FF9F43] shrink-0">
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>

              {platform === 'ios' ? (
                <div className="flex items-center gap-2 rounded-xl border border-[#22D3EE]/25 bg-[#22D3EE]/10 px-3 py-2 text-[11px] text-[#A5F3FC]">
                  <Share className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>Tip: Use Safari on iOS/iPadOS to enable standalone full-screen mode.</span>
                </div>
              ) : null}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playSoftBack();
                    setShowGuide(false);
                  }}
                  className="tactile-btn h-10 rounded-xl bg-gradient-to-r from-[#FF6B35] to-[#FF3E8A] px-5 text-xs font-semibold text-white hover:brightness-110"
                >
                  Got it
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        aria-label="Install AIGAMERIA app"
        className={`tactile-btn inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#22D3EE]/35 bg-[#22D3EE]/12 font-semibold text-[#A5F3FC] hover:border-[#22D3EE]/60 hover:bg-[#22D3EE]/20 hover:text-white whitespace-nowrap shrink-0 ${
          compact ? 'h-9 sm:h-10 px-2.5 sm:px-3 text-xs' : 'h-10 w-full px-3.5 text-xs'
        }`}
      >
        <Download className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className={compact ? 'hidden sm:inline' : ''}>Install App</span>
      </button>

      {modalNode}
    </>
  );
}
