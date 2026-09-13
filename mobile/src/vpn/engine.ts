import {
  ConnectionMetrics,
  Preferences,
  QuotaState,
  Server,
  VpnFailure,
  VpnState,
  emptyMetrics,
  emptyQuota,
} from '../domain/models';
import type {NativeTunnelConfig, TunnelStatus} from './native';
import type {NetworkStatus} from './networkMonitor';
import {fastest, latencyHints} from './serverSelector';

/**
 * What the tunnel is actually made of, taken from the configuration the
 * control plane issued. The diagnostics screen shows these rather than
 * guessing: the tunnel address is what the gateway assigned, and the endpoint
 * host is literally the address the Internet sees traffic come from.
 */
export type ConnectionDetails = {
  addresses: string[];
  dns: string[];
  mtu: number;
  endpoint: string;
};

export type EngineSnapshot = {
  state: VpnState;
  quota: QuotaState;
  metrics: ConnectionMetrics;
  server: Server | null;
  failure: VpnFailure | null;
  connection: ConnectionDetails | null;
};

/**
 * Every dependency is an interface, not a module import.
 *
 * That is what lets the whole connection flow -- including the handshake wait,
 * the quota heartbeat and the backoff -- be tested in Node with no emulator,
 * no native module and no server. The real wiring lives in createEngine.ts.
 */
export type EngineApi = {
  startSession(params: {
    gatewayId?: string;
    countryCode?: string;
    latencyHints: Record<string, number>;
  }): Promise<{
    sessionId: string;
    server: Server;
    config: {interface: NativeTunnelConfig['interface']; peer: NativeTunnelConfig['peer']};
    quota: QuotaState;
    heartbeatIntervalSeconds: number;
  }>;
  heartbeat(
    sessionId: string,
    metrics: {bytesDown: number; bytesUp: number; latencyMs: number | null},
    tunnelEstablished: boolean,
  ): Promise<{expired: boolean; quota: QuotaState}>;
  endSession(
    sessionId: string,
    reason: string,
    bytesDown: number,
    bytesUp: number,
  ): Promise<void>;
  quota(): Promise<QuotaState>;
};

export type EngineNative = {
  prepare(): Promise<boolean>;
  up(config: NativeTunnelConfig): Promise<void>;
  down(): Promise<void>;
  status(): Promise<TunnelStatus>;
};

export type EngineDeps = {
  api: EngineApi;
  native: EngineNative;
  isOnline: () => Promise<boolean>;
  watchNetwork: (onChange: (status: NetworkStatus) => void) => () => void;
  now: () => number;
};

const HEARTBEAT_MS = 30_000;
const METRICS_MS = 2_000;
const HANDSHAKE_TIMEOUT_MS = 15_000;
const HANDSHAKE_POLL_MS = 400;
const HANDSHAKE_STALE_SECONDS = 190;
const BASE_BACKOFF_MS = 1_500;
const MAX_BACKOFF_MS = 30_000;
const MAX_RECONNECT_ATTEMPTS = 6;

/**
 * The VPN engine: the single source of truth for connection state.
 *
 * Nothing else in the app may decide that the VPN is on. CONNECTED is
 * published only after three things are true in order -- the control plane
 * authorised a session, the native backend brought the interface up, and a
 * real handshake completed. Until the third, the state stays CONNECTING,
 * because an interface with no handshake protects nothing and a shield drawn
 * over it would be a lie the user cannot check.
 *
 * The engine also owns the heartbeat that keeps the server-side quota honest
 * and the reconnect policy for network changes and gateway failures.
 */
export class VpnEngine {
  private snapshot: EngineSnapshot = {
    state: 'DISCONNECTED',
    quota: emptyQuota,
    metrics: emptyMetrics,
    server: null,
    failure: null,
    connection: null,
  };

  private listeners = new Set<(snapshot: EngineSnapshot) => void>();
  private sessionId: string | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private metricsTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempt = 0;
  private requestedServer: Server | null = null;
  private preferences: Preferences | null = null;
  private lastCounters = {rx: 0, tx: 0, at: 0};
  private unwatchNetwork: (() => void) | null = null;

  constructor(private readonly deps: EngineDeps) {}

  // --- subscription ------------------------------------------------------

  subscribe(listener: (snapshot: EngineSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): EngineSnapshot {
    return this.snapshot;
  }

  private set(patch: Partial<EngineSnapshot>): void {
    this.snapshot = {...this.snapshot, ...patch};
    this.listeners.forEach(listener => listener(this.snapshot));
  }

  start(): void {
    this.unwatchNetwork = this.deps.watchNetwork(status => {
      if (!status.online && this.snapshot.state === 'CONNECTED') {
        // Say so immediately rather than showing a stale "Protected".
        this.set({state: 'RECONNECTING'});
      } else if (status.online && this.snapshot.state === 'RECONNECTING') {
        void this.scheduleReconnect('network_changed');
      }
    });
  }

  stop(): void {
    this.unwatchNetwork?.();
    this.clearTimers();
  }

  // --- connecting --------------------------------------------------------

  /**
   * @param server null means "let the engine pick the fastest healthy one".
   */
  async connect(
    server: Server | null,
    servers: Server[],
    preferences: Preferences,
  ): Promise<void> {
    if (this.snapshot.state === 'CONNECTED' || isTransitional(this.snapshot.state)) return;
    this.requestedServer = server;
    this.preferences = preferences;
    await this.establish(servers, false);
  }

  private async establish(servers: Server[], reconnecting: boolean): Promise<void> {
    this.set({
      state: reconnecting ? 'RECONNECTING' : 'CONNECTING',
      failure: null,
    });

    if (!(await this.deps.isOnline())) {
      this.fail('network_unavailable', 'No Internet connection. Connect to Wi-Fi or mobile data.');
      return;
    }

    // Android's consent dialog needs an Activity, so it is asked for at the
    // moment the user presses Connect rather than on first launch.
    let granted = false;
    try {
      granted = await this.deps.native.prepare();
    } catch {
      granted = false;
    }
    if (!granted) {
      this.fail(
        'permission_denied',
        'Android needs your permission before the VPN can start. Tap Connect and choose OK.',
      );
      return;
    }

    const target = this.requestedServer ?? fastest(servers);
    const preferences = this.preferences;

    let authorisation;
    try {
      authorisation = await this.deps.api.startSession({
        gatewayId: target?.gatewayId,
        countryCode: target?.countryCode,
        latencyHints: latencyHints(servers),
      });
    } catch (error) {
      this.handleSessionError(error);
      return;
    }

    this.sessionId = authorisation.sessionId;
    this.set({
      server: authorisation.server,
      quota: authorisation.quota,
      connection: {
        addresses: authorisation.config.interface.addresses,
        dns: authorisation.config.interface.dns,
        mtu: authorisation.config.interface.mtu,
        endpoint: authorisation.config.peer.endpoint,
      },
    });

    try {
      await this.deps.native.up({
        interface: authorisation.config.interface,
        peer: authorisation.config.peer,
        blockIpv6: preferences?.blockIpv6 ?? true,
        splitMode: preferences?.splitMode ?? 'ALL_APPS',
        splitPackages: preferences?.splitPackages ?? [],
        location: `${authorisation.server.city}, ${authorisation.server.country}`,
      });
    } catch {
      await this.deps.api.endSession(this.sessionId, 'tunnel_start_failed', 0, 0);
      this.sessionId = null;
      this.fail('tunnel_failed', 'Android would not start the VPN. Try again.');
      return;
    }

    // Only now wait for proof that packets can actually flow.
    if (!(await this.awaitHandshake())) {
      await this.deps.native.down();
      await this.deps.api.endSession(this.sessionId, 'handshake_timeout', 0, 0);
      this.sessionId = null;
      this.set({
        state: 'SERVER_UNAVAILABLE',
        failure: {
          code: 'handshake_timeout',
          message: `${authorisation.server.city} did not respond. Try another location.`,
        },
      });
      return;
    }

    this.reconnectAttempt = 0;
    this.lastCounters = {rx: 0, tx: 0, at: this.deps.now()};
    this.set({
      state: 'CONNECTED',
      metrics: {...emptyMetrics, connectedSinceEpochMs: this.deps.now()},
    });
    this.startHeartbeat();
    this.startMetrics();
  }

  /** A completed handshake is the only real proof of a tunnel. */
  private async awaitHandshake(): Promise<boolean> {
    const deadline = this.deps.now() + HANDSHAKE_TIMEOUT_MS;
    while (this.deps.now() < deadline) {
      const status = await this.safeStatus();
      if (status.up && status.handshakeAgeSeconds !== null && status.handshakeAgeSeconds < 180) {
        return true;
      }
      await delay(HANDSHAKE_POLL_MS);
    }
    return false;
  }

  private async safeStatus(): Promise<TunnelStatus> {
    try {
      return await this.deps.native.status();
    } catch {
      return {up: false, handshakeAgeSeconds: null};
    }
  }

  private handleSessionError(error: unknown): void {
    const code = (error as {code?: string})?.code ?? 'connect_failed';
    const message =
      (error as {message?: string})?.message ?? 'Could not reach the VPN service.';
    if (code === 'quota_exhausted') {
      this.set({state: 'QUOTA_EXPIRED', failure: null});
      void this.refreshQuota();
      return;
    }
    if (code === 'no_gateway_available' || code === 'server_not_found') {
      this.set({state: 'SERVER_UNAVAILABLE', failure: {code, message}});
      return;
    }
    this.fail(code, message);
  }

  // --- disconnecting -----------------------------------------------------

  async disconnect(reason = 'user_requested'): Promise<void> {
    await this.teardown('DISCONNECTED', reason);
  }

  private async teardown(finalState: VpnState, reason: string): Promise<void> {
    if (this.snapshot.state === 'DISCONNECTED' && !this.sessionId) return;
    this.set({state: 'DISCONNECTING'});
    this.clearTimers();

    const status = await this.safeStatus();
    await this.deps.native.down().catch(() => undefined);

    if (this.sessionId) {
      await this.deps.api.endSession(
        this.sessionId,
        reason,
        status.rxBytes ?? this.snapshot.metrics.bytesDown,
        status.txBytes ?? this.snapshot.metrics.bytesUp,
      );
    }
    this.sessionId = null;
    this.set({state: finalState, metrics: emptyMetrics, connection: null});
    await this.refreshQuota();
  }

  // --- heartbeat: the quota's clock --------------------------------------

  /**
   * Reports to the control plane every 30 seconds. The server charges elapsed
   * *server* time; this call carries only byte counters and latency. If the
   * server says the allowance is gone it has already removed the peer, so the
   * engine tears down rather than pretending otherwise.
   */
  private startHeartbeat(): void {
    this.clearHeartbeat();
    this.heartbeatTimer = setInterval(async () => {
      const sessionId = this.sessionId;
      if (!sessionId) return;
      const status = await this.safeStatus();
      try {
        const beat = await this.deps.api.heartbeat(
          sessionId,
          {
            bytesDown: status.rxBytes ?? 0,
            bytesUp: status.txBytes ?? 0,
            latencyMs: this.snapshot.metrics.latencyMs,
          },
          status.up,
        );
        this.set({quota: beat.quota});
        if (beat.expired) {
          await this.teardown('QUOTA_EXPIRED', 'quota_exhausted');
        }
      } catch {
        // A missed heartbeat is not a disconnect: the tunnel may be fine and
        // the API briefly unreachable. If we stay silent the server reaps us,
        // which is the correct outcome -- going dark must not be a way to keep
        // a tunnel for free.
      }
    }, HEARTBEAT_MS);
  }

  private startMetrics(): void {
    this.clearMetrics();
    this.metricsTimer = setInterval(async () => {
      const status = await this.safeStatus();
      const now = this.deps.now();
      const seconds = Math.max(0.001, (now - this.lastCounters.at) / 1000);
      const rx = status.rxBytes ?? 0;
      const tx = status.txBytes ?? 0;

      this.set({
        metrics: {
          ...this.snapshot.metrics,
          downloadBps: Math.max(0, (rx - this.lastCounters.rx) / seconds),
          uploadBps: Math.max(0, (tx - this.lastCounters.tx) / seconds),
          bytesDown: rx,
          bytesUp: tx,
          handshakeAgeSeconds: status.handshakeAgeSeconds,
        },
      });
      this.lastCounters = {rx, tx, at: now};

      // A tunnel that stops handshaking is a dead tunnel, whatever the
      // interface says.
      const stale =
        status.handshakeAgeSeconds !== null && status.handshakeAgeSeconds > HANDSHAKE_STALE_SECONDS;
      if (this.snapshot.state === 'CONNECTED' && (!status.up || stale)) {
        await this.scheduleReconnect('tunnel_lost');
      }
    }, METRICS_MS);
  }

  // --- failover ----------------------------------------------------------

  /**
   * Exponential backoff, capped. Each retry re-asks the control plane for a
   * gateway, so a failed server is replaced by a healthy sibling rather than
   * retried forever.
   */
  private async scheduleReconnect(reason: string): Promise<void> {
    if (!this.preferences?.autoReconnect) {
      await this.teardown('FAILED', reason);
      return;
    }
    this.clearTimers();
    this.set({state: 'RECONNECTING'});
    await this.deps.native.down().catch(() => undefined);

    this.reconnectAttempt += 1;
    if (this.reconnectAttempt > MAX_RECONNECT_ATTEMPTS) {
      await this.teardown('FAILED', reason);
      this.set({
        failure: {
          code: 'reconnect_exhausted',
          message: 'Could not restore the VPN. Tap Connect to try again.',
        },
      });
      return;
    }

    const backoff = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** (this.reconnectAttempt - 1));
    await delay(backoff);
    await this.establish(this.requestedServer ? [this.requestedServer] : [], true);
  }

  // --- misc --------------------------------------------------------------

  async refreshQuota(): Promise<void> {
    try {
      this.set({quota: await this.deps.api.quota()});
    } catch {
      // Keep the last authoritative figure rather than guessing a new one.
    }
  }

  private fail(code: string, message: string): void {
    this.set({state: 'FAILED', failure: {code, message}});
  }

  private clearTimers(): void {
    this.clearHeartbeat();
    this.clearMetrics();
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private clearMetrics(): void {
    if (this.metricsTimer) clearInterval(this.metricsTimer);
    this.metricsTimer = null;
  }
}

const isTransitional = (state: VpnState): boolean =>
  state === 'CONNECTING' || state === 'RECONNECTING' || state === 'DISCONNECTING';

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
