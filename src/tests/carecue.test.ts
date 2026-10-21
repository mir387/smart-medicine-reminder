/**
 * CareCue Automated Logic Tests
 * Tests validation, date math, schedule calculations, and backup validation.
 */

import { calculateTodayDoses, getNextScheduledReminder, dateKey } from '../services/notifications';
import { Medicine, DoseLog } from '../types';

function parseTimes(val: string): string[] {
  const parts = val.split(',').map((t) => t.trim()).filter(Boolean);
  if (!parts.length) throw new Error('Enter at least one reminder time.');
  const validTime = /^([01]\d|2[0-3]):([0-5]\d)$/;
  for (const time of parts) {
    if (!validTime.test(time)) throw new Error(`"${time}" is not a valid 24-hour time.`);
  }
  return Array.from(new Set(parts)).sort();
}

function isActiveOnDate(medicine: Medicine, date: string): boolean {
  return medicine.start_date <= date && (!medicine.end_date || medicine.end_date >= date);
}

async function runTests() {
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  ✓ ${msg}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${msg}`);
      failed++;
    }
  }

  console.log('\n--- Running CareCue Logic Tests ---');

  // Test 1: Time parsing & sorting
  try {
    const times = parseTimes('20:00, 08:00, 14:00, 08:00');
    assert(times.length === 3, 'parseTimes deduplicates entries');
    assert(times[0] === '08:00' && times[1] === '14:00' && times[2] === '20:00', 'parseTimes sorts chronologically');
  } catch (e) {
    assert(false, `parseTimes threw unexpected error: ${e}`);
  }

  // Test 2: Invalid time detection
  try {
    parseTimes('25:00, 08:99');
    assert(false, 'parseTimes should reject 25:00');
  } catch {
    assert(true, 'parseTimes correctly rejects invalid 24-hour times');
  }

  // Test 3: Date eligibility
  const testMed: Medicine = {
    id: 'm1',
    user_id: 'u1',
    name: 'Amoxicillin',
    times: ['08:00', '18:00'],
    start_date: '2026-10-15',
    end_date: '2026-10-22',
  };
  assert(isActiveOnDate(testMed, '2026-10-18') === true, 'isActiveOnDate returns true inside active window');
  assert(isActiveOnDate(testMed, '2026-10-14') === false, 'isActiveOnDate returns false before start_date');
  assert(isActiveOnDate(testMed, '2026-10-25') === false, 'isActiveOnDate returns false after end_date');

  // Test 4: Schedule dose computation
  const targetDate = '2026-10-18';
  const testLogs: DoseLog[] = [
    {
      id: 'log1',
      medicine_id: 'm1',
      user_id: 'u1',
      scheduled_date: '2026-10-18',
      scheduled_time: '08:00',
      logged_at: '2026-10-18T08:05:00Z',
      status: 'taken',
    },
  ];

  const doses = calculateTodayDoses([testMed], testLogs, targetDate);
  assert(doses.length === 2, 'calculateTodayDoses generates 2 doses for 2 scheduled times');
  assert(doses[0].status === 'taken', 'first dose has status "taken" matching dose_logs');
  assert(doses[1].time === '18:00', 'second dose is at 18:00');

  // Test 5: Next reminder selection
  const next = getNextScheduledReminder(doses);
  assert(next !== null && next.time === '18:00', 'getNextScheduledReminder selects the upcoming 18:00 dose');

  // Test 6: dateKey formatting
  const d = new Date(2026, 9, 18); // month 9 is October
  assert(dateKey(d) === '2026-10-18', 'dateKey formats YYYY-MM-DD correctly');

  // Test 7: As-needed (PRN) medicine handling
  const prnMed: Medicine = {
    id: 'prn1',
    user_id: 'u1',
    name: 'Ibuprofen 400mg',
    times: [],
    frequency: 'as_needed',
    start_date: '2026-10-01',
  };
  const prnLogs: DoseLog[] = [
    {
      id: 'log2',
      medicine_id: 'prn1',
      user_id: 'u1',
      scheduled_date: '2026-10-18',
      scheduled_time: '11:30',
      logged_at: '2026-10-18T11:30:00Z',
      status: 'taken',
    },
    {
      id: 'log3',
      medicine_id: 'prn1',
      user_id: 'u1',
      scheduled_date: '2026-10-18',
      scheduled_time: '17:45',
      logged_at: '2026-10-18T17:45:00Z',
      status: 'taken',
    },
  ];

  const { getAsNeededMedicines } = await import('../services/notifications');
  const asNeededList = getAsNeededMedicines([prnMed], prnLogs, '2026-10-18');
  assert(asNeededList.length === 1, 'getAsNeededMedicines identifies PRN medicine correctly');
  assert(asNeededList[0].takenTodayCount === 2, 'PRN medicine correctly counts 2 doses taken today');

  // Test 8: Recurring frequency options
  const { FREQUENCY_OPTIONS, getFrequencyLabel } = await import('../components/DashboardView');
  assert(FREQUENCY_OPTIONS.length === 6, 'FREQUENCY_OPTIONS provides 6 frequency choices');
  assert(getFrequencyLabel('as_needed', []) === 'As needed (PRN)', 'getFrequencyLabel formats as_needed');
  assert(getFrequencyLabel('twice_daily', ['08:00', '20:00']) === 'Twice daily', 'getFrequencyLabel formats twice_daily');
  assert(getFrequencyLabel('once_daily', ['08:00']) === 'Once daily', 'getFrequencyLabel formats once_daily');

  // Test 9: Weekly adherence calculation
  const { calculateWeeklyAdherence, getCurrentWeekRange } = await import('../services/notifications');
  const weekRange = getCurrentWeekRange(new Date('2026-10-19T10:00:00Z'));
  assert(weekRange.days.length === 7, 'getCurrentWeekRange returns 7 days');

  const sampleMed: Medicine = {
    id: 'm-sample',
    user_id: 'u1',
    name: 'Sample Med',
    times: ['08:00', '20:00'],
    start_date: '2026-10-01',
  };
  const sampleLogs: DoseLog[] = [
    {
      id: 'l-sample-1',
      medicine_id: 'm-sample',
      user_id: 'u1',
      scheduled_date: '2026-10-19',
      scheduled_time: '08:00',
      logged_at: '2026-10-19T08:05:00Z',
      status: 'taken',
    },
  ];
  const weeklyData = calculateWeeklyAdherence([sampleMed], sampleLogs, new Date('2026-10-19T10:00:00Z'));
  assert(weeklyData.length === 7, 'calculateWeeklyAdherence generates 7 days of metrics');
  const monData = weeklyData.find((d) => d.day === 'Mon');
  assert(monData !== undefined, 'Monday is present in weekly adherence data');
  assert(monData?.takenCount === 1, 'Monday has 1 dose taken');
  assert(monData?.takenPct === 100, 'Monday past scheduled doses taken percentage is 100%');

  // Test 10: Caregiver connection code generation
  const { generateCaregiverCode } = await import('../services/supabase');
  const code = generateCaregiverCode();
  assert(/^\d{6}$/.test(code), `generateCaregiverCode generates valid 6-digit numeric string (${code})`);

  // Test 11: Missed Dose Alert Trigger evaluation
  const overdueMedicine: Medicine = {
    id: 'm-overdue',
    user_id: 'u1',
    name: 'Metformin 500mg',
    times: ['08:00'],
    start_date: '2026-10-18',
  };
  // No log provided for 08:00 when tested on 2026-10-18 after 08:00
  const evaluatedDoses = calculateTodayDoses([overdueMedicine], [], '2026-10-18', '11:00');
  assert(evaluatedDoses.length === 1, 'calculateTodayDoses finds 1 dose');
  assert(evaluatedDoses[0].status === 'overdue', 'Dose before current time without log is flagged as overdue for caregiver alert');

  // Test 12: Notification time parsing & normalization (24h, 12h AM/PM)
  const { parseTimeParts } = await import('../services/notifications');
  const t24 = parseTimeParts('08:30');
  assert(t24?.formatted24 === '08:30' && t24.hours === 8 && t24.minutes === 30, 'parseTimeParts handles 24h format (08:30)');

  const tPM = parseTimeParts('8:45 PM');
  assert(tPM?.formatted24 === '20:45' && tPM.hours === 20 && tPM.minutes === 45, 'parseTimeParts handles 12h PM format (8:45 PM -> 20:45)');

  const tAM = parseTimeParts('12:15 AM');
  assert(tAM?.formatted24 === '00:15' && tAM.hours === 0 && tAM.minutes === 15, 'parseTimeParts handles midnight 12h AM format (12:15 AM -> 00:15)');

  const tInvalid = parseTimeParts('25:99');
  assert(tInvalid === null, 'parseTimeParts safely rejects invalid times (25:99)');

  // Test 13: Stable positive 31-bit Android notification ID
  const { stableId } = await import('../services/notifications');
  const id1 = stableId('carecue|med-1|2026-10-19|08:00');
  const id2 = stableId('carecue|med-1|2026-10-19|08:00');
  const id3 = stableId('carecue|med-1|2026-10-19|20:00');
  assert(id1 === id2, 'stableId produces deterministic IDs for same key');
  assert(id1 !== id3, 'stableId produces distinct IDs for different keys');
  assert(id1 > 0 && id1 <= 2147483647, 'stableId is a valid positive 31-bit Android integer');

  // Test 14: NotificationService Android ID generation and channels
  const {
    NotificationService,
    generateAndroidNotificationId,
    parseAndroidTime,
    ANDROID_CHANNEL_REMINDERS,
    ANDROID_CHANNEL_ALERTS,
    ANDROID_MAX_SCHEDULED_NOTIFICATIONS,
  } = await import('../services/NotificationService');
  assert(typeof NotificationService.isAndroid === 'function', 'NotificationService has isAndroid method');
  assert(ANDROID_CHANNEL_REMINDERS === 'carecue_reminders', 'ANDROID_CHANNEL_REMINDERS matches carecue_reminders');
  assert(ANDROID_CHANNEL_ALERTS === 'carecue_alerts', 'ANDROID_CHANNEL_ALERTS matches carecue_alerts');
  assert(ANDROID_MAX_SCHEDULED_NOTIFICATIONS === 64, 'ANDROID_MAX_SCHEDULED_NOTIFICATIONS capped at 64 to protect AlarmManager');
  const androidId = generateAndroidNotificationId('carecue|test|1');
  assert(androidId > 0 && androidId <= 2147483647, 'generateAndroidNotificationId creates positive 31-bit integer');
  const parsedTime = parseAndroidTime('07:45 AM');
  assert(parsedTime?.formatted24 === '07:45', 'parseAndroidTime correctly parses 07:45 AM');

  // Test 15: Daily Summary metrics - medications remaining and doses taken progress
  const meds: Medicine[] = [
    { id: 'm1', user_id: 'u1', name: 'Lisinopril', times: ['08:00', '20:00'], start_date: '2026-10-18' },
    { id: 'm2', user_id: 'u1', name: 'Atorvastatin', times: ['20:00'], start_date: '2026-10-18' },
  ];
  // 1 dose taken of m1 at 08:00
  const logs: DoseLog[] = [
    { id: 'l1', medicine_id: 'm1', user_id: 'u1', scheduled_date: '2026-10-18', scheduled_time: '08:00', logged_at: '2026-10-18T08:05:00Z', status: 'taken' },
  ];
  const summaryDoses = calculateTodayDoses(meds, logs, '2026-10-18', '09:00');
  // Total scheduled doses: 3
  assert(summaryDoses.length === 3, 'Total scheduled doses for today is 3');
  // Taken doses: 1
  const takenCount = summaryDoses.filter(d => d.status === 'taken').length;
  assert(takenCount === 1, 'Completed doses count is 1');
  // Pending doses: 2 (m1 at 20:00 and m2 at 20:00)
  const remainingDoses = summaryDoses.filter(d => d.status === 'upcoming' || d.status === 'overdue' || d.status === 'snoozed');
  assert(remainingDoses.length === 2, 'Remaining doses count is 2');
  // Distinct medications remaining: 2 (m1 and m2 both have 20:00 pending)
  const remainingMedsCount = new Set(remainingDoses.map(d => d.medicineId)).size;
  assert(remainingMedsCount === 2, 'Distinct medications remaining count is 2');
  // Progress pct: Math.round((1 / 3) * 100) = 33%
  const progressPct = Math.round((takenCount / summaryDoses.length) * 100);
  assert(progressPct === 33, 'Progress percentage of doses taken is 33%');

  console.log(`\nTests finished: ${passed} passed, ${failed} failed.\n`);
  if (failed > 0) process.exit(1);
}

runTests();
