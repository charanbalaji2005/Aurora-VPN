import {create} from 'zustand';
import {Account, RegisteredDevice, api} from '../api/auroraApi';
import {secureStore} from '../api/secureStore';
import {
  ConnectionMetrics,
  Preferences,
  QuotaState,
  Server,
  VpnFailure,
  VpnState,
  defaultPreferences,
  emptyMetrics,
  emptyQuota,
} from '../domain/models';
import {AuroraVpn} from '../vpn/native';
import {ConnectionDetails, EngineSnapshot, VpnEngine} from '../vpn/engine';
import {createEngine} from '../vpn/createEngine';

/** One throughput reading, taken from the backend every two seconds. */
export type TrafficSample = {down: number; up: number; at: number};

/** Three minutes of history: enough to see a stall, cheap to keep. */
const MAX_SAMPLES = 90;

type Store = {
  // engine-owned, mirrored for React
  vpnState: VpnState;
  quota: QuotaState;
  metrics: ConnectionMetrics;
  activeServer: Server | null;
  failure: VpnFailure | null;
  connection: ConnectionDetails | null;
  /** Real readings only — never seeded, never interpolated. */
  samples: TrafficSample[];
  connectedSince: number | null;

  // app state
  account: Account | null;
  devices: RegisteredDevice[];
  signedIn: boolean;
  ready: boolean;
  servers: Server[];
  favourites: string[];
  preferences: Preferences;
  refreshing: boolean;
  signInError: string | null;
  signingIn: boolean;

  bootstrap: () => Promise<void>;
  signIn: (email: string, password: string, creating: boolean) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  connect: (server: Server | null) => Promise<void>;
  disconnect: () => Promise<void>;
  toggleConnection: () => Promise<void>;
  toggleFavourite: (gatewayId: string) => Promise<void>;
  setPreference: <K extends keyof Preferences>(key: K, value: Preferences[K]) => Promise<void>;
};

const PREFS_KEY = 'preferences';
const FAVOURITES_KEY = 'favourites';

let engine: VpnEngine | null = null;

/**
 * The React-facing store.
 *
 * It mirrors the engine rather than duplicating its logic: every connection
 * field here is written by one subscription to the engine snapshot, so the
 * screen physically cannot disagree with the tunnel. Everything else in the
 * store is app state the engine does not care about -- the location list,
 * favourites, preferences, sign-in.
 */
export const useStore = create<Store>((set, get) => ({
  vpnState: 'DISCONNECTED',
  quota: emptyQuota,
  metrics: emptyMetrics,
  activeServer: null,
  failure: null,
  connection: null,
  samples: [],
  connectedSince: null,

  account: null,
  devices: [],
  signedIn: false,
  ready: false,
  servers: [],
  favourites: [],
  preferences: defaultPreferences,
  refreshing: false,
  signInError: null,
  signingIn: false,

  async bootstrap() {
    if (!engine) {
      engine = createEngine();
      engine.subscribe((snapshot: EngineSnapshot) => {
        const previous = get();
        const connected = snapshot.state === 'CONNECTED';

        // Append a sample only when the engine actually produced a new
        // measurement. A disconnect clears the history rather than leaving the
        // last session's chart on screen pretending to be live.
        let samples = previous.samples;
        if (!connected) {
          samples = [];
        } else if (
          snapshot.metrics.downloadBps !== null &&
          snapshot.metrics.uploadBps !== null &&
          snapshot.metrics.bytesDown !== previous.metrics.bytesDown
        ) {
          samples = [
            ...previous.samples,
            {
              down: snapshot.metrics.downloadBps,
              up: snapshot.metrics.uploadBps,
              at: Date.now(),
            },
          ].slice(-MAX_SAMPLES);
        }

        set({
          vpnState: snapshot.state,
          quota: snapshot.quota,
          metrics: snapshot.metrics,
          activeServer: snapshot.server,
          failure: snapshot.failure,
          connection: snapshot.connection,
          samples,
          connectedSince: connected
            ? (previous.connectedSince ?? snapshot.metrics.connectedSinceEpochMs ?? Date.now())
            : null,
        });
      });
      engine.start();
    }

    const [refreshToken, storedPrefs, storedFavourites] = await Promise.all([
      secureStore.refreshToken(),
      AuroraVpn.getSecret(PREFS_KEY),
      AuroraVpn.getSecret(FAVOURITES_KEY),
    ]);

    set({
      signedIn: !!refreshToken,
      preferences: storedPrefs
        ? {...defaultPreferences, ...safeParse<Partial<Preferences>>(storedPrefs)}
        : defaultPreferences,
      favourites: storedFavourites ? safeParse<string[]>(storedFavourites) ?? [] : [],
      ready: true,
    });

    if (refreshToken) await get().refresh();
  },

  async signIn(email, password, creating) {
    set({signingIn: true, signInError: null});
    try {
      await api.signIn(email, password, creating);
      set({signedIn: true, signingIn: false});
      await get().refresh();
    } catch (error) {
      set({
        signingIn: false,
        signInError:
          (error as {message?: string})?.message ?? "Couldn't sign in. Check your details.",
      });
    }
  },

  async signOut() {
    await engine?.disconnect('sign_out');
    await secureStore.clear();
    // The device key pair is kept: signing back in on the same phone should
    // not force every gateway to rebuild a peer from scratch.
    set({signedIn: false, servers: [], account: null, devices: [], samples: []});
  },

  async refresh() {
    set({refreshing: true});
    try {
      // Each call is allowed to fail on its own: a server list that loads but
      // an account call that does not should still fill the picker.
      const [servers, account, devices] = await Promise.all([
        api.servers(),
        api.me().catch(() => null),
        api.devices().catch(() => [] as RegisteredDevice[]),
        engine?.refreshQuota(),
      ]);
      const favourites = get().favourites;
      set({
        servers: servers.map(server => ({
          ...server,
          isFavourite: favourites.includes(server.gatewayId),
        })),
        ...(account ? {account} : {}),
        devices,
      });
    } catch {
      // Keep whatever list we already have: an empty picker is worse than a
      // slightly stale one.
    } finally {
      set({refreshing: false});
    }
  },

  async connect(server) {
    await engine?.connect(server, get().servers, get().preferences);
  },

  async disconnect() {
    await engine?.disconnect();
  },

  async toggleConnection() {
    const state = get().vpnState;
    if (state === 'CONNECTED') {
      await engine?.disconnect();
    } else if (state === 'CONNECTING' || state === 'RECONNECTING') {
      await engine?.disconnect('cancelled');
    } else if (state !== 'QUOTA_EXPIRED') {
      await get().connect(null);
    }
  },

  async toggleFavourite(gatewayId) {
    const current = get().favourites;
    const next = current.includes(gatewayId)
      ? current.filter(id => id !== gatewayId)
      : [...current, gatewayId];
    await AuroraVpn.setSecret(FAVOURITES_KEY, JSON.stringify(next));
    set({
      favourites: next,
      servers: get().servers.map(server => ({
        ...server,
        isFavourite: next.includes(server.gatewayId),
      })),
    });
  },

  async setPreference(key, value) {
    const next = {...get().preferences, [key]: value};
    await AuroraVpn.setSecret(PREFS_KEY, JSON.stringify(next));
    set({preferences: next});
  },
}));

function safeParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
