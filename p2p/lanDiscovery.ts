import dgram from 'node:dgram';
import os from 'node:os';

export interface DiscoveredLanNode {
  nodeId: string;
  hostname: string;
  address: string;
  port: number;
  fingerprint: string;
  lastSeenAt: number;
}

const DISCOVERY_PORT = Number(process.env.LAN_DISCOVERY_PORT || 41234);
const MULTICAST_ADDR = '239.255.77.88';

/**
 * Lightweight zero-dependency UDP multicast/broadcast LAN discovery service.
 * Allows gamers on the same Wi-Fi/LAN to automatically discover local personal nodes
 * and low-latency LAN streaming servers without any cloud directory.
 */
export class LanDiscoveryService {
  private socket: dgram.Socket | null = null;
  private beaconTimer: ReturnType<typeof setInterval> | null = null;
  private readonly peers = new Map<string, DiscoveredLanNode>();
  private running = false;
  private lastError: string | null = null;

  constructor(
    private readonly nodeId: string,
    private readonly httpPort: number,
    private readonly fingerprint: string,
  ) {}

  public start(): { running: boolean; error?: string } {
    if (this.running) return { running: true };
    try {
      const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });

      sock.on('error', (err) => {
        this.lastError = err.message;
        this.stop();
      });

      sock.on('message', (msg, rinfo) => {
        try {
          const parsed = JSON.parse(msg.toString('utf8')) as {
            app?: string;
            nodeId?: string;
            port?: number;
            hostname?: string;
            fingerprint?: string;
          };
          if (parsed.app !== 'AIGAMERIA_NODE' || !parsed.nodeId || parsed.nodeId === this.nodeId) {
            return;
          }
          this.peers.set(parsed.nodeId, {
            nodeId: parsed.nodeId,
            hostname: String(parsed.hostname ?? 'lan-node').slice(0, 64),
            address: rinfo.address,
            port: Number(parsed.port) || 3000,
            fingerprint: String(parsed.fingerprint ?? '').slice(0, 32),
            lastSeenAt: Date.now(),
          });
        } catch {
          // Ignore malformed LAN datagrams
        }
      });

      sock.bind(DISCOVERY_PORT, () => {
        try {
          sock.addMembership(MULTICAST_ADDR);
          sock.setBroadcast(true);
          sock.setMulticastTTL(2);
        } catch {
          // Multicast can be restricted in cloud sandboxes; keep service graceful
        }
        this.sendBeacon();
      });

      this.socket = sock;
      this.running = true;
      this.lastError = null;
      this.beaconTimer = setInterval(() => {
        this.sendBeacon();
        this.pruneStalePeers();
      }, 10_000);

      return { running: true };
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : 'LAN discovery unavailable';
      this.running = false;
      return { running: false, error: this.lastError };
    }
  }

  public stop(): void {
    if (this.beaconTimer) {
      clearInterval(this.beaconTimer);
      this.beaconTimer = null;
    }
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // ignore
      }
      this.socket = null;
    }
    this.running = false;
  }

  public getStatus() {
    this.pruneStalePeers();
    return {
      running: this.running,
      port: DISCOVERY_PORT,
      multicastGroup: MULTICAST_ADDR,
      localAddresses: this.getLocalLanAddresses(),
      discoveredNodes: Array.from(this.peers.values()),
      lastError: this.lastError,
    };
  }

  private sendBeacon(): void {
    if (!this.socket || !this.running) return;
    const payload = Buffer.from(
      JSON.stringify({
        app: 'AIGAMERIA_NODE',
        nodeId: this.nodeId,
        hostname: os.hostname(),
        port: this.httpPort,
        fingerprint: this.fingerprint,
      }),
      'utf8',
    );
    try {
      this.socket.send(payload, 0, payload.length, DISCOVERY_PORT, MULTICAST_ADDR);
    } catch {
      // Ignore transient network send errors
    }
  }

  private pruneStalePeers(): void {
    const cutoff = Date.now() - 45_000;
    for (const [id, peer] of this.peers.entries()) {
      if (peer.lastSeenAt < cutoff) {
        this.peers.delete(id);
      }
    }
  }

  public getLocalLanAddresses(): string[] {
    const nets = os.networkInterfaces();
    const addresses: string[] = [];
    for (const ifaceList of Object.values(nets)) {
      if (!ifaceList) continue;
      for (const iface of ifaceList) {
        if (iface.family === 'IPv4' && !iface.internal) {
          addresses.push(iface.address);
        }
      }
    }
    return addresses;
  }
}
