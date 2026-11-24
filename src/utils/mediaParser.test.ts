import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractUrlsFromText,
  isSafeLinkUrl,
  parseMediaLink,
  splitTextWithLinks,
} from './mediaParser';
import { isBlockedIpAddress, validatePublicHttpUrl } from './urlSecurity';

test('extractUrlsFromText extracts valid links, strips punctuation, and ignores unsafe schemes', () => {
  const input =
    'Check this clip (https://youtu.be/dQw4w9WgXcQ), screenshot https://cdn.example.com/map.png! Also ignore javascript:alert(1) and data:text/html,hi';
  const urls = extractUrlsFromText(input);
  assert.deepEqual(urls, [
    'https://youtu.be/dQw4w9WgXcQ',
    'https://cdn.example.com/map.png',
  ]);
  assert.equal(isSafeLinkUrl('javascript:alert(1)'), false);
  assert.equal(isSafeLinkUrl('data:image/svg+xml,evil'), false);
  assert.equal(isSafeLinkUrl('/src/assets/images/../secrets.txt'), false);
  assert.equal(isSafeLinkUrl('/src/assets/images/clip_tactical_highlight.jpg'), true);
});

test('parseMediaLink classifies YouTube, Vimeo, Twitch, video, audio, image, and web links', () => {
  const yt = parseMediaLink('https://www.youtube.com/watch?v=aqz-KE-bpKQ');
  assert.equal(yt?.kind, 'youtube');
  assert.equal(yt?.embedUrl, 'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?rel=0&modestbranding=1');
  assert.equal(yt?.thumbnailUrl, 'https://img.youtube.com/vi/aqz-KE-bpKQ/hqdefault.jpg');

  const ytShort = parseMediaLink('https://youtube.com/shorts/aqz-KE-bpKQ');
  assert.equal(ytShort?.kind, 'youtube');

  const vimeo = parseMediaLink('https://vimeo.com/76979871');
  assert.equal(vimeo?.kind, 'vimeo');
  assert.equal(vimeo?.embedUrl, 'https://player.vimeo.com/video/76979871');

  const twitch = parseMediaLink('https://www.twitch.tv/videos/1234567890');
  assert.equal(twitch?.kind, 'twitch');

  const mp4 = parseMediaLink('https://media.example.com/highlights/clutch_round.mp4');
  assert.equal(mp4?.kind, 'video');
  assert.equal(mp4?.title, 'Clutch round');

  const mp3 = parseMediaLink('https://media.example.com/comms/callout.mp3');
  assert.equal(mp3?.kind, 'audio');

  const img = parseMediaLink('https://cdn.example.com/screens/ancient_smoke.webp');
  assert.equal(img?.kind, 'image');

  const web = parseMediaLink('https://store.steampowered.com/news/app/730');
  assert.equal(web?.kind, 'link');
  assert.equal(web?.domain, 'store.steampowered.com');
});

test('splitTextWithLinks preserves text and links in order', () => {
  const parts = splitTextWithLinks('Watch https://youtu.be/aqz-KE-bpKQ right now!');
  assert.equal(parts.length, 3);
  assert.equal(parts[0].type, 'text');
  assert.equal(parts[1].type, 'link');
  assert.equal(parts[1].href, 'https://youtu.be/aqz-KE-bpKQ');
  assert.equal(parts[2].value, ' right now!');
});

test('urlSecurity blocks private, loopback, link-local, metadata, and internal hosts', () => {
  assert.equal(isBlockedIpAddress('127.0.0.1'), true);
  assert.equal(isBlockedIpAddress('10.0.0.5'), true);
  assert.equal(isBlockedIpAddress('172.16.0.1'), true);
  assert.equal(isBlockedIpAddress('192.168.1.10'), true);
  assert.equal(isBlockedIpAddress('169.254.169.254'), true);
  assert.equal(isBlockedIpAddress('::1'), true);
  assert.equal(isBlockedIpAddress('fc00::1'), true);
  assert.equal(isBlockedIpAddress('fe80::1'), true);
  assert.equal(isBlockedIpAddress('::ffff:127.0.0.1'), true);
  assert.equal(isBlockedIpAddress('93.184.216.34'), false);

  assert.equal(validatePublicHttpUrl('http://localhost:3000/api'), null);
  assert.equal(validatePublicHttpUrl('http://169.254.169.254/latest/meta-data'), null);
  assert.equal(validatePublicHttpUrl('http://10.0.0.1/admin'), null);
  assert.equal(validatePublicHttpUrl('http://internal-service/secret'), null);
  assert.equal(validatePublicHttpUrl('javascript:alert(1)'), null);
  assert.notEqual(validatePublicHttpUrl('https://www.youtube.com/watch?v=aqz-KE-bpKQ'), null);
});
