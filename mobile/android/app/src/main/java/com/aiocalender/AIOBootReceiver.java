package com.aiocalender;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class AIOBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null) return;
        String action = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action)
            || Intent.ACTION_LOCKED_BOOT_COMPLETED.equals(action)
            || "android.intent.action.QUICKBOOT_POWERON".equals(action)
            || "com.htc.intent.action.QUICKBOOT_POWERON".equals(action)) {
            try {
                AIOAlarmScheduler.rescheduleAll(context);
            } catch (Throwable t) {
                t.printStackTrace();
            }
        }
    }
}
