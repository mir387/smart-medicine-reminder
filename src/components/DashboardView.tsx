import React, { useState, useEffect, useRef, useMemo } from 'react';
import confetti from 'canvas-confetti';
import { useAuth } from '../context/AuthContext';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import {
  Medicine,
  ActivityEntry,
  StatusBanner,
  DoseLog,
  FrequencyType,
  WeeklyAdherenceDay,
  CaregiverInvite,
  CaregiverAlert,
} from '../types';
import {
  getMedicines,
  saveMedicine as apiSaveMedicine,
  deleteMedicine as apiDeleteMedicine,
  deleteAllMedicines as apiDeleteAllMedicines,
  getDoseLogs,
  recordDoseLog,
  getCaregiverInvites,
  createCaregiverInvite,
  revokeCaregiverInvite,
  generateCaregiverCode,
  getCaregiverAlerts,
  createCaregiverAlert,
  acknowledgeCaregiverAlert,
  dismissCaregiverAlert,
} from '../services/supabase';
import {
  dateKey,
  playReminderTone,
  requestNotificationPermission,
  checkNotificationPermission,
  syncNativeReminders,
  scheduleNativeSnooze,
  sendTestReminder,
  isNativePlatform,
  calculateTodayDoses,
  getAsNeededMedicines,
  getNextScheduledReminder,
  calculateWeeklyAdherence,
  getCurrentWeekRange,
} from '../services/notifications';
import { DailySummary } from './DailySummary';

interface DashboardViewProps {
  onOpenAccount: () => void;
}

const ACTIVITY_KEY = 'carecue_events_v1';

export const FREQUENCY_OPTIONS: Array<{
  value: FrequencyType;
  label: string;
  hint: string;
  defaultTimes: string;
}> = [
  { value: 'once_daily', label: 'Once daily', hint: '1 dose / day', defaultTimes: '08:00' },
  { value: 'twice_daily', label: 'Twice daily', hint: 'Morning & Night', defaultTimes: '08:00, 20:00' },
  { value: 'three_times_daily', label: '3 times daily', hint: 'Morning, Noon, Night', defaultTimes: '08:00, 14:00, 20:00' },
  { value: 'four_times_daily', label: '4 times daily', hint: 'Every 4-6 hours', defaultTimes: '08:00, 12:00, 16:00, 20:00' },
  { value: 'as_needed', label: 'As needed (PRN)', hint: 'When symptoms occur', defaultTimes: '' },
  { value: 'custom', label: 'Custom times', hint: 'Flexible specific times', defaultTimes: '08:00' },
];

export function getFrequencyLabel(frequency?: FrequencyType, times?: string[]): string {
  if (frequency === 'as_needed' || (!times || times.length === 0)) return 'As needed (PRN)';
  if (frequency === 'once_daily') return 'Once daily';
  if (frequency === 'twice_daily') return 'Twice daily';
  if (frequency === 'three_times_daily') return '3 times daily';
  if (frequency === 'four_times_daily') return '4 times daily';
  if (frequency === 'custom') return 'Custom times';
  if (times.length === 1) return 'Once daily';
  if (times.length === 2) return 'Twice daily';
  if (times.length === 3) return '3 times daily';
  return `${times.length}x daily`;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload: WeeklyAdherenceDay;
    value: number;
    name: string;
    dataKey: string;
    color?: string;
  }>;
  label?: string;
}

const CustomWeeklyTooltip: React.FC<CustomTooltipProps> = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white/95 backdrop-blur-md p-3 rounded-xl border border-slate-200 shadow-xl text-xs min-w-[160px]">
        <p className="font-bold text-slate-800 m-0 mb-1.5 border-b border-slate-100 pb-1 flex items-center justify-between">
          <span>{data.day}, {data.date}</span>
          {data.isToday && <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded font-semibold">Today</span>}
        </p>
        <div className="space-y-1">
          <div className="flex items-center justify-between text-emerald-700">
            <span className="flex items-center gap-1 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500" /> Taken:
            </span>
            <span className="font-bold">{data.takenPct}% ({data.takenCount})</span>
          </div>
          <div className="flex items-center justify-between text-rose-600">
            <span className="flex items-center gap-1 font-medium">
              <span className="w-2 h-2 rounded-full bg-rose-500" /> Missed:
            </span>
            <span className="font-bold">{data.missedPct}% ({data.missedCount})</span>
          </div>
          <div className="flex items-center justify-between text-slate-500 pt-1 border-t border-slate-100 text-[11px]">
            <span>Scheduled:</span>
            <span className="font-semibold text-slate-700">{data.totalScheduled} doses</span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

export const DashboardView: React.FC<DashboardViewProps> = ({ onOpenAccount }) => {
  const { user, profile } = useAuth();
  const userId = user?.id || 'guest';
  const userName = profile?.full_name || user?.fullName || 'Alex';

  // Mobile Bottom Navigation Tabs: 'today' | 'medicines' | 'analytics' | 'caregiver' | 'more'
  const [activeTab, setActiveTab] = useState<'today' | 'medicines' | 'analytics' | 'caregiver' | 'more'>('today');
  
  // Today Sub-segmented filter: 'scheduled' | 'prn'
  const [todayFilter, setTodayFilter] = useState<'scheduled' | 'prn'>('scheduled');

  // Mode: Patient Mode vs Caregiver View
  const [viewMode, setViewMode] = useState<'patient' | 'caregiver'>('patient');

  // Core Data
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [doseLogs, setDoseLogs] = useState<DoseLog[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [caregiverInvites, setCaregiverInvites] = useState<CaregiverInvite[]>([]);
  const [caregiverAlerts, setCaregiverAlerts] = useState<CaregiverAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Status Banner
  const [status, setStatus] = useState<StatusBanner | null>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Medicine Form Modal State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formFrequency, setFormFrequency] = useState<FrequencyType>('twice_daily');
  const [formTimes, setFormTimes] = useState('08:00, 20:00');
  const [formStartDate, setFormStartDate] = useState(dateKey(new Date()));
  const [formEndDate, setFormEndDate] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Dose Logging Modal State
  const [loggingDose, setLoggingDose] = useState<{
    medicineId: string;
    medicineName: string;
    time: string;
    date: string;
    notes?: string | null;
  } | null>(null);
  const [doseLogNotes, setDoseLogNotes] = useState('');
  const [isLoggingAction, setIsLoggingAction] = useState(false);

  // Caregiver Invite Form Modal State
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [connectionCode, setConnectionCode] = useState<string>('748291');
  const [isCopiedCode, setIsCopiedCode] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteRole, setInviteRole] = useState<CaregiverInvite['role']>('Family Member');
  const [invitePermissions, setInvitePermissions] = useState<CaregiverInvite['permissions']>('full_access');
  const [isSendingInvite, setIsSendingInvite] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');

  // Notification Diagnostics & Settings State
  const [isNotifModalOpen, setIsNotifModalOpen] = useState(false);
  const [notifPermissionState, setNotifPermissionState] = useState<'granted' | 'denied' | 'prompt'>('prompt');
  const [nativeRemindersScheduled, setNativeRemindersScheduled] = useState<number>(0);
  const [isSendingTestNotif, setIsSendingTestNotif] = useState(false);
  const isNative = useMemo(() => isNativePlatform(), []);

  // Backup & Import
  const [importPreview, setImportPreview] = useState<Medicine[] | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Filter & Search
  const [searchQuery, setSearchQuery] = useState('');

  // Helper to show status banner
  const showStatus = (message: string, type: 'info' | 'success' | 'error' = 'info', timeout = 4000) => {
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    setStatus({ message, type });
    if (timeout > 0) {
      statusTimerRef.current = setTimeout(() => {
        setStatus(null);
      }, timeout);
    }
  };

  // Activity Log Helpers
  const loadActivity = () => {
    try {
      const raw = localStorage.getItem(ACTIVITY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setActivity(parsed);
          return;
        }
      }
    } catch {}
    setActivity([]);
  };

  const addActivity = (message: string, key?: string, kind: ActivityEntry['kind'] = 'info') => {
    setActivity((prev) => {
      const newEntry: ActivityEntry = {
        message,
        time: new Date().toISOString(),
        key,
        kind,
      };
      const updated = [newEntry, ...prev].slice(0, 30);
      try {
        localStorage.setItem(ACTIVITY_KEY, JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  // Initial Data Load
  useEffect(() => {
    loadActivity();
    loadAllData();
  }, [userId]);

  const loadAllData = async () => {
    setIsLoading(true);
    try {
      const [medsData, logsData, invitesData, alertsData] = await Promise.all([
        getMedicines(userId),
        getDoseLogs(userId),
        getCaregiverInvites(userId),
        getCaregiverAlerts(userId),
      ]);
      setMedicines(medsData);
      setDoseLogs(logsData);
      setCaregiverInvites(invitesData);
      setCaregiverAlerts(alertsData);
      if (invitesData.length > 0 && invitesData[0].code) {
        setConnectionCode(invitesData[0].code);
      }
    } catch (e: unknown) {
      const err = e instanceof Error ? e.message : 'Error';
      showStatus(`Loading data failed: ${err}`, 'error', 5000);
    } finally {
      setIsLoading(false);
    }
  };

  // Check notification permissions and handle native notification actions
  useEffect(() => {
    checkNotificationPermission().then((res) => {
      setNotifPermissionState(res.state);
    });

    const handleAction = (e: Event) => {
      const customEvent = e as CustomEvent;
      const detail = customEvent.detail;
      if (!detail) return;
      if (detail.action === 'taken' && detail.medicineId) {
        handleLogTaken(detail.medicineId, detail.medicineName || 'Medicine', detail.time || '12:00');
      } else if (detail.action === 'snooze' && detail.medicineId) {
        handleSnoozeDose(detail.medicineId, detail.medicineName || 'Medicine', detail.time || '12:00');
      }
    };

    window.addEventListener('carecue:notification-action', handleAction);
    return () => window.removeEventListener('carecue:notification-action', handleAction);
  }, []);

  // Synchronize scheduled native Android notifications whenever medicines or logs update
  useEffect(() => {
    if (medicines.length > 0) {
      syncNativeReminders(medicines, doseLogs)
        .then((res) => {
          if (res.isNative) {
            setNativeRemindersScheduled(res.scheduled);
          }
        })
        .catch((err) => console.warn('[CareCue] Native reminder sync note:', err));
    }
  }, [medicines, doseLogs]);

  // Computed Values
  const todayStr = dateKey(new Date());
  const activeMedicines = useMemo(
    () => medicines.filter((m) => m.start_date <= todayStr && (!m.end_date || m.end_date >= todayStr)),
    [medicines, todayStr]
  );
  const todayDoses = useMemo(
    () => calculateTodayDoses(medicines, doseLogs, todayStr),
    [medicines, doseLogs, todayStr]
  );
  const asNeededMedicines = useMemo(
    () => getAsNeededMedicines(medicines, doseLogs, todayStr),
    [medicines, doseLogs, todayStr]
  );
  const completedDosesCount = useMemo(
    () => doseLogs.filter((l) => l.scheduled_date === todayStr && l.status === 'taken').length,
    [doseLogs, todayStr]
  );
  const nextReminder = useMemo(() => getNextScheduledReminder(todayDoses), [todayDoses]);

  // Overdue and Missed Doses Calculation
  const overdueDoses = useMemo(() => todayDoses.filter((d) => d.status === 'overdue'), [todayDoses]);
  const missedDoses = useMemo(() => todayDoses.filter((d) => d.status === 'skipped'), [todayDoses]);
  const unacknowledgedAlerts = useMemo(() => caregiverAlerts.filter((a) => !a.acknowledged), [caregiverAlerts]);

  // MISSED DOSE ALERT TRIGGER:
  // Whenever a scheduled dose becomes "Overdue" or is logged as "Missed", automatically generate a high-priority alert notification in Caregiver View/Log
  useEffect(() => {
    if (isLoading) return;

    overdueDoses.forEach((od) => {
      const exists = caregiverAlerts.some(
        (a) => a.medicine_id === od.medicineId && a.scheduled_date === todayStr && a.scheduled_time === od.time
      );
      if (!exists) {
        createCaregiverAlert({
          patient_id: userId,
          medicine_id: od.medicineId,
          medicine_name: od.medicineName,
          scheduled_time: od.time,
          scheduled_date: todayStr,
          alert_type: 'overdue',
          severity: 'high',
          notes: `Dose of ${od.medicineName} scheduled for ${od.time} is overdue.`,
        }).then((newAlert) => {
          setCaregiverAlerts((prev) => [newAlert, ...prev.filter((p) => p.id !== newAlert.id)]);
          addActivity(`🚨 Caregiver alert: ${od.medicineName} at ${od.time} is overdue`, od.eventKey, 'alert');
        });
      }
    });

    missedDoses.forEach((md) => {
      const exists = caregiverAlerts.some(
        (a) => a.medicine_id === md.medicineId && a.scheduled_date === todayStr && a.scheduled_time === md.time && a.alert_type === 'missed'
      );
      if (!exists) {
        createCaregiverAlert({
          patient_id: userId,
          medicine_id: md.medicineId,
          medicine_name: md.medicineName,
          scheduled_time: md.time,
          scheduled_date: todayStr,
          alert_type: 'missed',
          severity: 'high',
          notes: `Dose of ${md.medicineName} was recorded as missed for ${md.time}.`,
        }).then((newAlert) => {
          setCaregiverAlerts((prev) => [newAlert, ...prev.filter((p) => p.id !== newAlert.id)]);
          addActivity(`⚠️ Caregiver alert: ${md.medicineName} was missed`, md.eventKey, 'alert');
        });
      }
    });
  }, [overdueDoses, missedDoses, todayStr, userId, isLoading]);

  // Weekly adherence metrics for Recharts
  const weeklyAdherence = useMemo(() => calculateWeeklyAdherence(medicines, doseLogs), [medicines, doseLogs]);
  const { start: weekStart, end: weekEnd } = getCurrentWeekRange();
  const weekRangeStr = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

  const elapsedDaysWithDoses = weeklyAdherence.filter((d) => !d.isFuture && d.totalScheduled > 0);
  const totalWeeklyTaken = elapsedDaysWithDoses.reduce((acc, d) => acc + d.takenCount, 0);
  const totalWeeklyMissed = elapsedDaysWithDoses.reduce((acc, d) => acc + d.missedCount, 0);
  const totalWeeklyExpected = totalWeeklyTaken + totalWeeklyMissed;
  const weeklyAdherencePct =
    totalWeeklyExpected > 0 ? Math.round((totalWeeklyTaken / totalWeeklyExpected) * 100) : 100;

  // Window compatibility bindings
  useEffect(() => {
    (window as unknown as Record<string, unknown>).loadCareCueData = loadAllData;
    (window as unknown as Record<string, unknown>).openAddMedicineModal = () => openAddForm();
    (window as unknown as Record<string, unknown>).switchCareCueTab = (tab: 'today' | 'medicines' | 'analytics' | 'caregiver' | 'more') => setActiveTab(tab);
  }, [userId]);

  // Form Handlers
  const handleFrequencyChange = (freq: FrequencyType) => {
    setFormFrequency(freq);
    const match = FREQUENCY_OPTIONS.find((f) => f.value === freq);
    if (match && match.defaultTimes) {
      setFormTimes(match.defaultTimes);
    } else if (freq === 'as_needed') {
      setFormTimes('');
    }
  };

  const openAddForm = () => {
    setEditingId(null);
    setFormName('');
    setFormFrequency('twice_daily');
    setFormTimes('08:00, 20:00');
    setFormStartDate(dateKey(new Date()));
    setFormEndDate('');
    setFormNotes('');
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEditForm = (med: Medicine) => {
    setEditingId(med.id);
    setFormName(med.name);
    setFormFrequency(med.frequency || 'custom');
    setFormTimes(med.times?.join(', ') || '');
    setFormStartDate(med.start_date);
    setFormEndDate(med.end_date || '');
    setFormNotes(med.notes || '');
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleSaveMedicine = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedName = formName.trim();
    if (!trimmedName) {
      setFormError('Please enter the medicine name.');
      return;
    }

    let parsedTimes: string[] = [];
    if (formFrequency !== 'as_needed') {
      const parts = formTimes.split(',').map((t) => t.trim()).filter(Boolean);
      if (parts.length === 0) {
        setFormError('Please enter at least one reminder time (e.g. 08:00).');
        return;
      }
      const validTime = /^([01]\d|2[0-3]):([0-5]\d)$/;
      for (const t of parts) {
        if (!validTime.test(t)) {
          setFormError(`"${t}" is not a valid 24-hour time. Use HH:MM format (e.g. 08:00 or 20:30).`);
          return;
        }
      }
      parsedTimes = Array.from(new Set(parts)).sort();
    }

    if (formEndDate && formEndDate < formStartDate) {
      setFormError('End date cannot be earlier than start date.');
      return;
    }

    setIsSaving(true);
    try {
      const payload: {
        id?: string;
        user_id: string;
        name: string;
        times: string[];
        frequency: FrequencyType;
        start_date: string;
        end_date: string | null;
        notes: string | null;
      } = {
        user_id: userId,
        name: trimmedName,
        times: parsedTimes,
        frequency: formFrequency,
        start_date: formStartDate,
        end_date: formEndDate || null,
        notes: formNotes.trim() || null,
      };

      if (editingId) {
        payload.id = editingId;
      }

      const saved = await apiSaveMedicine(payload, userId);
      if (editingId) {
        setMedicines((prev) => prev.map((m) => (m.id === saved.id ? saved : m)));
        addActivity(`Updated medicine: ${saved.name}`);
        showStatus(`Updated "${saved.name}" successfully!`, 'success');
      } else {
        setMedicines((prev) => [saved, ...prev]);
        addActivity(`Added new medicine: ${saved.name}`);
        showStatus(`Added "${saved.name}" to your schedule!`, 'success');
      }

      setIsFormOpen(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save medicine.';
      setFormError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to remove "${name}" from your active medicines?`)) {
      return;
    }
    try {
      await apiDeleteMedicine(id, userId);
      setMedicines((prev) => prev.filter((m) => m.id !== id));
      addActivity(`Removed medicine: ${name}`);
      showStatus(`Removed "${name}" from your profile.`, 'info');
    } catch (err: unknown) {
      showStatus(err instanceof Error ? err.message : 'Failed to delete medicine.', 'error');
    }
  };

  // Dose Logging Actions
  const handleLogTaken = async (medicineId: string, medicineName: string, time: string) => {
    try {
      await recordDoseLog(userId, medicineId, todayStr, time, 'taken', null);
      setDoseLogs((prev) => [
        {
          id: `log-${Date.now()}`,
          medicine_id: medicineId,
          user_id: userId,
          scheduled_date: todayStr,
          scheduled_time: time,
          status: 'taken',
          logged_at: new Date().toISOString(),
          notes: null,
        },
        ...prev.filter(
          (l) => !(l.medicine_id === medicineId && l.scheduled_date === todayStr && l.scheduled_time === time)
        ),
      ]);

      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.7 },
        colors: ['#10B981', '#2DD4BF', '#3B82F6', '#A7F3D0'],
      });

      addActivity(`Logged dose of ${medicineName} at ${time}`, `${medicineId}-${todayStr}-${time}`, 'dose');
      playReminderTone();
      showStatus(`Dose of ${medicineName} recorded as taken!`, 'success', 3000);
    } catch (err: unknown) {
      showStatus(err instanceof Error ? err.message : 'Failed to log dose.', 'error');
    }
  };

  const handleSnoozeDose = async (medicineId: string, medicineName: string, time: string) => {
    try {
      await recordDoseLog(userId, medicineId, todayStr, time, 'snoozed', 'Snoozed 15 minutes');
      setDoseLogs((prev) => [
        {
          id: `log-${Date.now()}`,
          medicine_id: medicineId,
          user_id: userId,
          scheduled_date: todayStr,
          scheduled_time: time,
          status: 'snoozed',
          logged_at: new Date().toISOString(),
          notes: 'Snoozed 15 minutes',
        },
        ...prev.filter(
          (l) => !(l.medicine_id === medicineId && l.scheduled_date === todayStr && l.scheduled_time === time)
        ),
      ]);
      addActivity(`Snoozed ${medicineName} for 15 minutes`, `${medicineId}-${todayStr}-${time}`, 'info');
      await scheduleNativeSnooze({ id: medicineId, name: medicineName }, 15);
      showStatus(`Snoozed reminder for "${medicineName}" for 15 minutes.`, 'info', 3000);
    } catch (err: unknown) {
      showStatus(err instanceof Error ? err.message : 'Failed to snooze dose.', 'error');
    }
  };

  const handleSendTestNotification = async () => {
    setIsSendingTestNotif(true);
    try {
      const ok = await sendTestReminder();
      if (ok) {
        showStatus('Test reminder sent! Check sound & notification drawer.', 'success', 3500);
      } else {
        showStatus('Could not deliver test notification. Please enable permissions below.', 'error', 4500);
      }
    } finally {
      setIsSendingTestNotif(false);
    }
  };

  const handleRequestPermissions = async () => {
    const granted = await requestNotificationPermission();
    setNotifPermissionState(granted ? 'granted' : 'denied');
    if (granted) {
      showStatus('Notifications enabled! Reminders and alarms are active.', 'success', 3500);
      syncNativeReminders(medicines, doseLogs).then((r) => {
        if (r.isNative) setNativeRemindersScheduled(r.scheduled);
      });
    } else {
      showStatus('Notification access denied. You can enable it in Android Settings → Apps → CareCue.', 'error', 6000);
    }
  };

  const handleOpenLogModal = (dose: { medicineId: string; medicineName: string; time: string; notes?: string | null }) => {
    setLoggingDose({
      medicineId: dose.medicineId,
      medicineName: dose.medicineName,
      time: dose.time,
      date: todayStr,
      notes: dose.notes,
    });
    setDoseLogNotes('');
  };

  const handleExecuteDoseLog = async (status: 'taken' | 'skipped' | 'snoozed') => {
    if (!loggingDose) return;
    setIsLoggingAction(true);
    try {
      await recordDoseLog(
        userId,
        loggingDose.medicineId,
        loggingDose.date,
        loggingDose.time,
        status,
        doseLogNotes.trim() || null
      );

      setDoseLogs((prev) => [
        {
          id: `log-${Date.now()}`,
          medicine_id: loggingDose.medicineId,
          user_id: userId,
          scheduled_date: loggingDose.date,
          scheduled_time: loggingDose.time,
          status,
          logged_at: new Date().toISOString(),
          notes: doseLogNotes.trim() || null,
        },
        ...prev.filter(
          (l) =>
            !(
              l.medicine_id === loggingDose.medicineId &&
              l.scheduled_date === loggingDose.date &&
              l.scheduled_time === loggingDose.time
            )
        ),
      ]);

      if (status === 'taken') {
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.7 },
          colors: ['#10B981', '#2DD4BF', '#3B82F6'],
        });
        showStatus(`Marked ${loggingDose.medicineName} as taken!`, 'success');
      } else if (status === 'skipped') {
        showStatus(`Recorded ${loggingDose.medicineName} as skipped.`, 'info');
      } else {
        showStatus(`Snoozed ${loggingDose.medicineName}.`, 'info');
      }

      addActivity(
        `Logged ${loggingDose.medicineName} as ${status}`,
        `${loggingDose.medicineId}-${loggingDose.date}-${loggingDose.time}`,
        status === 'taken' ? 'dose' : 'info'
      );

      setLoggingDose(null);
    } catch (err: unknown) {
      showStatus(err instanceof Error ? err.message : 'Failed to record dose.', 'error');
    } finally {
      setIsLoggingAction(false);
    }
  };

  // Caregiver Sharing Handlers
  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(connectionCode);
      setIsCopiedCode(true);
      setTimeout(() => setIsCopiedCode(false), 2500);
      showStatus('Connection code copied to clipboard!', 'success', 2500);
    } catch {
      showStatus(`Your connection code is: ${connectionCode}`, 'info', 4000);
    }
  };

  const handleRegenerateCode = () => {
    const newCode = generateCaregiverCode();
    setConnectionCode(newCode);
    showStatus(`Generated new connection PIN: ${newCode}`, 'info', 3000);
  };

  const handleSendCaregiverInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteName.trim()) {
      showStatus('Please enter caregiver name.', 'error');
      return;
    }
    setIsSendingInvite(true);
    try {
      const invite = await createCaregiverInvite({
        patient_id: userId,
        code: generateCaregiverCode(),
        caregiver_name: inviteName.trim(),
        caregiver_email: inviteEmail.trim() || undefined,
        caregiver_phone: invitePhone.trim() || undefined,
        role: inviteRole,
        permissions: invitePermissions,
        status: 'active',
        expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
      });

      setCaregiverInvites((prev) => [invite, ...prev]);
      addActivity(`Invited ${invite.caregiver_name} (${invite.role}) as caregiver`);
      showStatus(`Invite dispatched to ${invite.caregiver_name}!`, 'success', 4000);
      setInviteName('');
      setInviteEmail('');
      setInvitePhone('');
      setIsInviteModalOpen(false);
    } catch (err: unknown) {
      showStatus(err instanceof Error ? err.message : 'Failed to send invite.', 'error');
    } finally {
      setIsSendingInvite(false);
    }
  };

  const handleRevokeInvite = async (id: string, name?: string) => {
    if (!window.confirm(`Revoke caregiver access for ${name || 'this contact'}?`)) return;
    try {
      await revokeCaregiverInvite(id, userId);
      setCaregiverInvites((prev) => prev.filter((i) => i.id !== id));
      addActivity(`Revoked caregiver invite for ${name || id}`);
      showStatus('Caregiver connection revoked.', 'info');
    } catch (err: unknown) {
      showStatus(err instanceof Error ? err.message : 'Failed to revoke invite.', 'error');
    }
  };

  const handleAcknowledgeAlert = async (alertId: string, medName: string) => {
    try {
      await acknowledgeCaregiverAlert(alertId, userId);
      setCaregiverAlerts((prev) =>
        prev.map((a) => (a.id === alertId ? { ...a, acknowledged: true, acknowledged_at: new Date().toISOString() } : a))
      );
      addActivity(`Acknowledged caregiver alert for ${medName}`);
      showStatus(`Alert for ${medName} acknowledged.`, 'success', 2500);
    } catch (err: unknown) {
      showStatus(err instanceof Error ? err.message : 'Failed to acknowledge alert.', 'error');
    }
  };

  const handleDismissAlert = async (alertId: string) => {
    try {
      await dismissCaregiverAlert(alertId, userId);
      setCaregiverAlerts((prev) => prev.filter((a) => a.id !== alertId));
      showStatus('Alert dismissed.', 'info', 2000);
    } catch (err: unknown) {
      showStatus(err instanceof Error ? err.message : 'Failed to dismiss alert.', 'error');
    }
  };

  // Backup & Import
  const handleExportBackup = () => {
    try {
      const data = {
        version: 2,
        exported_at: new Date().toISOString(),
        user_id: userId,
        medicines,
        dose_logs: doseLogs,
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `carecue-backup-${dateKey(new Date())}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      addActivity('Exported JSON backup of medication data');
      showStatus('Backup successfully downloaded!', 'success');
    } catch {
      showStatus('Failed to generate export file.', 'error');
    }
  };

  const handleSelectImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (Array.isArray(parsed.medicines)) {
          setImportPreview(parsed.medicines);
        } else if (Array.isArray(parsed)) {
          setImportPreview(parsed);
        } else {
          showStatus('Unrecognized backup format.', 'error');
        }
      } catch {
        showStatus('Could not read JSON backup file.', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleConfirmImport = async () => {
    if (!importPreview || importPreview.length === 0) return;
    setIsImporting(true);
    try {
      for (const item of importPreview) {
        await apiSaveMedicine(
          {
            user_id: userId,
            name: item.name,
            times: item.times || [],
            frequency: item.frequency || 'custom',
            start_date: item.start_date || dateKey(new Date()),
            end_date: item.end_date || null,
            notes: item.notes || null,
          },
          userId
        );
      }
      await loadAllData();
      showStatus(`Imported ${importPreview.length} medicines successfully!`, 'success');
      setImportPreview(null);
    } catch (err: unknown) {
      showStatus(err instanceof Error ? err.message : 'Import failed.', 'error');
    } finally {
      setIsImporting(false);
    }
  };

  const handleDeleteAll = async () => {
    if (!window.confirm('⚠️ PERMANENT: Delete ALL medicines and dose history?')) return;
    try {
      await apiDeleteAllMedicines(userId);
      setMedicines([]);
      setDoseLogs([]);
      addActivity('Cleared all saved medicines from account');
      showStatus('All medicines permanently removed.', 'info');
    } catch (err: unknown) {
      showStatus(err instanceof Error ? err.message : 'Failed to delete medicines.', 'error');
    }
  };

  const handleClearActivity = () => {
    localStorage.removeItem(ACTIVITY_KEY);
    setActivity([]);
    showStatus('Activity log cleared.', 'info', 2000);
  };

  // Filtered medicines for search in medicines tab
  const filteredMedicines = useMemo(() => {
    if (!searchQuery.trim()) return medicines;
    const q = searchQuery.toLowerCase();
    return medicines.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.notes && m.notes.toLowerCase().includes(q)) ||
        (m.times && m.times.some((t) => t.includes(q)))
    );
  }, [medicines, searchQuery]);

  // Greeting
  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const formattedToday = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="min-h-screen py-0 sm:py-6 px-0 sm:px-4 flex justify-center">
      {/* Mobile-First App Shell Container */}
      <main className="mobile-app-shell animate-fade-up">
        {/* Top App Bar Header */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3 shadow-2xs">
          {/* Brand Identity */}
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#10B981] via-[#059669] to-[#0D9488] flex items-center justify-center text-white font-black text-base shadow-md shadow-emerald-500/20 select-none">
                C+
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-base font-extrabold tracking-tight text-slate-900 leading-none">CareCue</span>
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {viewMode === 'patient' ? 'Patient' : 'Caregiver'}
                </span>
              </div>
              <span className="text-[11px] text-slate-400 font-medium">Medicine Organizer</span>
            </div>
          </div>

          {/* Quick Header Actions */}
          <div className="flex items-center gap-1.5">
            {/* Mode Quick Toggle */}
            <button
              type="button"
              onClick={() => {
                if (viewMode === 'patient') {
                  setViewMode('caregiver');
                  setActiveTab('caregiver');
                } else {
                  setViewMode('patient');
                  setActiveTab('today');
                }
              }}
              className={`p-1.5 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 border ${
                viewMode === 'caregiver'
                  ? 'bg-blue-50 text-blue-700 border-blue-200 shadow-2xs'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
              }`}
              title="Toggle Patient or Caregiver Mode"
            >
              <span>{viewMode === 'patient' ? '👥 Caregiver' : '👤 Patient'}</span>
            </button>

            {/* High-priority Alerts Bell */}
            <button
              type="button"
              onClick={() => {
                setActiveTab('caregiver');
                requestNotificationPermission();
              }}
              className={`relative p-2 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                unacknowledgedAlerts.length > 0
                  ? 'bg-rose-50 text-rose-700 border-rose-200 animate-pulse'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
              title="Alerts & Notifications"
            >
              <span>🔔</span>
              {unacknowledgedAlerts.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-600 text-white text-[9px] font-black flex items-center justify-center">
                  {unacknowledgedAlerts.length}
                </span>
              )}
            </button>

            {/* Profile / Account Button */}
            <button
              type="button"
              onClick={onOpenAccount}
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-700 transition-colors cursor-pointer"
              title="Account Settings"
            >
              {userName.charAt(0).toUpperCase()}
            </button>
          </div>
        </header>

        {/* Global Alert / Status Banner */}
        {status && (
          <div
            role="status"
            className={`mx-4 mt-3 p-3 rounded-xl text-xs font-semibold flex items-center justify-between transition-all animate-fade-up shadow-2xs ${
              status.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : status.type === 'error'
                ? 'bg-rose-50 text-rose-800 border border-rose-200'
                : 'bg-blue-50 text-blue-800 border border-blue-200'
            }`}
          >
            <span>{status.message}</span>
            <button
              type="button"
              onClick={() => setStatus(null)}
              className="text-xs font-bold text-slate-400 hover:text-slate-700 ml-2 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* High-Priority Caregiver Alert Trigger Banner (when Overdue/Missed) */}
        {unacknowledgedAlerts.length > 0 && (
          <div className="mx-4 mt-3 p-3.5 rounded-xl bg-rose-50 border border-rose-200 shadow-2xs animate-fade-up">
            <div className="flex items-start gap-2.5">
              <span className="text-base leading-none">🚨</span>
              <div className="flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[11px] font-black uppercase text-rose-700 tracking-wide">
                    {unacknowledgedAlerts[0].alert_type === 'overdue' ? 'Overdue Dose Alert' : 'Missed Dose Alert'}
                  </span>
                  <span className="text-[10px] text-rose-500 font-semibold">{unacknowledgedAlerts.length} alert(s)</span>
                </div>
                <p className="text-xs text-rose-950 font-bold mt-0.5 m-0">
                  {unacknowledgedAlerts[0].medicine_name} scheduled for {unacknowledgedAlerts[0].scheduled_time}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => handleAcknowledgeAlert(unacknowledgedAlerts[0].id, unacknowledgedAlerts[0].medicine_name)}
                    className="px-2.5 py-1 rounded-md bg-rose-600 text-white text-[11px] font-bold cursor-pointer hover:bg-rose-700"
                  >
                    Acknowledge
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('caregiver')}
                    className="px-2.5 py-1 rounded-md bg-white border border-rose-200 text-rose-800 text-[11px] font-bold cursor-pointer hover:bg-rose-50"
                  >
                    View Caregiver Hub
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Scrollable Main Content Zone (padded at bottom for thumb-friendly bottom nav) */}
        <div className="flex-1 px-4 py-4 pb-28 space-y-4 overflow-y-auto">
          {/* TAB 1: TODAY (Home screen experience) */}
          {activeTab === 'today' && (
            <div className="space-y-4 animate-fade-up">
              {/* User Greeting & Date Section */}
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-black text-slate-900 tracking-tight m-0">
                    {timeGreeting}, {userName}
                  </h1>
                  <p className="text-xs text-slate-500 m-0 mt-0.5 font-medium">{formattedToday}</p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Adherence</span>
                  <span className="text-base font-black text-emerald-600">{weeklyAdherencePct}%</span>
                </div>
              </div>

              {/* USER REQUIREMENT: PROMINENT "+ Add a medicine" MAIN ACTION BUTTON */}
              {/* Placed prominently near the top of the screen (just below header/greeting section) so it is immediately visible as soon as the app opens without needing to scroll */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={openAddForm}
                  className="w-full min-h-[48px] py-3 px-4 rounded-xl bg-gradient-to-r from-[#10B981] via-[#059669] to-[#0D9488] hover:from-[#059669] hover:to-[#0f766e] active:scale-[0.98] text-white text-sm font-extrabold shadow-md shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer border border-emerald-400/20"
                >
                  <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-white text-sm font-black">
                    +
                  </span>
                  <span>+ Add a Medicine</span>
                </button>
              </div>

              {/* Compact Next Dose / Schedule Status Card */}
              {nextReminder ? (
                <div className="p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-200/90 shadow-2xs">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs">⏰</span>
                      <span
                        className={`text-[10px] font-black uppercase tracking-wider ${
                          nextReminder.status === 'overdue' ? 'text-rose-600' : 'text-emerald-700'
                        }`}
                      >
                        {nextReminder.status === 'overdue' ? '⚠️ Overdue Dose' : 'Next Scheduled Dose'}
                      </span>
                    </div>
                    <span className="text-xs font-black text-emerald-800 bg-white px-2 py-0.5 rounded-md border border-emerald-200">
                      {nextReminder.time}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-extrabold text-slate-900">{nextReminder.medicineName}</div>
                      {nextReminder.notes && (
                        <p className="text-[11px] text-slate-500 m-0 mt-0.5 line-clamp-1">{nextReminder.notes}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleSnoozeDose(nextReminder.medicineId, nextReminder.medicineName, nextReminder.time)}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-bold text-slate-600 cursor-pointer"
                      >
                        Snooze
                      </button>
                      <button
                        type="button"
                        onClick={() => handleLogTaken(nextReminder.medicineId, nextReminder.medicineName, nextReminder.time)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold shadow-xs cursor-pointer"
                      >
                        Take
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/90 flex items-center justify-between gap-3 shadow-2xs">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-sm">
                      ✓
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">All caught up for now</span>
                      <span className="text-[11px] text-slate-500">
                        {completedDosesCount} of {todayDoses.length} doses taken today
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-extrabold text-emerald-600">
                      {todayDoses.length > 0 ? `${Math.round((completedDosesCount / todayDoses.length) * 100)}%` : '100%'}
                    </span>
                  </div>
                </div>
              )}

              {/* USER REQUIREMENT: Daily Summary Component with medications remaining count and doses taken progress bar */}
              <DailySummary
                todayDoses={todayDoses}
                activeMedicines={activeMedicines}
                completedDosesCount={completedDosesCount}
                onOpenAddModal={openAddForm}
                onFilterScheduled={() => setTodayFilter('scheduled')}
              />

              {/* Sub-segmented switch: Scheduled vs As-Needed */}
              <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs">
                <button
                  type="button"
                  onClick={() => setTodayFilter('scheduled')}
                  className={`flex-1 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                    todayFilter === 'scheduled'
                      ? 'bg-white text-emerald-700 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Scheduled ({todayDoses.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTodayFilter('prn')}
                  className={`flex-1 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                    todayFilter === 'prn'
                      ? 'bg-white text-emerald-700 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  As-Needed PRN ({asNeededMedicines.length})
                </button>
              </div>

              {/* Scheduled Doses List */}
              {todayFilter === 'scheduled' && (
                <div className="space-y-2.5">
                  {todayDoses.length === 0 ? (
                    <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      <p className="text-xs font-bold text-slate-700 m-0">No doses scheduled for today</p>
                      <p className="text-[11px] text-slate-500 m-0 mt-0.5">
                        Tap &ldquo;+ Add a Medicine&rdquo; above to register your prescribed times.
                      </p>
                    </div>
                  ) : (
                    todayDoses.map((dose) => {
                      const isTaken = dose.status === 'taken';
                      const isOverdue = dose.status === 'overdue';
                      const isSkipped = dose.status === 'skipped';

                      return (
                        <div
                          key={dose.eventKey}
                          className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-3 shadow-2xs ${
                            isTaken
                              ? 'bg-emerald-50/50 border-emerald-200/90'
                              : isOverdue
                              ? 'bg-rose-50/70 border-rose-200'
                              : isSkipped
                              ? 'bg-slate-100 border-slate-200 opacity-60'
                              : 'bg-white border-slate-200/80 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {/* Time badge */}
                            <div
                              className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                                isTaken
                                  ? 'bg-emerald-500 text-white'
                                  : isOverdue
                                  ? 'bg-rose-500 text-white'
                                  : isSkipped
                                  ? 'bg-slate-300 text-slate-700'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {isTaken ? '✓' : dose.time}
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs font-bold text-slate-900 truncate">{dose.medicineName}</span>
                                <span
                                  className={`text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded ${
                                    isTaken
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : isOverdue
                                      ? 'bg-rose-100 text-rose-800'
                                      : isSkipped
                                      ? 'bg-slate-200 text-slate-700'
                                      : 'bg-slate-100 text-slate-600'
                                  }`}
                                >
                                  {isTaken ? 'Taken' : isOverdue ? 'Overdue' : isSkipped ? 'Skipped' : 'Upcoming'}
                                </span>
                              </div>
                              {dose.notes && (
                                <p className="text-[11px] text-slate-500 m-0 mt-0.5 truncate">{dose.notes}</p>
                              )}
                            </div>
                          </div>

                          {/* Quick 1-tap actions */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            {isTaken ? (
                              <button
                                type="button"
                                onClick={() => handleOpenLogModal(dose)}
                                className="px-2 py-1 rounded-lg border border-slate-200 text-[11px] font-semibold text-slate-500 hover:bg-slate-50 cursor-pointer"
                              >
                                Edit
                              </button>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleOpenLogModal(dose)}
                                  className="w-7 h-7 rounded-lg border border-slate-200 text-slate-500 text-xs font-bold flex items-center justify-center hover:bg-slate-50 cursor-pointer"
                                  title="Details & Snooze"
                                >
                                  ···
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleLogTaken(dose.medicineId, dose.medicineName, dose.time)}
                                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-2xs cursor-pointer active:scale-95"
                                >
                                  Take
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* As-Needed (PRN) Doses List */}
              {todayFilter === 'prn' && (
                <div className="space-y-2.5">
                  {asNeededMedicines.length === 0 ? (
                    <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      <p className="text-xs font-bold text-slate-700 m-0">No PRN medicines saved</p>
                      <p className="text-[11px] text-slate-500 m-0 mt-0.5">
                        Add a medicine with &ldquo;As needed (PRN)&rdquo; frequency.
                      </p>
                    </div>
                  ) : (
                    asNeededMedicines.map(({ medicine, takenTodayCount }) => (
                      <div
                        key={medicine.id}
                        className="p-3 rounded-xl border border-slate-200/90 bg-white flex items-center justify-between gap-3 shadow-2xs"
                      >
                        <div>
                          <div className="text-xs font-bold text-slate-900">{medicine.name}</div>
                          <div className="text-[11px] text-slate-500">{medicine.notes || 'Take as needed'}</div>
                          <div className="text-[10px] text-emerald-700 font-semibold mt-0.5">
                            Taken today: {takenTodayCount} dose(s)
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            const now = new Date();
                            const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                            handleLogTaken(medicine.id, medicine.name, time);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-2xs cursor-pointer shrink-0"
                        >
                          + Log Dose
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: MEDICINES (Prescriptions directory) */}
          {activeTab === 'medicines' && (
            <div className="space-y-4 animate-fade-up">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-black text-slate-900 m-0">My Prescriptions</h2>
                  <p className="text-xs text-slate-500 m-0 mt-0.5">
                    {activeMedicines.length} active prescription(s) registered
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openAddForm}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold shadow-2xs hover:bg-emerald-700 cursor-pointer"
                >
                  + Add New
                </button>
              </div>

              {/* Search Bar */}
              <div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search medicines or notes…"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Medicines Cards */}
              <div className="space-y-2.5">
                {filteredMedicines.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    {searchQuery ? 'No medicines match your search.' : 'No medicines added yet.'}
                  </div>
                ) : (
                  filteredMedicines.map((med) => (
                    <div
                      key={med.id}
                      className="p-3.5 rounded-xl border border-slate-200/90 bg-white hover:border-slate-300 transition-all shadow-2xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-bold text-slate-900">{med.name}</div>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-800 border border-emerald-100">
                              {getFrequencyLabel(med.frequency, med.times)}
                            </span>
                            {med.times && med.times.length > 0 && (
                              <span className="text-[10px] font-medium text-slate-500">
                                {med.times.join(', ')}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => openEditForm(med)}
                            className="px-2 py-1 rounded-md border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(med.id, med.name)}
                            className="px-2 py-1 rounded-md border border-rose-200 text-xs font-bold text-rose-600 hover:bg-rose-50 cursor-pointer"
                          >
                            Delete
                          </button>
                        </div>
                      </div>

                      <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                        <span>
                          From {med.start_date}
                          {med.end_date ? ` to ${med.end_date}` : ' (ongoing)'}
                        </span>
                        {med.notes && <span className="italic truncate max-w-[150px]">&ldquo;{med.notes}&rdquo;</span>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 3: ADHERENCE ANALYTICS (Recharts Bar Chart) */}
          {activeTab === 'analytics' && (
            <div className="space-y-4 animate-fade-up">
              <div>
                <h2 className="text-lg font-black text-slate-900 m-0">Weekly Adherence</h2>
                <p className="text-xs text-slate-500 m-0 mt-0.5">Doses taken versus missed ({weekRangeStr})</p>
              </div>

              {/* Score Card */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white shadow-md shadow-emerald-500/20">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-100 block">
                      Adherence Score
                    </span>
                    <div className="text-3xl font-black mt-0.5">{weeklyAdherencePct}%</div>
                  </div>
                  <div className="text-right text-xs text-emerald-100 space-y-0.5">
                    <div>
                      <strong className="text-white">{totalWeeklyTaken}</strong> taken
                    </div>
                    <div>
                      <strong className="text-rose-200">{totalWeeklyMissed}</strong> missed
                    </div>
                    <div className="text-[10px] opacity-80">{totalWeeklyExpected} expected</div>
                  </div>
                </div>
              </div>

              {/* Recharts Bar Chart Card */}
              <div className="p-3.5 rounded-xl bg-white border border-slate-200/90 shadow-2xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-800">Daily Compliance (%)</span>
                  <div className="flex items-center gap-3 text-[10px] font-semibold text-slate-600">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-[#10B981]" /> Taken
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-[#EF4444]" /> Missed
                    </span>
                  </div>
                </div>

                <div className="w-full h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={weeklyAdherence} margin={{ top: 8, right: 6, left: -22, bottom: 0 }} barGap={4}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis
                        dataKey="day"
                        axisLine={{ stroke: '#e2e8f0' }}
                        tickLine={false}
                        tick={{ fill: '#64748B', fontSize: 11, fontWeight: 600 }}
                      />
                      <YAxis
                        unit="%"
                        domain={[0, 100]}
                        ticks={[0, 25, 50, 75, 100]}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#64748B', fontSize: 10 }}
                      />
                      <Tooltip content={<CustomWeeklyTooltip />} cursor={{ fill: 'rgba(16,185,129,0.04)' }} />
                      <Bar dataKey="takenPct" fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={20} />
                      <Bar dataKey="missedPct" fill="#EF4444" radius={[4, 4, 0, 0]} maxBarSize={20} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Historical Dose Logs */}
              <div className="p-3.5 rounded-xl bg-white border border-slate-200/90 shadow-2xs">
                <span className="text-xs font-bold text-slate-800 block mb-2">Recent Dose Records</span>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {doseLogs.length === 0 ? (
                    <div className="text-center py-4 text-xs text-slate-400">No dose logs recorded yet.</div>
                  ) : (
                    doseLogs.slice(0, 10).map((log) => {
                      const med = medicines.find((m) => m.id === log.medicine_id);
                      return (
                        <div key={log.id} className="p-2 rounded-lg bg-slate-50 text-[11px] flex items-center justify-between gap-2">
                          <div>
                            <span className="font-bold text-slate-800">{med?.name || 'Medicine'}</span>
                            <span className="text-slate-500 ml-1">
                              ({log.scheduled_date} at {log.scheduled_time})
                            </span>
                          </div>
                          <span
                            className={`px-1.5 py-0.2 rounded text-[9px] font-extrabold ${
                              log.status === 'taken'
                                ? 'bg-emerald-100 text-emerald-800'
                                : log.status === 'skipped'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {log.status.toUpperCase()}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: CAREGIVER & FAMILY SHARING */}
          {activeTab === 'caregiver' && (
            <div className="space-y-4 animate-fade-up">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-black text-slate-900 m-0">Caregiver & Family Hub</h2>
                  <p className="text-xs text-slate-500 m-0 mt-0.5">Share schedules and get missed dose alerts</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsInviteModalOpen(true)}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold shadow-2xs hover:bg-blue-700 cursor-pointer"
                >
                  + Invite
                </button>
              </div>

              {/* Mode Toggle Banner */}
              <div className="p-3 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-slate-800 block">
                    Current Mode: {viewMode === 'patient' ? 'Patient View' : 'Caregiver View'}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {viewMode === 'patient' ? 'You are managing your own schedule' : `Monitoring ${userName}'s adherence`}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setViewMode(viewMode === 'patient' ? 'caregiver' : 'patient')}
                  className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 font-bold text-slate-700 hover:bg-slate-50 cursor-pointer shadow-2xs"
                >
                  Switch
                </button>
              </div>

              {/* 6-Digit Connection Code Card */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-md">
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 block mb-1">
                  6-Digit Connection PIN
                </span>
                <p className="text-xs text-slate-300 m-0 mb-3">
                  Share this code with your family member or doctor to link accounts.
                </p>

                <div className="bg-white/10 p-3 rounded-xl border border-white/20 text-center mb-3">
                  <div className="text-3xl font-mono font-black tracking-widest text-white">{connectionCode}</div>
                  <span className="text-[10px] text-emerald-300 font-medium">Valid for 30 days · Encrypted</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="flex-1 py-2 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold transition-all cursor-pointer"
                  >
                    {isCopiedCode ? '✓ Copied!' : 'Copy Code'}
                  </button>
                  <button
                    type="button"
                    onClick={handleRegenerateCode}
                    className="py-2 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all cursor-pointer"
                  >
                    🔄 Refresh
                  </button>
                </div>
              </div>

              {/* Missed Dose Alerts Log */}
              <div className="p-3.5 rounded-xl bg-white border border-slate-200/90 shadow-2xs">
                <span className="text-xs font-bold text-slate-800 block mb-2">
                  Caregiver Alert Log ({caregiverAlerts.length})
                </span>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {caregiverAlerts.length === 0 ? (
                    <div className="text-center py-4 text-xs text-slate-400">
                      ✓ No missed or overdue doses. All clear!
                    </div>
                  ) : (
                    caregiverAlerts.map((alert) => (
                      <div
                        key={alert.id}
                        className={`p-2.5 rounded-lg border text-xs flex items-center justify-between gap-2 ${
                          alert.acknowledged
                            ? 'bg-slate-50 border-slate-200 opacity-70'
                            : alert.severity === 'high'
                            ? 'bg-rose-50 border-rose-200'
                            : 'bg-amber-50 border-amber-200'
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-900">{alert.medicine_name}</span>
                            <span
                              className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                                alert.acknowledged ? 'bg-slate-200 text-slate-700' : 'bg-rose-200 text-rose-900'
                              }`}
                            >
                              {alert.alert_type}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {alert.scheduled_time} on {alert.scheduled_date}
                          </div>
                        </div>

                        {!alert.acknowledged ? (
                          <button
                            type="button"
                            onClick={() => handleAcknowledgeAlert(alert.id, alert.medicine_name)}
                            className="px-2 py-1 rounded bg-rose-600 text-white text-[10px] font-bold cursor-pointer hover:bg-rose-700"
                          >
                            Resolve
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleDismissAlert(alert.id)}
                            className="text-slate-400 text-xs hover:text-slate-600 cursor-pointer"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Linked Caregivers List */}
              <div className="p-3.5 rounded-xl bg-white border border-slate-200/90 shadow-2xs">
                <span className="text-xs font-bold text-slate-800 block mb-2">
                  Linked Family & Doctors ({caregiverInvites.length})
                </span>
                <div className="space-y-2">
                  {caregiverInvites.length === 0 ? (
                    <div className="text-center py-4 text-xs text-slate-400">
                      No caregivers linked yet. Tap &ldquo;+ Invite&rdquo; above.
                    </div>
                  ) : (
                    caregiverInvites.map((inv) => (
                      <div
                        key={inv.id}
                        className="p-2.5 rounded-lg border border-slate-200 bg-white flex items-center justify-between text-xs"
                      >
                        <div>
                          <span className="font-bold text-slate-900">{inv.caregiver_name}</span>
                          <span className="text-[10px] text-blue-600 font-semibold ml-1.5">({inv.role})</span>
                          <div className="text-[10px] text-slate-400">{inv.caregiver_email || inv.caregiver_phone || 'Direct PIN'}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRevokeInvite(inv.id, inv.caregiver_name)}
                          className="text-[10px] text-rose-600 hover:text-rose-800 font-semibold cursor-pointer"
                        >
                          Revoke
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Connect as Caregiver */}
              <div className="p-3.5 rounded-xl bg-white border border-slate-200/90 shadow-2xs">
                <span className="text-xs font-bold text-slate-800 block mb-1">Connect to Another Patient</span>
                <p className="text-[11px] text-slate-500 m-0 mb-2">
                  Enter a 6-digit connection PIN from a family member.
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    maxLength={6}
                    value={joinCodeInput}
                    onChange={(e) => setJoinCodeInput(e.target.value)}
                    placeholder="6-digit PIN"
                    className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (joinCodeInput.trim().length >= 6) {
                        setViewMode('caregiver');
                        showStatus(`Connected with PIN ${joinCodeInput}!`, 'success');
                        setJoinCodeInput('');
                      } else {
                        showStatus('Enter a 6-digit PIN code.', 'error');
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold cursor-pointer hover:bg-blue-700"
                  >
                    Connect
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: MORE / SETTINGS */}
          {activeTab === 'more' && (
            <div className="space-y-4 animate-fade-up">
              <div>
                <h2 className="text-lg font-black text-slate-900 m-0">Settings & Tools</h2>
                <p className="text-xs text-slate-500 m-0 mt-0.5">Backup, data management, and activity ledger</p>
              </div>

              {/* Account Link Card */}
              <div className="p-3.5 rounded-xl bg-white border border-slate-200/90 shadow-2xs flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-900 block">{userName}</span>
                  <span className="text-[11px] text-slate-500">{user?.email || 'Registered Patient Profile'}</span>
                </div>
                <button
                  type="button"
                  onClick={onOpenAccount}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Profile
                </button>
              </div>

              {/* Reminders & Native Notifications */}
              <div className="p-3.5 rounded-xl bg-white border border-slate-200/90 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🔔</span>
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">Notifications & Alarms</span>
                      <span className="text-[11px] text-slate-500">
                        {isNative ? 'Capacitor Android Native Alarms' : 'Browser Reminder System'}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      notifPermissionState === 'granted'
                        ? 'bg-emerald-100 text-emerald-800'
                        : notifPermissionState === 'denied'
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {notifPermissionState === 'granted'
                      ? '✓ Enabled'
                      : notifPermissionState === 'denied'
                      ? '✕ Blocked'
                      : '⚠️ Setup Required'}
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/60 flex items-center justify-between text-xs">
                  <div className="text-slate-600">
                    <span className="font-semibold text-slate-800">{nativeRemindersScheduled}</span> alarms scheduled (7-day window)
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsNotifModalOpen(true)}
                    className="text-xs font-bold text-emerald-700 hover:text-emerald-800 cursor-pointer"
                  >
                    Details & Tips →
                  </button>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSendTestNotification}
                    disabled={isSendingTestNotif}
                    className="flex-1 py-2 px-3 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs font-bold cursor-pointer transition-colors"
                  >
                    {isSendingTestNotif ? 'Sending…' : '🔊 Test Sound & Alert'}
                  </button>
                  {notifPermissionState !== 'granted' && (
                    <button
                      type="button"
                      onClick={handleRequestPermissions}
                      className="py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
                    >
                      Enable Permissions
                    </button>
                  )}
                </div>
              </div>

              {/* Backup & Restore */}
              <div className="p-3.5 rounded-xl bg-white border border-slate-200/90 shadow-2xs space-y-2.5">
                <span className="text-xs font-bold text-slate-800 block">Backup & Data Management</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleExportBackup}
                    className="py-2 px-3 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold hover:bg-emerald-100 cursor-pointer"
                  >
                    Export JSON
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="py-2 px-3 rounded-lg bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold hover:bg-slate-100 cursor-pointer"
                  >
                    Import JSON
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,application/json"
                    onChange={handleSelectImportFile}
                    className="hidden"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleDeleteAll}
                  className="w-full py-2 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold hover:bg-rose-100 cursor-pointer"
                >
                  Reset All Medicines
                </button>
              </div>

              {/* Activity Log */}
              <div className="p-3.5 rounded-xl bg-white border border-slate-200/90 shadow-2xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-800">Recent Activity</span>
                  {activity.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearActivity}
                      className="text-[10px] text-slate-400 hover:text-slate-600 font-semibold cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {activity.length === 0 ? (
                    <div className="text-center py-4 text-xs text-slate-400">No recent activity.</div>
                  ) : (
                    activity.slice(0, 8).map((act, idx) => (
                      <div key={idx} className="p-1.5 rounded-md bg-slate-50 text-[11px] flex justify-between gap-2">
                        <span className="text-slate-700 truncate">{act.message}</span>
                        <span className="text-slate-400 text-[10px] shrink-0">
                          {new Date(act.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Medical Notice */}
              <div className="p-3 rounded-xl bg-slate-50 text-[11px] text-slate-500 leading-relaxed border border-slate-200/60">
                ⚠️ <strong>CareCue</strong> is an organization tool for personal prescribed medications. It does not provide medical advice or prescribe treatments.
              </div>
            </div>
          )}
        </div>

        {/* COMPACT BOTTOM NAVIGATION BAR (Fixed at bottom of mobile frame) */}
        <nav
          className="sticky bottom-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200/90 px-2 py-1.5 flex items-center justify-around shadow-lg"
          aria-label="App Navigation"
        >
          <button
            type="button"
            onClick={() => setActiveTab('today')}
            className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-xl transition-all cursor-pointer ${
              activeTab === 'today' ? 'text-emerald-600 font-black' : 'text-slate-400 hover:text-slate-700 font-semibold'
            }`}
          >
            <span className="text-lg leading-none">📅</span>
            <span className="text-[10px]">Today</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('medicines')}
            className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-xl transition-all cursor-pointer ${
              activeTab === 'medicines' ? 'text-emerald-600 font-black' : 'text-slate-400 hover:text-slate-700 font-semibold'
            }`}
          >
            <span className="text-lg leading-none">💊</span>
            <span className="text-[10px]">Medicines</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('analytics')}
            className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-xl transition-all cursor-pointer ${
              activeTab === 'analytics' ? 'text-emerald-600 font-black' : 'text-slate-400 hover:text-slate-700 font-semibold'
            }`}
          >
            <span className="text-lg leading-none">📊</span>
            <span className="text-[10px]">Adherence</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('caregiver')}
            className={`relative flex flex-col items-center gap-0.5 py-1 px-3 rounded-xl transition-all cursor-pointer ${
              activeTab === 'caregiver' ? 'text-emerald-600 font-black' : 'text-slate-400 hover:text-slate-700 font-semibold'
            }`}
          >
            <span className="text-lg leading-none">👥</span>
            <span className="text-[10px]">Caregiver</span>
            {unacknowledgedAlerts.length > 0 && (
              <span className="absolute top-1 right-2 w-2 h-2 rounded-full bg-rose-500 animate-ping" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('more')}
            className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-xl transition-all cursor-pointer ${
              activeTab === 'more' ? 'text-emerald-600 font-black' : 'text-slate-400 hover:text-slate-700 font-semibold'
            }`}
          >
            <span className="text-lg leading-none">⚙️</span>
            <span className="text-[10px]">More</span>
          </button>
        </nav>

        {/* MODAL 1: ADD / EDIT MEDICINE BOTTOM SHEET */}
        {isFormOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-up">
            <div className="bg-white rounded-t-3xl sm:rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 shadow-2xl border border-slate-200">
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
                <h3 className="m-0 text-base font-extrabold text-slate-900">
                  {editingId ? 'Edit Medicine' : 'Add New Medicine'}
                </h3>
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 text-sm font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {formError && (
                <div className="p-2.5 mb-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                  {formError}
                </div>
              )}

              <form onSubmit={handleSaveMedicine} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Medicine Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Lisinopril 10mg, Metformin"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium"
                  />
                </div>

                {/* Frequency Selector */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Frequency</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {FREQUENCY_OPTIONS.map((freq) => (
                      <button
                        key={freq.value}
                        type="button"
                        onClick={() => handleFrequencyChange(freq.value)}
                        className={`p-2 rounded-xl text-left border transition-all cursor-pointer ${
                          formFrequency === freq.value
                            ? 'bg-emerald-50 border-emerald-500 text-emerald-900 ring-1 ring-emerald-500'
                            : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                        }`}
                      >
                        <div className="text-xs font-bold">{freq.label}</div>
                        <div className="text-[10px] text-slate-500">{freq.hint}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Reminder Times */}
                {formFrequency !== 'as_needed' ? (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Reminder Times (HH:MM format) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formTimes}
                      onChange={(e) => setFormTimes(e.target.value)}
                      placeholder="e.g. 08:00, 20:00"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium"
                    />
                    <span className="text-[10px] text-slate-400 mt-0.5 block">Separate times with commas</span>
                  </div>
                ) : (
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
                    ℹ️ <strong>As needed (PRN):</strong> No scheduled alarm times. Log when symptoms occur.
                  </div>
                )}

                {/* Dates */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Start Date</label>
                    <input
                      type="date"
                      required
                      value={formStartDate}
                      onChange={(e) => setFormStartDate(e.target.value)}
                      className="w-full px-2.5 py-2 rounded-xl border border-slate-200 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">End Date (Opt)</label>
                    <input
                      type="date"
                      value={formEndDate}
                      onChange={(e) => setFormEndDate(e.target.value)}
                      className="w-full px-2.5 py-2 rounded-xl border border-slate-200 text-xs"
                    />
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Instructions / Notes</label>
                  <input
                    type="text"
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="e.g. Take with breakfast"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {isSaving ? 'Saving…' : editingId ? 'Save Changes' : 'Confirm'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL 2: DOSE LOGGING MODAL */}
        {loggingDose && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-up">
            <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200">
              <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-100">
                <h3 className="m-0 text-sm font-extrabold text-slate-900">Record Scheduled Dose</h3>
                <button
                  type="button"
                  onClick={() => setLoggingDose(null)}
                  className="w-6 h-6 rounded text-slate-400 text-xs font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="mb-3">
                <div className="text-base font-black text-slate-900">{loggingDose.medicineName}</div>
                <div className="text-xs text-slate-500">
                  Scheduled for {loggingDose.time} on {loggingDose.date}
                </div>
              </div>

              <div className="mb-3">
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Dose Notes (Optional)</label>
                <input
                  type="text"
                  value={doseLogNotes}
                  onChange={(e) => setDoseLogNotes(e.target.value)}
                  placeholder="e.g. Taken with food"
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-xs"
                />
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  disabled={isLoggingAction}
                  onClick={() => handleExecuteDoseLog('taken')}
                  className="py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
                >
                  ✓ Taken
                </button>
                <button
                  type="button"
                  disabled={isLoggingAction}
                  onClick={() => handleExecuteDoseLog('snoozed')}
                  className="py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold cursor-pointer"
                >
                  ⏰ Snooze
                </button>
                <button
                  type="button"
                  disabled={isLoggingAction}
                  onClick={() => handleExecuteDoseLog('skipped')}
                  className="py-2 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold cursor-pointer"
                >
                  ✕ Skip
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 3: CAREGIVER INVITE MODAL */}
        {isInviteModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-up">
            <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200">
              <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-100">
                <h3 className="m-0 text-sm font-extrabold text-slate-900">Invite Caregiver</h3>
                <button
                  type="button"
                  onClick={() => setIsInviteModalOpen(false)}
                  className="w-6 h-6 rounded text-slate-400 text-xs font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSendCaregiverInvite} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Name</label>
                  <input
                    type="text"
                    required
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    placeholder="e.g. Dr. Roberts, Mom"
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Email or Phone</label>
                  <input
                    type="text"
                    value={inviteEmail || invitePhone}
                    onChange={(e) => {
                      if (e.target.value.includes('@')) {
                        setInviteEmail(e.target.value);
                      } else {
                        setInvitePhone(e.target.value);
                      }
                    }}
                    placeholder="caregiver@email.com or +1 555-0100"
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-xs"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Role</label>
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as CaregiverInvite['role'])}
                      className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs bg-white"
                    >
                      <option value="Family Member">Family</option>
                      <option value="Physician / Doctor">Doctor</option>
                      <option value="Home Nurse">Nurse</option>
                      <option value="Caregiver / Guardian">Caregiver</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Permissions</label>
                    <select
                      value={invitePermissions}
                      onChange={(e) => setInvitePermissions(e.target.value as CaregiverInvite['permissions'])}
                      className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs bg-white"
                    >
                      <option value="full_access">Full Access</option>
                      <option value="view_only">View Only</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsInviteModalOpen(false)}
                    className="flex-1 py-2 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSendingInvite}
                    className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {isSendingInvite ? 'Sending…' : 'Send'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL 4: IMPORT PREVIEW MODAL */}
        {importPreview && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-up">
            <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200">
              <h3 className="text-sm font-bold text-slate-900 m-0 mb-1">Import Medicines</h3>
              <p className="text-xs text-slate-600 mb-3">
                Found <strong className="text-emerald-600">{importPreview.length}</strong> medicines in file.
              </p>

              <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg p-2 mb-3 bg-slate-50">
                {importPreview.map((item, idx) => (
                  <div key={idx} className="py-1 text-xs">
                    <strong className="text-slate-800">{item.name}</strong>
                    <div className="text-slate-500 text-[10px]">{item.times?.join(', ')}</div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  disabled={isImporting}
                  onClick={() => setImportPreview(null)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isImporting}
                  onClick={handleConfirmImport}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
                >
                  {isImporting ? 'Importing…' : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        )}
        {/* MODAL 5: NOTIFICATION DIAGNOSTICS & DETAILS MODAL */}
        {isNotifModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-up">
            <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200">
              <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="text-base">🔔</span>
                  <h3 className="m-0 text-sm font-extrabold text-slate-900">Notification Settings & Tips</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsNotifModalOpen(false)}
                  className="w-6 h-6 rounded text-slate-400 text-xs font-bold cursor-pointer hover:text-slate-700"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3 text-xs text-slate-600">
                <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200/80">
                  <span className="font-bold text-emerald-900 block mb-0.5">Android Notification Channels</span>
                  <p className="m-0 text-[11px] text-emerald-800">
                    CareCue uses high-importance Android channels (<code className="font-mono text-[10px] bg-white/70 px-1 rounded">carecue_reminders</code> and <code className="font-mono text-[10px] bg-white/70 px-1 rounded">carecue_alerts</code>) with vibration and heads-up popups.
                  </p>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="font-bold text-slate-800 block mb-0.5">Android Doze Mode & Battery Tips</span>
                  <p className="m-0 text-[11px] text-slate-600">
                    To prevent delayed alarms on Android devices, ensure CareCue is set to <strong>&apos;Unrestricted&apos;</strong> battery usage in Android Settings.
                  </p>
                </div>

                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200 text-[11px]">
                  <span>Permission Status:</span>
                  <strong className={`capitalize ${notifPermissionState === 'granted' ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {notifPermissionState}
                  </strong>
                </div>

                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200 text-[11px]">
                  <span>Alarms in Queue:</span>
                  <strong className="text-slate-800">{nativeRemindersScheduled} active</strong>
                </div>
              </div>

              <div className="flex justify-end pt-4 mt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsNotifModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default DashboardView;
