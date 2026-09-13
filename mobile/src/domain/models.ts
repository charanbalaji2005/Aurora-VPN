/**
 * The only connection states that exist.
 *
 * The UI renders this and nothing else -- there is no separate "the screen
 * thinks we're connected" flag anywhere in the app. CONNECTED is published by
 * the engine only after the WireGuard backend reports the interface up *and* a
 * handshake has actually completed.
 */
export type VpnState =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'DISCONNECTING'
  | 'FAILED'
  | 'SERVER_UNAVAILABLE'
  | 'QUOTA_EXPIRED';

export const isBusy = (state: VpnState): boolean =>
  state === 'CONNECTING' || state === 'RECONNECTING' || state === 'DISCONNECTING';

export const isProtected = (state: VpnState): boolean => state === 'CONNECTED';

export type Server = {
  gatewayId: string;
  country: string;
  countryCode: string;
  city: string;
  name: string;
  status: string;
  loadPercent: number;
  premiumOnly: boolean;
  /** Measured on this device, in milliseconds. Null until probed. */
  latencyMs: number | null;
  isFavourite: boolean;
};

export const isAvailable = (server: Server): boolean =>
  server.status === 'online' || server.status === 'degraded';

/** Authoritative quota figures, exactly as the control plane reported them. */
export type QuotaState = {
  dailySeconds: number;
  usedSeconds: number;
  remainingSeconds: number;
  resetsAtIso: string | null;
  unlimited: boolean;
};

export const emptyQuota: QuotaState = {
  dailySeconds: 10800,
  usedSeconds: 0,
  remainingSeconds: 10800,
  resetsAtIso: null,
  unlimited: false,
};

export const isExhausted = (quota: QuotaState): boolean =>
  !quota.unlimited && quota.remainingSeconds <= 0;

export const remainingFraction = (quota: QuotaState): number => {
  if (quota.unlimited) return 1;
  if (quota.dailySeconds <= 0) return 0;
  return Math.max(0, Math.min(1, quota.remainingSeconds / quota.dailySeconds));
};

/**
 * Live tunnel measurements. Every field is nullable on purpose: when the
 * platform cannot give a real number the UI shows an em dash instead of
 * inventing one.
 */
export type ConnectionMetrics = {
  latencyMs: number | null;
  downloadBps: number | null;
  uploadBps: number | null;
  bytesDown: number;
  bytesUp: number;
  connectedSinceEpochMs: number | null;
  handshakeAgeSeconds: number | null;
};

export const emptyMetrics: ConnectionMetrics = {
  latencyMs: null,
  downloadBps: null,
  uploadBps: null,
  bytesDown: 0,
  bytesUp: 0,
  connectedSinceEpochMs: null,
  handshakeAgeSeconds: null,
};

/** Why the tunnel is not up, phrased for a person. */
export type VpnFailure = {code: string; message: string};

export type SplitTunnelMode = 'ALL_APPS' | 'EXCLUDE_SELECTED' | 'ONLY_SELECTED';

export type Preferences = {
  killSwitch: boolean;
  autoConnect: boolean;
  autoReconnect: boolean;
  preferFastest: boolean;
  blockIpv6: boolean;
  splitMode: SplitTunnelMode;
  splitPackages: string[];
};

export const defaultPreferences: Preferences = {
  killSwitch: false,
  autoConnect: false,
  autoReconnect: true,
  preferFastest: true,
  blockIpv6: true,
  splitMode: 'ALL_APPS',
  splitPackages: [],
};

/** The client half of a WireGuard config. Never contains a private key. */
export type TunnelConfig = {
  interface: {addresses: string[]; dns: string[]; mtu: number};
  peer: {
    publicKey: string;
    presharedKey: string | null;
    endpoint: string;
    allowedIps: string[];
    persistentKeepalive: number;
  };
};
