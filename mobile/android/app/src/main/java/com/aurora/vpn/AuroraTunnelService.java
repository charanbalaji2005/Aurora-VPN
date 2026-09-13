package com.aurora.vpn;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import androidx.core.app.NotificationCompat;
import androidx.lifecycle.LifecycleService;

/**
 * Keeps the app process alive while the tunnel is up and shows the ongoing
 * notification Android requires.
 *
 * This is separate from the tunnel itself, which belongs to WireGuard's
 * VpnService. It exists so the JavaScript heartbeat loop survives the app
 * being backgrounded: without it, a phone in someone's pocket would hold a
 * tunnel the control plane had already stopped counting.
 */
public class AuroraTunnelService extends LifecycleService {

  private static final String CHANNEL_ID = "aurora.tunnel";
  private static final int NOTIFICATION_ID = 4201;
  private static final String EXTRA_TITLE = "title";
  private static final String EXTRA_BODY = "body";
  static final String ACTION_DISCONNECT = "com.aurora.vpn.DISCONNECT";

  static void start(Context context, String location) {
    Intent intent = new Intent(context, AuroraTunnelService.class);
    intent.putExtra(EXTRA_TITLE, location == null ? "Connecting…" : "Protected · " + location);
    context.startForegroundService(intent);
  }

  static void update(Context context, String title, String body) {
    Intent intent = new Intent(context, AuroraTunnelService.class);
    intent.putExtra(EXTRA_TITLE, title);
    intent.putExtra(EXTRA_BODY, body);
    context.startForegroundService(intent);
  }

  static void stop(Context context) {
    context.stopService(new Intent(context, AuroraTunnelService.class));
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    super.onStartCommand(intent, flags, startId);
    if (intent == null) {
      // Process was restarted without a valid active session.
      // Stop the service rather than showing a misleading "Protected" notification.
      stopSelf();
      return START_NOT_STICKY;
    }
    createChannel();

    String title = intent.getStringExtra(EXTRA_TITLE);
    String body = intent.getStringExtra(EXTRA_BODY);
    startForeground(NOTIFICATION_ID, build(title == null ? "Connecting…" : title, body));
    return START_NOT_STICKY;
  }

  @Override
  public IBinder onBind(Intent intent) {
    super.onBind(intent);
    return null;
  }

  private Notification build(String title, String body) {
    PendingIntent open =
        PendingIntent.getActivity(
            this,
            0,
            new Intent(this, MainActivity.class),
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

    return new NotificationCompat.Builder(this, CHANNEL_ID)
        .setSmallIcon(android.R.drawable.ic_lock_lock)
        .setContentTitle(title == null ? "Aurora VPN" : title)
        .setContentText(body)
        .setOngoing(true)
        .setCategory(NotificationCompat.CATEGORY_SERVICE)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setContentIntent(open)
        .build();
  }

  private void createChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return;
    }
    NotificationManager manager = getSystemService(NotificationManager.class);
    NotificationChannel channel =
        new NotificationChannel(
            CHANNEL_ID, getString(R.string.notif_channel), NotificationManager.IMPORTANCE_LOW);
    channel.setDescription(getString(R.string.notif_channel_desc));
    channel.setShowBadge(false);
    manager.createNotificationChannel(channel);
  }
}
