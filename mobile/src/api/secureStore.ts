import {AuroraVpn} from '../vpn/native';

/**
 * Tokens live in the native encrypted store, not AsyncStorage.
 *
 * AsyncStorage is a plaintext SQLite file; on a rooted device anything with
 * access to the app's data directory can read it. Tokens are short lived
 * anyway (15 minutes for access), but there is no reason to hand them over
 * cheaply.
 */
const ACCESS = 'access_token';
const REFRESH = 'refresh_token';
const DEVICE = 'device_id';

export const secureStore = {
  async accessToken(): Promise<string | null> {
    return AuroraVpn.getSecret(ACCESS);
  },
  async refreshToken(): Promise<string | null> {
    return AuroraVpn.getSecret(REFRESH);
  },
  async deviceId(): Promise<string | null> {
    return AuroraVpn.getSecret(DEVICE);
  },
  async setTokens(access: string, refresh: string): Promise<void> {
    await AuroraVpn.setSecret(ACCESS, access);
    await AuroraVpn.setSecret(REFRESH, refresh);
  },
  async setDeviceId(id: string): Promise<void> {
    await AuroraVpn.setSecret(DEVICE, id);
  },
  async clear(): Promise<void> {
    await AuroraVpn.clearSecrets();
  },
};
