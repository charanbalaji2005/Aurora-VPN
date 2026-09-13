import {Server} from '../src/domain/models';
import {fastest, latencyHints, score} from '../src/vpn/serverSelector';

const server = (patch: Partial<Server>): Server => ({
  gatewayId: 'jp-tok-01',
  country: 'Japan',
  countryCode: 'JP',
  city: 'Tokyo',
  name: 'JP-TOK-01',
  status: 'online',
  loadPercent: 20,
  premiumOnly: false,
  latencyMs: 40,
  isFavourite: false,
  ...patch,
});

describe('choosing a server', () => {
  it('prefers an idle server over a saturated one at the same latency', () => {
    const idle = server({gatewayId: 'a', loadPercent: 5});
    const loaded = server({gatewayId: 'b', loadPercent: 95});
    expect(score(idle)).toBeGreaterThan(score(loaded));
  });

  /** The quickest ping to a full gateway is a bad recommendation. */
  it('does not pick the lowest latency when the gateway is saturated', () => {
    const nearbyButFull = server({gatewayId: 'near', latencyMs: 10, loadPercent: 99});
    const fartherButIdle = server({gatewayId: 'far', latencyMs: 120, loadPercent: 5});
    expect(fastest([nearbyButFull, fartherButIdle])?.gatewayId).toBe('far');
  });

  it('ignores servers that are not available', () => {
    const offline = server({gatewayId: 'off', status: 'offline', latencyMs: 1, loadPercent: 0});
    const online = server({gatewayId: 'on', latencyMs: 200, loadPercent: 50});
    expect(fastest([offline, online])?.gatewayId).toBe('on');
  });

  it('returns null when nothing is usable', () => {
    expect(fastest([server({status: 'offline'})])).toBeNull();
  });

  it('sends back only measured latencies as hints', () => {
    const hints = latencyHints([
      server({gatewayId: 'a', latencyMs: 42}),
      server({gatewayId: 'b', latencyMs: null}),
    ]);
    expect(hints).toEqual({a: 42});
  });
});
