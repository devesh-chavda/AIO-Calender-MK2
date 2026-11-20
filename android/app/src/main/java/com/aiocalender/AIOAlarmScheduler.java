package com.aiocalender;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import java.util.ArrayList;
import java.util.List;

public class AIOAlarmScheduler {

    public static boolean canScheduleExactAlarms(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            return am != null && am.canScheduleExactAlarms();
        }
        return true;
    }

    public static void scheduleAlarm(Context context, AIOAlarmStorage.AlarmEntry entry) {
        if (entry == null || entry.triggerTimeMs <= System.currentTimeMillis()) {
            return;
        }

        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) return;

        Intent broadcastIntent = new Intent(context, AIOAlarmReceiver.class);
        broadcastIntent.setAction(AIOAlarmReceiver.ACTION_EXACT_ALARM);
        broadcastIntent.putExtra("id", entry.id);
        broadcastIntent.putExtra("title", entry.title);
        broadcastIntent.putExtra("body", entry.body);
        broadcastIntent.putExtra("vibrate", entry.vibrate);
        broadcastIntent.putExtra("category", entry.category);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }

        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            context,
            entry.id,
            broadcastIntent,
            flags
        );

        Intent openAppIntent = new Intent(context, MainActivity.class);
        openAppIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent showIntent = PendingIntent.getActivity(
            context,
            entry.id,
            openAppIntent,
            flags
        );

        try {
            // AlarmClockInfo guarantees waking up from Doze mode, bypasses OEM throttling,
            // and provides real-time accuracy for lecture / task reminders.
            AlarmManager.AlarmClockInfo clockInfo = new AlarmManager.AlarmClockInfo(entry.triggerTimeMs, showIntent);
            alarmManager.setAlarmClock(clockInfo, pendingIntent);
        } catch (SecurityException se) {
            // Fallback for devices restricting setAlarmClock
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, entry.triggerTimeMs, pendingIntent);
                } else {
                    alarmManager.setExact(AlarmManager.RTC_WAKEUP, entry.triggerTimeMs, pendingIntent);
                }
            } catch (Exception ignored) {
            }
        } catch (Exception e) {
            try {
                alarmManager.set(AlarmManager.RTC_WAKEUP, entry.triggerTimeMs, pendingIntent);
            } catch (Exception ignored) {
            }
        }
    }

    public static void cancelAlarm(Context context, int id) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) return;

        Intent broadcastIntent = new Intent(context, AIOAlarmReceiver.class);
        broadcastIntent.setAction(AIOAlarmReceiver.ACTION_EXACT_ALARM);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }

        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            context,
            id,
            broadcastIntent,
            flags
        );

        if (pendingIntent != null) {
            alarmManager.cancel(pendingIntent);
            pendingIntent.cancel();
        }

        new AIOAlarmStorage(context).removeAlarm(id);
    }

    public static void cancelAll(Context context) {
        AIOAlarmStorage storage = new AIOAlarmStorage(context);
        List<AIOAlarmStorage.AlarmEntry> existing = storage.getAlarms();
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }

        for (AIOAlarmStorage.AlarmEntry e : existing) {
            if (alarmManager != null) {
                Intent broadcastIntent = new Intent(context, AIOAlarmReceiver.class);
                broadcastIntent.setAction(AIOAlarmReceiver.ACTION_EXACT_ALARM);
                PendingIntent pendingIntent = PendingIntent.getBroadcast(
                    context,
                    e.id,
                    broadcastIntent,
                    flags
                );
                if (pendingIntent != null) {
                    alarmManager.cancel(pendingIntent);
                    pendingIntent.cancel();
                }
            }
        }

        storage.clearAlarms();
    }

    public static void rescheduleAll(Context context) {
        AIOAlarmStorage storage = new AIOAlarmStorage(context);
        List<AIOAlarmStorage.AlarmEntry> stored = storage.getAlarms();
        long now = System.currentTimeMillis();
        List<AIOAlarmStorage.AlarmEntry> valid = new ArrayList<>();

        for (AIOAlarmStorage.AlarmEntry entry : stored) {
            if (entry.triggerTimeMs > now) {
                scheduleAlarm(context, entry);
                valid.add(entry);
            }
        }
        storage.saveAlarms(valid);
    }
}
