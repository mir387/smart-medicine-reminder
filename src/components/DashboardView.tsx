import React, { useState, useEffect, useRef, useMemo } from 'react';
import confetti from 'canvas-confetti';
import { useAuth } from '../context/AuthContext';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
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

type TabId = 'today' | 'medicines' | 'analytics' | 'caregiver' | 'more';
type TodayFilter = 'upcoming' | 'completed' | 'prn';

const ACTIVITY_KEY = 'carecue_events_v1';

/* ------------------------------------------------------------------ */
/* Design tokens (shared class strings keep the JSX compact)           */
/* ------------------------------------------------------------------ */
const CARD =
  'rounded-3xl bg-white/80 backdrop-blur-md border border-white/70 shadow-[0_6px_24px_rgba(15,23,42,0.06)]';
const CARD_SOLID = 'rounded-3xl bg-white border border-slate-200/80 shadow-[0_6px_24px_rgba(15,23,42,0.05)]';
const INPUT =
  'w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900';
const LABEL = 'block text-xs font-bold text-slate-700 mb-1.5';
const BTN_DARK =
  'rounded-full bg-[#111] text-white font-bold cursor-pointer hover:bg-slate-800 active:scale-95 transition disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-900';
const BTN_LIGHT =
  'rounded-full bg-white border border-slate-200 text-slate-700 font-bold cursor-pointer hover:bg-slate-50 active:scale-95 transition disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400';
const ICON_BTN =
  'w-10 h-10 rounded-full bg-white/90 border border-white shadow-sm flex items-center justify-center text-slate-800 cursor-pointer hover:bg-white active:scale-95 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900';
const MODAL_BACKDROP =
  'fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-up';
const MODAL_PANEL =
  'bg-white rounded-t-[32px] sm:rounded-[28px] max-w-md w-full max-h-[90vh] overflow-y-auto p-5 shadow-2xl border border-slate-200';

/* ------------------------------------------------------------------ */
/* Small inline icon set (no new dependencies)                         */
/* ------------------------------------------------------------------ */
const ICONS: Record<string, React.ReactNode> = {
  calendar: (
    <>
      <rect x="3" y="4" width="18" height="18" rx="4" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </>
  ),
  pill: (
    <>
      <path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z" />
      <path d="m8.5 8.5 7 7" />
    </>
  ),
  pie: (
    <>
      <path d="M21.2 15.9A10 10 0 1 1 8 2.8" />
      <path d="M22 12A10 10 0 0 0 12 2v10z" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
    </>
  ),
  sliders: <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />,
  bell: (
    <>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  arrow: <path d="M7 17 17 7M7 7h10v10" />,
  check: <path d="M20 6 9 17l-5-5" />,
  dots: (
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>
  ),
};

const Icon: React.FC<{ name: keyof typeof ICONS; size?: number; strokeWidth?: number }> = ({
  name,
  size = 20,
  strokeWidth = 2,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {ICONS[name]}
  </svg>
);

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
function fmt12(t: string): { clock: string; period: string } {
  const [hStr, mStr] = (t || '').split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return { clock: t, period: '' };
  return { clock: `${h % 12 || 12}:${String(m).padStart(2, '0')}`, period: h >= 12 ? 'PM' : 'AM' };
}

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
      <div className="bg-white/95 backdrop-blur-md p-3 rounded-2xl border border-slate-200 shadow-xl text-xs min-w-[160px]">
        <p className="font-bold text-slate-800 m-0 mb-1.5 border-b border-slate-100 pb-1 flex items-center justify-between">
          <span>
            {data.day}, {data.date}
          </span>
          {data.isToday && (
            <span className="text-[10px] bg-[#111] text-white px-1.5 py-0.5 rounded-full font-semibold">Today</span>
          )}
        </p>
        <div className="space-y-1">
          <div className="flex items-center justify-between text-emerald-700">
            <span className="flex items-center gap-1 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500" /> Taken:
            </span>
            <span className="font-bold">
              {data.takenPct}% ({data.takenCount})
            </span>
          </div>
          <div className="flex items-center justify-between text-rose-600">
            <span className="flex items-center gap-1 font-medium">
              <span className="w-2 h-2 rounded-full bg-rose-500" /> Missed:
            </span>
            <span className="font-bold">
              {data.missedPct}% ({data.missedCount})
            </span>
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

const NAV_ITEMS: Array<{ id: TabId; label: string; icon: keyof typeof ICONS }> = [
  { id: 'today', label: 'Today', icon: 'calendar' },
  { id: 'medicines', label: 'Medicines', icon: 'pill' },
  { id: 'analytics', label: 'Adherence', icon: 'pie' },
  { id: 'caregiver', label: 'Caregiver', icon: 'users' },
  { id: 'more', label: 'More', icon: 'sliders' },
];

export const DashboardView: React.FC<DashboardViewProps> = ({ onOpenAccount }) => {
  const { user, profile } = useAuth();
  const userId = user?.id || 'guest';
  const userName = profile?.full_name || user?.fullName || 'Alex';

  const [activeTab, setActiveTab] = useState<TabId>('today');
  const [todayFilter, setTodayFilter] = useState<TodayFilter>('upcoming');
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

  const overdueDoses = useMemo(() => todayDoses.filter((d) => d.status === 'overdue'), [todayDoses]);
  const missedDoses = useMemo(() => todayDoses.filter((d) => d.status === 'skipped'), [todayDoses]);
  const unacknowledgedAlerts = useMemo(() => caregiverAlerts.filter((a) => !a.acknowledged), [caregiverAlerts]);

  // Split today's scheduled doses for the Upcoming / Completed segmented control
  const upcomingDoses = useMemo(
    () => todayDoses.filter((d) => d.status !== 'taken' && d.status !== 'skipped'),
    [todayDoses]
  );
  const completedDoses = useMemo(
    () => todayDoses.filter((d) => d.status === 'taken' || d.status === 'skipped'),
    [todayDoses]
  );

  // MISSED DOSE ALERT TRIGGER (unchanged behaviour)
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

  // Weekly adherence metrics
  const weeklyAdherence = useMemo(() => calculateWeeklyAdherence(medicines, doseLogs), [medicines, doseLogs]);
  const { start: weekStart, end: weekEnd } = getCurrentWeekRange();
  const weekRangeStr = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

  const elapsedDaysWithDoses = weeklyAdherence.filter((d) => !d.isFuture && d.totalScheduled > 0);
  const totalWeeklyTaken = elapsedDaysWithDoses.reduce((acc, d) => acc + d.takenCount, 0);
  const totalWeeklyMissed = elapsedDaysWithDoses.reduce((acc, d) => acc + d.missedCount, 0);
  const totalWeeklyExpected = totalWeeklyTaken + totalWeeklyMissed;
  const weeklyAdherencePct =
    totalWeeklyExpected > 0 ? Math.round((totalWeeklyTaken / totalWeeklyExpected) * 100) : 100;

  // Week strip (real dates for the current week, derived from getCurrentWeekRange)
  const weekDays = useMemo(() => {
    const base = new Date(weekStart);
    base.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      return {
        key: dateKey(d),
        dow: d.toLocaleDateString('en-US', { weekday: 'short' }),
        num: d.getDate(),
        info: weeklyAdherence[i],
      };
    });
  }, [weekStart.getTime(), weeklyAdherence]);

  // Window compatibility bindings
  useEffect(() => {
    (window as unknown as Record<string, unknown>).loadCareCueData = loadAllData;
    (window as unknown as Record<string, unknown>).openAddMedicineModal = () => openAddForm();
    (window as unknown as Record<string, unknown>).switchCareCueTab = (tab: TabId) => setActiveTab(tab);
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

  const handleExecuteDoseLog = async (logStatus: 'taken' | 'skipped' | 'snoozed') => {
    if (!loggingDose) return;
    setIsLoggingAction(true);
    try {
      await recordDoseLog(
        userId,
        loggingDose.medicineId,
        loggingDose.date,
        loggingDose.time,
        logStatus,
        doseLogNotes.trim() || null
      );

      setDoseLogs((prev) => [
        {
          id: `log-${Date.now()}`,
          medicine_id: loggingDose.medicineId,
          user_id: userId,
          scheduled_date: loggingDose.date,
          scheduled_time: loggingDose.time,
          status: logStatus,
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

      if (logStatus === 'taken') {
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.7 },
          colors: ['#10B981', '#2DD4BF', '#3B82F6'],
        });
        showStatus(`Marked ${loggingDose.medicineName} as taken!`, 'success');
      } else if (logStatus === 'skipped') {
        showStatus(`Recorded ${loggingDose.medicineName} as skipped.`, 'info');
      } else {
        showStatus(`Snoozed ${loggingDose.medicineName}.`, 'info');
      }

      addActivity(
        `Logged ${loggingDose.medicineName} as ${logStatus}`,
        `${loggingDose.medicineId}-${loggingDose.date}-${loggingDose.time}`,
        logStatus === 'taken' ? 'dose' : 'info'
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

  // Greeting / header copy
  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const monthYear = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const HEADERS: Record<TabId, { eyebrow: string; title: React.ReactNode }> = {
    today: { eyebrow: `${timeGreeting}, ${userName}`, title: monthYear },
    medicines: { eyebrow: `${activeMedicines.length} active`, title: <>My<br />prescriptions</> },
    analytics: { eyebrow: weekRangeStr, title: <>Check your<br />adherence</> },
    caregiver: { eyebrow: viewMode === 'patient' ? 'Patient view' : 'Caregiver view', title: <>Caregiver<br />&amp; family</> },
    more: { eyebrow: user?.email || 'Your profile', title: <>Settings<br />&amp; tools</> },
  };
  const header = HEADERS[activeTab];

  /* ---------------------------------------------------------------- */
  /* Dose card (timeline item)                                         */
  /* ---------------------------------------------------------------- */
  const renderDoseRow = (dose: (typeof todayDoses)[number]) => {
    const isTaken = dose.status === 'taken';
    const isOverdue = dose.status === 'overdue';
    const isSkipped = dose.status === 'skipped';
    const isFeatured =
      !!nextReminder && nextReminder.medicineId === dose.medicineId && nextReminder.time === dose.time && !isTaken && !isSkipped;
    const t = fmt12(dose.time);

    const bg = isOverdue ? 'bg-[#FFB8BE]' : isFeatured ? 'bg-[#FFB5DA]' : 'bg-[#F3F3F3]';
    const label = isTaken ? 'Taken' : isOverdue ? 'Overdue' : isSkipped ? 'Skipped' : 'Upcoming';

    return (
      <div key={dose.eventKey} className="flex gap-3">
        <div className="w-11 shrink-0 pt-1 text-right leading-tight">
          <div className="text-[11px] font-bold text-slate-800">{t.clock}</div>
          <div className="text-[10px] font-semibold text-slate-400">{t.period}</div>
        </div>
        <div className={`w-0.5 rounded-full self-stretch ${isFeatured || isOverdue ? 'bg-[#111]' : 'bg-slate-200'}`} />
        <div className={`flex-1 min-w-0 rounded-3xl p-4 ${bg} ${isSkipped ? 'opacity-60' : ''}`}>
          <div className="text-[11px] font-semibold text-black/50">
            {t.clock} {t.period} · {label}
          </div>
          <div className={`mt-1 text-xl font-extrabold leading-tight tracking-tight text-slate-900 ${isTaken ? 'line-through decoration-2 decoration-black/30' : ''}`}>
            {dose.medicineName}
          </div>
          <div className="mt-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-sm shrink-0 shadow-sm">
                {isTaken ? <Icon name="check" size={16} strokeWidth={3} /> : '💊'}
              </div>
              <span className="text-[11px] font-semibold text-black/60 truncate">
                {dose.notes || 'Scheduled dose'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {!isTaken && (
                <button
                  type="button"
                  onClick={() => handleLogTaken(dose.medicineId, dose.medicineName, dose.time)}
                  className={`${BTN_DARK} px-3.5 h-9 text-xs`}
                >
                  Take
                </button>
              )}
              <button
                type="button"
                onClick={() => handleOpenLogModal(dose)}
                className="w-9 h-9 rounded-full bg-[#111] text-white flex items-center justify-center cursor-pointer hover:bg-slate-800 active:scale-95 transition"
                title={isTaken ? 'Edit record' : 'Details, snooze & skip'}
                aria-label={isTaken ? 'Edit record' : 'Details, snooze and skip'}
              >
                <Icon name="arrow" size={16} />
              </button>
            </div>
          </div>
          {isOverdue && (
            <button
              type="button"
              onClick={() => handleSnoozeDose(dose.medicineId, dose.medicineName, dose.time)}
              className="mt-3 text-[11px] font-bold text-black/70 underline underline-offset-2 cursor-pointer"
            >
              Snooze 15 min
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen py-0 sm:py-6 px-0 sm:px-4 flex justify-center">
      <main className="mobile-app-shell animate-fade-up">
        {/* Peach → pink ambient header wash */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[440px] bg-gradient-to-b from-[#FFD89B] via-[#FFC3B0] to-white"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 top-24 w-72 h-72 rounded-full bg-[#FFB1D8]/50 blur-3xl"
        />

        <div className="relative z-10 flex flex-col flex-1">
          {/* Top row: brand + quick actions */}
          <header className="px-5 pt-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-full bg-[#111] text-white flex items-center justify-center text-[11px] font-black select-none">
                C+
              </div>
              <span className="text-sm font-extrabold tracking-tight text-slate-900">CareCue</span>
            </div>

            <div className="flex items-center gap-2">
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
                className={`h-10 px-3.5 rounded-full text-xs font-bold cursor-pointer border transition active:scale-95 ${
                  viewMode === 'caregiver'
                    ? 'bg-[#111] text-white border-[#111]'
                    : 'bg-white/90 text-slate-800 border-white shadow-sm hover:bg-white'
                }`}
                title="Toggle Patient or Caregiver Mode"
              >
                {viewMode === 'patient' ? '👥 Caregiver' : '👤 Patient'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab('caregiver');
                  requestNotificationPermission();
                }}
                className={`${ICON_BTN} relative ${unacknowledgedAlerts.length > 0 ? 'animate-pulse' : ''}`}
                title="Alerts & Notifications"
                aria-label="Alerts and notifications"
              >
                <Icon name="bell" size={18} />
                {unacknowledgedAlerts.length > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-rose-600 text-white text-[9px] font-black flex items-center justify-center">
                    {unacknowledgedAlerts.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={onOpenAccount}
                className={`${ICON_BTN} text-xs font-extrabold`}
                title="Account Settings"
                aria-label="Account settings"
              >
                {userName.charAt(0).toUpperCase()}
              </button>
            </div>
          </header>

          {/* Large page title */}
          <section className="px-5 pt-6 pb-4 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="m-0 mb-1 text-xs font-semibold text-slate-700/80 truncate">{header.eyebrow}</p>
              <h1 className="m-0 text-[34px] leading-[1.02] font-black tracking-tight text-slate-900">{header.title}</h1>
            </div>
            {activeTab === 'today' && (
              <div className="shrink-0 rounded-full bg-white/90 border border-white shadow-sm px-3.5 py-2 text-right">
                <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">Adherence</span>
                <span className="block text-base font-black text-slate-900 leading-none">{weeklyAdherencePct}%</span>
              </div>
            )}
            {(activeTab === 'medicines') && (
              <button type="button" onClick={openAddForm} className={ICON_BTN} aria-label="Add medicine" title="Add medicine">
                <Icon name="plus" size={20} />
              </button>
            )}
            {activeTab === 'caregiver' && (
              <button type="button" onClick={() => setIsInviteModalOpen(true)} className={ICON_BTN} aria-label="Invite caregiver" title="Invite caregiver">
                <Icon name="plus" size={20} />
              </button>
            )}
          </section>

          {/* Status banner */}
          {status && (
            <div
              role="status"
              className={`mx-5 mb-3 p-3 rounded-2xl text-xs font-semibold flex items-center justify-between animate-fade-up shadow-sm ${
                status.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : status.type === 'error'
                  ? 'bg-rose-50 text-rose-800 border border-rose-200'
                  : 'bg-white text-slate-800 border border-slate-200'
              }`}
            >
              <span>{status.message}</span>
              <button
                type="button"
                onClick={() => setStatus(null)}
                aria-label="Dismiss"
                className="text-xs font-bold text-slate-400 hover:text-slate-700 ml-2 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* High-priority caregiver alert banner */}
          {unacknowledgedAlerts.length > 0 && (
            <div className="mx-5 mb-3 p-3.5 rounded-3xl bg-[#FFB8BE] shadow-sm animate-fade-up">
              <div className="flex items-start gap-2.5">
                <span className="text-base leading-none">🚨</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[11px] font-black uppercase text-rose-900 tracking-wide">
                      {unacknowledgedAlerts[0].alert_type === 'overdue' ? 'Overdue Dose Alert' : 'Missed Dose Alert'}
                    </span>
                    <span className="text-[10px] text-rose-900/70 font-semibold">{unacknowledgedAlerts.length} alert(s)</span>
                  </div>
                  <p className="text-sm text-slate-900 font-extrabold mt-0.5 m-0">
                    {unacknowledgedAlerts[0].medicine_name} · {unacknowledgedAlerts[0].scheduled_time}
                  </p>
                  <div className="flex items-center gap-2 mt-2.5">
                    <button
                      type="button"
                      onClick={() => handleAcknowledgeAlert(unacknowledgedAlerts[0].id, unacknowledgedAlerts[0].medicine_name)}
                      className={`${BTN_DARK} px-3.5 h-8 text-[11px]`}
                    >
                      Acknowledge
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('caregiver')}
                      className={`${BTN_LIGHT} px-3.5 h-8 text-[11px]`}
                    >
                      View Caregiver Hub
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Main content */}
          <div className="flex-1 px-5 pb-28 space-y-4">
            {isLoading && (
              <div className="text-center text-xs font-semibold text-slate-500 py-2" role="status">
                Loading your medicines…
              </div>
            )}

            {/* TAB 1: TODAY */}
            {activeTab === 'today' && (
              <div className="space-y-4 animate-fade-up">
                {/* Week strip */}
                <div className="flex items-center gap-2 overflow-x-auto -mx-5 px-5 pb-1" aria-label="This week">
                  {weekDays.map((d) => {
                    const isToday = d.key === todayStr;
                    return (
                      <div
                        key={d.key}
                        className={`shrink-0 flex flex-col items-center justify-center rounded-full ${
                          isToday
                            ? 'bg-[#111] text-white w-[72px] h-11 shadow-md'
                            : 'bg-white/70 text-slate-800 w-11 h-11'
                        }`}
                        aria-current={isToday ? 'date' : undefined}
                      >
                        <span className="text-sm font-bold leading-none">{d.num}</span>
                        <span className={`text-[9px] font-semibold leading-none mt-1 ${isToday ? 'text-white/70' : 'text-slate-400'}`}>
                          {d.dow}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Primary action */}
                <button
                  type="button"
                  onClick={openAddForm}
                  className={`${BTN_DARK} w-full min-h-[52px] px-4 text-sm flex items-center justify-center gap-2 shadow-lg shadow-black/10`}
                >
                  <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
                    <Icon name="plus" size={14} strokeWidth={3} />
                  </span>
                  Add a Medicine
                </button>

                {/* Daily summary (existing component) */}
                <DailySummary
                  todayDoses={todayDoses}
                  activeMedicines={activeMedicines}
                  completedDosesCount={completedDosesCount}
                  onOpenAddModal={openAddForm}
                  onFilterScheduled={() => setTodayFilter('upcoming')}
                />

                {/* Upcoming / Completed / PRN */}
                <div className="flex items-center gap-1 p-1 rounded-full bg-slate-100 text-xs" role="tablist">
                  {(
                    [
                      { id: 'upcoming', label: `Upcoming (${upcomingDoses.length})` },
                      { id: 'completed', label: `Completed (${completedDoses.length})` },
                      { id: 'prn', label: `PRN (${asNeededMedicines.length})` },
                    ] as Array<{ id: TodayFilter; label: string }>
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={todayFilter === tab.id}
                      onClick={() => setTodayFilter(tab.id)}
                      className={`flex-1 py-2 rounded-full font-bold transition cursor-pointer ${
                        todayFilter === tab.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {todayFilter === 'upcoming' && (
                  <div className="space-y-3">
                    {upcomingDoses.length === 0 ? (
                      <div className="text-center py-8 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                        <p className="text-sm font-bold text-slate-800 m-0">
                          {todayDoses.length === 0 ? 'No doses scheduled for today' : 'All caught up for now'}
                        </p>
                        <p className="text-xs text-slate-500 m-0 mt-1">
                          {todayDoses.length === 0
                            ? 'Tap “Add a Medicine” above to register your prescribed times.'
                            : `${completedDosesCount} of ${todayDoses.length} doses taken today`}
                        </p>
                      </div>
                    ) : (
                      upcomingDoses.map(renderDoseRow)
                    )}
                  </div>
                )}

                {todayFilter === 'completed' && (
                  <div className="space-y-3">
                    {completedDoses.length === 0 ? (
                      <div className="text-center py-8 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                        <p className="text-sm font-bold text-slate-800 m-0">Nothing completed yet</p>
                        <p className="text-xs text-slate-500 m-0 mt-1">Doses you take or skip will show up here.</p>
                      </div>
                    ) : (
                      completedDoses.map(renderDoseRow)
                    )}
                  </div>
                )}

                {todayFilter === 'prn' && (
                  <div className="space-y-3">
                    {asNeededMedicines.length === 0 ? (
                      <div className="text-center py-8 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                        <p className="text-sm font-bold text-slate-800 m-0">No PRN medicines saved</p>
                        <p className="text-xs text-slate-500 m-0 mt-1">
                          Add a medicine with “As needed (PRN)” frequency.
                        </p>
                      </div>
                    ) : (
                      asNeededMedicines.map(({ medicine, takenTodayCount }) => (
                        <div key={medicine.id} className="p-4 rounded-3xl bg-[#F3F3F3] flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-lg font-extrabold tracking-tight text-slate-900 leading-tight">{medicine.name}</div>
                            <div className="text-xs text-slate-500 truncate">{medicine.notes || 'Take as needed'}</div>
                            <div className="text-[11px] text-emerald-700 font-bold mt-1">
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
                            className={`${BTN_DARK} px-4 h-10 text-xs shrink-0`}
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

            {/* TAB 2: MEDICINES */}
            {activeTab === 'medicines' && (
              <div className="space-y-4 animate-fade-up">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search medicines or notes…"
                  aria-label="Search medicines"
                  className={`${INPUT} rounded-full px-5`}
                />

                <div className="space-y-3">
                  {filteredMedicines.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-500 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                      {searchQuery ? 'No medicines match your search.' : 'No medicines added yet.'}
                    </div>
                  ) : (
                    filteredMedicines.map((med, i) => (
                      <div
                        key={med.id}
                        className={`p-4 rounded-3xl ${i === 0 && !searchQuery ? 'bg-[#FFB5DA]' : 'bg-[#F3F3F3]'}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-xl font-extrabold tracking-tight leading-tight text-slate-900">{med.name}</div>
                            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                              <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-white text-slate-800">
                                {getFrequencyLabel(med.frequency, med.times)}
                              </span>
                              {med.times && med.times.length > 0 && (
                                <span className="text-[11px] font-semibold text-black/50">{med.times.join(', ')}</span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 flex items-center justify-between gap-2">
                          <div className="text-[11px] font-semibold text-black/55 min-w-0">
                            <div>
                              From {med.start_date}
                              {med.end_date ? ` to ${med.end_date}` : ' (ongoing)'}
                            </div>
                            {med.notes && <div className="italic truncate">“{med.notes}”</div>}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => openEditForm(med)}
                              className={`${BTN_DARK} px-3.5 h-9 text-xs`}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(med.id, med.name)}
                              className="px-3.5 h-9 rounded-full bg-white text-rose-600 text-xs font-bold cursor-pointer hover:bg-rose-50 active:scale-95 transition"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* TAB 3: ADHERENCE */}
            {activeTab === 'analytics' && (
              <div className="space-y-3 animate-fade-up">
                {/* Chart card */}
                <div className="rounded-3xl p-4 bg-gradient-to-br from-[#FFF3D6] via-[#FFE4D6] to-[#FFE0EC] border border-white/70 shadow-[0_6px_24px_rgba(15,23,42,0.06)]">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                      <Icon name="pie" size={14} /> Adherence
                    </div>
                    <div className="text-right leading-none">
                      <span className="text-3xl font-black tracking-tight text-slate-900">{weeklyAdherencePct}</span>
                      <span className="text-xs font-bold text-slate-600 ml-0.5">%</span>
                    </div>
                  </div>

                  <div className="w-full h-[210px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={weeklyAdherence} margin={{ top: 8, right: 4, left: -24, bottom: 0 }} barGap={3}>
                        <defs>
                          <pattern id="adherenceHatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                            <rect width="6" height="6" fill="#E9DDD0" />
                            <line x1="0" y1="0" x2="0" y2="6" stroke="#8B7F73" strokeWidth="1.6" />
                          </pattern>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(15,23,42,0.06)" />
                        <XAxis
                          dataKey="day"
                          axisLine={false}
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
                        <Tooltip content={<CustomWeeklyTooltip />} cursor={{ fill: 'rgba(15,23,42,0.04)' }} />
                        <Bar dataKey="takenPct" radius={[8, 8, 0, 0]} maxBarSize={26}>
                          {weeklyAdherence.map((d, idx) => (
                            <Cell key={idx} fill={d.isToday ? '#111111' : 'url(#adherenceHatch)'} />
                          ))}
                        </Bar>
                        <Bar dataKey="missedPct" fill="#FB7185" radius={[8, 8, 0, 0]} maxBarSize={10} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="flex items-center gap-4 text-[10px] font-semibold text-slate-600 mt-1">
                    <span className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-sm bg-[#8B7F73]" /> Taken
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-sm bg-[#111]" /> Today
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-sm bg-[#FB7185]" /> Missed
                    </span>
                  </div>
                </div>

                {/* Stat tiles */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-3xl p-4 bg-gradient-to-br from-[#E7F9EF] to-[#F3FFF8] border border-white/70 shadow-sm">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" /> Taken
                    </div>
                    <div className="mt-3 text-3xl font-black tracking-tight text-slate-900">{totalWeeklyTaken}</div>
                    <div className="text-[11px] font-semibold text-slate-500">doses this week</div>
                  </div>
                  <div className="rounded-3xl p-4 bg-gradient-to-br from-[#FFE1E4] to-[#FFF1F2] border border-white/70 shadow-sm">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                      <span className="w-2 h-2 rounded-full bg-rose-500" /> Missed
                    </div>
                    <div className="mt-3 text-3xl font-black tracking-tight text-slate-900">{totalWeeklyMissed}</div>
                    <div className="text-[11px] font-semibold text-slate-500">doses this week</div>
                  </div>
                  <div className="rounded-3xl p-4 bg-gradient-to-br from-[#FFEFD6] to-[#FFF8EC] border border-white/70 shadow-sm">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                      <span className="w-2 h-2 rounded-full bg-amber-500" /> Expected
                    </div>
                    <div className="mt-3 text-3xl font-black tracking-tight text-slate-900">{totalWeeklyExpected}</div>
                    <div className="text-[11px] font-semibold text-slate-500">so far</div>
                  </div>
                  <div className="rounded-3xl p-4 bg-gradient-to-br from-[#EAE6FF] to-[#F6F3FF] border border-white/70 shadow-sm">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                      <span className="w-2 h-2 rounded-full bg-violet-500" /> Today
                    </div>
                    <div className="mt-3 text-3xl font-black tracking-tight text-slate-900">
                      {completedDosesCount}
                      <span className="text-base text-slate-400 font-bold">/{todayDoses.length}</span>
                    </div>
                    <div className="text-[11px] font-semibold text-slate-500">doses taken</div>
                  </div>
                </div>

                {/* Historical dose logs */}
                <div className={`${CARD_SOLID} p-4`}>
                  <span className="text-sm font-extrabold text-slate-900 block mb-2">Recent dose records</span>
                  <div className="space-y-1.5 max-h-56 overflow-y-auto">
                    {doseLogs.length === 0 ? (
                      <div className="text-center py-4 text-xs text-slate-400">No dose logs recorded yet.</div>
                    ) : (
                      doseLogs.slice(0, 10).map((log) => {
                        const med = medicines.find((m) => m.id === log.medicine_id);
                        return (
                          <div key={log.id} className="p-2.5 rounded-2xl bg-slate-50 text-[11px] flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <span className="font-bold text-slate-800">{med?.name || 'Medicine'}</span>
                              <span className="text-slate-500 ml-1">
                                ({log.scheduled_date} at {log.scheduled_time})
                              </span>
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold shrink-0 ${
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

            {/* TAB 4: CAREGIVER */}
            {activeTab === 'caregiver' && (
              <div className="space-y-4 animate-fade-up">
                <div className={`${CARD} p-3.5 flex items-center justify-between text-xs`}>
                  <div>
                    <span className="font-bold text-slate-900 block">
                      Current mode: {viewMode === 'patient' ? 'Patient View' : 'Caregiver View'}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {viewMode === 'patient' ? 'You are managing your own schedule' : `Monitoring ${userName}'s adherence`}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setViewMode(viewMode === 'patient' ? 'caregiver' : 'patient')}
                    className={`${BTN_DARK} px-3.5 h-8 text-xs`}
                  >
                    Switch
                  </button>
                </div>

                {/* PIN card */}
                <div className="p-5 rounded-3xl bg-[#111] text-white shadow-lg">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[#FFB5DA] block mb-1">
                    6-Digit Connection PIN
                  </span>
                  <p className="text-xs text-white/70 m-0 mb-3">
                    Share this code with your family member or doctor to link accounts.
                  </p>
                  <div className="bg-white/10 p-3 rounded-2xl border border-white/15 text-center mb-3">
                    <div className="text-3xl font-mono font-black tracking-widest">{connectionCode}</div>
                    <span className="text-[10px] text-white/60 font-medium">Valid for 30 days · Encrypted</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopyCode}
                      className="flex-1 h-10 rounded-full bg-white text-[#111] text-xs font-bold cursor-pointer hover:bg-slate-100 active:scale-95 transition"
                    >
                      {isCopiedCode ? '✓ Copied!' : 'Copy Code'}
                    </button>
                    <button
                      type="button"
                      onClick={handleRegenerateCode}
                      className="h-10 px-4 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-bold cursor-pointer active:scale-95 transition"
                    >
                      🔄 Refresh
                    </button>
                  </div>
                </div>

                {/* Alerts log */}
                <div className={`${CARD_SOLID} p-4`}>
                  <span className="text-sm font-extrabold text-slate-900 block mb-2">
                    Caregiver alert log ({caregiverAlerts.length})
                  </span>
                  <div className="space-y-2 max-h-56 overflow-y-auto">
                    {caregiverAlerts.length === 0 ? (
                      <div className="text-center py-4 text-xs text-slate-400">✓ No missed or overdue doses. All clear!</div>
                    ) : (
                      caregiverAlerts.map((alert) => (
                        <div
                          key={alert.id}
                          className={`p-3 rounded-2xl text-xs flex items-center justify-between gap-2 ${
                            alert.acknowledged
                              ? 'bg-slate-50 opacity-70'
                              : alert.severity === 'high'
                              ? 'bg-[#FFE1E4]'
                              : 'bg-amber-50'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-900 truncate">{alert.medicine_name}</span>
                              <span
                                className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
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
                              className={`${BTN_DARK} px-3 h-8 text-[11px] shrink-0`}
                            >
                              Resolve
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleDismissAlert(alert.id)}
                              aria-label="Dismiss alert"
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

                {/* Linked caregivers */}
                <div className={`${CARD_SOLID} p-4`}>
                  <span className="text-sm font-extrabold text-slate-900 block mb-2">
                    Linked family &amp; doctors ({caregiverInvites.length})
                  </span>
                  <div className="space-y-2">
                    {caregiverInvites.length === 0 ? (
                      <div className="text-center py-4 text-xs text-slate-400">
                        No caregivers linked yet. Tap the + button above.
                      </div>
                    ) : (
                      caregiverInvites.map((inv) => (
                        <div key={inv.id} className="p-3 rounded-2xl bg-[#F3F3F3] flex items-center justify-between text-xs gap-2">
                          <div className="min-w-0">
                            <span className="font-bold text-slate-900">{inv.caregiver_name}</span>
                            <span className="text-[10px] text-slate-500 font-semibold ml-1.5">({inv.role})</span>
                            <div className="text-[10px] text-slate-400 truncate">
                              {inv.caregiver_email || inv.caregiver_phone || 'Direct PIN'}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRevokeInvite(inv.id, inv.caregiver_name)}
                            className="text-[11px] text-rose-600 hover:text-rose-800 font-bold cursor-pointer shrink-0"
                          >
                            Revoke
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Connect as caregiver */}
                <div className={`${CARD_SOLID} p-4`}>
                  <span className="text-sm font-extrabold text-slate-900 block mb-1">Connect to another patient</span>
                  <p className="text-[11px] text-slate-500 m-0 mb-3">Enter a 6-digit connection PIN from a family member.</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      maxLength={6}
                      value={joinCodeInput}
                      onChange={(e) => setJoinCodeInput(e.target.value)}
                      placeholder="6-digit PIN"
                      aria-label="Connection PIN"
                      className={`${INPUT} flex-1 rounded-full font-mono`}
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
                      className={`${BTN_DARK} px-5 text-xs`}
                    >
                      Connect
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 5: MORE */}
            {activeTab === 'more' && (
              <div className="space-y-4 animate-fade-up">
                <div className={`${CARD_SOLID} p-4 flex items-center justify-between gap-3`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-full bg-[#111] text-white flex items-center justify-center font-black">
                      {userName.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <span className="text-sm font-extrabold text-slate-900 block truncate">{userName}</span>
                      <span className="text-[11px] text-slate-500 truncate block">
                        {user?.email || 'Registered Patient Profile'}
                      </span>
                    </div>
                  </div>
                  <button type="button" onClick={onOpenAccount} className={`${BTN_LIGHT} px-4 h-9 text-xs`}>
                    Profile
                  </button>
                </div>

                {/* Notifications */}
                <div className="rounded-3xl p-4 bg-gradient-to-br from-[#FFF3D6] via-[#FFE8DA] to-[#FFE3EE] border border-white/70 shadow-sm space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center text-slate-900">
                        <Icon name="bell" size={16} />
                      </div>
                      <div>
                        <span className="text-sm font-extrabold text-slate-900 block">Notifications &amp; alarms</span>
                        <span className="text-[11px] text-slate-600">
                          {isNative ? 'Capacitor Android Native Alarms' : 'Browser Reminder System'}
                        </span>
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 ${
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
                        : '⚠️ Setup'}
                    </span>
                  </div>

                  <div className="p-3 rounded-2xl bg-white/70 flex items-center justify-between text-xs">
                    <div className="text-slate-600">
                      <span className="font-bold text-slate-900">{nativeRemindersScheduled}</span> alarms scheduled (7-day window)
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsNotifModalOpen(true)}
                      className="text-xs font-bold text-slate-900 underline underline-offset-2 cursor-pointer"
                    >
                      Details
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleSendTestNotification}
                      disabled={isSendingTestNotif}
                      className={`${BTN_LIGHT} flex-1 h-10 text-xs`}
                    >
                      {isSendingTestNotif ? 'Sending…' : '🔊 Test Sound & Alert'}
                    </button>
                    {notifPermissionState !== 'granted' && (
                      <button type="button" onClick={handleRequestPermissions} className={`${BTN_DARK} px-4 h-10 text-xs`}>
                        Enable
                      </button>
                    )}
                  </div>
                </div>

                {/* Backup */}
                <div className={`${CARD_SOLID} p-4 space-y-3`}>
                  <span className="text-sm font-extrabold text-slate-900 block">Backup &amp; data</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={handleExportBackup} className={`${BTN_DARK} h-10 text-xs`}>
                      Export JSON
                    </button>
                    <button type="button" onClick={() => fileInputRef.current?.click()} className={`${BTN_LIGHT} h-10 text-xs`}>
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
                    className="w-full h-10 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold hover:bg-rose-100 cursor-pointer active:scale-95 transition"
                  >
                    Reset All Medicines
                  </button>
                </div>

                {/* Activity */}
                <div className={`${CARD_SOLID} p-4`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-extrabold text-slate-900">Recent activity</span>
                    {activity.length > 0 && (
                      <button
                        type="button"
                        onClick={handleClearActivity}
                        className="text-[11px] text-slate-400 hover:text-slate-700 font-semibold cursor-pointer"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="space-y-1.5 max-h-44 overflow-y-auto">
                    {activity.length === 0 ? (
                      <div className="text-center py-4 text-xs text-slate-400">No recent activity.</div>
                    ) : (
                      activity.slice(0, 8).map((act, idx) => (
                        <div key={idx} className="p-2.5 rounded-2xl bg-slate-50 text-[11px] flex justify-between gap-2">
                          <span className="text-slate-700 truncate">{act.message}</span>
                          <span className="text-slate-400 text-[10px] shrink-0">
                            {new Date(act.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-50 text-[11px] text-slate-500 leading-relaxed">
                  ⚠️ <strong>CareCue</strong> is an organization tool for personal prescribed medications. It does not provide medical advice or prescribe treatments.
                </div>
              </div>
            )}
          </div>

          {/* Floating dark bottom navigation pill */}
          <nav
            className="sticky bottom-4 z-30 mx-5 mb-4 rounded-full bg-[#111] px-3 py-2.5 flex items-center justify-around shadow-2xl shadow-black/30"
            aria-label="App Navigation"
          >
            {NAV_ITEMS.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  aria-label={item.label}
                  aria-current={active ? 'page' : undefined}
                  title={item.label}
                  className={`relative w-11 h-11 rounded-full flex items-center justify-center transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                    active ? 'bg-white text-[#111]' : 'text-white/65 hover:text-white'
                  }`}
                >
                  <Icon name={item.icon} size={20} />
                  {item.id === 'caregiver' && unacknowledgedAlerts.length > 0 && (
                    <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-[#111]" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* MODAL 1: ADD / EDIT MEDICINE */}
        {isFormOpen && (
          <div className={MODAL_BACKDROP} role="dialog" aria-modal="true" aria-label={editingId ? 'Edit medicine' : 'Add medicine'}>
            <div className={MODAL_PANEL}>
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
                <h3 className="m-0 text-xl font-black tracking-tight text-slate-900">
                  {editingId ? 'Edit medicine' : 'Add new medicine'}
                </h3>
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  aria-label="Close"
                  className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 text-sm font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {formError && (
                <div className="p-3 mb-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs" role="alert">
                  {formError}
                </div>
              )}

              <form onSubmit={handleSaveMedicine} className="space-y-4">
                <div>
                  <label className={LABEL}>
                    Medicine name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Lisinopril 10mg, Metformin"
                    className={INPUT}
                  />
                </div>

                <div>
                  <label className={LABEL}>Frequency</label>
                  <div className="grid grid-cols-2 gap-2">
                    {FREQUENCY_OPTIONS.map((freq) => (
                      <button
                        key={freq.value}
                        type="button"
                        onClick={() => handleFrequencyChange(freq.value)}
                        className={`p-3 rounded-2xl text-left border transition cursor-pointer ${
                          formFrequency === freq.value
                            ? 'bg-[#FFB5DA] border-[#111] text-slate-900 ring-1 ring-[#111]'
                            : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                        }`}
                      >
                        <div className="text-xs font-bold">{freq.label}</div>
                        <div className="text-[10px] text-slate-500">{freq.hint}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {formFrequency !== 'as_needed' ? (
                  <div>
                    <label className={LABEL}>
                      Reminder times (HH:MM) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formTimes}
                      onChange={(e) => setFormTimes(e.target.value)}
                      placeholder="e.g. 08:00, 20:00"
                      className={INPUT}
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">Separate times with commas</span>
                  </div>
                ) : (
                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
                    ℹ️ <strong>As needed (PRN):</strong> No scheduled alarm times. Log when symptoms occur.
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={LABEL}>Start date</label>
                    <input type="date" required value={formStartDate} onChange={(e) => setFormStartDate(e.target.value)} className={INPUT} />
                  </div>
                  <div>
                    <label className={LABEL}>End date (opt)</label>
                    <input type="date" value={formEndDate} onChange={(e) => setFormEndDate(e.target.value)} className={INPUT} />
                  </div>
                </div>

                <div>
                  <label className={LABEL}>Instructions / notes</label>
                  <input
                    type="text"
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="e.g. Take with breakfast"
                    className={INPUT}
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button type="button" onClick={() => setIsFormOpen(false)} className={`${BTN_LIGHT} flex-1 h-12 text-sm`}>
                    Cancel
                  </button>
                  <button type="submit" disabled={isSaving} className={`${BTN_DARK} flex-1 h-12 text-sm`}>
                    {isSaving ? 'Saving…' : editingId ? 'Save changes' : 'Confirm'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL 2: DOSE LOGGING */}
        {loggingDose && (
          <div className={MODAL_BACKDROP} role="dialog" aria-modal="true" aria-label="Record scheduled dose">
            <div className={`${MODAL_PANEL} sm:max-w-sm`}>
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
                <h3 className="m-0 text-base font-extrabold text-slate-900">Record scheduled dose</h3>
                <button
                  type="button"
                  onClick={() => setLoggingDose(null)}
                  aria-label="Close"
                  className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 text-xs font-bold cursor-pointer hover:bg-slate-200"
                >
                  ✕
                </button>
              </div>

              <div className="mb-4 p-4 rounded-3xl bg-[#FFB5DA]">
                <div className="text-xl font-black tracking-tight text-slate-900">{loggingDose.medicineName}</div>
                <div className="text-xs font-semibold text-black/55 mt-0.5">
                  Scheduled for {loggingDose.time} on {loggingDose.date}
                </div>
              </div>

              <div className="mb-4">
                <label className={LABEL}>Dose notes (optional)</label>
                <input
                  type="text"
                  value={doseLogNotes}
                  onChange={(e) => setDoseLogNotes(e.target.value)}
                  placeholder="e.g. Taken with food"
                  className={INPUT}
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  disabled={isLoggingAction}
                  onClick={() => handleExecuteDoseLog('taken')}
                  className={`${BTN_DARK} h-11 text-xs`}
                >
                  ✓ Taken
                </button>
                <button
                  type="button"
                  disabled={isLoggingAction}
                  onClick={() => handleExecuteDoseLog('snoozed')}
                  className="h-11 rounded-full bg-amber-400 hover:bg-amber-500 text-slate-900 text-xs font-bold cursor-pointer active:scale-95 transition disabled:opacity-50"
                >
                  ⏰ Snooze
                </button>
                <button
                  type="button"
                  disabled={isLoggingAction}
                  onClick={() => handleExecuteDoseLog('skipped')}
                  className="h-11 rounded-full bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold cursor-pointer active:scale-95 transition disabled:opacity-50"
                >
                  ✕ Skip
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 3: CAREGIVER INVITE */}
        {isInviteModalOpen && (
          <div className={MODAL_BACKDROP} role="dialog" aria-modal="true" aria-label="Invite caregiver">
            <div className={`${MODAL_PANEL} sm:max-w-sm`}>
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
                <h3 className="m-0 text-base font-extrabold text-slate-900">Invite caregiver</h3>
                <button
                  type="button"
                  onClick={() => setIsInviteModalOpen(false)}
                  aria-label="Close"
                  className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 text-xs font-bold cursor-pointer hover:bg-slate-200"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSendCaregiverInvite} className="space-y-3.5">
                <div>
                  <label className={LABEL}>Name</label>
                  <input
                    type="text"
                    required
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    placeholder="e.g. Dr. Roberts, Mom"
                    className={INPUT}
                  />
                </div>

                <div>
                  <label className={LABEL}>Email or phone</label>
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
                    className={INPUT}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={LABEL}>Role</label>
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as CaregiverInvite['role'])}
                      className={INPUT}
                    >
                      <option value="Family Member">Family</option>
                      <option value="Physician / Doctor">Doctor</option>
                      <option value="Home Nurse">Nurse</option>
                      <option value="Caregiver / Guardian">Caregiver</option>
                    </select>
                  </div>
                  <div>
                    <label className={LABEL}>Permissions</label>
                    <select
                      value={invitePermissions}
                      onChange={(e) => setInvitePermissions(e.target.value as CaregiverInvite['permissions'])}
                      className={INPUT}
                    >
                      <option value="full_access">Full Access</option>
                      <option value="view_only">View Only</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => setIsInviteModalOpen(false)} className={`${BTN_LIGHT} flex-1 h-11 text-xs`}>
                    Cancel
                  </button>
                  <button type="submit" disabled={isSendingInvite} className={`${BTN_DARK} flex-1 h-11 text-xs`}>
                    {isSendingInvite ? 'Sending…' : 'Send'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL 4: IMPORT PREVIEW */}
        {importPreview && (
          <div className={MODAL_BACKDROP} role="dialog" aria-modal="true" aria-label="Import medicines">
            <div className={`${MODAL_PANEL} sm:max-w-sm`}>
              <h3 className="text-base font-extrabold text-slate-900 m-0 mb-1">Import medicines</h3>
              <p className="text-xs text-slate-600 mb-3">
                Found <strong className="text-slate-900">{importPreview.length}</strong> medicines in file.
              </p>

              <div className="max-h-44 overflow-y-auto divide-y divide-slate-100 rounded-2xl p-3 mb-4 bg-slate-50">
                {importPreview.map((item, idx) => (
                  <div key={idx} className="py-1.5 text-xs">
                    <strong className="text-slate-800">{item.name}</strong>
                    <div className="text-slate-500 text-[10px]">{item.times?.join(', ')}</div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 justify-end">
                <button type="button" disabled={isImporting} onClick={() => setImportPreview(null)} className={`${BTN_LIGHT} px-5 h-10 text-xs`}>
                  Cancel
                </button>
                <button type="button" disabled={isImporting} onClick={handleConfirmImport} className={`${BTN_DARK} px-5 h-10 text-xs`}>
                  {isImporting ? 'Importing…' : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 5: NOTIFICATION DETAILS */}
        {isNotifModalOpen && (
          <div className={MODAL_BACKDROP} role="dialog" aria-modal="true" aria-label="Notification settings and tips">
            <div className={`${MODAL_PANEL} sm:max-w-sm`}>
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
                <h3 className="m-0 text-base font-extrabold text-slate-900">Notification settings &amp; tips</h3>
                <button
                  type="button"
                  onClick={() => setIsNotifModalOpen(false)}
                  aria-label="Close"
                  className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 text-xs font-bold cursor-pointer hover:bg-slate-200"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3 text-xs text-slate-600">
                <div className="p-3 rounded-2xl bg-[#FFE3EE]">
                  <span className="font-bold text-slate-900 block mb-0.5">Android notification channels</span>
                  <p className="m-0 text-[11px] text-slate-700">
                    CareCue uses high-importance Android channels (<code className="font-mono text-[10px] bg-white/70 px-1 rounded">carecue_reminders</code> and <code className="font-mono text-[10px] bg-white/70 px-1 rounded">carecue_alerts</code>) with vibration and heads-up popups.
                  </p>
                </div>

                <div className="p-3 rounded-2xl bg-slate-50">
                  <span className="font-bold text-slate-800 block mb-0.5">Android Doze mode &amp; battery tips</span>
                  <p className="m-0 text-[11px] text-slate-600">
                    To prevent delayed alarms on Android devices, ensure CareCue is set to <strong>&apos;Unrestricted&apos;</strong> battery usage in Android Settings.
                  </p>
                </div>

                <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 text-[11px]">
                  <span>Permission status:</span>
                  <strong className={`capitalize ${notifPermissionState === 'granted' ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {notifPermissionState}
                  </strong>
                </div>

                <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 text-[11px]">
                  <span>Alarms in queue:</span>
                  <strong className="text-slate-800">{nativeRemindersScheduled} active</strong>
                </div>
              </div>

              <div className="flex justify-end pt-4 mt-3 border-t border-slate-100">
                <button type="button" onClick={() => setIsNotifModalOpen(false)} className={`${BTN_DARK} px-6 h-10 text-xs`}>
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
