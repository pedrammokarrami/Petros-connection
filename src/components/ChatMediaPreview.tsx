import { useEffect, useMemo, useState } from 'react';
import {
  ExternalLink,
  Film,
  Globe,
  Image as ImageIcon,
  Maximize2,
  Music,
  Play,
} from 'lucide-react';
import {
  extractUrlsFromText,
  parseMediaLink,
  splitTextWithLinks,
  type ParsedMediaLink,
} from '../utils/mediaParser';

interface RemoteMetadata {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  author?: string;
}

const metadataCache = new Map<string, RemoteMetadata>();

interface ChatMessageContentProps {
  content: string;
  onOpenFullscreen: (media: ParsedMediaLink) => void;
}

function MediaPreviewCard({
  baseMedia,
  onOpenFullscreen,
}: {
  baseMedia: ParsedMediaLink;
  onOpenFullscreen: (media: ParsedMediaLink) => void;
}) {
  const [remote, setRemote] = useState<RemoteMetadata | null>(
    () => metadataCache.get(baseMedia.url) ?? null,
  );
  const [loading, setLoading] = useState(
    !baseMedia.isLocalAsset &&
      baseMedia.kind !== 'image' &&
      baseMedia.kind !== 'video' &&
      baseMedia.kind !== 'audio' &&
      !metadataCache.has(baseMedia.url),
  );
  const [inlinePlaying, setInlinePlaying] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);

  useEffect(() => {
    if (
      baseMedia.isLocalAsset ||
      baseMedia.kind === 'image' ||
      baseMedia.kind === 'video' ||
      baseMedia.kind === 'audio'
    ) {
      return;
    }
    if (metadataCache.has(baseMedia.url)) {
      setRemote(metadataCache.get(baseMedia.url) ?? null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetch(`/api/link-preview?url=${encodeURIComponent(baseMedia.url)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: RemoteMetadata | null) => {
        if (cancelled) return;
        if (data && typeof data === 'object') {
          metadataCache.set(baseMedia.url, data);
          setRemote(data);
        }
      })
      .catch(() => {
        // Fallback smoothly to locally parsed metadata
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [baseMedia]);

  const enriched: ParsedMediaLink = useMemo(
    () => ({
      ...baseMedia,
      title: remote?.title || baseMedia.title,
      description: remote?.description || baseMedia.description,
      provider: remote?.siteName || baseMedia.provider,
      thumbnailUrl: remote?.image || baseMedia.thumbnailUrl,
    }),
    [baseMedia, remote],
  );

  // 1. Direct Image Card
  if (enriched.kind === 'image') {
    return (
      <div className="mt-2.5 w-full max-w-[340px] overflow-hidden rounded-xl border border-white/12 bg-[#0E091E]/90">
        {!imageFailed && enriched.mediaUrl ? (
          <button
            type="button"
            onClick={() => onOpenFullscreen(enriched)}
            aria-label={`Inspect image ${enriched.title} fullscreen`}
            className="group relative block w-full overflow-hidden text-left focus-visible:outline-none"
          >
            <img
              src={enriched.mediaUrl}
              alt={enriched.title}
              loading="lazy"
              onError={() => setImageFailed(true)}
              className="max-h-52 w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
            <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-lg bg-[#0D091A]/80 border border-white/15 px-2 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
              <Maximize2 className="h-3 w-3 text-[#22D3EE]" aria-hidden="true" />
              <span>Expand</span>
            </span>
          </button>
        ) : null}
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-white">{enriched.title}</p>
            <p className="truncate text-[11px] text-[#9B8FB8] flex items-center gap-1">
              <ImageIcon className="h-3 w-3 text-[#FF9F43] shrink-0" aria-hidden="true" />
              <span>{enriched.provider}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenFullscreen(enriched)}
            aria-label={`Open ${enriched.title} fullscreen`}
            className="tactile-btn inline-flex h-7 items-center gap-1 rounded-lg border border-white/12 bg-white/[0.06] px-2 text-[11px] font-medium text-[#E4DDF5] hover:bg-white/[0.12] shrink-0"
          >
            <Maximize2 className="h-3 w-3" aria-hidden="true" />
            <span>View</span>
          </button>
        </div>
      </div>
    );
  }

  // 2. Direct HTML5 Video Player Card
  if (enriched.kind === 'video' && enriched.mediaUrl) {
    return (
      <div className="mt-2.5 w-full max-w-[360px] overflow-hidden rounded-xl border border-white/12 bg-[#0E091E]/90">
        {!videoFailed ? (
          <div className="relative bg-black">
            <video
              src={enriched.mediaUrl}
              controls
              playsInline
              preload="metadata"
              onError={() => setVideoFailed(true)}
              className="max-h-52 w-full object-contain bg-black"
            />
          </div>
        ) : (
          <div className="flex items-center gap-2.5 bg-[#160F2B] px-3.5 py-4 text-xs text-[#C2B7D9]">
            <Film className="h-5 w-5 text-[#FF9F43] shrink-0" aria-hidden="true" />
            <span>Inline preview unavailable for this host — expand or open link.</span>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-white">{enriched.title}</p>
            <p className="truncate text-[11px] text-[#9B8FB8]">
              {enriched.provider} · {enriched.domain}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenFullscreen(enriched)}
            aria-label={`Expand video ${enriched.title} fullscreen`}
            className="tactile-btn inline-flex h-7 items-center gap-1 rounded-lg border border-[#22D3EE]/35 bg-[#22D3EE]/12 px-2.5 text-[11px] font-semibold text-[#A5F3FC] hover:bg-[#22D3EE]/22 whitespace-nowrap shrink-0"
          >
            <Maximize2 className="h-3 w-3" aria-hidden="true" />
            <span>Fullscreen</span>
          </button>
        </div>
      </div>
    );
  }

  // 3. Embedded Video Players (YouTube / Vimeo / Twitch)
  if (
    (enriched.kind === 'youtube' || enriched.kind === 'vimeo' || enriched.kind === 'twitch') &&
    enriched.embedUrl
  ) {
    return (
      <div className="mt-2.5 w-full max-w-[360px] overflow-hidden rounded-xl border border-white/12 bg-[#0E091E]/90">
        {inlinePlaying ? (
          <div className="relative aspect-video w-full bg-black">
            <iframe
              src={enriched.embedUrl}
              title={enriched.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="h-full w-full border-0"
            />
          </div>
        ) : (
          <div className="relative aspect-video w-full overflow-hidden bg-gradient-to-br from-[#1C1238] via-[#261645] to-[#120B24]">
            {enriched.thumbnailUrl && !imageFailed ? (
              <img
                src={enriched.thumbnailUrl}
                alt={enriched.title}
                loading="lazy"
                onError={() => setImageFailed(true)}
                className="h-full w-full object-cover opacity-85"
              />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-t from-[#0D091A]/90 via-[#0D091A]/30 to-transparent" />
            <div className="absolute inset-0 flex items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={() => setInlinePlaying(true)}
                aria-label={`Play ${enriched.title} inline`}
                className="tactile-btn inline-flex h-11 items-center gap-2 rounded-full bg-gradient-to-r from-[#FF6B35] to-[#FF3E8A] px-4 text-xs font-semibold text-white shadow-lg shadow-[#FF3E8A]/35 hover:brightness-110"
              >
                <Play className="h-4 w-4 fill-current" aria-hidden="true" />
                <span>Play Inline</span>
              </button>
              <button
                type="button"
                onClick={() => onOpenFullscreen(enriched)}
                aria-label={`Watch ${enriched.title} fullscreen`}
                className="tactile-btn inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-[#0D091A]/80 text-white hover:bg-[#0D091A] backdrop-blur-sm"
              >
                <Maximize2 className="h-4 w-4 text-[#22D3EE]" aria-hidden="true" />
              </button>
            </div>
            <span className="absolute left-2.5 top-2.5 rounded-md bg-[#0D091A]/80 border border-white/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#FF9F43]">
              {enriched.provider}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 px-3 py-2.5">
          <button
            type="button"
            onClick={() => onOpenFullscreen(enriched)}
            className="min-w-0 text-left flex-1"
          >
            <p className="truncate text-xs font-semibold text-white hover:text-[#22D3EE] transition-colors">
              {loading ? 'Loading video details…' : enriched.title}
            </p>
            <p className="truncate text-[11px] text-[#9B8FB8]">
              {enriched.description ?? enriched.domain}
            </p>
          </button>
          <button
            type="button"
            onClick={() => onOpenFullscreen(enriched)}
            aria-label={`Expand ${enriched.title} fullscreen`}
            className="tactile-btn inline-flex h-7 items-center gap-1 rounded-lg border border-[#22D3EE]/35 bg-[#22D3EE]/12 px-2 text-[11px] font-semibold text-[#A5F3FC] hover:bg-[#22D3EE]/22 whitespace-nowrap shrink-0"
          >
            <Maximize2 className="h-3 w-3" aria-hidden="true" />
            <span>Fullscreen</span>
          </button>
        </div>
      </div>
    );
  }

  // 4. Direct Audio Card
  if (enriched.kind === 'audio' && enriched.mediaUrl) {
    return (
      <div className="mt-2.5 w-full max-w-[340px] rounded-xl border border-white/12 bg-[#0E091E]/90 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Music className="h-4 w-4 text-[#22D3EE] shrink-0" aria-hidden="true" />
            <p className="truncate text-xs font-semibold text-white">{enriched.title}</p>
          </div>
          <button
            type="button"
            onClick={() => onOpenFullscreen(enriched)}
            aria-label={`Expand audio ${enriched.title}`}
            className="tactile-btn inline-flex h-7 items-center gap-1 rounded-lg border border-white/12 bg-white/[0.05] px-2 text-[11px] text-[#D6CEE8] hover:text-white shrink-0"
          >
            <Maximize2 className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
        <audio src={enriched.mediaUrl} controls className="w-full h-9" />
      </div>
    );
  }

  // 5. Rich Web Link / Article OpenGraph Card
  return (
    <div className="mt-2.5 w-full max-w-[360px] overflow-hidden rounded-xl border border-white/12 bg-[#0E091E]/90">
      {enriched.thumbnailUrl && !imageFailed ? (
        <button
          type="button"
          onClick={() => onOpenFullscreen(enriched)}
          aria-label={`Preview ${enriched.title}`}
          className="block w-full overflow-hidden"
        >
          <img
            src={enriched.thumbnailUrl}
            alt={enriched.title}
            loading="lazy"
            onError={() => setImageFailed(true)}
            className="max-h-36 w-full object-cover hover:scale-[1.02] transition-transform"
          />
        </button>
      ) : null}

      <div className="p-3 space-y-1.5">
        <div className="flex items-center justify-between gap-2 text-[11px] text-[#22D3EE]">
          <span className="inline-flex items-center gap-1 truncate font-medium">
            <Globe className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{enriched.provider}</span>
          </span>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onOpenFullscreen(enriched)}
              aria-label={`Expand preview for ${enriched.title}`}
              className="tactile-btn inline-flex h-6 items-center gap-1 rounded-md border border-white/12 bg-white/[0.05] px-1.5 text-[10px] font-medium text-[#E4DDF5] hover:bg-white/[0.12]"
            >
              <Maximize2 className="h-2.5 w-2.5" aria-hidden="true" />
              <span>Preview</span>
            </button>
            <a
              href={enriched.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open ${enriched.domain} in new tab`}
              className="tactile-btn inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/12 bg-white/[0.05] text-[#C2B7D9] hover:text-white"
            >
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onOpenFullscreen(enriched)}
          className="block w-full text-left"
        >
          <p className="text-xs font-semibold text-white line-clamp-2 hover:text-[#FF9F43] transition-colors">
            {loading ? 'Fetching link preview…' : enriched.title}
          </p>
          {enriched.description ? (
            <p className="mt-0.5 text-[11px] text-[#A79BC2] line-clamp-2 leading-relaxed">
              {enriched.description}
            </p>
          ) : null}
        </button>
      </div>
    </div>
  );
}

export function ChatMessageContent({ content, onOpenFullscreen }: ChatMessageContentProps) {
  const segments = useMemo(() => splitTextWithLinks(content), [content]);
  const mediaItems = useMemo(() => {
    const urls = extractUrlsFromText(content);
    const parsed: ParsedMediaLink[] = [];
    for (const url of urls.slice(0, 2)) {
      const item = parseMediaLink(url);
      if (item) parsed.push(item);
    }
    return parsed;
  }, [content]);

  return (
    <div className="space-y-1">
      <p className="text-sm leading-relaxed break-words">
        {segments.map((seg, idx) =>
          seg.type === 'link' && seg.href ? (
            <a
              key={`${seg.href}-${idx}`}
              href={seg.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#67E8F9] underline decoration-[#22D3EE]/50 underline-offset-2 hover:text-white break-all"
            >
              {seg.value}
            </a>
          ) : (
            <span key={idx}>{seg.value}</span>
          ),
        )}
      </p>

      {mediaItems.map((item) => (
        <MediaPreviewCard
          key={item.url}
          baseMedia={item}
          onOpenFullscreen={onOpenFullscreen}
        />
      ))}
    </div>
  );
}
