import {Server, isAvailable} from '../domain/models';

/**
 * Which server to use.
 *
 * The score mirrors the control plane's formula so the app and the server
 * agree about what "fastest" means. Latency alone is a bad recommendation: the
 * quickest ping to a saturated gateway is a slow connection.
 */
export function fastest(servers: Server[]): Server | null {
  const candidates = servers.filter(isAvailable);
  if (candidates.length === 0) return null;

  return candidates.reduce((best, server) => {
    return score(server) > score(best) ? server : best;
  });
}

export function score(server: Server): number {
  // An unmeasured server is assumed mediocre rather than excluded, so a device
  // that has never probed still gets a sensible pick.
  const latency = server.latencyMs ?? 250;
  const latencyScore = 1 - Math.min(latency, 400) / 400;
  const loadScore = 1 - Math.min(Math.max(server.loadPercent, 0), 100) / 100;
  return 0.55 * latencyScore + 0.45 * loadScore;
}

/** Hints the control plane folds into its own scoring. */
export function latencyHints(servers: Server[]): Record<string, number> {
  const hints: Record<string, number> = {};
  for (const server of servers) {
    if (server.latencyMs !== null) hints[server.gatewayId] = server.latencyMs;
  }
  return hints;
}
