package com.aiocalender;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import androidx.core.app.NotificationCompat;

public class AIOAlarmReceiver extends BroadcastReceiver {
    public static final String ACTION_EXACT_ALARM = "com.aiocalender.AIO_EXACT_ALARM";
    public static final String CHANNEL_VIBRATE = "aio-alarm-clock-vibrate";
    public static final String CHANNEL_SILENT = "aio-alarm-clock-silent";

    @Override
    public void onReceive(Context context, Intent intent) {
        PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        PowerManager.WakeLock wakeLock = null;
        if (pm != null) {
            try {
                wakeLock = pm.newWakeLock(
                    PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP | PowerManager.ON_AFTER_RELEASE,
                    "aiocalender:exact_alarm_wake"
                );
                wakeLock.acquire(6000); // Light up screen for 6 seconds
            } catch (Exception e1) {
                try {
                    wakeLock = pm.newWakeLock(
                        PowerManager.PARTIAL_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP,
                        "aiocalender:exact_alarm_wake"
                    );
                    wakeLock.acquire(10000);
                } catch (Exception ignored) {
                }
            }
        }

        try {
            int id = intent.getIntExtra("id", 1000);
            String title = intent.getStringExtra("title");
            if (title == null || title.isEmpty()) {
                title = "📚 Lecture Reminder";
            }
            String body = intent.getStringExtra("body");
            if (body == null || body.isEmpty()) {
                body = "Your scheduled class is starting soon!";
            }
            boolean vibrate = intent.getBooleanExtra("vibrate", true);

            ensureChannels(context);

            String channelId = vibrate ? CHANNEL_VIBRATE : CHANNEL_SILENT;

            Intent openAppIntent = new Intent(context, MainActivity.class);
            openAppIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                pendingFlags |= PendingIntent.FLAG_IMMUTABLE;
            }
            PendingIntent contentPendingIntent = PendingIntent.getActivity(context, id, openAppIntent, pendingFlags);

            int smallIconResId = context.getResources().getIdentifier("ic_stat_icon_config_sample", "drawable", context.getPackageName());
            if (smallIconResId == 0) {
                smallIconResId = context.getApplicationInfo().icon;
            }

            Uri soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            if (soundUri == null) {
                soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            }

            NotificationCompat.Builder builder = new NotificationCompat.Builder(context, channelId)
                .setSmallIcon(smallIconResId)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setAutoCancel(true)
                .setContentIntent(contentPendingIntent)
                .setFullScreenIntent(contentPendingIntent, true);

            if (vibrate) {
                builder.setVibrate(new long[]{0, 500, 250, 500, 250, 500});
                builder.setSound(soundUri);
            } else {
                builder.setVibrate(new long[]{0});
                builder.setSound(null);
            }

            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.notify(id, builder.build());
            }

            // Remove from stored alarms once delivered
            new AIOAlarmStorage(context).removeAlarm(id);
        } catch (Exception e) {
            e.printStackTrace();
        } finally {
            if (wakeLock != null && wakeLock.isHeld()) {
                try {
                    wakeLock.release();
                } catch (Exception ignored) {
                }
            }
        }
    }

    public static void ensureChannels(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;

            Uri soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            AudioAttributes audioAttr = new AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setUsage(AudioAttributes.USAGE_ALARM)
                .build();

            // Channel 1: Vibrate + Sound
            NotificationChannel vibrateChannel = new NotificationChannel(
                CHANNEL_VIBRATE,
                "AIO Lecture Reminders (Alert)",
                NotificationManager.IMPORTANCE_HIGH
            );
            vibrateChannel.setDescription("High priority exact alarm reminders for lectures and tasks with sound and vibration");
            vibrateChannel.enableVibration(true);
            vibrateChannel.setVibrationPattern(new long[]{0, 500, 250, 500, 250, 500});
            vibrateChannel.enableLights(true);
            vibrateChannel.setLightColor(Color.RED);
            vibrateChannel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            vibrateChannel.setBypassDnd(true);
            if (soundUri != null) {
                vibrateChannel.setSound(soundUri, audioAttr);
            }
            nm.createNotificationChannel(vibrateChannel);

            // Channel 2: Silent
            NotificationChannel silentChannel = new NotificationChannel(
                CHANNEL_SILENT,
                "AIO Lecture Reminders (Silent)",
                NotificationManager.IMPORTANCE_HIGH
            );
            silentChannel.setDescription("High priority exact alarm reminders without sound or vibration");
            silentChannel.enableVibration(false);
            silentChannel.enableLights(true);
            silentChannel.setSound(null, null);
            silentChannel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(silentChannel);
        }
    }
}
