import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Globe, X, ZoomIn, ZoomOut } from 'lucide-react';
import type { ParsedMediaLink } from '../utils/mediaParser';

interface MediaLightboxModalProps {
  media: ParsedMediaLink | null;
  onClose: () => void;
}

export function MediaLightboxModal({ media, onClose }: MediaLightboxModalProps) {
  const [zoomed, setZoomed] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    setZoomed(false);
  }, [media?.url]);

  useEffect(() => {
    if (!media) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [Boolean(media)]);

  if (!media) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="media-lightbox-title"
      className="fixed inset-0 z-50 flex flex-col bg-[#07040F]/92 backdrop-blur-md p-3 sm:p-6"
    >
      {/* Top Bar Controls */}
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 pb-3 sm:pb-4">
        <div className="min-w-0">
          <h2 id="media-lightbox-title" className="truncate text-base sm:text-lg font-bold text-white">
            {media.title}
          </h2>
          <p className="truncate text-xs text-[#A79BC2]">
            {media.provider} · {media.domain}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {media.kind === 'image' ? (
            <button
              type="button"
              onClick={() => setZoomed((z) => !z)}
              aria-label={zoomed ? 'Zoom out image' : 'Zoom in image'}
              className="tactile-btn inline-flex h-10 items-center gap-1.5 rounded-xl border border-white/14 bg-white/[0.06] px-3 text-xs font-semibold text-white hover:bg-white/[0.12] whitespace-nowrap"
            >
              {zoomed ? (
                <>
                  <ZoomOut className="h-4 w-4 text-[#22D3EE]" aria-hidden="true" />
                  <span className="hidden sm:inline">Fit</span>
                </>
              ) : (
                <>
                  <ZoomIn className="h-4 w-4 text-[#22D3EE]" aria-hidden="true" />
                  <span className="hidden sm:inline">Zoom</span>
                </>
              )}
            </button>
          ) : null}

          {!media.isLocalAsset ? (
            <a
              href={media.url}
              target="_blank"
              rel="noopener noreferrer"
              className="tactile-btn inline-flex h-10 items-center gap-1.5 rounded-xl border border-white/14 bg-white/[0.06] px-3 text-xs font-semibold text-[#E4DDF5] hover:bg-white/[0.12] hover:text-white whitespace-nowrap"
            >
              <ExternalLink className="h-4 w-4 text-[#FF9F43]" aria-hidden="true" />
              <span className="hidden sm:inline">Open Source</span>
            </a>
          ) : null}

          <button
            type="button"
            onClick={onClose}
            aria-label="Close fullscreen media"
            className="tactile-btn inline-flex h-10 items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#FF6B35] to-[#FF3E8A] px-3.5 text-xs font-semibold text-white hover:brightness-110 whitespace-nowrap"
          >
            <X className="h-4 w-4" aria-hidden="true" />
            <span>Close</span>
          </button>
        </div>
      </header>

      {/* Main Responsive Stage */}
      <div
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        className="mx-auto flex w-full max-w-5xl flex-1 items-center justify-center overflow-auto"
      >
        {media.kind === 'image' && media.mediaUrl ? (
          <img
            src={media.mediaUrl}
            alt={media.title}
            onClick={() => setZoomed((z) => !z)}
            className={`animate-modal-pop rounded-2xl border border-white/12 shadow-2xl transition-transform duration-200 cursor-zoom-in ${
              zoomed
                ? 'max-w-none w-[135%] sm:w-[125%] cursor-zoom-out'
                : 'max-h-[78dvh] max-w-full object-contain'
            }`}
          />
        ) : media.kind === 'video' && media.mediaUrl ? (
          <div className="animate-modal-pop w-full max-w-4xl overflow-hidden rounded-2xl border border-white/14 bg-black shadow-2xl">
            <video
              src={media.mediaUrl}
              controls
              autoPlay
              playsInline
              className="max-h-[76dvh] w-full bg-black"
            />
          </div>
        ) : (media.kind === 'youtube' || media.kind === 'vimeo' || media.kind === 'twitch') &&
          media.embedUrl ? (
          <div className="animate-modal-pop aspect-video w-full max-w-4xl overflow-hidden rounded-2xl border border-white/14 bg-black shadow-2xl">
            <iframe
              src={media.embedUrl}
              title={media.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="h-full w-full border-0"
            />
          </div>
        ) : media.kind === 'audio' && media.mediaUrl ? (
          <div className="animate-modal-pop glass-panel-elevated w-full max-w-xl rounded-2xl p-6 space-y-4">
            <p className="text-base font-semibold text-white">{media.title}</p>
            <audio src={media.mediaUrl} controls autoPlay className="w-full" />
          </div>
        ) : (
          <div className="animate-modal-pop glass-panel-elevated w-full max-w-xl overflow-hidden rounded-2xl border border-white/14">
            {media.thumbnailUrl ? (
              <img
                src={media.thumbnailUrl}
                alt={media.title}
                className="max-h-64 w-full object-cover"
              />
            ) : null}
            <div className="p-6 space-y-3">
              <div className="inline-flex items-center gap-1.5 text-xs font-medium text-[#22D3EE]">
                <Globe className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{media.provider}</span>
              </div>
              <h3 className="text-xl font-bold text-white">{media.title}</h3>
              {media.description ? (
                <p className="text-sm text-[#CFC6E3] leading-relaxed">{media.description}</p>
              ) : null}
              <p className="truncate font-mono text-xs text-[#8F83AB]">{media.url}</p>
              <div className="pt-2 flex items-center gap-2">
                <a
                  href={media.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tactile-btn inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-[#FF6B35] to-[#FF3E8A] px-4 text-xs font-semibold text-white hover:brightness-110"
                >
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  <span>Open External Link</span>
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
