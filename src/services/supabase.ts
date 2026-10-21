import { createClient } from '@supabase/supabase-js';
import { Medicine, UserProfile, DoseLog, CaregiverInvite, CaregiverAlert } from '../types';

export const SUPABASE_URL = 'https://suvrmmuwvxtvghgbtnvs.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_WAdWbVJxrp0JKGe0qV06_A_fcPAyjsb';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

const LOCAL_STORAGE_MEDS_KEY = 'carecue_medicines_local_v1';
const LOCAL_STORAGE_PROFILE_KEY = 'carecue_profile_local_v1';
const LOCAL_STORAGE_DOSE_LOGS_KEY = 'carecue_dose_logs_local_v1';
const LOCAL_STORAGE_CAREGIVER_INVITES_KEY = 'carecue_caregiver_invites_v1';
const LOCAL_STORAGE_CAREGIVER_ALERTS_KEY = 'carecue_caregiver_alerts_v1';

// Seed demo data for first-time or guest users if empty
const DEFAULT_DEMO_MEDS: Medicine[] = [
  {
    id: 'med-demo-1',
    user_id: 'guest',
    name: 'Metformin 500mg',
    times: ['08:00', '20:00'],
    frequency: 'twice_daily',
    start_date: new Date().toISOString().split('T')[0],
    end_date: null,
    notes: 'Take after meals with water.',
    created_at: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: 'med-demo-2',
    user_id: 'guest',
    name: 'Vitamin D3 1000 IU',
    times: ['09:00'],
    frequency: 'once_daily',
    start_date: new Date().toISOString().split('T')[0],
    end_date: null,
    notes: 'Morning dose with breakfast.',
    created_at: new Date(Date.now() - 172800000).toISOString(),
  },
  {
    id: 'med-demo-3',
    user_id: 'guest',
    name: 'Amoxicillin 250mg',
    times: ['08:00', '14:00', '20:00'],
    frequency: 'three_times_daily',
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
    notes: 'Complete full 7-day course.',
    created_at: new Date().toISOString(),
  },
  {
    id: 'med-demo-4',
    user_id: 'guest',
    name: 'Ibuprofen 400mg',
    times: [],
    frequency: 'as_needed',
    start_date: new Date().toISOString().split('T')[0],
    end_date: null,
    notes: 'Take 1 tablet every 6-8 hours as needed for pain. Max 3 daily.',
    created_at: new Date().toISOString(),
  },
];

// Helper for local storage medicines fallback
export function getLocalMedicines(userId: string): Medicine[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_MEDS_KEY);
    if (!raw) {
      localStorage.setItem(LOCAL_STORAGE_MEDS_KEY, JSON.stringify(DEFAULT_DEMO_MEDS));
      return DEFAULT_DEMO_MEDS;
    }
    const parsed: Medicine[] = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(m => !m.user_id || m.user_id === userId || userId === 'guest');
  } catch {
    return [];
  }
}

export function saveLocalMedicines(medicines: Medicine[]): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_MEDS_KEY, JSON.stringify(medicines));
  } catch (e) {
    console.error('Failed to save medicines to local storage', e);
  }
}

// Medicine API operations with graceful offline/local fallback
export async function getMedicines(userId: string): Promise<Medicine[]> {
  try {
    if (userId !== 'guest') {
      const { data, error } = await supabase
        .from('medicines')
        .select('id,user_id,name,times,start_date,end_date,notes,created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (!error && Array.isArray(data)) {
        saveLocalMedicines(data);
        return data;
      }
      if (error) {
        console.warn('Supabase getMedicines warning, falling back to local storage:', error.message);
      }
    }
  } catch (err) {
    console.warn('Supabase query error, fallback to local', err);
  }
  return getLocalMedicines(userId);
}

export async function saveMedicine(
  medicine: {
    id?: string;
    user_id: string;
    name: string;
    times: string[];
    start_date: string;
    end_date?: string | null;
    notes?: string | null;
    frequency?: import('../types').FrequencyType;
  },
  userId: string
): Promise<Medicine> {
  const isUpdate = Boolean(medicine.id);
  const now = new Date().toISOString();
  const id = medicine.id || 'med-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);

  const payload: Medicine = {
    id,
    user_id: userId,
    name: medicine.name,
    times: medicine.times,
    start_date: medicine.start_date,
    end_date: medicine.end_date || null,
    notes: medicine.notes || null,
    frequency: medicine.frequency || 'custom',
    created_at: now,
  };

  // Try Supabase first if authenticated
  if (userId !== 'guest') {
    try {
      if (isUpdate) {
        const { data, error } = await supabase
          .from('medicines')
          .update({
            name: payload.name,
            times: payload.times,
            start_date: payload.start_date,
            end_date: payload.end_date,
            notes: payload.notes,
            frequency: payload.frequency,
          })
          .eq('id', id)
          .eq('user_id', userId)
          .select()
          .maybeSingle();

        if (!error && data) {
          const local = getLocalMedicines(userId);
          const updated = local.map(m => (m.id === id ? { ...m, ...payload } : m));
          saveLocalMedicines(updated);
          return data;
        }
      } else {
        const { data, error } = await supabase
          .from('medicines')
          .insert([payload])
          .select()
          .maybeSingle();

        if (!error && data) {
          const local = getLocalMedicines(userId);
          saveLocalMedicines([data, ...local]);
          return data;
        }
      }
    } catch (e) {
      console.warn('Supabase save error, persisting locally:', e);
    }
  }

  // Local fallback
  const local = getLocalMedicines(userId);
  let updatedList: Medicine[];
  if (isUpdate) {
    updatedList = local.map(m => (m.id === id ? { ...m, ...payload } : m));
  } else {
    updatedList = [payload, ...local];
  }
  saveLocalMedicines(updatedList);
  return payload;
}

export async function deleteMedicine(id: string, userId: string): Promise<boolean> {
  if (userId !== 'guest') {
    try {
      const { error } = await supabase
        .from('medicines')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (error) {
        console.warn('Supabase delete warning:', error.message);
      }
    } catch (e) {
      console.warn('Supabase delete exception:', e);
    }
  }

  const local = getLocalMedicines(userId);
  const updated = local.filter(m => m.id !== id);
  saveLocalMedicines(updated);
  return true;
}

export async function deleteAllMedicines(userId: string): Promise<boolean> {
  if (userId !== 'guest') {
    try {
      const { error } = await supabase
        .from('medicines')
        .delete()
        .eq('user_id', userId);

      if (error) {
        console.warn('Supabase delete all error:', error.message);
      }
    } catch (e) {
      console.warn('Supabase delete all exception:', e);
    }
  }

  saveLocalMedicines([]);
  return true;
}

// ==========================================
// REAL DOSE LOGS (Supabase + Local fallback)
// ==========================================
function createDemoDoseLogs(): DoseLog[] {
  const logs: DoseLog[] = [];
  const now = new Date();

  // Create demo logs for the past 6 days
  for (let offset = 6; offset >= 1; offset--) {
    const d = new Date(now);
    d.setDate(now.getDate() - offset);
    const dayStr = [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, '0'),
      String(d.getDate()).padStart(2, '0'),
    ].join('-');

    // Day offset 4 missed one dose for realistic adherence variation
    const isMissedDay = offset === 4;

    // Metformin 08:00
    logs.push({
      id: `demo-log-met1-${dayStr}`,
      medicine_id: 'med-demo-1',
      user_id: 'guest',
      scheduled_date: dayStr,
      scheduled_time: '08:00',
      logged_at: `${dayStr}T08:12:00Z`,
      status: 'taken',
    });

    // Vitamin D3 09:00
    if (!isMissedDay) {
      logs.push({
        id: `demo-log-vit-${dayStr}`,
        medicine_id: 'med-demo-2',
        user_id: 'guest',
        scheduled_date: dayStr,
        scheduled_time: '09:00',
        logged_at: `${dayStr}T09:05:00Z`,
        status: 'taken',
      });
    } else {
      logs.push({
        id: `demo-log-vit-${dayStr}`,
        medicine_id: 'med-demo-2',
        user_id: 'guest',
        scheduled_date: dayStr,
        scheduled_time: '09:00',
        logged_at: `${dayStr}T10:00:00Z`,
        status: 'skipped',
      });
    }

    // Metformin 20:00
    logs.push({
      id: `demo-log-met2-${dayStr}`,
      medicine_id: 'med-demo-1',
      user_id: 'guest',
      scheduled_date: dayStr,
      scheduled_time: '20:00',
      logged_at: `${dayStr}T20:25:00Z`,
      status: 'taken',
    });
  }

  return logs;
}

export function getLocalDoseLogs(userId: string): DoseLog[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_DOSE_LOGS_KEY);
    if (!raw) {
      const demoLogs = createDemoDoseLogs();
      localStorage.setItem(LOCAL_STORAGE_DOSE_LOGS_KEY, JSON.stringify(demoLogs));
      return demoLogs;
    }
    const parsed: DoseLog[] = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(l => l.user_id === userId || userId === 'guest');
  } catch {
    return [];
  }
}

export function saveLocalDoseLogs(logs: DoseLog[]): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_DOSE_LOGS_KEY, JSON.stringify(logs));
  } catch (e) {
    console.error('Failed to save dose logs to local storage', e);
  }
}

export async function getDoseLogs(userId: string, targetDate?: string): Promise<DoseLog[]> {
  try {
    if (userId !== 'guest') {
      let query = supabase
        .from('dose_logs')
        .select('*')
        .eq('user_id', userId)
        .order('logged_at', { ascending: false });

      if (targetDate) {
        query = query.eq('scheduled_date', targetDate);
      }

      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        return data;
      }
    }
  } catch (err) {
    console.warn('Supabase dose_logs query warning:', err);
  }

  const local = getLocalDoseLogs(userId);
  if (targetDate) {
    return local.filter(l => l.scheduled_date === targetDate);
  }
  return local;
}

export async function recordDoseLog(
  userIdOrPayload:
    | string
    | {
        medicine_id: string;
        user_id?: string;
        scheduled_date: string;
        scheduled_time: string;
        status: 'taken' | 'skipped' | 'snoozed' | 'missed';
        notes?: string | null;
        logged_by?: string;
      },
  medicineIdOrUserId?: string,
  scheduledDate?: string,
  scheduledTime?: string,
  status?: 'taken' | 'skipped' | 'snoozed' | 'missed',
  notes?: string | null
): Promise<DoseLog> {
  let uid = '';
  let medId = '';
  let sDate = '';
  let sTime = '';
  let st: 'taken' | 'skipped' | 'snoozed' | 'missed' = 'taken';
  let nt: string | null = null;
  let loggedBy: string | undefined = undefined;

  if (typeof userIdOrPayload === 'object') {
    uid = userIdOrPayload.user_id || medicineIdOrUserId || 'guest';
    medId = userIdOrPayload.medicine_id;
    sDate = userIdOrPayload.scheduled_date;
    sTime = userIdOrPayload.scheduled_time;
    st = userIdOrPayload.status;
    nt = userIdOrPayload.notes || null;
    loggedBy = userIdOrPayload.logged_by;
  } else {
    uid = userIdOrPayload;
    medId = medicineIdOrUserId || '';
    sDate = scheduledDate || '';
    sTime = scheduledTime || '';
    st = status || 'taken';
    nt = notes || null;
  }

  const newLog: DoseLog = {
    id: 'log-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
    medicine_id: medId,
    user_id: uid,
    scheduled_date: sDate,
    scheduled_time: sTime,
    logged_at: new Date().toISOString(),
    status: st,
    notes: nt,
    logged_by: loggedBy,
  };

  if (uid !== 'guest') {
    try {
      const { data, error } = await supabase
        .from('dose_logs')
        .insert([newLog])
        .select()
        .maybeSingle();

      if (!error && data) {
        const local = getLocalDoseLogs(uid);
        saveLocalDoseLogs([data, ...local.filter(l => !(l.medicine_id === medId && l.scheduled_date === sDate && l.scheduled_time === sTime))]);
        return data;
      }
    } catch (e) {
      console.warn('Supabase recordDoseLog error, storing locally:', e);
    }
  }

  const local = getLocalDoseLogs(uid);
  const filtered = local.filter(l => !(l.medicine_id === medId && l.scheduled_date === sDate && l.scheduled_time === sTime));
  const updated = [newLog, ...filtered];
  saveLocalDoseLogs(updated);
  return newLog;
}

export async function deleteDoseLog(logId: string, userId: string): Promise<boolean> {
  if (userId !== 'guest') {
    try {
      await supabase.from('dose_logs').delete().eq('id', logId).eq('user_id', userId);
    } catch (e) {
      console.warn('Supabase delete dose log error:', e);
    }
  }
  const local = getLocalDoseLogs(userId);
  saveLocalDoseLogs(local.filter(l => l.id !== logId));
  return true;
}

// ==========================================
// USER PROFILE
// ==========================================
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  if (userId === 'guest') {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_PROFILE_KEY);
      if (stored) return JSON.parse(stored);
    } catch {}
    return {
      id: 'guest',
      full_name: 'Guest User',
      email: 'guest@carecue.app',
      phone: '',
    };
  }

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('full_name, phone')
      .eq('id', userId)
      .maybeSingle();

    if (!error && data) {
      return {
        id: userId,
        full_name: data.full_name || '',
        phone: data.phone || '',
      };
    }
  } catch (e) {
    console.warn('Profile fetch error:', e);
  }

  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_PROFILE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}

  return null;
}

export async function saveUserProfile(userId: string, fullName: string, phone: string, email?: string): Promise<UserProfile> {
  const profile: UserProfile = {
    id: userId,
    full_name: fullName,
    phone,
    email,
  };

  if (userId !== 'guest') {
    try {
      const { error } = await supabase
        .from('profiles')
        .upsert(
          {
            id: userId,
            full_name: fullName,
            phone: phone || null,
          },
          { onConflict: 'id' }
        );

      if (error) {
        console.warn('Supabase profile upsert error:', error.message);
      }
    } catch (e) {
      console.warn('Supabase profile upsert exception:', e);
    }
  }

  localStorage.setItem(LOCAL_STORAGE_PROFILE_KEY, JSON.stringify(profile));
  return profile;
}

// ==========================================
// CAREGIVER & FAMILY SHARING
// ==========================================

export function getLocalCaregiverInvites(patientId: string): CaregiverInvite[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_CAREGIVER_INVITES_KEY);
    if (!raw) {
      // Default demo connected caregiver for realistic preview
      const demoInvite: CaregiverInvite = {
        id: 'invite-demo-1',
        patient_id: patientId,
        code: '748291',
        caregiver_name: 'Dr. Sarah Jenkins',
        caregiver_email: 'dr.jenkins@stmarys-health.org',
        caregiver_phone: '+1 (555) 234-5678',
        role: 'Physician / Doctor',
        permissions: 'view_only',
        status: 'active',
        created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
        expires_at: new Date(Date.now() + 27 * 86400000).toISOString(),
      };
      const demoFamily: CaregiverInvite = {
        id: 'invite-demo-2',
        patient_id: patientId,
        code: '639104',
        caregiver_name: 'Elena (Daughter)',
        caregiver_email: 'elena.family@carecue.app',
        caregiver_phone: '+1 (555) 876-5432',
        role: 'Family Member',
        permissions: 'full_access',
        status: 'active',
        created_at: new Date(Date.now() - 7 * 86400000).toISOString(),
        expires_at: new Date(Date.now() + 23 * 86400000).toISOString(),
      };
      const list = [demoInvite, demoFamily];
      localStorage.setItem(LOCAL_STORAGE_CAREGIVER_INVITES_KEY, JSON.stringify(list));
      return list;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(i => !i.patient_id || i.patient_id === patientId || patientId === 'guest');
    }
  } catch {}
  return [];
}

export function saveLocalCaregiverInvites(invites: CaregiverInvite[]): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_CAREGIVER_INVITES_KEY, JSON.stringify(invites));
  } catch (e) {
    console.error('Failed to save caregiver invites', e);
  }
}

export async function getCaregiverInvites(patientId: string): Promise<CaregiverInvite[]> {
  return getLocalCaregiverInvites(patientId);
}

export async function createCaregiverInvite(
  inviteData: Omit<CaregiverInvite, 'id' | 'created_at'>
): Promise<CaregiverInvite> {
  const newInvite: CaregiverInvite = {
    id: `invite-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    ...inviteData,
    created_at: new Date().toISOString(),
  };

  const list = getLocalCaregiverInvites(inviteData.patient_id);
  const updated = [newInvite, ...list];
  saveLocalCaregiverInvites(updated);
  return newInvite;
}

export async function revokeCaregiverInvite(inviteId: string, patientId: string): Promise<boolean> {
  const list = getLocalCaregiverInvites(patientId);
  const updated = list.filter(i => i.id !== inviteId);
  saveLocalCaregiverInvites(updated);
  return true;
}

// Generate secure 6-digit connection code
export function generateCaregiverCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ==========================================
// CAREGIVER MISSED DOSE ALERTS
// ==========================================

export function getLocalCaregiverAlerts(patientId: string): CaregiverAlert[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_CAREGIVER_ALERTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter(a => !a.patient_id || a.patient_id === patientId || patientId === 'guest');
      }
    }
  } catch {}
  return [];
}

export function saveLocalCaregiverAlerts(alerts: CaregiverAlert[]): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_CAREGIVER_ALERTS_KEY, JSON.stringify(alerts));
  } catch (e) {
    console.error('Failed to save caregiver alerts', e);
  }
}

export async function getCaregiverAlerts(patientId: string): Promise<CaregiverAlert[]> {
  return getLocalCaregiverAlerts(patientId);
}

export async function createCaregiverAlert(
  alertData: Omit<CaregiverAlert, 'id' | 'created_at' | 'acknowledged'>
): Promise<CaregiverAlert> {
  const alerts = getLocalCaregiverAlerts(alertData.patient_id);
  
  // Check if identical active alert already logged recently to prevent duplicate spamming
  const existing = alerts.find(
    a => a.medicine_id === alertData.medicine_id &&
         a.scheduled_date === alertData.scheduled_date &&
         a.scheduled_time === alertData.scheduled_time &&
         !a.acknowledged
  );
  if (existing) {
    return existing;
  }

  const newAlert: CaregiverAlert = {
    id: `alert-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    ...alertData,
    created_at: new Date().toISOString(),
    acknowledged: false,
  };

  const updated = [newAlert, ...alerts].slice(0, 50);
  saveLocalCaregiverAlerts(updated);
  return newAlert;
}

export async function acknowledgeCaregiverAlert(
  alertId: string,
  patientId: string,
  acknowledgedBy = 'Caregiver'
): Promise<boolean> {
  const alerts = getLocalCaregiverAlerts(patientId);
  const updated = alerts.map(a => {
    if (a.id === alertId) {
      return {
        ...a,
        acknowledged: true,
        acknowledged_at: new Date().toISOString(),
        acknowledged_by: acknowledgedBy,
      };
    }
    return a;
  });
  saveLocalCaregiverAlerts(updated);
  return true;
}

export async function dismissCaregiverAlert(alertId: string, patientId: string): Promise<boolean> {
  const alerts = getLocalCaregiverAlerts(patientId);
  const updated = alerts.filter(a => a.id !== alertId);
  saveLocalCaregiverAlerts(updated);
  return true;
}

