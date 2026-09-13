package com.aurora.vpn;

import android.app.Activity;
import android.content.Intent;
import android.net.VpnService;
import android.util.Log;
import androidx.annotation.NonNull;
import com.facebook.react.bridge.ActivityEventListener;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.BaseActivityEventListener;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import com.wireguard.android.backend.Backend;
import com.wireguard.android.backend.GoBackend;
import com.wireguard.android.backend.Statistics;
import com.wireguard.android.backend.Tunnel;
import com.wireguard.config.Config;
import com.wireguard.config.InetEndpoint;
import com.wireguard.config.InetNetwork;
import com.wireguard.config.Interface;
import com.wireguard.config.Peer;
import com.wireguard.crypto.Key;
import com.wireguard.crypto.KeyPair;
import java.net.InetAddress;
import java.util.HashMap;
import java.util.Map;

/**
 * The bridge between JavaScript and the real tunnel.
 *
 * This module exists because Android's VpnService, the WireGuard Go backend
 * and per-app routing are all native APIs with no JavaScript equivalent. It is
 * deliberately the *only* native code in the app, and it is deliberately thin:
 * it exposes five verbs and holds no product logic. Every decision about when
 * to connect, what to charge and what to display lives in TypeScript, where it
 * can be read and tested.
 *
 * Two things never cross the bridge:
 *   - the device private key (see {@link DeviceKeyStore})
 *   - any packet or address from inside the tunnel
 */
public class AuroraVpnModule extends ReactContextBaseJavaModule {

  private static final String TAG = "AuroraVpn";
  private static final int REQUEST_VPN_CONSENT = 0x5601;
  static final String EVENT_STATE = "AuroraTunnelState";

  private final ReactApplicationContext context;
  private Backend backend;
  private DeviceKeyStore keys;
  private SecureStore secrets;
  private Promise pendingConsent;

  private final AuroraTunnel tunnel = new AuroraTunnel();

  /** WireGuard's callback interface. State changes are pushed to JS. */
  private final class AuroraTunnel implements Tunnel {
    @Override
    public String getName() {
      return "aurora";
    }

    @Override
    public void onStateChange(Tunnel.State newState) {
      WritableMap payload = Arguments.createMap();
      payload.putString("interfaceState", newState.name());
      emit(payload);
    }
  }

  private final ActivityEventListener consentListener =
      new BaseActivityEventListener() {
        @Override
        public void onActivityResult(Activity activity, int requestCode, int resultCode, Intent d) {
          if (requestCode != REQUEST_VPN_CONSENT || pendingConsent == null) {
            return;
          }
          // RESULT_OK means the user accepted Android's VPN warning dialog.
          pendingConsent.resolve(resultCode == Activity.RESULT_OK);
          pendingConsent = null;
        }
      };

  public AuroraVpnModule(ReactApplicationContext reactContext) {
    super(reactContext);
    this.context = reactContext;
    reactContext.addActivityEventListener(consentListener);
  }

  @NonNull
  @Override
  public String getName() {
    return "AuroraVpn";
  }

  @Override
  public Map<String, Object> getConstants() {
    Map<String, Object> constants = new HashMap<>();
    constants.put("apiBaseUrl", BuildConfig.API_BASE_URL);
    constants.put("appVersion", BuildConfig.VERSION_NAME);
    return constants;
  }

  private Backend backend() {
    if (backend == null) {
      backend = new GoBackend(context.getApplicationContext());
    }
    return backend;
  }

  private DeviceKeyStore keys() throws Exception {
    if (keys == null) {
      keys = new DeviceKeyStore(context.getApplicationContext());
    }
    return keys;
  }

  private SecureStore secrets() throws Exception {
    if (secrets == null) {
      secrets = new SecureStore(context.getApplicationContext());
    }
    return secrets;
  }

  private void emit(WritableMap payload) {
    context
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
        .emit(EVENT_STATE, payload);
  }

  // --- identity ------------------------------------------------------------

  /** Returns the public key, creating the pair on first use. */
  @ReactMethod
  public void ensureKeyPair(Promise promise) {
    try {
      promise.resolve(keys().ensureKeyPair());
    } catch (Exception e) {
      promise.reject("key_store_failed", "This device could not create its VPN key.", e);
    }
  }

  @ReactMethod
  public void rotateKeyPair(Promise promise) {
    try {
      promise.resolve(keys().rotate());
    } catch (Exception e) {
      promise.reject("key_store_failed", "This device could not rotate its VPN key.", e);
    }
  }

  @ReactMethod
  public void clearKeys(Promise promise) {
    try {
      keys().clear();
      promise.resolve(null);
    } catch (Exception e) {
      promise.reject("key_store_failed", e.getMessage(), e);
    }
  }

  // --- encrypted storage for the JS layer ----------------------------------

  @ReactMethod
  public void setSecret(String key, String value, Promise promise) {
    try {
      secrets().put(key, value);
      promise.resolve(null);
    } catch (Exception e) {
      promise.reject("secure_store_failed", e.getMessage(), e);
    }
  }

  @ReactMethod
  public void getSecret(String key, Promise promise) {
    try {
      promise.resolve(secrets().get(key));
    } catch (Exception e) {
      promise.reject("secure_store_failed", e.getMessage(), e);
    }
  }

  @ReactMethod
  public void clearSecrets(Promise promise) {
    try {
      secrets().clear();
      promise.resolve(null);
    } catch (Exception e) {
      promise.reject("secure_store_failed", e.getMessage(), e);
    }
  }

  // --- permission ----------------------------------------------------------

  /**
   * Asks Android for VPN consent. Resolves true if the app may create a tunnel.
   * Requires an Activity, which is why this cannot be done from JS alone.
   */
  @ReactMethod
  public void prepare(Promise promise) {
    Activity activity = getCurrentActivity();
    if (activity == null) {
      promise.reject("no_activity", "The app must be in the foreground to enable the VPN.");
      return;
    }
    Intent intent = VpnService.prepare(context);
    if (intent == null) {
      promise.resolve(true); // already granted
      return;
    }
    pendingConsent = promise;
    activity.startActivityForResult(intent, REQUEST_VPN_CONSENT);
  }

  // --- tunnel --------------------------------------------------------------

  /**
   * Brings the tunnel up from the client configuration the control plane
   * issued. The private key is read from local storage here; the caller never
   * supplies it and cannot see it.
   */
  @ReactMethod
  public void up(ReadableMap config, Promise promise) {
    try {
      Config wg = buildConfig(config);
      backend().setState(tunnel, Tunnel.State.UP, wg);
      AuroraTunnelService.start(context, config.hasKey("location") ? config.getString("location") : null);
      promise.resolve(null);
    } catch (Exception e) {
      Log.w(TAG, "tunnel up failed: " + e.getClass().getSimpleName());
      promise.reject(
          "tunnel_failed", "Android would not start the VPN. Check the VPN permission.", e);
    }
  }

  @ReactMethod
  public void down(Promise promise) {
    try {
      backend().setState(tunnel, Tunnel.State.DOWN, null);
      AuroraTunnelService.stop(context);
      promise.resolve(null);
    } catch (Exception e) {
      Log.w(TAG, "tunnel down failed: " + e.getClass().getSimpleName());
      promise.reject("tunnel_down_failed", e.getMessage(), e);
    }
  }

  /**
   * The truth about the tunnel, read straight from the backend.
   *
   * {@code handshakeAgeSeconds} is the value that matters: an interface can be
   * UP while no handshake has ever completed, and that state protects nothing.
   * It is null when there has never been a handshake, never zero, so the
   * JavaScript layer cannot mistake "unknown" for "just now".
   */
  @ReactMethod
  public void status(Promise promise) {
    WritableMap result = Arguments.createMap();
    try {
      boolean up = backend().getState(tunnel) == Tunnel.State.UP;
      result.putBoolean("up", up);

      Statistics stats = backend().getStatistics(tunnel);
      result.putDouble("rxBytes", stats.totalRx());
      result.putDouble("txBytes", stats.totalTx());

      Key[] peers = stats.peers();
      if (peers.length > 0) {
        Statistics.PeerStats peer = stats.peer(peers[0]);
        long handshakeMs = peer == null ? 0 : peer.getLatestHandshakeEpochMillis();
        if (handshakeMs > 0) {
          result.putDouble("handshakeAgeSeconds", (System.currentTimeMillis() - handshakeMs) / 1000d);
        } else {
          result.putNull("handshakeAgeSeconds");
        }
      } else {
        result.putNull("handshakeAgeSeconds");
      }
      promise.resolve(result);
    } catch (Exception e) {
      result.putBoolean("up", false);
      result.putNull("handshakeAgeSeconds");
      promise.resolve(result);
    }
  }

  /** Updates the ongoing notification text without touching the tunnel. */
  @ReactMethod
  public void updateNotification(String title, String body, Promise promise) {
    AuroraTunnelService.update(context, title, body);
    promise.resolve(null);
  }

  // --- config translation --------------------------------------------------

  private Config buildConfig(ReadableMap config) throws Exception {
    ReadableMap iface = config.getMap("interface");
    ReadableMap peerMap = config.getMap("peer");
    if (iface == null || peerMap == null) {
      throw new IllegalArgumentException("malformed tunnel configuration");
    }

    Interface.Builder interfaceBuilder = new Interface.Builder();
    interfaceBuilder.setKeyPair(new KeyPair(keys().privateKey()));

    ReadableArray addresses = iface.getArray("addresses");
    boolean hasV6Address = false;
    for (int i = 0; addresses != null && i < addresses.size(); i++) {
      String addr = addresses.getString(i);
      if (addr != null) {
        if (addr.contains(":")) {
          hasV6Address = true;
        }
        interfaceBuilder.addAddress(InetNetwork.parse(addr));
      }
    }
    ReadableArray dns = iface.getArray("dns");
    for (int i = 0; dns != null && i < dns.size(); i++) {
      interfaceBuilder.addDnsServer(InetAddress.getByName(dns.getString(i)));
    }
    interfaceBuilder.setMtu(iface.hasKey("mtu") ? iface.getInt("mtu") : 1280);

    // Split tunnelling uses the platform's per-package routing
    String splitMode = config.hasKey("splitMode") ? config.getString("splitMode") : "ALL_APPS";
    ReadableArray packages = config.getArray("splitPackages");
    if (packages != null && !"ALL_APPS".equals(splitMode)) {
      for (int i = 0; i < packages.size(); i++) {
        String name = packages.getString(i);
        if ("ONLY_SELECTED".equals(splitMode)) {
          interfaceBuilder.includeApplication(name);
        } else {
          interfaceBuilder.excludeApplication(name);
        }
      }
    }

    Peer.Builder peerBuilder =
        new Peer.Builder()
            .setPublicKey(Key.fromBase64(peerMap.getString("publicKey")))
            .setEndpoint(InetEndpoint.parse(peerMap.getString("endpoint")))
            .setPersistentKeepalive(
                peerMap.hasKey("persistentKeepalive") ? peerMap.getInt("persistentKeepalive") : 25);

    if (peerMap.hasKey("presharedKey") && peerMap.getString("presharedKey") != null) {
      peerBuilder.setPreSharedKey(Key.fromBase64(peerMap.getString("presharedKey")));
    }

    boolean blockIpv6 = !config.hasKey("blockIpv6") || config.getBoolean("blockIpv6");
    boolean dummyV6Assigned = false;
    ReadableArray allowed = peerMap.getArray("allowedIps");
    for (int i = 0; allowed != null && i < allowed.size(); i++) {
      String cidr = allowed.getString(i);
      if (cidr == null) {
        continue;
      }
      boolean isV6 = cidr.contains(":");
      if (isV6) {
        if (hasV6Address) {
          // Dual-stack gateway: carry IPv6 traffic through the tunnel
          peerBuilder.addAllowedIp(InetNetwork.parse(cidr));
        } else if (blockIpv6 && "::/0".equals(cidr)) {
          // Gateway is IPv4-only but user requested IPv6 leak protection:
          // Assign dummy ULA address to satisfy VpnService and route ::/0 into tunnel to drop
          if (!dummyV6Assigned) {
            interfaceBuilder.addAddress(InetNetwork.parse("fd00:aurora::2/128"));
            dummyV6Assigned = true;
          }
          peerBuilder.addAllowedIp(InetNetwork.parse(cidr));
        }
      } else {
        peerBuilder.addAllowedIp(InetNetwork.parse(cidr));
      }
    }

    return new Config.Builder().setInterface(interfaceBuilder.build()).addPeer(peerBuilder.build()).build();
  }
}
