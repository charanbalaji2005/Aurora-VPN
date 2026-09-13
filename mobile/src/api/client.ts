import {AuroraVpn} from '../vpn/native';
import {secureStore} from './secureStore';

/**
 * HTTP client for the control plane.
 *
 * Two things it has to get right:
 *
 * 1. **Actionable errors.** The API sends a stable `code` and a written
 *    message; we surface the server's wording because it knows the specifics
 *    ("Tokyo did not respond"), and fall back to a code-specific line. Never
 *    "something went wrong".
 * 2. **One refresh at a time.** Refresh tokens are single use and the server
 *    treats a replay as theft -- it burns the whole token family and signs the
 *    user out. So concurrent 401s share one in-flight refresh promise.
 */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const BASE = (AuroraVpn?.apiBaseUrl ?? 'http://10.0.2.2:8000/').replace(/\/$/, '');
const TIMEOUT_MS = 15000;

let refreshInFlight: Promise<boolean> | null = null;

function messageFor(status: number, body: {error?: {message?: string}} | null): string {
  const fromServer = body?.error?.message;
  if (fromServer) return fromServer;
  switch (true) {
    case status === 401:
      return 'Your session expired. Sign in again.';
    case status === 403:
      return 'This account cannot do that right now.';
    case status === 404:
      return 'That is no longer available.';
    case status === 429:
      return 'Too many attempts. Wait a moment and try again.';
    case status >= 500:
      return 'The VPN service is temporarily unavailable.';
    default:
      return "Couldn't reach the VPN service. Check your connection.";
  }
}

async function rawRequest(
  path: string,
  init: RequestInit,
  token: string | null,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(`${BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        ...(token ? {authorization: `Bearer ${token}`} : {}),
        ...(init.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function refreshTokens(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refresh = await secureStore.refreshToken();
    if (!refresh) return false;
    try {
      const response = await rawRequest(
        '/api/v1/auth/refresh',
        {method: 'POST', body: JSON.stringify({refresh_token: refresh})},
        null,
      );
      if (!response.ok) {
        await secureStore.clear();
        return false;
      }
      const body = await response.json();
      await secureStore.setTokens(body.access_token, body.refresh_token);
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

export async function request<T>(
  path: string,
  options: {method?: string; body?: unknown; skipAuth?: boolean} = {},
): Promise<T> {
  const init: RequestInit = {
    method: options.method ?? 'GET',
    ...(options.body !== undefined ? {body: JSON.stringify(options.body)} : {}),
  };

  let token = options.skipAuth ? null : await secureStore.accessToken();
  let response: Response;
  try {
    response = await rawRequest(path, init, token);
  } catch (e) {
    throw new ApiError('network_unreachable', "Couldn't reach the VPN service.", 0);
  }

  if (response.status === 401 && !options.skipAuth) {
    const refreshed = await refreshTokens();
    if (refreshed) {
      token = await secureStore.accessToken();
      response = await rawRequest(path, init, token);
    }
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(
      body?.error?.code ?? 'request_failed',
      messageFor(response.status, body),
      response.status,
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
