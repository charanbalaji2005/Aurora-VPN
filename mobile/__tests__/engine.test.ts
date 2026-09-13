import {
  EngineApi,
  EngineDeps,
  EngineNative,
  VpnEngine,
} from '../src/vpn/engine';
import {Preferences, QuotaState, Server, defaultPreferences} from '../src/domain/models';

/**
 * These tests drive the real engine with fake dependencies -- no emulator, no
 * native module, no server. They cover the two claims the product rests on:
 * "connected" means a handshake happened, and the tunnel really stops when the
 * allowance does.
 */

const server: Server = {
  gatewayId: 'sg-sin-01',
  country: 'Singapore',
  countryCode: 'SG',
  city: 'Singapore',
  name: 'SG-SIN-01',
  status: 'online',
  loadPercent: 12,
  premiumOnly: false,
  latencyMs: 30,
  isFavourite: false,
};

const quota = (remaining: number): QuotaState => ({
  dailySeconds: 10_800,
  usedSeconds: 10_800 - remaining,
  remainingSeconds: remaining,
  resetsAtIso: null,
  unlimited: false,
});

/**
 * Time is injected, so the 15 second handshake timeout can be exercised in
 * milliseconds instead of making the suite wait for it.
 */
function fastClock(stepMs: number) {
  let t = 1_700_000_000_000;
  return () => {
    t += stepMs;
    return t;
  };
}

let running: VpnEngine | null = null;
afterEach(() => {
  // The engine owns real intervals once connected; leaving them running would
  // hang the test process.
  running?.stop();
  running = null;
});

function harness(overrides: {
  handshakeAfterCalls?: number;
  prepare?: boolean;
  startSession?: EngineApi['startSession'];
  now?: () => number;
}) {
  let statusCalls = 0;
  const handshakeAfter = overrides.handshakeAfterCalls ?? 1;

  const calls: string[] = [];

  const native: EngineNative = {
    prepare: jest.fn(async () => {
      calls.push('prepare');
      return overrides.prepare ?? true;
    }),
    up: jest.fn(async () => {
      calls.push('up');
    }),
    down: jest.fn(async () => {
      calls.push('down');
    }),
    status: jest.fn(async () => {
      statusCalls += 1;
      return {
        up: true,
        rxBytes: 1000 * statusCalls,
        txBytes: 500 * statusCalls,
        // Null until the fake gateway "answers", exactly like the real module.
        handshakeAgeSeconds: statusCalls >= handshakeAfter ? 2 : null,
      };
    }),
  };

  const api: EngineApi = {
    startSession:
      overrides.startSession ??
      jest.fn(async () => {
        calls.push('startSession');
        return {
          sessionId: 'sess-1',
          server,
          config: {
            interface: {addresses: ['10.20.2.5/32'], dns: ['10.20.2.1'], mtu: 1280},
            peer: {
              publicKey: 'B'.repeat(43) + '=',
              presharedKey: null,
              endpoint: 'sg1.example.net:51820',
              allowedIps: ['0.0.0.0/0', '::/0'],
              persistentKeepalive: 25,
            },
          },
          quota: quota(10_800),
          heartbeatIntervalSeconds: 30,
        };
      }),
    heartbeat: jest.fn(async () => ({expired: false, quota: quota(10_740)})),
    endSession: jest.fn(async (_id, reason) => {
      calls.push(`endSession:${reason}`);
    }),
    quota: jest.fn(async () => quota(10_740)),
  };

  const deps: EngineDeps = {
    api,
    native,
    isOnline: async () => true,
    watchNetwork: () => () => {},
    now: overrides.now ?? (() => Date.now()),
  };

  const engine = new VpnEngine(deps);
  running = engine;
  return {engine, api, native, calls};
}

const prefs: Preferences = defaultPreferences;

describe('connecting', () => {
  it('asks for VPN permission before it asks for a session', async () => {
    const {engine, calls} = harness({});
    await engine.connect(server, [server], prefs);
    expect(calls[0]).toBe('prepare');
    expect(calls).toContain('startSession');
    expect(engine.getSnapshot().state).toBe('CONNECTED');
  });

  it('does not start a session at all when permission is refused', async () => {
    const {engine, api} = harness({prepare: false});
    await engine.connect(server, [server], prefs);
    expect(api.startSession).not.toHaveBeenCalled();
    expect(engine.getSnapshot().state).toBe('FAILED');
    expect(engine.getSnapshot().failure?.code).toBe('permission_denied');
  });

  /** The claim the whole product rests on. */
  it('only reports CONNECTED once a handshake has actually happened', async () => {
    const {engine} = harness({handshakeAfterCalls: 3});
    const seen: string[] = [];
    engine.subscribe(snapshot => seen.push(snapshot.state));

    await engine.connect(server, [server], prefs);

    expect(seen).toContain('CONNECTING');
    expect(seen[seen.length - 1]).toBe('CONNECTED');
    // It never claimed protection while the handshake was still missing.
    const firstConnected = seen.indexOf('CONNECTED');
    expect(seen.slice(0, firstConnected)).not.toContain('CONNECTED');
  });

  it('tears the interface down and blames the location when no handshake lands', async () => {
    // Never answers: handshakeAgeSeconds stays null past the timeout.
    const {engine, native, api} = harness({
      handshakeAfterCalls: Number.MAX_SAFE_INTEGER,
      now: fastClock(4_000),
    });
    await engine.connect(server, [server], prefs);

    expect(engine.getSnapshot().state).toBe('SERVER_UNAVAILABLE');
    expect(native.down).toHaveBeenCalled();
    expect(api.endSession).toHaveBeenCalledWith('sess-1', 'handshake_timeout', 0, 0);
    expect(engine.getSnapshot().failure?.message).toContain('Singapore');
  });

  it('surfaces an exhausted allowance as its own state, not a generic failure', async () => {
    const {engine} = harness({
      startSession: jest.fn(async () => {
        throw Object.assign(new Error('You have used today’s 3 hours.'), {
          code: 'quota_exhausted',
        });
      }),
    });
    await engine.connect(server, [server], prefs);
    expect(engine.getSnapshot().state).toBe('QUOTA_EXPIRED');
  });

  it('offers another location when the control plane has no gateway', async () => {
    const {engine} = harness({
      startSession: jest.fn(async () => {
        throw Object.assign(new Error('No server in that location is available.'), {
          code: 'no_gateway_available',
        });
      }),
    });
    await engine.connect(server, [server], prefs);
    expect(engine.getSnapshot().state).toBe('SERVER_UNAVAILABLE');
  });
});

describe('disconnecting', () => {
  it('brings the interface down and closes the session with its byte counters', async () => {
    const {engine, native, api} = harness({});
    await engine.connect(server, [server], prefs);
    await engine.disconnect();

    expect(native.down).toHaveBeenCalled();
    expect(api.endSession).toHaveBeenCalledWith(
      'sess-1',
      'user_requested',
      expect.any(Number),
      expect.any(Number),
    );
    expect(engine.getSnapshot().state).toBe('DISCONNECTED');
    expect(engine.getSnapshot().metrics.bytesDown).toBe(0);
  });
});
