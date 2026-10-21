import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

const isNative = Capacitor.isNativePlatform();

export const CHANNEL_REMINDERS = 'carecue_reminders';
export const CHANNEL_ALERTS = 'carecue_alerts';
export const ACTION_TYPE_DOSE = 'MEDICINE_DOSE_ACTIONS';

let channelsInitialized = false;
let listenersInitialized = false;

/**
 * Returns date in YYYY-MM-DD format
 */
export function dateKey(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

/**
 * Deterministic 31-bit positive integer hash for Android notification IDs
 */
export function stableId(value) {
  let hash = 2166136261;
  const str = String(value);
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) & 0x7fffffff) || 1;
}

/**
 * Robust time parser that handles 24h ('08:00', '14:30', '8:00')
 * and 12h ('8:00 AM', '08:00 pm', '2:15 PM') formats safely
 */
export function parseTimeParts(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const trimmed = timeStr.trim().toUpperCase();
  const isPM = trimmed.includes('PM');
  const isAM = trimmed.includes('AM');
  const clean = trimmed.replace(/[AP]M/, '').trim();
  const parts = clean.split(':').map((p) => parseInt(p, 10));

  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;

  let hours = parts[0];
  const minutes = parts[1];

  if (isPM && hours < 12) hours += 12;
  if (isAM && hours === 12) hours = 0;

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  return {
    hours,
    minutes,
    formatted24: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
  };
}

/**
 * Ensure Android 8.0+ notification channels and action types exist
 */
export async function setupChannels() {
  if (!isNative) return true;
  if (channelsInitialized) return true;

  try {
    // 1. Medicine reminder channel (high priority heads-up with vibration & lights)
    await LocalNotifications.createChannel({
      id: CHANNEL_REMINDERS,
      name: 'Medicine Reminders',
      description: 'Timely reminders for your scheduled medicine doses',
      importance: 5, // High / Heads-up alert
      visibility: 1, // Public on lock screen
      sound: 'beep.wav',
      vibration: true,
      lights: true,
      lightColor: '#087F73',
    });

    // 2. High priority alert channel for missed doses & caregiver notifications
    await LocalNotifications.createChannel({
      id: CHANNEL_ALERTS,
      name: 'Missed Dose & Caregiver Alerts',
      description: 'High-priority notifications when scheduled doses are overdue or missed',
      importance: 5,
      visibility: 1,
      vibration: true,
      lights: true,
      lightColor: '#DC2626',
    });

    // 3. Register quick actions for notifications (Mark Taken, Snooze)
    await LocalNotifications.registerActionTypes({
      types: [
        {
          id: ACTION_TYPE_DOSE,
          actions: [
            {
              id: 'TAKE_DOSE',
              title: '✓ Mark Taken',
              foreground: false,
            },
            {
              id: 'SNOOZE_DOSE',
              title: '⏱ Snooze 15m',
              foreground: false,
            },
          ],
        },
      ],
    });

    channelsInitialized = true;
    return true;
  } catch (err) {
    console.warn('[CareCue] Notification channels/actions setup notice:', err);
    return false;
  }
}

/**
 * Setup listeners for notification actions (user taps Mark Taken or Snooze from notification)
 */
export function setupActionListeners() {
  if (!isNative || listenersInitialized) return;

  try {
    LocalNotifications.addListener('localNotificationActionPerformed', async (action) => {
      try {
        const actionId = action.actionId;
        const notification = action.notification;
        const extra = notification?.extra || {};

        console.log('[CareCue Native] Notification action performed:', actionId, extra);

        if (actionId === 'TAKE_DOSE') {
          // Broadcast event for UI and persistence
          window.dispatchEvent(
            new CustomEvent('carecue:notification-action', {
              detail: { action: 'taken', ...extra },
            })
          );
        } else if (actionId === 'SNOOZE_DOSE') {
          // Schedule snooze for 15 minutes from now
          await scheduleSnooze(
            { id: extra.medicineId, name: extra.medicineName || 'Medicine' },
            15
          );
          window.dispatchEvent(
            new CustomEvent('carecue:notification-action', {
              detail: { action: 'snooze', minutes: 15, ...extra },
            })
          );
        } else {
          // User tapped the notification body directly
          window.dispatchEvent(
            new CustomEvent('carecue:notification-click', {
              detail: extra,
            })
          );
        }
      } catch (e) {
        console.error('[CareCue] Error handling notification action:', e);
      }
    });

    LocalNotifications.addListener('localNotificationReceived', (notification) => {
      console.log('[CareCue Native] Notification received by device:', notification.id);
      window.dispatchEvent(
        new CustomEvent('carecue:notification-received', {
          detail: notification,
        })
      );
    });

    listenersInitialized = true;
  } catch (err) {
    console.warn('[CareCue] Could not attach notification listeners:', err);
  }
}

/**
 * Check permission status
 */
export async function checkPermission() {
  if (!isNative) {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return {
        display: Notification.permission === 'granted' ? 'granted' : Notification.permission === 'denied' ? 'denied' : 'prompt',
        isNative: false,
        supported: true,
      };
    }
    return { display: 'denied', isNative: false, supported: false };
  }

  try {
    const status = await LocalNotifications.checkPermissions();
    return {
      display: status.display,
      isNative: true,
      supported: true,
    };
  } catch (err) {
    console.warn('[CareCue] Failed to check permissions:', err);
    return { display: 'denied', isNative: true, supported: true, error: String(err) };
  }
}

/**
 * Request notification permission from the system
 */
export async function enable() {
  await setupChannels();
  setupActionListeners();

  if (!isNative) {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') return true;
      const res = await Notification.requestPermission();
      return res === 'granted';
    }
    return false;
  }

  try {
    let permission = await LocalNotifications.checkPermissions();
    if (permission.display !== 'granted') {
      permission = await LocalNotifications.requestPermissions();
    }
    return permission.display === 'granted';
  } catch (err) {
    console.error('[CareCue] Error requesting notification permission:', err);
    return false;
  }
}

/**
 * Reschedule medicine reminders for the upcoming 7 days
 * Avoids Android AlarmManager intent explosion by scheduling up to 64 earliest pending doses
 */
export async function reschedule(medicines, logsOrEvents = []) {
  if (!isNative) {
    return { scheduled: 0, permission: false, isNative: false };
  }

  await setupChannels();
  setupActionListeners();

  try {
    const permission = await LocalNotifications.checkPermissions();
    if (permission.display !== 'granted') {
      return { scheduled: 0, permission: false, isNative: true };
    }

    // Cancel existing pending notifications cleanly before scheduling fresh list
    const pending = await LocalNotifications.getPending();
    if (pending.notifications?.length) {
      await LocalNotifications.cancel({
        notifications: pending.notifications.map((n) => ({ id: n.id })),
      });
    }

    const now = new Date();
    const notifications = [];

    // Schedule across next 7 days (lookahead window)
    for (let offset = 0; offset < 7; offset++) {
      const dayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
      const day = dateKey(dayDate);

      for (const medicine of medicines || []) {
        if (!medicine) continue;

        // Skip as_needed medicines (they are taken on demand, no fixed alarms)
        if (medicine.frequency === 'as_needed') continue;

        // Support both start_date/end_date and start/end property names
        const startDate = medicine.start_date || medicine.start;
        const endDate = medicine.end_date || medicine.end;

        if (startDate && startDate > day) continue;
        if (endDate && endDate < day) continue;

        const times = Array.isArray(medicine.times) ? medicine.times : [];
        if (!times.length) continue;

        for (const rawTime of times) {
          const parsed = parseTimeParts(rawTime);
          if (!parsed) continue;

          const time24 = parsed.formatted24;
          const eventKey = `${medicine.id}|${day}|${time24}`;

          // Check if dose has already been marked taken, skipped, or acknowledged
          const alreadyLogged = (logsOrEvents || []).some((item) => {
            if (!item) return false;
            // Match DoseLog format
            if (
              item.medicine_id === medicine.id &&
              item.scheduled_date === day &&
              item.scheduled_time === time24 &&
              (item.status === 'taken' || item.status === 'skipped')
            ) {
              return true;
            }
            // Match ActivityEntry format
            if (item.key === eventKey && (item.kind === 'ack' || item.kind === 'dose')) {
              return true;
            }
            return false;
          });

          if (alreadyLogged) continue;

          const scheduleAt = new Date(
            dayDate.getFullYear(),
            dayDate.getMonth(),
            dayDate.getDate(),
            parsed.hours,
            parsed.minutes,
            0,
            0
          );

          // Only schedule reminders strictly in the future (minimum 15 seconds ahead)
          if (scheduleAt.getTime() <= now.getTime() + 15000) continue;

          const medName = medicine.name || 'Prescription dose';
          const instructions = medicine.notes ? ` · ${medicine.notes}` : ' · Please take as directed';

          notifications.push({
            id: stableId(`carecue|${eventKey}`),
            title: `CareCue · ${medName}`,
            body: `Scheduled for ${time24}${instructions}`,
            channelId: CHANNEL_REMINDERS,
            actionTypeId: ACTION_TYPE_DOSE,
            schedule: {
              at: scheduleAt,
              allowWhileIdle: true, // Crucial for Android Doze mode
            },
            extra: {
              medicineId: medicine.id,
              medicineName: medName,
              date: day,
              time: time24,
              eventKey,
            },
          });
        }
      }
    }

    // Sort chronologically and cap to earliest 64 reminders to preserve battery and alarm limits
    notifications.sort((a, b) => a.schedule.at.getTime() - b.schedule.at.getTime());
    const cappedNotifications = notifications.slice(0, 64);

    if (cappedNotifications.length) {
      await LocalNotifications.schedule({ notifications: cappedNotifications });
    }

    console.log(`[CareCue Native] Scheduled ${cappedNotifications.length} reminder(s).`);

    return {
      scheduled: cappedNotifications.length,
      permission: true,
      isNative: true,
    };
  } catch (err) {
    console.error('[CareCue Native] Reschedule error:', err);
    return { scheduled: 0, permission: false, isNative: true, error: String(err) };
  }
}

/**
 * Schedule an immediate snooze reminder for a medicine (e.g. 15 minutes from now)
 */
export async function scheduleSnooze(medicine, minutes = 15) {
  if (!isNative) return false;
  await setupChannels();

  try {
    const at = new Date(Date.now() + minutes * 60 * 1000);
    const snoozeId = stableId(`carecue|snooze|${medicine.id || 'dose'}|${at.getTime()}`);

    await LocalNotifications.schedule({
      notifications: [
        {
          id: snoozeId,
          title: `CareCue · Snoozed Reminder: ${medicine.name || 'Medicine'}`,
          body: `Snoozed dose is now due. Please take your prescribed medicine.`,
          channelId: CHANNEL_REMINDERS,
          actionTypeId: ACTION_TYPE_DOSE,
          schedule: {
            at,
            allowWhileIdle: true,
          },
          extra: {
            medicineId: medicine.id,
            medicineName: medicine.name,
            isSnooze: true,
          },
        },
      ],
    });

    console.log(`[CareCue Native] Scheduled ${minutes}m snooze for ${medicine.name}`);
    return true;
  } catch (err) {
    console.error('[CareCue Native] Snooze scheduling error:', err);
    return false;
  }
}

/**
 * Send an immediate missed/overdue dose alert
 */
export async function sendMissedDoseAlert(medicineName, scheduledTime) {
  if (!isNative) return false;
  await setupChannels();

  try {
    const id = stableId(`carecue|missed|${medicineName}|${Date.now()}`);
    await LocalNotifications.schedule({
      notifications: [
        {
          id,
          title: `CareCue · Overdue Dose: ${medicineName}`,
          body: `The dose scheduled for ${scheduledTime || 'earlier today'} has not been logged.`,
          channelId: CHANNEL_ALERTS,
          schedule: {
            at: new Date(Date.now() + 1000), // Fire immediately (1 sec)
            allowWhileIdle: true,
          },
          extra: {
            medicineName,
            isMissedAlert: true,
          },
        },
      ],
    });
    return true;
  } catch (err) {
    console.warn('[CareCue Native] Missed dose alert error:', err);
    return false;
  }
}

/**
 * Deliver a test notification within 3 seconds to verify channel, sound, and heads-up presentation
 */
export async function sendTestNotification() {
  await setupChannels();

  if (!isNative) {
    // Web fallback
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      new Notification('CareCue Test Reminder', {
        body: 'Sound, vibration, and reminders are active! Ready for your medicine schedule.',
        icon: '/assets/logo.png',
      });
      return true;
    }
    return false;
  }

  try {
    const testId = stableId(`carecue|test|${Date.now()}`);
    await LocalNotifications.schedule({
      notifications: [
        {
          id: testId,
          title: 'CareCue · Test Reminder',
          body: 'Native Android notification sound, vibration, and channels are working correctly!',
          channelId: CHANNEL_REMINDERS,
          actionTypeId: ACTION_TYPE_DOSE,
          schedule: {
            at: new Date(Date.now() + 2000), // 2 seconds from now
            allowWhileIdle: true,
          },
          extra: {
            isTest: true,
          },
        },
      ],
    });
    return true;
  } catch (err) {
    console.error('[CareCue Native] Test notification error:', err);
    return false;
  }
}

/**
 * Get count of all currently pending scheduled notifications
 */
export async function getPendingCount() {
  if (!isNative) return 0;
  try {
    const pending = await LocalNotifications.getPending();
    return pending.notifications?.length || 0;
  } catch {
    return 0;
  }
}

/**
 * Cancel all pending reminders
 */
export async function cancelAll() {
  if (!isNative) return;
  try {
    const pending = await LocalNotifications.getPending();
    if (pending.notifications?.length) {
      await LocalNotifications.cancel({
        notifications: pending.notifications.map((n) => ({ id: n.id })),
      });
    }
  } catch (err) {
    console.warn('[CareCue] Cancel all error:', err);
  }
}

// Attach to window for global access across scripts
if (typeof window !== 'undefined') {
  window.CareCueNotifications = {
    isNative,
    setupChannels,
    checkPermission,
    enable,
    requestPermission: enable,
    reschedule,
    scheduleSnooze,
    sendMissedDoseAlert,
    sendTestNotification,
    getPendingCount,
    cancelAll,
    parseTimeParts,
    stableId,
  };

  // Auto-initialize channels and listeners if running on native device
  if (isNative) {
    setupChannels().catch(() => {});
    setupActionListeners();
  }
}
