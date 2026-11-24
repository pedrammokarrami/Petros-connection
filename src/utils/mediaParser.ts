/**
 * Intelligent URL extraction and media classification for AIGAMERIA chat streams.
 * Safely parses direct images, HTML5 video/audio streams, YouTube, Vimeo, Twitch, and rich web links.
 */

export type MediaKind = 'youtube' | 'vimeo' | 'twitch' | 'video' | 'audio' | 'image' | 'link';

export interface ParsedMediaLink {
  url: string;
  kind: MediaKind;
  provider: string;
  domain: string;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  embedUrl?: string;
  mediaUrl?: string;
  isLocalAsset?: boolean;
}

export interface TextSegment {
  type: 'text' | 'link';
  value: string;
  href?: string;
}

const URL_REGEX = /(https?:\/\/[^\s<>"'`]+|\/src\/assets\/images\/[^\s<>"'`]+)/gi;

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|avif|bmp)(\?.*)?$/i;
const VIDEO_EXT_RE = /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i;
const AUDIO_EXT_RE = /\.(mp3|wav|m4a|flac|aac)(\?.*)?$/i;

function stripTrailingPunctuation(raw: string): string {
  return raw.replace(/[.,!?;:)\]]+$/, '');
}

export function isSafeLinkUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/src/assets/images/')) {
    return !trimmed.includes('..');
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function extractUrlsFromText(text: string): string[] {
  if (!text) return [];
  const matches = text.match(URL_REGEX);
  if (!matches) return [];
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of matches) {
    const clean = stripTrailingPunctuation(raw);
    if (isSafeLinkUrl(clean) && !seen.has(clean)) {
      seen.add(clean);
      result.push(clean);
    }
  }
  return result;
}

export function splitTextWithLinks(text: string): TextSegment[] {
  if (!text) return [];
  const segments: TextSegment[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(URL_REGEX)) {
    const matchIndex = match.index ?? 0;
    const rawMatch = match[0];
    const cleanUrl = stripTrailingPunctuation(rawMatch);
    const trailing = rawMatch.slice(cleanUrl.length);

    if (matchIndex > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, matchIndex) });
    }

    if (isSafeLinkUrl(cleanUrl)) {
      segments.push({ type: 'link', value: cleanUrl, href: cleanUrl });
    } else {
      segments.push({ type: 'text', value: cleanUrl });
    }

    if (trailing) {
      segments.push({ type: 'text', value: trailing });
    }

    lastIndex = matchIndex + rawMatch.length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return segments;
}

function extractYouTubeId(parsed: URL): string | null {
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (host === 'youtu.be') {
    const id = parsed.pathname.split('/').filter(Boolean)[0];
    return id && /^[a-zA-Z0-9_-]{6,15}$/.test(id) ? id : null;
  }
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    if (parsed.pathname === '/watch') {
      const v = parsed.searchParams.get('v');
      return v && /^[a-zA-Z0-9_-]{6,15}$/.test(v) ? v : null;
    }
    const parts = parsed.pathname.split('/').filter(Boolean);
    if ((parts[0] === 'shorts' || parts[0] === 'embed' || parts[0] === 'live') && parts[1]) {
      return /^[a-zA-Z0-9_-]{6,15}$/.test(parts[1]) ? parts[1] : null;
    }
  }
  return null;
}

function extractVimeoId(parsed: URL): string | null {
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (host !== 'vimeo.com' && host !== 'player.vimeo.com') return null;
  const parts = parsed.pathname.split('/').filter(Boolean);
  const candidate = parts[parts.length - 1];
  return candidate && /^\d{5,12}$/.test(candidate) ? candidate : null;
}

function extractTwitchInfo(parsed: URL): { id: string; kind: 'video' | 'clip' } | null {
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const parts = parsed.pathname.split('/').filter(Boolean);
  if (host === 'clips.twitch.tv' && parts[0]) {
    return { id: parts[0], kind: 'clip' };
  }
  if (host === 'twitch.tv') {
    if (parts[0] === 'videos' && parts[1] && /^\d+$/.test(parts[1])) {
      return { id: parts[1], kind: 'video' };
    }
    if (parts[1] === 'clip' && parts[2]) {
      return { id: parts[2], kind: 'clip' };
    }
  }
  return null;
}

function humanizeFilename(pathname: string, fallback: string): string {
  const leaf = pathname.split('/').filter(Boolean).pop() ?? '';
  if (!leaf) return fallback;
  const cleaned = decodeURIComponent(leaf)
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\d{10,}/g, '')
    .trim();
  if (!cleaned) return fallback;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function parseMediaLink(rawUrl: string): ParsedMediaLink | null {
  const clean = stripTrailingPunctuation(rawUrl.trim());
  if (!isSafeLinkUrl(clean)) return null;

  // Local generated media assets (used for instant offline-safe highlight previews)
  if (clean.startsWith('/src/assets/images/')) {
    return {
      url: clean,
      kind: 'image',
      provider: 'AIGAMERIA Media',
      domain: 'aigameria.app',
      title: humanizeFilename(clean, 'Match Highlight'),
      description: 'High-resolution match frame shared in squad chat.',
      thumbnailUrl: clean,
      mediaUrl: clean,
      isLocalAsset: true,
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(clean);
  } catch {
    return null;
  }

  const domain = parsed.hostname.replace(/^www\./, '');

  // 1. YouTube
  const ytId = extractYouTubeId(parsed);
  if (ytId) {
    return {
      url: clean,
      kind: 'youtube',
      provider: 'YouTube',
      domain,
      title: `YouTube Video (${ytId})`,
      description: 'Click play to watch inline or expand into fullscreen player.',
      thumbnailUrl: `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${ytId}?rel=0&modestbranding=1`,
    };
  }

  // 2. Vimeo
  const vimeoId = extractVimeoId(parsed);
  if (vimeoId) {
    return {
      url: clean,
      kind: 'vimeo',
      provider: 'Vimeo',
      domain,
      title: `Vimeo Clip #${vimeoId}`,
      description: 'Embedded Vimeo video player.',
      embedUrl: `https://player.vimeo.com/video/${vimeoId}`,
    };
  }

  // 3. Twitch
  const twitch = extractTwitchInfo(parsed);
  if (twitch) {
    const parentHost =
      typeof window !== 'undefined' && window.location.hostname
        ? window.location.hostname
        : 'localhost';
    const embedUrl =
      twitch.kind === 'video'
        ? `https://player.twitch.tv/?video=${encodeURIComponent(twitch.id)}&parent=${encodeURIComponent(parentHost)}&autoplay=false`
        : `https://clips.twitch.tv/embed?clip=${encodeURIComponent(twitch.id)}&parent=${encodeURIComponent(parentHost)}&autoplay=false`;
    return {
      url: clean,
      kind: 'twitch',
      provider: 'Twitch',
      domain,
      title: twitch.kind === 'video' ? `Twitch VOD #${twitch.id}` : `Twitch Clip · ${twitch.id}`,
      description: 'Watch inline or open fullscreen.',
      embedUrl,
    };
  }

  // 4. Direct Video
  if (VIDEO_EXT_RE.test(parsed.pathname)) {
    return {
      url: clean,
      kind: 'video',
      provider: 'Direct Video',
      domain,
      title: humanizeFilename(parsed.pathname, 'Video Clip'),
      description: 'Inline HTML5 video player · Click expand for fullscreen.',
      mediaUrl: clean,
    };
  }

  // 5. Direct Audio
  if (AUDIO_EXT_RE.test(parsed.pathname)) {
    return {
      url: clean,
      kind: 'audio',
      provider: 'Audio Clip',
      domain,
      title: humanizeFilename(parsed.pathname, 'Audio Recording'),
      description: 'Playable audio stream.',
      mediaUrl: clean,
    };
  }

  // 6. Direct Image
  if (
    IMAGE_EXT_RE.test(parsed.pathname) ||
    domain.includes('images.unsplash.com') ||
    domain.includes('images.pexels.com')
  ) {
    return {
      url: clean,
      kind: 'image',
      provider: 'Image',
      domain,
      title: humanizeFilename(parsed.pathname, 'Shared Image'),
      description: 'Click image to inspect fullscreen.',
      thumbnailUrl: clean,
      mediaUrl: clean,
    };
  }

  // 7. Rich Web Link / Article
  const pathTitle = humanizeFilename(parsed.pathname, domain);
  return {
    url: clean,
    kind: 'link',
    provider: domain,
    domain,
    title: pathTitle === domain ? `Link on ${domain}` : pathTitle,
    description: clean,
  };
}
