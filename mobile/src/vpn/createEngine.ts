import {api} from '../api/auroraApi';
import {AuroraVpn} from './native';
import {EngineDeps, VpnEngine} from './engine';
import {isOnline, watchNetwork} from './networkMonitor';

/**
 * The only place the engine is wired to the real world.
 *
 * Keeping this separate from engine.ts is what allows the engine's tests to
 * run in plain Node: nothing in engine.ts imports react-native, the native
 * module or fetch.
 */
export const createEngine = (overrides: Partial<EngineDeps> = {}): VpnEngine =>
  new VpnEngine({
    api,
    native: AuroraVpn,
    isOnline,
    watchNetwork,
    now: () => Date.now(),
    ...overrides,
  });
