import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor, registerPlugin } from '@capacitor/core';

// Native AIOAlarm Plugin (powered by Android AlarmManager.setAlarmClock)
const AIOAlarm = registerPlugin('AIOAlarm');

// Web fallback timer IDs when running in browser
let webTimers = [];

/**
 * Converts any string or timestamp ID into a safe positive 32-bit integer (1,000 .. 2,000,000,000).
 */
function toSafe32BitId(seedString) {
  let hash = 2166136261;
  const str = String(seedString);
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const positive = Math.abs(hash) % 1999990000;
  return positive + 1000;
}

function formatLeadLabel(minutes) {
  if (minutes >= 10080) return '1 week';
  if (minutes >= 1440) return `${Math.round(minutes / 1440)} day${minutes >= 2880 ? 's' : ''}`;
  if (minutes >= 60) return `${Math.round(minutes / 60)} hour${minutes >= 120 ? 's' : ''}`;
  return `${minutes} mins`;
}

// 1. Setup Notification Channels & Permissions
export async function setupNotifications() {
  if (!Capacitor.isNativePlatform()) {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch {
        // Ignore browser permission errors
      }
    }
    return typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted';
  }

  try {
    let perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') {
      perm = await LocalNotifications.requestPermissions();
    }

    // Channel 1: High Importance + Vibration
    await LocalNotifications.createChannel({
      id: 'aio-vibrate-v2',
      name: 'AIO Alerts (Vibrate)',
      description: 'Exact lecture and deadline reminders with vibration',
      importance: 5,
      visibility: 1,
      vibration: true,
      lights: true,
    });

    // Channel 2: High Importance, Silent
    await LocalNotifications.createChannel({
      id: 'aio-silent-v2',
      name: 'AIO Alerts (Silent)',
      description: 'Exact lecture and deadline reminders without vibration',
      importance: 5,
      visibility: 1,
      vibration: false,
      lights: true,
    });

    return perm.display === 'granted';
  } catch (error) {
    console.warn("Could not register Capacitor channels, falling back to native channel manager:", error);
    return true;
  }
}

// 2. Comprehensive Diagnostics (Battery Optimization, Exact Alarms, Permissions, OEM)
export async function getNotificationStatus() {
  if (!Capacitor.isNativePlatform()) {
    const webPerm = typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported';
    return {
      isNative: false,
      displayPermission: webPerm,
      exactAlarmStatus: 'web-timer',
      isBatteryIgnored: true,
      manufacturer: 'browser',
      model: navigator.userAgent,
    };
  }

  try {
    let nativeDiag = {
      isBatteryOptimizationIgnored: true,
      canScheduleExactAlarms: true,
      areNotificationsEnabled: true,
      manufacturer: '',
      model: '',
    };

    if (AIOAlarm && typeof AIOAlarm.checkDiagnostics === 'function') {
      try {
        nativeDiag = await AIOAlarm.checkDiagnostics();
      } catch (err) {
        console.warn("AIOAlarm.checkDiagnostics error:", err);
      }
    }

    const perm = await LocalNotifications.checkPermissions();

    return {
      isNative: true,
      displayPermission: perm.display || (nativeDiag.areNotificationsEnabled ? 'granted' : 'denied'),
      exactAlarmStatus: nativeDiag.canScheduleExactAlarms ? 'granted' : 'denied',
      isBatteryIgnored: nativeDiag.isBatteryOptimizationIgnored,
      manufacturer: nativeDiag.manufacturer || '',
      model: nativeDiag.model || '',
    };
  } catch {
    return {
      isNative: true,
      displayPermission: 'granted',
      exactAlarmStatus: 'granted',
      isBatteryIgnored: true,
      manufacturer: '',
      model: '',
    };
  }
}

// Request Battery Optimization Exemption ("Stop optimizing battery usage?")
export async function requestIgnoreBatteryOptimization() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    if (AIOAlarm && typeof AIOAlarm.requestIgnoreBatteryOptimization === 'function') {
      await AIOAlarm.requestIgnoreBatteryOptimization();
    }
  } catch (e) {
    console.error("Could not request battery optimization exemption:", e);
  }
}

// Open App Battery Settings (to choose "Unrestricted")
export async function openBatterySettings() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    if (AIOAlarm && typeof AIOAlarm.openBatterySettings === 'function') {
      await AIOAlarm.openBatterySettings();
    }
  } catch (e) {
    console.error("Could not open battery settings:", e);
  }
}

// Open Android system "Alarms & reminders" settings screen
export async function openExactAlarmSettings() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    if (AIOAlarm && typeof AIOAlarm.openExactAlarmSettings === 'function') {
      await AIOAlarm.openExactAlarmSettings();
    } else if (typeof LocalNotifications.changeExactNotificationSetting === 'function') {
      await LocalNotifications.changeExactNotificationSetting();
    } else {
      await LocalNotifications.requestPermissions();
    }
  } catch (error) {
    console.error("Could not open exact alarm settings:", error);
  }
}

// Open OEM Autostart / Background Manager (Xiaomi, Samsung, OnePlus, Oppo, Vivo)
export async function openAutostartSettings() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    if (AIOAlarm && typeof AIOAlarm.openAutostartSettings === 'function') {
      await AIOAlarm.openAutostartSettings();
    }
  } catch (e) {
    console.error("Could not open OEM autostart settings:", e);
  }
}

/**
 * Computes the next 4 weekly occurrences of a class lecture reminder
 * using local timezone and exact lead-time calculation.
 */
function getUpcomingLectureTriggers(lecture, leadMinutes, weeksToSchedule = 4) {
  const dayMap = {
    sunday: 0,
    sun: 0,
    monday: 1,
    mon: 1,
    tuesday: 2,
    tue: 2,
    wednesday: 3,
    wed: 3,
    thursday: 4,
    thu: 4,
    friday: 5,
    fri: 5,
    saturday: 6,
    sat: 6,
  };

  const rawDay = String(lecture.day || '').trim().toLowerCase();
  const targetDayIndex = dayMap[rawDay];
  if (targetDayIndex === undefined || !lecture.startTime) return [];

  const timeParts = String(lecture.startTime).trim().split(':').map(Number);
  const startHour = timeParts[0];
  const startMinute = timeParts[1];
  if (Number.isNaN(startHour) || Number.isNaN(startMinute)) return [];

  const now = new Date();
  const results = [];

  for (let weekOffset = 0; weekOffset < weeksToSchedule; weekOffset++) {
    const classDate = new Date(now);
    const currentDayIndex = now.getDay();
    let daysUntil = (targetDayIndex - currentDayIndex + 7) % 7;
    daysUntil += weekOffset * 7;

    classDate.setDate(now.getDate() + daysUntil);
    classDate.setHours(startHour, startMinute, 0, 0);

    const triggerDate = new Date(classDate.getTime() - leadMinutes * 60 * 1000);

    if (triggerDate > now) {
      results.push({ triggerDate, classDate, isImmediateCatchup: false });
    } else if (weekOffset === 0 && classDate > now) {
      // Class starts later today, inside the lead window.
      // Schedule an immediate heads-up in 10 seconds.
      const catchupDate = new Date(now.getTime() + 10 * 1000);
      if (catchupDate < classDate) {
        const minsLeft = Math.max(1, Math.round((classDate.getTime() - now.getTime()) / 60000));
        results.push({ triggerDate: catchupDate, classDate, isImmediateCatchup: true, minsLeft });
      }
    }
  }

  return results;
}

// 3. The Master Sync Engine (Bypasses Android Doze & Aggressive Power-Saving)
export async function syncAllAlarms(classes, tasks, settings) {
  if (!settings) return [];

  // Clear any existing web fallback timers
  webTimers.forEach((t) => clearTimeout(t));
  webTimers = [];

  const newAlarms = [];
  const usedIds = new Set();

  const allocateId = (key) => {
    let id = toSafe32BitId(key);
    while (usedIds.has(id)) {
      id = ((id + 1) % 1999990000) + 1000;
    }
    usedIds.add(id);
    return id;
  };

  const wantsVibration = settings.vibrateEnabled !== false;
  const activeChannel = wantsVibration ? 'aio-vibrate-v2' : 'aio-silent-v2';

  // A. Process Classes when "Lecture Alerts" checkbox is checked
  if (settings.classNotifs && Array.isArray(classes) && classes.length > 0) {
    const leadTime = parseInt(settings.classLeadTime || '10', 10);

    classes.forEach((lecture) => {
      const triggers = getUpcomingLectureTriggers(lecture, leadTime, 4);
      const locationStr = [
        lecture.building,
        lecture.room ? `Room ${lecture.room}` : '',
      ]
        .filter(Boolean)
        .join(' • ') || 'TBA';

      triggers.forEach((item, idx) => {
        const id = allocateId(`class-${lecture.id}-${idx}-${item.triggerDate.getTime()}`);
        const minsText = item.isImmediateCatchup ? `${item.minsLeft} mins` : `${leadTime} mins`;

        newAlarms.push({
          id,
          title: `📚 Class: ${lecture.courseCode ? `${lecture.courseCode} - ` : ''}${lecture.courseName}`,
          body: `Starts in ${minsText} (${lecture.startTime}) at ${locationStr}`,
          channelId: activeChannel,
          schedule: {
            at: item.triggerDate,
            allowWhileIdle: true,
          },
          smallIcon: 'ic_stat_icon_config_sample',
          extra: {
            category: 'Lecture',
            triggerIso: item.triggerDate.toISOString(),
          },
        });
      });
    });
  }

  // B. Process Tasks when "Task & Assignment Alerts" checkbox is checked
  if (settings.taskNotifs && Array.isArray(tasks) && tasks.length > 0) {
    const taskLead = parseInt(settings.taskLeadTime || '60', 10);
    const repeatFreq = settings.taskRepeatFrequency || 'once';
    const now = new Date();

    tasks.forEach((task) => {
      if (task.completed || !task.due || !task.time) return;

      const dueDate = new Date(`${task.due}T${task.time}:00`);
      if (Number.isNaN(dueDate.getTime()) || dueDate <= now) return;

      const triggerTimestamps = new Map();

      // 1. Primary lead-time alert
      const primaryTrigger = new Date(dueDate.getTime() - taskLead * 60 * 1000);
      if (primaryTrigger > now) {
        triggerTimestamps.set(primaryTrigger.getTime(), formatLeadLabel(taskLead));
      } else {
        const fifteenMinBefore = new Date(dueDate.getTime() - 15 * 60 * 1000);
        if (fifteenMinBefore > now) {
          triggerTimestamps.set(fifteenMinBefore.getTime(), '15 mins');
        } else {
          const catchup = new Date(now.getTime() + 15 * 1000);
          if (catchup < dueDate) {
            const minsRemaining = Math.max(1, Math.round((dueDate.getTime() - now.getTime()) / 60000));
            triggerTimestamps.set(catchup.getTime(), `${minsRemaining} mins`);
          }
        }
      }

      // 2. Repetition rules
      if (repeatFreq === 'hourly') {
        for (let h = 1; h <= 6; h++) {
          const hourlyTime = new Date(dueDate.getTime() - h * 60 * 60 * 1000);
          if (hourlyTime > now && hourlyTime >= primaryTrigger) {
            triggerTimestamps.set(hourlyTime.getTime(), `${h} hour${h > 1 ? 's' : ''}`);
          }
        }
      } else if (repeatFreq === 'daily') {
        for (let d = 0; d <= 7; d++) {
          const dayBase = new Date(dueDate);
          dayBase.setDate(dueDate.getDate() - d);

          [9, 20].forEach((digestHour) => {
            const digestDate = new Date(dayBase);
            digestDate.setHours(digestHour, 0, 0, 0);
            if (digestDate > now && digestDate < dueDate && digestDate >= primaryTrigger) {
              const hoursLeft = Math.max(1, Math.round((dueDate.getTime() - digestDate.getTime()) / 3600000));
              const label = hoursLeft >= 24 ? `${Math.round(hoursLeft / 24)}d` : `${hoursLeft}h`;
              if (!triggerTimestamps.has(digestDate.getTime())) {
                triggerTimestamps.set(digestDate.getTime(), label);
              }
            }
          });
        }
      }

      triggerTimestamps.forEach((timeLabel, ts) => {
        const triggerDate = new Date(ts);
        const id = allocateId(`task-${task.id}-${ts}`);
        newAlarms.push({
          id,
          title: `🎯 ${task.type || 'Task'}: ${task.title}`,
          body: `Due in ${timeLabel} (${task.due} at ${task.time})${task.location ? ` • ${task.location}` : ''}`,
          channelId: activeChannel,
          schedule: {
            at: triggerDate,
            allowWhileIdle: true,
          },
          smallIcon: 'ic_stat_icon_config_sample',
          extra: {
            category: 'Task',
            triggerIso: triggerDate.toISOString(),
          },
        });
      });
    });
  }

  // Sort chronologically
  newAlarms.sort((a, b) => a.schedule.at.getTime() - b.schedule.at.getTime());

  // C. Schedule through Native Alarm Clock (Bypasses Android Doze and OEM Throttling)
  if (Capacitor.isNativePlatform()) {
    try {
      await setupNotifications();

      // 1. Arm using native AlarmManager.setAlarmClock()
      if (AIOAlarm && typeof AIOAlarm.scheduleAlarms === 'function') {
        const nativeAlarmsPayload = newAlarms.map((a) => ({
          id: a.id,
          title: a.title,
          body: a.body,
          triggerTimeMs: a.schedule.at.getTime(),
          vibrate: wantsVibration,
          category: a.extra?.category || 'Lecture',
        }));

        if (nativeAlarmsPayload.length > 0) {
          await AIOAlarm.scheduleAlarms({ alarms: nativeAlarmsPayload });
        } else {
          await AIOAlarm.cancelAll();
        }
      }

      // 2. Also keep Capacitor LocalNotifications cleanly in sync as secondary
      const pending = await LocalNotifications.getPending();
      if (pending.notifications && pending.notifications.length > 0) {
        await LocalNotifications.cancel({ notifications: pending.notifications });
      }
    } catch (error) {
      console.error("Failed to sync alarms via native engine:", error);
    }
  } else if (typeof window !== 'undefined' && 'Notification' in window) {
    // Web browser fallback
    const nowMs = Date.now();
    newAlarms.forEach((alarm) => {
      const delayMs = alarm.schedule.at.getTime() - nowMs;
      if (delayMs > 0 && delayMs <= 24 * 60 * 60 * 1000) {
        const timerId = setTimeout(() => {
          if (Notification.permission === 'granted') {
            new Notification(alarm.title, { body: alarm.body });
          }
        }, delayMs);
        webTimers.push(timerId);
      }
    });
  }

  return newAlarms.map((a) => ({
    id: a.id,
    title: a.title,
    body: a.body,
    triggerAt: a.schedule.at,
    category: a.extra?.category || 'Alert',
  }));
}

// 4. Test Notification (Uses Native Alarm Clock to wake device even if locked)
export async function scheduleTestNotification(vibrateEnabled) {
  const wantsVibration = vibrateEnabled !== false;

  if (!Capacitor.isNativePlatform()) {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        setTimeout(() => {
          new Notification(
            wantsVibration ? 'AIO Calendar: Vibration ON 📳' : 'AIO Calendar: Silent Mode 🤫',
            { body: 'Test notification delivered successfully!' }
          );
        }, 5000);
        return { ok: true, message: 'Test scheduled! Notification will appear in 5 seconds.' };
      }
    }
    return { ok: false, message: 'Please allow browser notifications or test on your Android device.' };
  }

  try {
    await setupNotifications();

    if (AIOAlarm && typeof AIOAlarm.scheduleTestAlarm === 'function') {
      const res = await AIOAlarm.scheduleTestAlarm({ vibrate: wantsVibration });
      return { ok: true, message: res?.message || 'Test alarm scheduled! Lock your phone and wait 5 seconds.' };
    }

    const activeChannel = wantsVibration ? 'aio-vibrate-v2' : 'aio-silent-v2';
    await LocalNotifications.schedule({
      notifications: [
        {
          id: 99999,
          title: wantsVibration ? 'Vibration ON! 📳' : 'Silent Mode ON! 🤫',
          body: 'AIO Calendar Mk2 alarm is working properly.',
          channelId: activeChannel,
          schedule: {
            at: new Date(Date.now() + 5000),
            allowWhileIdle: true,
          },
          smallIcon: 'ic_stat_icon_config_sample',
        },
      ],
    });

    return { ok: true, message: 'Test alarm scheduled! Lock your phone and wait 5 seconds.' };
  } catch (error) {
    return { ok: false, message: `Test failed: ${error.message || String(error)}` };
  }
}
