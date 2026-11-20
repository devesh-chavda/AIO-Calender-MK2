package com.aiocalender;

import android.app.AlarmManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(name = "AIOAlarm")
public class AIOAlarmPlugin extends Plugin {

    @PluginMethod
    public void scheduleAlarms(PluginCall call) {
        JSArray alarmsArray = call.getArray("alarms");
        if (alarmsArray == null) {
            call.reject("Missing 'alarms' array");
            return;
        }

        Context context = getContext();
        AIOAlarmScheduler.cancelAll(context);

        List<AIOAlarmStorage.AlarmEntry> entries = new ArrayList<>();
        int count = 0;

        try {
            JSONArray jsonArr = alarmsArray;
            for (int i = 0; i < jsonArr.length(); i++) {
                JSONObject obj = jsonArr.getJSONObject(i);
                AIOAlarmStorage.AlarmEntry entry = new AIOAlarmStorage.AlarmEntry();
                entry.id = obj.optInt("id", (int) (System.currentTimeMillis() % 1000000) + i);
                entry.title = obj.optString("title", "Lecture Reminder");
                entry.body = obj.optString("body", "");
                entry.triggerTimeMs = obj.optLong("triggerTimeMs", 0);
                entry.vibrate = obj.optBoolean("vibrate", true);
                entry.category = obj.optString("category", "Alert");

                if (entry.triggerTimeMs > System.currentTimeMillis()) {
                    AIOAlarmScheduler.scheduleAlarm(context, entry);
                    entries.add(entry);
                    count++;
                }
            }

            new AIOAlarmStorage(context).saveAlarms(entries);

            JSObject ret = new JSObject();
            ret.put("scheduledCount", count);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to schedule alarms: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void cancelAll(PluginCall call) {
        AIOAlarmScheduler.cancelAll(getContext());
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void scheduleTestAlarm(PluginCall call) {
        Context context = getContext();
        boolean vibrate = call.getBoolean("vibrate", true);

        AIOAlarmReceiver.ensureChannels(context);

        AIOAlarmStorage.AlarmEntry entry = new AIOAlarmStorage.AlarmEntry();
        entry.id = 99999;
        entry.title = vibrate ? "🔔 Lecture Alert (Vibrate ON)" : "🤫 Lecture Alert (Silent Mode)";
        entry.body = "AIO Calender MK2 alarm clock triggered successfully! This bypasses Doze & power-saving modes.";
        entry.triggerTimeMs = System.currentTimeMillis() + 5000;
        entry.vibrate = vibrate;
        entry.category = "Test";

        AIOAlarmScheduler.scheduleAlarm(context, entry);

        JSObject ret = new JSObject();
        ret.put("ok", true);
        ret.put("message", "Test alarm scheduled for 5 seconds from now. Lock your screen to see it wake up!");
        call.resolve(ret);
    }

    @PluginMethod
    public void checkDiagnostics(PluginCall call) {
        Context context = getContext();
        String packageName = context.getPackageName();

        boolean isBatteryIgnored = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                isBatteryIgnored = pm.isIgnoringBatteryOptimizations(packageName);
            }
        }

        boolean canScheduleExact = AIOAlarmScheduler.canScheduleExactAlarms(context);
        boolean areNotificationsEnabled = NotificationManagerCompat.from(context).areNotificationsEnabled();

        JSObject ret = new JSObject();
        ret.put("isBatteryOptimizationIgnored", isBatteryIgnored);
        ret.put("canScheduleExactAlarms", canScheduleExact);
        ret.put("areNotificationsEnabled", areNotificationsEnabled);
        ret.put("manufacturer", Build.MANUFACTURER != null ? Build.MANUFACTURER.toLowerCase() : "");
        ret.put("model", Build.MODEL != null ? Build.MODEL : "");
        ret.put("sdkVersion", Build.VERSION.SDK_INT);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestIgnoreBatteryOptimization(PluginCall call) {
        Context context = getContext();
        String packageName = context.getPackageName();
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                intent.setData(Uri.parse("package:" + packageName));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(intent);
            }
            JSObject ret = new JSObject();
            ret.put("ok", true);
            call.resolve(ret);
        } catch (Exception e) {
            openBatterySettings(call);
        }
    }

    @PluginMethod
    public void openBatterySettings(PluginCall call) {
        Context context = getContext();
        String packageName = context.getPackageName();
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.parse("package:" + packageName));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
            JSObject ret = new JSObject();
            ret.put("ok", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not open battery settings: " + e.getMessage());
        }
    }

    @PluginMethod
    public void openExactAlarmSettings(PluginCall call) {
        Context context = getContext();
        String packageName = context.getPackageName();
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
                intent.setData(Uri.parse("package:" + packageName));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(intent);
            }
            JSObject ret = new JSObject();
            ret.put("ok", true);
            call.resolve(ret);
        } catch (Exception e) {
            openBatterySettings(call);
        }
    }

    @PluginMethod
    public void openAutostartSettings(PluginCall call) {
        Context context = getContext();
        String manufacturer = Build.MANUFACTURER != null ? Build.MANUFACTURER.toLowerCase() : "";
        boolean launched = false;

        try {
            Intent intent = new Intent();
            if (manufacturer.contains("xiaomi") || manufacturer.contains("redmi") || manufacturer.contains("poco")) {
                intent.setComponent(new ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"));
            } else if (manufacturer.contains("samsung")) {
                // Galaxy S-series (including S24, S25, S26 Ultra) and One UI 5 / 6 / 7 / 8
                String[][] samsungTargets = {
                    {"com.samsung.android.sm", "com.samsung.android.sm.battery.ui.UsageLimitsActivity"},
                    {"com.samsung.android.lool", "com.samsung.android.sm.battery.ui.UsageLimitsActivity"},
                    {"com.samsung.android.lool", "com.samsung.android.sm.ui.battery.BatteryActivity"},
                    {"com.samsung.android.sm", "com.samsung.android.sm.ui.battery.BatteryActivity"},
                    {"com.samsung.android.sm", "com.samsung.android.sm.battery.ui.BatteryActivity"},
                    {"com.samsung.android.lool", "com.samsung.android.sm.battery.ui.BatteryActivity"}
                };
                for (String[] target : samsungTargets) {
                    try {
                        Intent samsungIntent = new Intent();
                        samsungIntent.setComponent(new ComponentName(target[0], target[1]));
                        samsungIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        context.startActivity(samsungIntent);
                        launched = true;
                        break;
                    } catch (Exception ignored) {
                    }
                }
            } else if (manufacturer.contains("oneplus") || manufacturer.contains("oppo") || manufacturer.contains("realme")) {
                intent.setComponent(new ComponentName("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"));
            } else if (manufacturer.contains("vivo") || manufacturer.contains("iqoo")) {
                intent.setComponent(new ComponentName("com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity"));
            } else if (manufacturer.contains("huawei") || manufacturer.contains("honor")) {
                intent.setComponent(new ComponentName("com.huawei.systemmanager", "com.huawei.systemmanager.optimize.process.ProtectActivity"));
            }

            if (intent.getComponent() != null) {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(intent);
                launched = true;
            }
        } catch (Exception ignored) {
        }

        if (!launched) {
            openBatterySettings(call);
        } else {
            JSObject ret = new JSObject();
            ret.put("ok", true);
            call.resolve(ret);
        }
    }
}
