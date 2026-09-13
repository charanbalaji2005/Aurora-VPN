/**
 * Client for the Aurora control plane.
 *
 * The token lives in sessionStorage: an operations console should not stay
 * signed in across browser restarts, and the access token is only valid for
 * fifteen minutes anyway.
 *
 * Errors keep the server's `code` as well as its message. The console reacts to
 * codes -- `mfa_required` opens the confirmation dialog, `permission_denied`
 * explains which role is needed -- rather than string-matching prose.
 */
const BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000').replace(/\/$/, '')

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly detail?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

const ACCESS = 'aurora.admin.token'
const REFRESH = 'aurora.admin.refresh'

export const session = {
  token: () => (typeof window === 'undefined' ? null : sessionStorage.getItem(ACCESS)),
  refresh: () => (typeof window === 'undefined' ? null : sessionStorage.getItem(REFRESH)),
  set(access: string, refresh: string) {
    sessionStorage.setItem(ACCESS, access)
    sessionStorage.setItem(REFRESH, refresh)
  },
  clear() {
    sessionStorage.removeItem(ACCESS)
    sessionStorage.removeItem(REFRESH)
  },
}

let refreshInFlight: Promise<boolean> | null = null

async function refreshTokens(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight
  refreshInFlight = (async () => {
    const refresh = session.refresh()
    if (!refresh) return false
    try {
      const response = await fetch(`${BASE}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({refresh_token: refresh}),
      })
      if (!response.ok) {
        session.clear()
        return false
      }
      const body = await response.json()
      session.set(body.access_token, body.refresh_token)
      return true
    } catch {
      return false
    } finally {
      refreshInFlight = null
    }
  })()
  return refreshInFlight
}

export async function api<T>(
  path: string,
  // Omit, not intersect: RequestInit['body'] is a BodyInit and would win.
  init: Omit<RequestInit, 'body'> & {body?: unknown} = {},
): Promise<T> {
  const send = async () => {
    const token = session.token()
    return fetch(`${BASE}/api/v1${path}`, {
      ...init,
      method: init.method ?? 'GET',
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      headers: {
        'content-type': 'application/json',
        ...(token ? {authorization: `Bearer ${token}`} : {}),
        ...init.headers,
      },
      cache: 'no-store',
    })
  }

  let response: Response
  try {
    response = await send()
  } catch {
    throw new ApiError('network_unreachable', 'Could not reach the control plane.', 0)
  }

  if (response.status === 401 && (await refreshTokens())) {
    response = await send()
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const error = body?.error ?? {}
    if (response.status === 401 && typeof window !== 'undefined') {
      session.clear()
      window.location.href = '/login'
    }
    throw new ApiError(
      error.code ?? 'request_failed',
      error.message ?? `Request failed (${response.status})`,
      response.status,
      error,
    )
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T)
}

export function websocketUrl(path: string): string {
  return `${BASE.replace(/^http/, 'ws')}/api/v1${path}`
}

/**
 * Trigger a tcpdump packet capture on a gateway and download the resulting
 * .pcap file.  The file can be opened directly in Wireshark.
 *
 * This is a binary download, so it uses its own fetch path rather than the
 * JSON api() helper.
 */
export async function captureGatewayTraffic(
  gatewayId: string,
  opts: {interface?: string; duration?: number; count?: number; filter?: string} = {},
): Promise<{filename: string; sizeBytes: number}> {
  const token = session.token()
  const body = {
    interface: opts.interface ?? 'wg0',
    duration: opts.duration ?? 10,
    count: opts.count ?? 500,
    bpf_filter: opts.filter ?? '',
  }
  const response = await fetch(
    `${BASE}/api/v1/admin/gateways/${gatewayId}/capture`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? {authorization: `Bearer ${token}`} : {}),
      },
      body: JSON.stringify(body),
    },
  )
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new ApiError(
      err?.error?.code ?? 'capture_failed',
      err?.error?.message ?? `Capture failed (${response.status})`,
      response.status,
    )
  }

  const blob = await response.blob()
  const cd = response.headers.get('content-disposition') ?? ''
  const match = cd.match(/filename="?([^"]+)"?/)
  const filename = match ? match[1] : `aurora-${gatewayId}.pcap`

  // Trigger browser download
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    URL.revokeObjectURL(url)
    document.body.removeChild(a)
  }, 1000)

  return {filename, sizeBytes: blob.size}
}



/* ---------------------------------------------------------------- types -- */

export type Identity = {
  id: string
  email: string
  role: string | null
  permissions: string[]
  mfa_enabled: boolean
}

export type Overview = {
  sessions_active: number
  sessions_today: number
  users_total: number
  users_suspended: number
  users_new_today: number
  devices_total: number
  gateways_total: number
  gateways_online: number
  gateway_load_average: number | null
  quota_seconds_used_today: number
  quota_seconds_used_yesterday: number
  bytes_up_today: number
  bytes_down_today: number
  free_daily_seconds: number
  server_time: string
}

export type Gateway = {
  id: string
  gateway_id: string
  name: string
  country: string
  country_code: string
  city: string
  status: string
  effective_status: string
  load_percent: number
  capacity: number
  active_peers: number
  sessions_active?: number
  endpoint_host: string
  listen_port: number
  median_latency_ms: number | null
  health_reported_at: string | null
  agent_url?: string
}

export type GatewayHealth = {
  cpu_percent: number
  memory_percent: number
  disk_percent: number
  load_percent: number
  active_peers: number
  wireguard_up: boolean
  packet_loss_percent: number
  at: string
} | null

export type SessionRow = {
  id: string
  user_id: string
  user_email?: string
  device_id: string
  gateway_id: string
  status: string
  started_at: string
  duration_seconds: number
  bytes_up: number
  bytes_down: number
  latency_ms?: number | null
}

export type UserRow = {
  id: string
  email: string
  plan: string
  status: string
  role?: string | null
  is_admin?: boolean
  created_at: string
}

export type DeviceRow = {
  id: string
  name: string
  platform: string
  user_email?: string
  app_version?: string | null
  os_version?: string | null
  last_seen_at: string | null
  created_at: string
  revoked: boolean
  connected: boolean
  gateway_id?: string | null
}

export type ServiceHealth = {
  name: string
  status: 'operational' | 'degraded' | 'down'
  latency_ms: number | null
  note?: string
}

export type LogEntry = {
  timestamp: string
  level: string
  service: string
  event: string
  actor: string | null
  target: string | null
  metadata: Record<string, unknown>
}

export type Analytics = {
  days: {date: string; sessions: number; duration_seconds: number; bytes_up: number; bytes_down: number}[]
  gateways: {gateway_id: string; sessions: number; bytes: number; duration_seconds: number}[]
  end_reasons: {reason: string; count: number}[]
}

export type TerminalGrant = {
  terminal_session_id: string
  token: string
  gateway_id: string
  gateway_name: string
  expires_in: number
  idle_timeout: number
  commands: {command: string; description: string; category: string}[]
}

export type UserAccount = {
  id: string
  email: string
  plan: 'free' | 'unlimited' | string
  status: 'active' | 'suspended' | string
  is_admin: boolean
  created_at: string
  free_daily_seconds: number
}

export type QuotaSnapshot = {
  plan: string
  unlimited: boolean
  daily_seconds: number
  used_seconds: number
  remaining_seconds: number
  resets_at: string
  server_time: string
}

export type ConsumerDevice = {
  id: string
  name: string
  platform: string
  created_at: string
  last_seen_at: string | null
  revoked: boolean
}

export type ServerLocation = {
  gateway_id: string
  name?: string
  country: string
  country_code: string
  city: string
  status: 'online' | 'degraded' | 'offline'
  load: number
  listen_port: number
  endpoint_host: string
  public_key: string
  dns_servers?: string[]
}

export type TunnelConfig = {
  interface: {
    address: string
    address_v6?: string | null
    dns: string[]
    mtu: number
  }
  peer: {
    public_key: string
    preshared_key?: string | null
    endpoint: string
    allowed_ips: string[]
    persistent_keepalive: number
  }
  ipv6_carried: boolean
}

export type SessionStartResult = {
  session_id: string
  status: string
  server: ServerLocation
  config: TunnelConfig
  quota: QuotaSnapshot
  heartbeat_interval_seconds: number
}

export const consumerApi = {
  async me(): Promise<UserAccount> {
    return api<UserAccount>('/auth/me')
  },
  async quota(): Promise<QuotaSnapshot> {
    return api<QuotaSnapshot>('/quota')
  },
  async servers(): Promise<{servers: ServerLocation[]; recommended_gateway_id: string | null}> {
    return api<{servers: ServerLocation[]; recommended_gateway_id: string | null}>('/servers')
  },
  async devices(): Promise<{devices: ConsumerDevice[]}> {
    return api<{devices: ConsumerDevice[]}>('/devices')
  },
  async registerDevice(name: string, publicKey: string, platform = 'web'): Promise<ConsumerDevice> {
    return api<ConsumerDevice>('/devices', {
      method: 'POST',
      body: {name, public_key: publicKey, platform},
    })
  },
  async revokeDevice(deviceId: string): Promise<void> {
    return api<void>(`/devices/${deviceId}`, {method: 'DELETE'})
  },
  async rotateDeviceKey(deviceId: string, publicKey: string): Promise<ConsumerDevice> {
    return api<ConsumerDevice>(`/devices/${deviceId}/rotate-key`, {
      method: 'POST',
      body: {public_key: publicKey},
    })
  },
  async startSession(deviceId: string, gatewayId?: string): Promise<SessionStartResult> {
    return api<SessionStartResult>('/vpn/session', {
      method: 'POST',
      body: {device_id: deviceId, ...(gatewayId ? {gateway_id: gatewayId} : {})},
    })
  },
  async deleteAccount(password?: string): Promise<void> {
    return api<void>('/auth/account', {
      method: 'DELETE',
      body: password ? {password} : undefined,
    })
  },
}

