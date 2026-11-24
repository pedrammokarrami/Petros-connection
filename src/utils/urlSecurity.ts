/**
 * Pure URL and IP address safety helpers for server-side link metadata fetching.
 * Prevents SSRF against loopback, private RFC1918, link-local, metadata, and internal hosts.
 */

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata',
  '0.0.0.0',
  '::1',
  '[::1]',
]);

function parseIpv4Octets(ip: string): number[] | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const nums: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n < 0 || n > 255) return null;
    nums.push(n);
  }
  return nums;
}

export function isBlockedIpAddress(rawIp: string): boolean {
  const ip = rawIp.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!ip) return true;

  // Handle IPv4-mapped IPv6 addresses like ::ffff:127.0.0.1
  if (ip.startsWith('::ffff:')) {
    const mapped = ip.slice('::ffff:'.length);
    if (mapped.includes('.')) {
      return isBlockedIpAddress(mapped);
    }
  }

  const v4 = parseIpv4Octets(ip);
  if (v4) {
    const [a, b] = v4;
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true; // 10.0.0.0/8 private
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
    if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
    if (a === 192 && b === 0 && v4[2] === 0) return true; // 192.0.0.0/24
    if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmark
    if (a >= 224) return true; // multicast & reserved
    return false;
  }

  // IPv6 checks
  if (ip.includes(':')) {
    if (ip === '::' || ip === '::1') return true;
    const firstHextet = ip.split(':')[0] || '0';
    const val = parseInt(firstHextet, 16);
    if (Number.isNaN(val)) return true;
    // fc00::/7 Unique local address
    if ((val & 0xfe00) === 0xfc00) return true;
    // fe80::/10 Link-local
    if ((val & 0xffc0) === 0xfe80) return true;
    // ff00::/8 Multicast
    if ((val & 0xff00) === 0xff00) return true;
    return false;
  }

  return false;
}

export function validatePublicHttpUrl(rawUrl: string): URL | null {
  try {
    const trimmed = rawUrl.trim();
    if (!trimmed || trimmed.length > 2048) return null;
    const parsed = new URL(trimmed);

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null;
    }
    if (parsed.username || parsed.password) {
      return null;
    }

    const host = parsed.hostname.toLowerCase();
    if (!host || BLOCKED_HOSTNAMES.has(host)) {
      return null;
    }
    if (
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host.endsWith('.localhost') ||
      host.endsWith('.home.arpa')
    ) {
      return null;
    }

    // Reject single-label hostnames (e.g., intranet names) and private IP literals
    if (!host.includes('.') && !host.includes(':')) {
      return null;
    }
    if (isBlockedIpAddress(host)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}
