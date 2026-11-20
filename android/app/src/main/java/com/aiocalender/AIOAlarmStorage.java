package com.aiocalender;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;

public class AIOAlarmStorage {
    private static final String PREF_NAME = "aio_alarm_storage";
    private static final String KEY_ALARMS = "stored_alarms";
    private final SharedPreferences prefs;

    public static class AlarmEntry {
        public int id;
        public String title;
        public String body;
        public long triggerTimeMs;
        public boolean vibrate;
        public String category;

        public JSONObject toJson() {
            try {
                JSONObject obj = new JSONObject();
                obj.put("id", id);
                obj.put("title", title);
                obj.put("body", body);
                obj.put("triggerTimeMs", triggerTimeMs);
                obj.put("vibrate", vibrate);
                obj.put("category", category != null ? category : "Alert");
                return obj;
            } catch (Exception e) {
                return null;
            }
        }

        public static AlarmEntry fromJson(JSONObject obj) {
            if (obj == null) return null;
            AlarmEntry entry = new AlarmEntry();
            entry.id = obj.optInt("id", 0);
            entry.title = obj.optString("title", "AIO Calender Reminder");
            entry.body = obj.optString("body", "");
            entry.triggerTimeMs = obj.optLong("triggerTimeMs", 0);
            entry.vibrate = obj.optBoolean("vibrate", true);
            entry.category = obj.optString("category", "Alert");
            return entry;
        }
    }

    public AIOAlarmStorage(Context context) {
        Context targetContext = context;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            try {
                Context deContext = context.createDeviceProtectedStorageContext();
                if (deContext != null) {
                    try {
                        deContext.moveSharedPreferencesFrom(context, PREF_NAME);
                    } catch (Throwable ignored) {
                    }
                    targetContext = deContext;
                }
            } catch (Throwable ignored) {
            }
        }
        this.prefs = targetContext.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
    }

    public synchronized void saveAlarms(List<AlarmEntry> list) {
        JSONArray arr = new JSONArray();
        if (list != null) {
            for (AlarmEntry item : list) {
                JSONObject obj = item.toJson();
                if (obj != null) {
                    arr.put(obj);
                }
            }
        }
        prefs.edit().putString(KEY_ALARMS, arr.toString()).apply();
    }

    public synchronized List<AlarmEntry> getAlarms() {
        List<AlarmEntry> list = new ArrayList<>();
        String raw = prefs.getString(KEY_ALARMS, null);
        if (raw == null || raw.trim().isEmpty()) {
            return list;
        }
        try {
            JSONArray arr = new JSONArray(raw);
            for (int i = 0; i < arr.length(); i++) {
                AlarmEntry entry = AlarmEntry.fromJson(arr.getJSONObject(i));
                if (entry != null) {
                    list.add(entry);
                }
            }
        } catch (Exception ignored) {
        }
        return list;
    }

    public synchronized void removeAlarm(int id) {
        List<AlarmEntry> current = getAlarms();
        List<AlarmEntry> filtered = new ArrayList<>();
        for (AlarmEntry e : current) {
            if (e.id != id) {
                filtered.add(e);
            }
        }
        saveAlarms(filtered);
    }

    public synchronized void clearAlarms() {
        prefs.edit().remove(KEY_ALARMS).apply();
    }
}
