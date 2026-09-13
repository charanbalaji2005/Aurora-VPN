package com.aurora.vpn;

import android.content.Context;
import android.content.SharedPreferences;
import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;
import com.wireguard.crypto.Key;
import com.wireguard.crypto.KeyPair;

/**
 * This device's WireGuard identity.
 *
 * The private key never crosses the React Native bridge. JavaScript can ask
 * for the public half and can ask for a tunnel to be brought up, but it has no
 * way to read the private key, so a compromised JS bundle (or a careless
 * console.log) cannot leak it.
 *
 * WireGuard uses Curve25519, which the Android Keystore cannot hold as a
 * hardware-bound key. The honest description is therefore: generated on the
 * device, stored in EncryptedSharedPreferences whose master key *is*
 * hardware-backed, never logged, never backed up.
 */
final class DeviceKeyStore {

  private static final String PREFS = "aurora.device_key";
  private static final String KEY_PRIVATE = "private";
  private static final String KEY_PUBLIC = "public";

  private final SharedPreferences prefs;

  DeviceKeyStore(Context context) throws Exception {
    MasterKey masterKey =
        new MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build();
    this.prefs =
        EncryptedSharedPreferences.create(
            context,
            PREFS,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM);
  }

  /** Creates the pair on first use. Returns the public key. */
  String ensureKeyPair() throws Exception {
    String stored = prefs.getString(KEY_PRIVATE, null);
    if (stored != null) {
      return new KeyPair(Key.fromBase64(stored)).getPublicKey().toBase64();
    }
    return rotate();
  }

  String rotate() {
    KeyPair pair = new KeyPair();
    prefs
        .edit()
        .putString(KEY_PRIVATE, pair.getPrivateKey().toBase64())
        .putString(KEY_PUBLIC, pair.getPublicKey().toBase64())
        .apply();
    return pair.getPublicKey().toBase64();
  }

  Key privateKey() throws Exception {
    String stored = prefs.getString(KEY_PRIVATE, null);
    if (stored == null) {
      throw new IllegalStateException("no device key");
    }
    return Key.fromBase64(stored);
  }

  void clear() {
    prefs.edit().clear().apply();
  }
}
