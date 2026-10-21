export type FrequencyType =
  | 'once_daily'
  | 'twice_daily'
  | 'three_times_daily'
  | 'four_times_daily'
  | 'as_needed'
  | 'custom';

export interface Medicine {
  id: string;
  user_id: string;
  name: string;
  times: string[];
  start_date: string;
  end_date?: string | null;
  notes?: string | null;
  created_at?: string;
  frequency?: FrequencyType;
  dosage?: string;
  instructions?: string;
}

export interface DoseLog {
  id: string;
  medicine_id: string;
  user_id: string;
  scheduled_date: string; // YYYY-MM-DD
  scheduled_time: string; // HH:MM
  logged_at: string; // ISO string
  status: 'taken' | 'skipped' | 'snoozed' | 'missed';
  notes?: string | null;
  logged_by?: string; // 'patient' | 'caregiver'
}

export interface ActivityEntry {
  message: string;
  time: string;
  key?: string;
  kind?: 'ack' | 'snooze' | 'info' | 'alert' | 'caregiver' | 'dose';
}

export interface UserProfile {
  id: string;
  full_name: string;
  phone?: string | null;
  email?: string;
  emergency_contact?: string;
  caregiver_code?: string;
  relationship?: string;
}

export interface ScheduledDoseItem {
  medicineId: string;
  medicineName: string;
  time: string;
  date: string;
  notes?: string | null;
  status: 'upcoming' | 'overdue' | 'taken' | 'skipped' | 'snoozed' | 'missed';
  eventKey: string;
  doseLog?: DoseLog;
}

export interface StatusBanner {
  message: string;
  type: 'info' | 'success' | 'error';
  id?: number;
}

export interface WeeklyAdherenceDay {
  day: string;
  date: string;
  fullDate: string;
  takenPct: number;
  missedPct: number;
  takenCount: number;
  missedCount: number;
  totalScheduled: number;
  isToday: boolean;
  isFuture: boolean;
}

export interface CaregiverInvite {
  id: string;
  patient_id: string;
  code: string; // 6-digit connection code
  caregiver_name?: string;
  caregiver_email?: string;
  caregiver_phone?: string;
  role: 'Family Member' | 'Physician / Doctor' | 'Home Nurse' | 'Caregiver / Guardian';
  permissions: 'view_only' | 'full_access';
  status: 'active' | 'pending';
  created_at: string;
  expires_at: string;
}

export interface CaregiverAlert {
  id: string;
  patient_id: string;
  medicine_id: string;
  medicine_name: string;
  scheduled_time: string;
  scheduled_date: string;
  alert_type: 'overdue' | 'missed' | 'refill_needed';
  severity: 'high' | 'medium' | 'low';
  created_at: string;
  acknowledged: boolean;
  acknowledged_at?: string;
  acknowledged_by?: string;
  notes?: string;
}
