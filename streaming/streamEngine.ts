import crypto from 'node:crypto';

export interface LocalStreamSession {
  id: string;
  title: string;
  hostHandle: string;
  hostPeerId?: string;
  mode: 'webrtc-p2p' | 'lan-hls';
  status: 'live' | 'ended';
  createdAt: number;
  viewerCount: number;
  ingestTokenHash?: string;
  hlsSequence: number;
}

interface HlsSegmentEntry {
  name: string;
  durationSec: number;
  contentType: string;
  data: Buffer;
  createdAt: number;
}

const MAX_HLS_SEGMENTS_PER_STREAM = 6;
const MAX_SEGMENT_BYTES = 4 * 1024 * 1024; // 4 MB per chunk cap

/**
 * Zero-cost, zero-disk local streaming engine supporting:
 * 1. Low-latency WebRTC Peer-to-Peer gameplay/media streaming (uses /ws/signal for SDP/ICE).
 * 2. LAN HLS rolling ring-buffer streaming (OBS / FFmpeg SRT-to-HLS local bridge pushed to
 *    /api/streams/:id/segments/:name and watched at /api/streams/:id/live.m3u8 with zero disk wear).
 */
export class LocalStreamEngine {
  private enabled = true;
  private readonly sessions = new Map<string, LocalStreamSession>();
  private readonly hlsBuffers = new Map<string, HlsSegmentEntry[]>();
  private readonly ingestTokens = new Map<string, string>(); // streamId -> token

  public setEnabled(next: boolean): void {
    this.enabled = next;
    if (!next) {
      for (const session of this.sessions.values()) {
        session.status = 'ended';
      }
      this.hlsBuffers.clear();
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public createStream(input: {
    title: string;
    hostHandle: string;
    hostPeerId?: string;
    mode: 'webrtc-p2p' | 'lan-hls';
  }): { session: LocalStreamSession; ingestToken: string } {
    if (!this.enabled) {
      throw new Error('Local streaming service is currently paused.');
    }

    const id = `live_${crypto.randomBytes(5).toString('hex')}`;
    const ingestToken = crypto.randomBytes(18).toString('base64url');
    const session: LocalStreamSession = {
      id,
      title: input.title.trim().slice(0, 80) || 'Squad Gameplay Stream',
      hostHandle: input.hostHandle.trim().slice(0, 40) || 'AIGAMERIA_OP',
      hostPeerId: input.hostPeerId,
      mode: input.mode,
      status: 'live',
      createdAt: Date.now(),
      viewerCount: 1,
      hlsSequence: 0,
    };

    this.sessions.set(id, session);
    this.hlsBuffers.set(id, []);
    this.ingestTokens.set(id, ingestToken);
    return { session, ingestToken };
  }

  public stopStream(streamId: string): boolean {
    const session = this.sessions.get(streamId);
    if (!session) return false;
    session.status = 'ended';
    this.hlsBuffers.delete(streamId);
    this.ingestTokens.delete(streamId);
    return true;
  }

  public listStreams(): LocalStreamSession[] {
    return Array.from(this.sessions.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  public getStream(streamId: string): LocalStreamSession | null {
    return this.sessions.get(streamId) ?? null;
  }

  public verifyIngestToken(streamId: string, candidate: string): boolean {
    const expected = this.ingestTokens.get(streamId);
    if (!expected || !candidate) return false;
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(candidate, 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  public pushHlsSegment(
    streamId: string,
    segmentName: string,
    data: Buffer,
    contentType = 'video/mp2t',
    durationSec = 2,
  ): { ok: true } | { ok: false; error: string } {
    const session = this.sessions.get(streamId);
    if (!session || session.status !== 'live') {
      return { ok: false, error: 'Stream not active.' };
    }
    if (!/^[a-zA-Z0-9._-]{1,48}\.(ts|m4s|mp4)$/.test(segmentName)) {
      return { ok: false, error: 'Invalid HLS segment name.' };
    }
    if (data.byteLength === 0 || data.byteLength > MAX_SEGMENT_BYTES) {
      return { ok: false, error: 'Segment size exceeds 4 MB ring-buffer limit.' };
    }

    const list = this.hlsBuffers.get(streamId) ?? [];
    list.push({
      name: segmentName,
      durationSec: Math.max(1, Math.min(10, Number(durationSec) || 2)),
      contentType,
      data,
      createdAt: Date.now(),
    });
    while (list.length > MAX_HLS_SEGMENTS_PER_STREAM) {
      list.shift();
      session.hlsSequence += 1;
    }
    this.hlsBuffers.set(streamId, list);
    return { ok: true };
  }

  public buildHlsPlaylist(streamId: string): string | null {
    const session = this.sessions.get(streamId);
    if (!session) return null;
    const segments = this.hlsBuffers.get(streamId) ?? [];
    const targetDuration = segments.reduce((m, s) => Math.max(m, Math.ceil(s.durationSec)), 2);

    const lines = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      `#EXT-X-TARGETDURATION:${targetDuration}`,
      `#EXT-X-MEDIA-SEQUENCE:${session.hlsSequence}`,
    ];
    for (const seg of segments) {
      lines.push(`#EXTINF:${seg.durationSec.toFixed(1)},`);
      lines.push(`segments/${seg.name}`);
    }
    if (session.status === 'ended') {
      lines.push('#EXT-X-ENDLIST');
    }
    return `${lines.join('\n')}\n`;
  }

  public getHlsSegment(streamId: string, segmentName: string): HlsSegmentEntry | null {
    const segments = this.hlsBuffers.get(streamId);
    if (!segments) return null;
    return segments.find((s) => s.name === segmentName) ?? null;
  }

  public getSummary() {
    const all = this.listStreams();
    const live = all.filter((s) => s.status === 'live');
    return {
      running: this.enabled,
      liveCount: live.length,
      totalSessions: all.length,
      sessions: all.slice(0, 12),
    };
  }
}
