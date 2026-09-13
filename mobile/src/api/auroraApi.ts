import {
  ConnectionMetrics,
  QuotaState,
  Server,
  TunnelConfig,
} from '../domain/models';
import {AuroraVpn} from '../vpn/native';
import {request} from './client';
import {secureStore} from './secureStore';

type QuotaDto = {
  daily_seconds: number;
  used_seconds: number;
  remaining_seconds: number;
  resets_at: string | null;
  unlimited: boolean;
};

type ServerDto = {
  gateway_id: string;
  country: string;
  country_code: string;
  city: string;
  name: string;
  status: string;
  load_percent: number;
  premium_only: boolean;
};

type SessionDto = {
  session_id: string;
  status: string;
  server: ServerDto;
  config: {
    interface: {addresses: string[]; dns: string[]; mtu: number};
    peer: {
      public_key: string;
      preshared_key: string | null;
      endpoint: string;
      allowed_ips: string[];
      persistent_keepalive: number;
    };
  };
  quota: QuotaDto;
  heartbeat_interval_seconds: number;
};

export const toQuota = (dto: QuotaDto): QuotaState => ({
  dailySeconds: dto.daily_seconds,
  usedSeconds: dto.used_seconds,
  remainingSeconds: dto.remaining_seconds,
  resetsAtIso: dto.resets_at,
  unlimited: dto.unlimited,
});

export const toServer = (dto: ServerDto): Server => ({
  gatewayId: dto.gateway_id,
  country: dto.country,
  countryCode: dto.country_code,
  city: dto.city,
  name: dto.name,
  status: dto.status,
  loadPercent: dto.load_percent,
  premiumOnly: dto.premium_only,
  latencyMs: null,
  isFavourite: false,
});

const toConfig = (dto: SessionDto['config']): TunnelConfig => ({
  interface: dto.interface,
  peer: {
    publicKey: dto.peer.public_key,
    presharedKey: dto.peer.preshared_key,
    endpoint: dto.peer.endpoint,
    allowedIps: dto.peer.allowed_ips,
    persistentKeepalive: dto.peer.persistent_keepalive,
  },
});

export type Account = {
  id: string;
  email: string;
  plan: string;
  status: string;
  freeDailySeconds: number;
};

export type RegisteredDevice = {
  id: string;
  name: string;
  platform: string;
  lastSeenAt: string | null;
};

export const api = {
  async signIn(email: string, password: string, creating: boolean): Promise<void> {
    const tokens = await request<{access_token: string; refresh_token: string}>(
      creating ? '/api/v1/auth/register' : '/api/v1/auth/login',
      {method: 'POST', body: {email, password}, skipAuth: true},
    );
    await secureStore.setTokens(tokens.access_token, tokens.refresh_token);
    await this.ensureDevice();
  },

  /**
   * Registering the device is part of signing in, not a separate step: without
   * a registered public key there is nothing for a gateway to build a peer
   * from, so "signed in but unusable" would only confuse people.
   */
  async ensureDevice(): Promise<string> {
    const existing = await secureStore.deviceId();
    if (existing) return existing;

    // The private half never leaves the native keystore.
    const publicKey = await AuroraVpn.ensureKeyPair();
    const device = await request<{id: string}>('/api/v1/devices', {
      method: 'POST',
      body: {
        name: 'Android device',
        platform: 'android',
        app_version: AuroraVpn.appVersion,
        public_key: publicKey,
      },
    });
    await secureStore.setDeviceId(device.id);
    return device.id;
  },

  /** The signed-in account, as the control plane sees it. */
  async me(): Promise<Account> {
    const dto = await request<{
      id: string;
      email: string;
      plan: string;
      status: string;
      free_daily_seconds: number;
    }>('/api/v1/auth/me');
    return {
      id: dto.id,
      email: dto.email,
      plan: dto.plan,
      status: dto.status,
      freeDailySeconds: dto.free_daily_seconds,
    };
  },

  async devices(): Promise<RegisteredDevice[]> {
    const body = await request<{
      devices: {id: string; name: string; platform: string; last_seen_at: string | null}[];
    }>('/api/v1/devices');
    return body.devices.map(d => ({
      id: d.id,
      name: d.name,
      platform: d.platform,
      lastSeenAt: d.last_seen_at,
    }));
  },

  async servers(): Promise<Server[]> {
    const body = await request<{servers: ServerDto[]}>('/api/v1/servers');
    return body.servers.map(toServer);
  },

  async quota(): Promise<QuotaState> {
    return toQuota(await request<QuotaDto>('/api/v1/quota'));
  },

  async startSession(params: {
    gatewayId?: string;
    countryCode?: string;
    latencyHints: Record<string, number>;
  }) {
    const deviceId = await this.ensureDevice();
    const dto = await request<SessionDto>('/api/v1/vpn/session', {
      method: 'POST',
      body: {
        device_id: deviceId,
        gateway_id: params.gatewayId ?? null,
        country_code: params.countryCode ?? null,
        latency_hints: params.latencyHints,
      },
    });
    return {
      sessionId: dto.session_id,
      server: toServer(dto.server),
      config: toConfig(dto.config),
      quota: toQuota(dto.quota),
      heartbeatIntervalSeconds: dto.heartbeat_interval_seconds,
    };
  },

  async heartbeat(
    sessionId: string,
    metrics: Pick<ConnectionMetrics, 'bytesDown' | 'bytesUp' | 'latencyMs'>,
    tunnelEstablished: boolean,
  ) {
    const dto = await request<{status: string; reason?: string; quota: QuotaDto}>(
      `/api/v1/vpn/session/${sessionId}/heartbeat`,
      {
        method: 'POST',
        body: {
          bytes_up: metrics.bytesUp,
          bytes_down: metrics.bytesDown,
          latency_ms: metrics.latencyMs,
          tunnel_established: tunnelEstablished,
        },
      },
    );
    return {
      expired: dto.status === 'EXPIRED' || dto.reason === 'quota_exhausted',
      quota: toQuota(dto.quota),
    };
  },

  /**
   * Best effort. If this never lands, the server's reaper closes the session
   * within two minutes, so the quota stays correct either way.
   */
  async endSession(sessionId: string, reason: string, bytesDown: number, bytesUp: number) {
    try {
      await request(`/api/v1/vpn/session/${sessionId}/disconnect`, {
        method: 'POST',
        body: {reason, bytes_down: bytesDown, bytes_up: bytesUp},
      });
    } catch {
      // Deliberately swallowed: see above.
    }
  },

  async rotateDeviceKey(deviceId: string, publicKey: string) {
    return await request(`/api/v1/devices/${deviceId}/rotate-key`, {
      method: 'POST',
      body: {public_key: publicKey},
    });
  },

  async deleteAccount(password?: string) {
    return await request('/api/v1/auth/account', {
      method: 'DELETE',
      body: password ? {password} : undefined,
    });
  },
};

