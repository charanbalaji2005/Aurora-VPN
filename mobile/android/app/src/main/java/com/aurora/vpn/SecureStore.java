package com.aurora.vpn;

import android.content.Context;
import android.content.SharedPreferences;
import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;

/**
 * Encrypted key/value storage for the JavaScript layer.
 *
 * Access and refresh tokens go here rather than in AsyncStorage, which is a
 * plaintext SQLite file readable by anything with access to the app's data
 * directory on a rooted device. Using the native store also avoids pulling in
 * a second native dependency for the same job.
 */
final class SecureStore {

  private final SharedPreferences prefs;

  SecureStore(Context context) throws Exception {
    MasterKey masterKey =
        new MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build();
    this.prefs =
        EncryptedSharedPreferences.create(
            context,
            "aurora.secrets",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM);
  }

  void put(String key, String value) {
    if (value == null) {
      prefs.edit().remove(key).apply();
    } else {
      prefs.edit().putString(key, value).apply();
    }
  }

  String get(String key) {
    return prefs.getString(key, null);
  }

  void clear() {
    prefs.edit().clear().apply();
  }
}
