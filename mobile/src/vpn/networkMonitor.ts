import NetInfo from '@react-native-community/netinfo';

export type NetworkStatus = {online: boolean; transport: string | null};

/**
 * Watches the underlying network.
 *
 * Two events matter to a VPN: losing the network (the tunnel is dead, say so
 * rather than showing a stale "Protected") and *changing* network, for example
 * Wi-Fi to mobile. WireGuard usually roams on its own, but the handshake can
 * stall, so the engine re-checks after a change and rebuilds if no handshake
 * lands.
 */
export function watchNetwork(onChange: (status: NetworkStatus) => void): () => void {
  return NetInfo.addEventListener(state => {
    onChange({
      online: !!state.isConnected,
      transport: state.type ?? null,
    });
  });
}

export async function isOnline(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return !!state.isConnected;
}
