import { Capacitor } from '@capacitor/core';
import {
  LocalNotifications,
  PermissionStatus as CapPermissionStatus,
  PendingResult,
} from '@capacitor/local-notifications';
import { Medicine, DoseLog } from '../types';

/**
 * Android Notification Channels
 * Android 8.0+ (Oreo, API 26+) requires notifications to target an explicit NotificationChannel.
 */
export const ANDROID_CHANNEL_REMINDERS = 'carecue_reminders';
export const ANDROID_CHANNEL_ALERTS = 'carecue_alerts';

/**
 * Android Notification Action Types
 * Enables inline heads-up action buttons ('Mark Taken' and 'Snooze') on Android.
 */
export const ANDROID_ACTION_TYPE_DOSE = 'MEDICINE_DOSE_ACTIONS';
export const ANDROID_ACTION_TAKE = 'TAKE_DOSE';
export const ANDROID_ACTION_SNOOZE = 'SNOOZE_DOSE';

/**
 * Android AlarmManager limit protection:
 * Android allows a finite number of active exact alarms per app before throwing an exception
 * or dropping schedules. We cap the active queue at 64 items over a 7-day lookahead.
 */
export const ANDROID_MAX_SCHEDULED_NOTIFICATIONS = 64;
export const ANDROID_LOOKAHEAD_DAYS = 7;

export interface AndroidNotificationPermissionResult {
  granted: boolean;
  state: 'granted' | 'denied' | 'prompt';
  isAndroid: boolean;
  isNative: boolean;
  supported: boolean;
}

export interface AndroidScheduleResult {
  scheduled: number;
  permission: boolean;
  isNative: boolean;
  channelReady: boolean;
}

/**
 * Deterministic 31-bit positive integer hash for Android notification IDs.
 * Android NotificationManager and AlarmManager require 32-bit signed integers (positive range: 1 to 2,147,483,647).
 */
export function generateAndroidNotificationId(key: string): number {
  let hash = 2166136261;
  const str = String(key);
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) & 0x7fffffff) || 1;
}

/**
 * Helper to parse time strings ('08:00', '14:30', '8:00 AM', '2:15 PM') into 24h hours/minutes
 */
export function parseAndroidTime(timeStr: string): { hours: number; minutes: number; formatted24: string } | null {
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
 * Format local Date to 'YYYY-MM-DD'
 */
export function formatLocalDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

/**
 * NotificationService
 * Centralized service for Capacitor LocalNotifications with Android native scoping.
 */
class NotificationServiceImpl {
  private channelsCreated = false;
  private listenersAttached = false;

  /**
   * Check if running on Android native platform (Capacitor Android APK)
   */
  public isAndroid(): boolean {
    const isCapNative = Capacitor.isNativePlatform();
    const platform = Capacitor.getPlatform();
    return isCapNative && platform === 'android';
  }

  /**
   * Check if running on any Capacitor native platform or Android APK environment
   */
  public isNative(): boolean {
    if (Capacitor.isNativePlatform()) return true;
    if (typeof window !== 'undefined') {
      const win = window as unknown as { CareCueNotifications?: { isNative?: boolean } };
      if (win.CareCueNotifications?.isNative) return true;
    }
    return false;
  }

  /**
   * Initialize Android 8.0+ Notification Channels and Action Types
   * Configures importance: 5 (IMPORTANCE_HIGH - heads-up banner and audible sound),
   * visibility: 1 (VISIBILITY_PUBLIC - shown on lock screen), LED lights, and custom sound.
   */
  public async initializeAndroidChannels(): Promise<boolean> {
    if (!this.isNative()) return false;
    if (this.channelsCreated) return true;

    try {
      // 1. Primary Medicine Reminders Channel (High Importance, Audible, Heads-up)
      await LocalNotifications.createChannel({
        id: ANDROID_CHANNEL_REMINDERS,
        name: 'Medicine Reminders',
        description: 'Timely notifications for scheduled medication doses',
        importance: 5, // High priority heads-up
        visibility: 1, // Visible on secure lock screen
        sound: 'beep.wav',
        vibration: true,
        lights: true,
        lightColor: '#087F73',
      });

      // 2. Urgent Missed Dose & Overdue Alert Channel
      await LocalNotifications.createChannel({
        id: ANDROID_CHANNEL_ALERTS,
        name: 'Missed Dose & Caregiver Alerts',
        description: 'High-priority alerts when a dose is overdue or missed',
        importance: 5,
        visibility: 1,
        vibration: true,
        lights: true,
        lightColor: '#DC2626',
      });

      // 3. Android Action Types (Buttons in Android Notification Shade)
      await LocalNotifications.registerActionTypes({
        types: [
          {
            id: ANDROID_ACTION_TYPE_DOSE,
            actions: [
              {
                id: ANDROID_ACTION_TAKE,
                title: '✓ Mark Taken',
                foreground: false, // Completes action in background without forcing app to front
              },
              {
                id: ANDROID_ACTION_SNOOZE,
                title: '⏱ Snooze 15m',
                foreground: false,
              },
            ],
          },
        ],
      });

      this.channelsCreated = true;
      return true;
    } catch (e) {
      console.warn('[NotificationService] Android channels setup note:', e);
      return false;
    }
  }

  /**
   * Check Android notification permission status (Android 13+ POST_NOTIFICATIONS)
   */
  public async checkPermissions(): Promise<AndroidNotificationPermissionResult> {
    const isAndroidNative = this.isAndroid();
    const isNativeAny = this.isNative();

    if (isNativeAny) {
      try {
        const status: CapPermissionStatus = await LocalNotifications.checkPermissions();
        const granted = status.display === 'granted';
        return {
          granted,
          state: granted ? 'granted' : status.display === 'denied' ? 'denied' : 'prompt',
          isAndroid: isAndroidNative,
          isNative: true,
          supported: true,
        };
      } catch {
        return {
          granted: false,
          state: 'denied',
          isAndroid: isAndroidNative,
          isNative: true,
          supported: true,
        };
      }
    }

    // Web Fallback Check
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const granted = Notification.permission === 'granted';
      return {
        granted,
        state: granted ? 'granted' : Notification.permission === 'denied' ? 'denied' : 'prompt',
        isAndroid: false,
        isNative: false,
        supported: true,
      };
    }

    return {
      granted: false,
      state: 'denied',
      isAndroid: false,
      isNative: false,
      supported: false,
    };
  }

  /**
   * Request Android notification permissions (displays native Android permission dialog)
   */
  public async requestPermissions(): Promise<boolean> {
    await this.initializeAndroidChannels();

    if (this.isNative()) {
      try {
        let status = await LocalNotifications.checkPermissions();
        if (status.display !== 'granted') {
          status = await LocalNotifications.requestPermissions();
        }
        return status.display === 'granted';
      } catch (e) {
        console.error('[NotificationService] Android permission request error:', e);
        return false;
      }
    }

    // Web Fallback Request
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') return true;
      try {
        const res = await Notification.requestPermission();
        return res === 'granted';
      } catch {
        return false;
      }
    }

    return false;
  }

  /**
   * Attach Android Notification Action and Delivery Listeners
   * Captures button clicks from Android notification shade (e.g., '✓ Mark Taken', '⏱ Snooze 15m')
   */
  public setupAndroidListeners(
    onAction?: (detail: { action: 'taken' | 'snooze' | string; medicineId?: string; medicineName?: string; time?: string }) => void
  ): void {
    if (!this.isNative() || this.listenersAttached) return;

    try {
      LocalNotifications.addListener('localNotificationActionPerformed', (notificationAction) => {
        const actionId = notificationAction.actionId;
        const extra = notificationAction.notification.extra || {};
        const medicineId = (extra.medicineId as string) || '';
        const medicineName = (extra.medicineName as string) || (extra.name as string) || 'Medicine';
        const time = (extra.time as string) || '';

        let resolvedAction: 'taken' | 'snooze' | string = actionId;
        if (actionId === ANDROID_ACTION_TAKE || actionId === 'TAKE_DOSE') {
          resolvedAction = 'taken';
        } else if (actionId === ANDROID_ACTION_SNOOZE || actionId === 'SNOOZE_DOSE') {
          resolvedAction = 'snooze';
        }

        // Trigger callback if supplied
        if (onAction) {
          onAction({ action: resolvedAction, medicineId, medicineName, time });
        }

        // Dispatch browser custom event for components
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('carecue:notification-action', {
              detail: {
                action: resolvedAction,
                medicineId,
                medicineName,
                time,
                notificationId: notificationAction.notification.id,
              },
            })
          );
        }
      });

      this.listenersAttached = true;
    } catch (e) {
      console.warn('[NotificationService] Listeners setup note:', e);
    }
  }

  /**
   * Synchronize scheduled native Android notifications.
   * Scoped specifically to Android requirements:
   * - Uses Android channels (carecue_reminders)
   * - allowWhileIdle: true to fire during Android Doze mode
   * - Deterministic 31-bit positive integer IDs
   * - Capped to 64 items to strictly honor Android AlarmManager quota limits
   * - Filters out already-taken or skipped doses
   */
  public async syncReminders(
    medicines: Medicine[],
    doseLogs: DoseLog[] = []
  ): Promise<AndroidScheduleResult> {
    if (!this.isNative()) {
      return { scheduled: 0, permission: false, isNative: false, channelReady: false };
    }

    const channelReady = await this.initializeAndroidChannels();

    try {
      const permission = await LocalNotifications.checkPermissions();
      if (permission.display !== 'granted') {
        return { scheduled: 0, permission: false, isNative: true, channelReady };
      }

      // Cancel existing pending notifications before scheduling new batch
      const pending = await LocalNotifications.getPending();
      if (pending.notifications?.length) {
        await LocalNotifications.cancel({
          notifications: pending.notifications.map((n) => ({ id: n.id })),
        });
      }

      const now = new Date();
      const notificationsToSchedule: Array<{
        id: number;
        title: string;
        body: string;
        channelId: string;
        actionTypeId: string;
        schedule: { at: Date; allowWhileIdle: boolean };
        extra: Record<string, unknown>;
      }> = [];

      for (let offset = 0; offset < ANDROID_LOOKAHEAD_DAYS; offset++) {
        const dayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
        const dayStr = formatLocalDateKey(dayDate);

        for (const medicine of medicines || []) {
          if (!medicine || medicine.frequency === 'as_needed') continue;

          const startDate = medicine.start_date;
          const endDate = medicine.end_date;

          if (startDate && startDate > dayStr) continue;
          if (endDate && endDate < dayStr) continue;

          const times = Array.isArray(medicine.times) ? medicine.times : [];
          if (!times.length) continue;

          for (const rawTime of times) {
            const parsed = parseAndroidTime(rawTime);
            if (!parsed) continue;

            const time24 = parsed.formatted24;
            const eventKey = `${medicine.id}|${dayStr}|${time24}`;

            // Check if dose has already been recorded
            const alreadyLogged = doseLogs.some(
              (log) =>
                log.medicine_id === medicine.id &&
                log.scheduled_date === dayStr &&
                log.scheduled_time === time24 &&
                (log.status === 'taken' || log.status === 'skipped')
            );

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

            // Must be at least 10 seconds into the future
            if (scheduleAt.getTime() <= now.getTime() + 10000) continue;

            const dosageInfo = medicine.dosage ? ` (${medicine.dosage})` : '';
            const instructions = medicine.notes ? ` · ${medicine.notes}` : ' · Tap to mark taken';

            notificationsToSchedule.push({
              id: generateAndroidNotificationId(`carecue|${eventKey}`),
              title: `CareCue · ${medicine.name}${dosageInfo}`,
              body: `Scheduled for ${time24}${instructions}`,
              channelId: ANDROID_CHANNEL_REMINDERS,
              actionTypeId: ANDROID_ACTION_TYPE_DOSE,
              schedule: {
                at: scheduleAt,
                allowWhileIdle: true, // Required for Android Doze mode
              },
              extra: {
                medicineId: medicine.id,
                medicineName: medicine.name,
                date: dayStr,
                time: time24,
                eventKey,
              },
            });
          }
        }
      }

      // Sort by earliest trigger time and cap at Android limit
      notificationsToSchedule.sort((a, b) => a.schedule.at.getTime() - b.schedule.at.getTime());
      const capped = notificationsToSchedule.slice(0, ANDROID_MAX_SCHEDULED_NOTIFICATIONS);

      if (capped.length > 0) {
        await LocalNotifications.schedule({ notifications: capped });
      }

      return {
        scheduled: capped.length,
        permission: true,
        isNative: true,
        channelReady,
      };
    } catch (err) {
      console.error('[NotificationService] Android reminder scheduling error:', err);
      return { scheduled: 0, permission: false, isNative: true, channelReady };
    }
  }

  /**
   * Schedule an Android Snooze Reminder (default 15 minutes)
   */
  public async scheduleSnooze(
    medicine: { id?: string; name: string },
    minutes = 15
  ): Promise<boolean> {
    if (!this.isNative()) return false;

    await this.initializeAndroidChannels();

    try {
      const at = new Date(Date.now() + minutes * 60 * 1000);
      const snoozeId = generateAndroidNotificationId(`carecue|snooze|${medicine.id || 'dose'}|${at.getTime()}`);

      await LocalNotifications.schedule({
        notifications: [
          {
            id: snoozeId,
            title: `CareCue · Snoozed: ${medicine.name}`,
            body: `Your snoozed medication dose is now due. Please take your prescribed dose.`,
            channelId: ANDROID_CHANNEL_REMINDERS,
            actionTypeId: ANDROID_ACTION_TYPE_DOSE,
            schedule: {
              at,
              allowWhileIdle: true, // Android Doze mode
            },
            extra: {
              medicineId: medicine.id,
              medicineName: medicine.name,
              isSnooze: true,
            },
          },
        ],
      });
      return true;
    } catch (err) {
      console.error('[NotificationService] Android snooze scheduling error:', err);
      return false;
    }
  }

  /**
   * Send an immediate Android test notification to verify sound, vibration, and channels
   */
  public async sendTestNotification(): Promise<boolean> {
    if (!this.isNative()) return false;

    await this.initializeAndroidChannels();

    try {
      const testId = generateAndroidNotificationId(`carecue|test|${Date.now()}`);
      await LocalNotifications.schedule({
        notifications: [
          {
            id: testId,
            title: 'CareCue · Android Test Notification',
            body: 'Android notification sound, vibration, and high-priority channels are working!',
            channelId: ANDROID_CHANNEL_REMINDERS,
            actionTypeId: ANDROID_ACTION_TYPE_DOSE,
            schedule: {
              at: new Date(Date.now() + 1200),
              allowWhileIdle: true,
            },
            extra: { isTest: true },
          },
        ],
      });
      return true;
    } catch (e) {
      console.error('[NotificationService] Android test notification failed:', e);
      return false;
    }
  }

  /**
   * Send an urgent overdue dose alert on the Android alert channel
   */
  public async sendOverdueAlert(medicineName: string, time?: string): Promise<boolean> {
    if (!this.isNative()) return false;

    await this.initializeAndroidChannels();

    try {
      const alertId = generateAndroidNotificationId(`carecue|overdue|${medicineName}|${Date.now()}`);
      await LocalNotifications.schedule({
        notifications: [
          {
            id: alertId,
            title: `CareCue Alert · Overdue: ${medicineName}`,
            body: `Scheduled for ${time || 'today'} - please record whether dose was taken or missed.`,
            channelId: ANDROID_CHANNEL_ALERTS,
            schedule: {
              at: new Date(Date.now() + 500),
              allowWhileIdle: true,
            },
            extra: { medicineName, isAlert: true },
          },
        ],
      });
      return true;
    } catch (e) {
      console.error('[NotificationService] Android overdue alert failed:', e);
      return false;
    }
  }

  /**
   * Cancel a specific notification by its numeric ID
   */
  public async cancel(id: number): Promise<boolean> {
    if (!this.isNative()) return false;
    try {
      await LocalNotifications.cancel({ notifications: [{ id }] });
      return true;
    } catch (e) {
      console.warn('[NotificationService] Cancel notification error:', e);
      return false;
    }
  }

  /**
   * Cancel all pending scheduled notifications
   */
  public async cancelAll(): Promise<boolean> {
    if (!this.isNative()) return false;
    try {
      const pending: PendingResult = await LocalNotifications.getPending();
      if (pending.notifications?.length) {
        await LocalNotifications.cancel({
          notifications: pending.notifications.map((n) => ({ id: n.id })),
        });
      }
      return true;
    } catch (e) {
      console.warn('[NotificationService] Cancel all error:', e);
      return false;
    }
  }

  /**
   * Query all pending notifications currently registered with Android AlarmManager
   */
  public async getPending(): Promise<PendingResult['notifications']> {
    if (!this.isNative()) return [];
    try {
      const res = await LocalNotifications.getPending();
      return res.notifications || [];
    } catch {
      return [];
    }
  }
}

export const NotificationService = new NotificationServiceImpl();

// Named exports for convenient imports across components and services
export const isAndroidNative = () => NotificationService.isAndroid();
export const isNativePlatform = () => NotificationService.isNative();
export const initializeNotificationChannels = () => NotificationService.initializeAndroidChannels();
export const checkAndroidNotificationPermission = () => NotificationService.checkPermissions();
export const requestAndroidNotificationPermission = () => NotificationService.requestPermissions();
export const syncNativeReminders = (medicines: Medicine[], doseLogs: DoseLog[] = []) =>
  NotificationService.syncReminders(medicines, doseLogs);
export const scheduleNativeSnooze = (medicine: { id?: string; name: string }, minutes = 15) =>
  NotificationService.scheduleSnooze(medicine, minutes);
export const sendNativeTestReminder = () => NotificationService.sendTestNotification();
export const sendNativeOverdueAlert = (medicineName: string, time?: string) =>
  NotificationService.sendOverdueAlert(medicineName, time);
