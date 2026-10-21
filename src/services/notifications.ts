import { Medicine, DoseLog, ScheduledDoseItem, WeeklyAdherenceDay } from '../types';
import {
  NotificationService,
  ANDROID_CHANNEL_REMINDERS,
  ANDROID_CHANNEL_ALERTS,
  ANDROID_ACTION_TYPE_DOSE,
} from './NotificationService';

export const CHANNEL_REMINDERS = ANDROID_CHANNEL_REMINDERS;
export const CHANNEL_ALERTS = ANDROID_CHANNEL_ALERTS;
export const ACTION_TYPE_DOSE = ANDROID_ACTION_TYPE_DOSE;

export function isNativePlatform(): boolean {
  return NotificationService.isNative();
}

export function dateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export function playReminderTone(): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12); // A5

    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.45);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.45);
  } catch (e) {
    console.debug('[CareCue] Audio tone error', e);
  }
}

/**
 * Initialize Android 8.0+ notification channels and action buttons via NotificationService
 */
export async function initializeNotificationChannels(): Promise<boolean> {
  return NotificationService.initializeAndroidChannels();
}

/**
 * Check permission status across Android and Web via NotificationService
 */
export async function checkNotificationPermission(): Promise<{
  granted: boolean;
  state: 'granted' | 'denied' | 'prompt';
  isNative: boolean;
  supported: boolean;
}> {
  return NotificationService.checkPermissions();
}

/**
 * Request notification permissions with Android 13+ and Web support via NotificationService
 */
export async function requestNotificationPermission(): Promise<boolean> {
  return NotificationService.requestPermissions();
}

export function showWebNotification(title: string, body: string): void {
  playReminderTone();
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body,
        icon: '/assets/logo.png',
        badge: '/assets/logo.png',
      });
    } catch (e) {
      console.warn('Could not trigger Notification API', e);
    }
  }
}

/**
 * Deterministic 31-bit positive integer hash for notification IDs
 */
export function stableId(value: string): number {
  let hash = 2166136261;
  const str = String(value);
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) & 0x7fffffff) || 1;
}

/**
 * Parse time supporting 24h ('08:00', '14:30', '8:00') and 12h ('8:00 AM', '2:00 PM')
 */
export function parseTimeParts(timeStr: string): { hours: number; minutes: number; formatted24: string } | null {
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
 * Schedule native Android notifications across the upcoming 7-day window.
 * Scoped to Android requirements and capped at 64 items to strictly prevent Android AlarmManager quota limits.
 */
export async function syncNativeReminders(
  medicines: Medicine[],
  doseLogs: DoseLog[] = []
): Promise<{ scheduled: number; permission: boolean; isNative: boolean }> {
  return NotificationService.syncReminders(medicines, doseLogs);
}

/**
 * Schedule a 15-minute (or custom) snooze reminder
 */
export async function scheduleNativeSnooze(
  medicine: { id?: string; name: string },
  minutes = 15
): Promise<boolean> {
  playReminderTone();
  return NotificationService.scheduleSnooze(medicine, minutes);
}

/**
 * Send an immediate test notification with audible tone and heads-up presentation
 */
export async function sendTestReminder(): Promise<boolean> {
  playReminderTone();

  if (isNativePlatform()) {
    return NotificationService.sendTestNotification();
  }

  // Web fallback
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    new Notification('CareCue · Test Notification', {
      body: 'Notifications and reminder tones are functioning properly!',
      icon: '/assets/logo.png',
    });
    return true;
  }

  return false;
}

/**
 * Trigger an overdue alert notification
 */
export async function sendOverdueDoseAlert(medicineName: string, time?: string): Promise<boolean> {
  playReminderTone();

  if (isNativePlatform()) {
    return NotificationService.sendOverdueAlert(medicineName, time);
  }

  return false;
}

export function calculateTodayDoses(
  medicines: Medicine[],
  doseLogs: DoseLog[],
  targetDateStr?: string,
  customCurrentTime?: string
): ScheduledDoseItem[] {
  const now = new Date();
  const today = targetDateStr || dateKey(now);
  const currentHours = String(now.getHours()).padStart(2, '0');
  const currentMins = String(now.getMinutes()).padStart(2, '0');
  const currentTime = customCurrentTime || `${currentHours}:${currentMins}`;

  const doses: ScheduledDoseItem[] = [];

  for (const med of medicines) {
    if (med.start_date > today) continue;
    if (med.end_date && med.end_date < today) continue;

    for (const time of med.times || []) {
      const eventKey = `${med.id}|${today}|${time}`;
      
      // Check real dose log first
      const log = doseLogs.find(
        (l) => l.medicine_id === med.id && l.scheduled_date === today && l.scheduled_time === time
      );

      let status: ScheduledDoseItem['status'] = 'upcoming';

      if (log) {
        status = log.status; // 'taken' | 'skipped' | 'snoozed'
      } else {
        // If no log yet, check whether it is past scheduled time today
        if (time < currentTime) {
          status = 'overdue';
        } else {
          status = 'upcoming';
        }
      }

      doses.push({
        medicineId: med.id,
        medicineName: med.name,
        time,
        date: today,
        notes: med.notes,
        status,
        eventKey,
        doseLog: log,
      });
    }
  }

  // Sort chronologically by time
  return doses.sort((a, b) => a.time.localeCompare(b.time));
}

export interface AsNeededDoseItem {
  medicine: Medicine;
  takenTodayCount: number;
  lastTakenTime?: string;
  todayLogs: DoseLog[];
}

export function getAsNeededMedicines(
  medicines: Medicine[],
  doseLogs: DoseLog[],
  targetDateStr?: string
): AsNeededDoseItem[] {
  const today = targetDateStr || dateKey(new Date());
  const asNeededMeds = medicines.filter(
    (m) =>
      (m.frequency === 'as_needed' || !m.times || m.times.length === 0) &&
      m.start_date <= today &&
      (!m.end_date || m.end_date >= today)
  );

  return asNeededMeds.map((med) => {
    const todayLogs = doseLogs.filter(
      (l) => l.medicine_id === med.id && l.scheduled_date === today && l.status === 'taken'
    );
    return {
      medicine: med,
      takenTodayCount: todayLogs.length,
      lastTakenTime: todayLogs[0]?.scheduled_time,
      todayLogs,
    };
  });
}

export function getNextScheduledReminder(doses: ScheduledDoseItem[]): ScheduledDoseItem | null {
  const pending = doses.filter((d) => d.status === 'upcoming' || d.status === 'overdue' || d.status === 'snoozed');
  if (!pending.length) return null;

  const nextUpcoming = pending.find((d) => d.status === 'upcoming');
  return nextUpcoming || pending[0];
}

export function getCurrentWeekRange(refDate = new Date()): { start: Date; end: Date; days: Date[] } {
  const d = new Date(refDate);
  const day = d.getDay();
  // Monday as first day of the week (ISO 8601 style)
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 0, 0, 0);

  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const nextDay = new Date(monday);
    nextDay.setDate(monday.getDate() + i);
    days.push(nextDay);
  }

  const sunday = new Date(days[6]);
  sunday.setHours(23, 59, 59, 999);

  return { start: monday, end: sunday, days };
}

export function calculateWeeklyAdherence(
  medicines: Medicine[],
  doseLogs: DoseLog[],
  refDate = new Date()
): WeeklyAdherenceDay[] {
  const { days } = getCurrentWeekRange(refDate);
  const todayStr = dateKey(refDate);
  const currentHours = String(refDate.getHours()).padStart(2, '0');
  const currentMins = String(refDate.getMinutes()).padStart(2, '0');
  const currentTime = `${currentHours}:${currentMins}`;

  return days.map((dayDate) => {
    const dayStr = dateKey(dayDate);
    const dayName = dayDate.toLocaleDateString('en-US', { weekday: 'short' });
    const formattedDate = dayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const isToday = dayStr === todayStr;
    const isFuture = dayStr > todayStr;
    const isPast = dayStr < todayStr;

    // Active scheduled medicines on this day
    const activeScheduledMeds = medicines.filter(
      (m) =>
        m.start_date <= dayStr &&
        (!m.end_date || m.end_date >= dayStr) &&
        m.frequency !== 'as_needed' &&
        Array.isArray(m.times) &&
        m.times.length > 0
    );

    const totalScheduled = activeScheduledMeds.reduce((sum, m) => sum + (m.times?.length || 0), 0);

    const logsForDay = doseLogs.filter((l) => l.scheduled_date === dayStr);
    const takenCount = logsForDay.filter((l) => l.status === 'taken').length;

    let missedCount = 0;
    let expectedCount = totalScheduled;

    if (isPast) {
      missedCount = Math.max(0, totalScheduled - takenCount);
    } else if (isToday) {
      const pastScheduledCount = activeScheduledMeds.reduce((sum, m) => {
        return sum + (m.times?.filter((t) => t <= currentTime).length || 0);
      }, 0);
      expectedCount = Math.max(pastScheduledCount, takenCount);
      missedCount = Math.max(0, pastScheduledCount - takenCount);
    } else {
      missedCount = 0;
      expectedCount = 0;
    }

    let takenPct = 0;
    let missedPct = 0;

    if (expectedCount > 0) {
      takenPct = Math.min(100, Math.round((takenCount / expectedCount) * 100));
      missedPct = Math.max(0, 100 - takenPct);
    } else if (isPast && totalScheduled > 0) {
      missedPct = 100;
      takenPct = 0;
    }

    return {
      day: dayName,
      date: formattedDate,
      fullDate: dayStr,
      takenPct,
      missedPct,
      takenCount,
      missedCount,
      totalScheduled,
      isToday,
      isFuture,
    };
  });
}
