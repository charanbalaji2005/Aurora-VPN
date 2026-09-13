import {NativeEventEmitter, NativeModules} from 'react-native';

/**
 * Typed view of the one native module.
 *
 * Everything the platform will not let JavaScript do lives behind this
 * interface: VpnService consent, the WireGuard Go backend, per-app routing,
 * encrypted storage and the foreground notification. The module is thin by
 * design -- it exposes verbs, not decisions. Every choice about *when* to
 * connect and what to charge is made in TypeScript, where it can be read and
 * tested.
 *
 * Note what is missing: there is no way to read the device private key. It is
 * generated and used natively, so a compromised JS bundle cannot exfiltrate
 * it.
 */
export type TunnelStatus = {
  up: boolean;
  rxBytes?: number;
  txBytes?: number;
  /**
   * Seconds since the last successful handshake, or null if there has never
   * been one. Null rather than zero, because "no handshake yet" and "handshake
   * one second ago" are opposite facts.
   */
  handshakeAgeSeconds: number | null;
};

export type NativeTunnelConfig = {
  interface: {addresses: string[]; dns: string[]; mtu: number};
  peer: {
    publicKey: string;
    presharedKey: string | null;
    endpoint: string;
    allowedIps: string[];
    persistentKeepalive: number;
  };
  blockIpv6: boolean;
  splitMode: string;
  splitPackages: string[];
  location?: string;
};

type AuroraVpnModule = {
  apiBaseUrl: string;
  appVersion: string;
  ensureKeyPair(): Promise<string>;
  rotateKeyPair(): Promise<string>;
  clearKeys(): Promise<void>;
  setSecret(key: string, value: string | null): Promise<void>;
  getSecret(key: string): Promise<string | null>;
  clearSecrets(): Promise<void>;
  prepare(): Promise<boolean>;
  up(config: NativeTunnelConfig): Promise<void>;
  down(): Promise<void>;
  status(): Promise<TunnelStatus>;
  updateNotification(title: string, body: string): Promise<void>;
};

export const AuroraVpn: AuroraVpnModule = NativeModules.AuroraVpn;

export const tunnelEvents = new NativeEventEmitter(
  NativeModules.AuroraVpn as unknown as never,
);

export const TUNNEL_STATE_EVENT = 'AuroraTunnelState';
