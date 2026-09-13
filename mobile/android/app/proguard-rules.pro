# WireGuard's Go backend is reached through JNI.
-keep class com.wireguard.android.backend.** { *; }
-keep class com.wireguard.config.** { *; }
-keep class com.wireguard.crypto.** { *; }

# React Native native module registration.
-keep class com.aurora.vpn.** { *; }
-keep,includedescriptorclasses class com.facebook.react.bridge.** { *; }
