import { describe, it, expect } from 'vitest';
import {
  calculateDueReminders,
  getUpcomingDoseGroup,
  formatReminderNotification,
  applySnooze,
  applyDismiss,
  applyMarkDelivered
} from './reminderScheduler';
import type { Medication, DailyLog, ReminderPreferences, ReminderDeliveryState } from '../types';

function createMockMed(
  id: string,
  name: string,
  timeSlots: ('morning' | 'midday' | 'evening' | 'bedtime')[],
  isActive: boolean = true
): Medication {
  return {
    id,
    name,
    dosage: '10mg',
    form: 'Tablet',
    timeSlots,
    withFood: false,
    instructions: 'Take daily',
    pillVisual: { shape: 'round', color: 'white' },
    isActive,
    createdAt: '2026-01-01T00:00:00.000Z'
  };
}

const DEFAULT_TEST_PREFS: ReminderPreferences = {
  enabled: true,
  includeMedNames: false,
  defaultSnoozeMinutes: 10,
  customSlotTimes: {
    morning: '08:00',
    midday: '13:00',
    evening: '18:30',
    bedtime: '22:00'
  }
};

const EMPTY_DELIVERY: ReminderDeliveryState = {
  lastDelivered: {},
  snoozedUntil: {},
  dismissed: {}
};

describe('Reminder Scheduler Engine', () => {
  // 1. Single daily dose reminder
  it('1. should calculate a single daily dose reminder when scheduled time is reached', () => {
    const meds = [createMockMed('m1', 'Lisinopril', ['morning'])];
    const log: DailyLog = { date: '2026-10-16', doses: {} };
    const testDate = new Date(2026, 9, 16, 8, 5); // 8:05 AM

    const due = calculateDueReminders(meds, log, DEFAULT_TEST_PREFS, EMPTY_DELIVERY, testDate);
    expect(due.length).toBe(1);
    expect(due[0].slot).toBe('morning');
    expect(due[0].medications[0].name).toBe('Lisinopril');
  });

  // 2. Multiple medications at the same time
  it('2. should group multiple medications scheduled at the same time into a single reminder event', () => {
    const meds = [
      createMockMed('m1', 'Lisinopril', ['morning']),
      createMockMed('m2', 'Metformin', ['morning'])
    ];
    const log: DailyLog = { date: '2026-10-16', doses: {} };
    const testDate = new Date(2026, 9, 16, 8, 1);

    const due = calculateDueReminders(meds, log, DEFAULT_TEST_PREFS, EMPTY_DELIVERY, testDate);
    expect(due.length).toBe(1);
    expect(due[0].medications.length).toBe(2);
    expect(due[0].slot).toBe('morning');
  });

  // 3. Multiple doses of the same medication
  it('3. should handle medications scheduled across multiple time slots', () => {
    const meds = [createMockMed('m1', 'Metformin', ['morning', 'evening'])];
    const log: DailyLog = { date: '2026-10-16', doses: {} };

    // Morning check
    const morningDate = new Date(2026, 9, 16, 8, 15);
    const morningDue = calculateDueReminders(meds, log, DEFAULT_TEST_PREFS, EMPTY_DELIVERY, morningDate);
    expect(morningDue.length).toBe(1);
    expect(morningDue[0].slot).toBe('morning');

    // Evening check
    const eveningDate = new Date(2026, 9, 16, 18, 35);
    const eveningDue = calculateDueReminders(meds, log, DEFAULT_TEST_PREFS, EMPTY_DELIVERY, eveningDate);
    expect(eveningDue.some(e => e.slot === 'evening')).toBe(true);
  });

  // 4. Dose marked as taken before reminder
  it('4. should not generate a reminder if the dose was already recorded as taken prior to reminder time', () => {
    const meds = [createMockMed('m1', 'Lisinopril', ['morning'])];
    const log: DailyLog = {
      date: '2026-10-16',
      doses: { 'm1_morning': { taken: true, timestamp: '07:45 AM' } }
    };
    const testDate = new Date(2026, 9, 16, 8, 10);

    const due = calculateDueReminders(meds, log, DEFAULT_TEST_PREFS, EMPTY_DELIVERY, testDate);
    expect(due.length).toBe(0);
  });

  // 5. Dose marked as taken after reminder
  it('5. should suppress reminder once dose is subsequently recorded as taken', () => {
    const meds = [createMockMed('m1', 'Lisinopril', ['morning'])];
    const logBefore: DailyLog = { date: '2026-10-16', doses: {} };
    const testDate = new Date(2026, 9, 16, 8, 15);

    const dueBefore = calculateDueReminders(meds, logBefore, DEFAULT_TEST_PREFS, EMPTY_DELIVERY, testDate);
    expect(dueBefore.length).toBe(1);

    const logAfter: DailyLog = {
      date: '2026-10-16',
      doses: { 'm1_morning': { taken: true, timestamp: '08:16 AM' } }
    };
    const dueAfter = calculateDueReminders(meds, logAfter, DEFAULT_TEST_PREFS, EMPTY_DELIVERY, testDate);
    expect(dueAfter.length).toBe(0);
  });

  // 6. Paused medication
  it('6. should ignore paused / inactive medications', () => {
    const meds = [createMockMed('m1', 'Lisinopril', ['morning'], false)]; // inactive
    const log: DailyLog = { date: '2026-10-16', doses: {} };
    const testDate = new Date(2026, 9, 16, 8, 30);

    const due = calculateDueReminders(meds, log, DEFAULT_TEST_PREFS, EMPTY_DELIVERY, testDate);
    expect(due.length).toBe(0);
  });

  // 7. Deleted medication
  it('7. should not generate reminders for deleted medications', () => {
    const meds: Medication[] = []; // deleted / empty
    const log: DailyLog = { date: '2026-10-16', doses: {} };
    const testDate = new Date(2026, 9, 16, 8, 30);

    const due = calculateDueReminders(meds, log, DEFAULT_TEST_PREFS, EMPTY_DELIVERY, testDate);
    expect(due.length).toBe(0);
  });

  // 8. Schedule edited after initial scheduling
  it('8. should recalculate reminders when medication schedule slots are edited', () => {
    // Originally morning, edited to evening
    const medsEdited = [createMockMed('m1', 'Lisinopril', ['evening'])];
    const log: DailyLog = { date: '2026-10-16', doses: {} };
    const morningDate = new Date(2026, 9, 16, 8, 30);

    const morningDue = calculateDueReminders(medsEdited, log, DEFAULT_TEST_PREFS, EMPTY_DELIVERY, morningDate);
    expect(morningDue.length).toBe(0);

    const eveningDate = new Date(2026, 9, 16, 18, 35);
    const eveningDue = calculateDueReminders(medsEdited, log, DEFAULT_TEST_PREFS, EMPTY_DELIVERY, eveningDate);
    expect(eveningDue.length).toBe(1);
    expect(eveningDue[0].slot).toBe('evening');
  });

  // 9. Duplicate event prevention
  it('9. should prevent duplicate notifications once marked as delivered', () => {
    const meds = [createMockMed('m1', 'Lisinopril', ['morning'])];
    const log: DailyLog = { date: '2026-10-16', doses: {} };
    const testDate = new Date(2026, 9, 16, 8, 10);

    const stateAfterDelivery = applyMarkDelivered(EMPTY_DELIVERY, '2026-10-16', 'morning', testDate);
    const dueSecondCheck = calculateDueReminders(meds, log, DEFAULT_TEST_PREFS, stateAfterDelivery, testDate);
    expect(dueSecondCheck.length).toBe(0);
  });

  // 10. Snooze and dismissal
  it('10. should respect snooze delay and dismissal without recording adherence', () => {
    const meds = [createMockMed('m1', 'Lisinopril', ['morning'])];
    const log: DailyLog = { date: '2026-10-16', doses: {} };
    const initialDate = new Date(2026, 9, 16, 8, 0);

    // Apply 10 minute snooze
    const snoozedState = applySnooze(EMPTY_DELIVERY, '2026-10-16', 'morning', 10, initialDate);

    // At 8:05 AM (still snoozed)
    const at805 = new Date(2026, 9, 16, 8, 5);
    expect(calculateDueReminders(meds, log, DEFAULT_TEST_PREFS, snoozedState, at805).length).toBe(0);

    // At 8:11 AM (snooze expired)
    const at811 = new Date(2026, 9, 16, 8, 11);
    const dueAfterSnooze = calculateDueReminders(meds, log, DEFAULT_TEST_PREFS, snoozedState, at811);
    expect(dueAfterSnooze.length).toBe(1);
    expect(dueAfterSnooze[0].isSnoozed).toBe(true);

    // Dismissal
    const dismissedState = applyDismiss(EMPTY_DELIVERY, '2026-10-16', 'morning', at811);
    expect(calculateDueReminders(meds, log, DEFAULT_TEST_PREFS, dismissedState, at811).length).toBe(0);
  });

  // 11. Day rollover
  it('11. should reset delivery state for the new calendar day without carrying over dismissal', () => {
    const meds = [createMockMed('m1', 'Lisinopril', ['morning'])];
    const logToday: DailyLog = { date: '2026-10-17', doses: {} };

    // Yesterday's delivery state
    const yesterdayState: ReminderDeliveryState = {
      lastDelivered: { '2026-10-16_morning': '2026-10-16T08:00:00.000Z' },
      snoozedUntil: {},
      dismissed: { '2026-10-16_morning': '2026-10-16T08:15:00.000Z' }
    };

    // On Oct 17 morning
    const nextDay = new Date(2026, 9, 17, 8, 10);
    const dueNextDay = calculateDueReminders(meds, logToday, DEFAULT_TEST_PREFS, yesterdayState, nextDay);
    expect(dueNextDay.length).toBe(1);
    expect(dueNextDay[0].date).toBe('2026-10-17');
  });

  // 12. Missing or corrupted reminder preferences
  it('12. should handle disabled or corrupted reminder preferences safely', () => {
    const meds = [createMockMed('m1', 'Lisinopril', ['morning'])];
    const log: DailyLog = { date: '2026-10-16', doses: {} };
    const testDate = new Date(2026, 9, 16, 8, 10);

    const disabledPrefs: ReminderPreferences = {
      ...DEFAULT_TEST_PREFS,
      enabled: false
    };

    const due = calculateDueReminders(meds, log, disabledPrefs, EMPTY_DELIVERY, testDate);
    expect(due.length).toBe(0);
  });

  // 13. Missed timer execution and app resume
  it('13. should detect overdue unrecorded doses when opening app after scheduled time', () => {
    const meds = [createMockMed('m1', 'Lisinopril', ['morning'])];
    const log: DailyLog = { date: '2026-10-16', doses: {} };
    // Open app at 10:30 AM (2.5 hours after 8:00 AM morning slot)
    const lateResumeDate = new Date(2026, 9, 16, 10, 30);

    const due = calculateDueReminders(meds, log, DEFAULT_TEST_PREFS, EMPTY_DELIVERY, lateResumeDate);
    expect(due.length).toBe(1);
    expect(due[0].isOverdue).toBe(true);
  });

  // 14. Permission & message formatting privacy
  it('14. should format generic privacy-first notifications by default', () => {
    const event = {
      slot: 'morning' as const,
      scheduledTime: '08:00',
      date: '2026-10-16',
      medications: [createMockMed('m1', 'Lisinopril', ['morning'])],
      isSnoozed: false,
      isOverdue: false,
      isTaken: false
    };

    const genericMsg = formatReminderNotification(event, false);
    expect(genericMsg.title).toContain('CareDose');
    expect(genericMsg.body).toContain('1 Morning medication');
    expect(genericMsg.body).not.toContain('Lisinopril');

    const detailedMsg = formatReminderNotification(event, true);
    expect(detailedMsg.body).toContain('Lisinopril');
  });

  // 15. Upcoming dose group calculation
  it('15. should correctly calculate upcoming dose groups for the Daily Pillbox overview', () => {
    const meds = [
      createMockMed('m1', 'Lisinopril', ['morning']),
      createMockMed('m2', 'Metformin', ['evening'])
    ];
    const log: DailyLog = {
      date: '2026-10-16',
      doses: { 'm1_morning': { taken: true, timestamp: '08:00 AM' } }
    };
    // At 12:00 PM
    const middayDate = new Date(2026, 9, 16, 12, 0);

    const upcoming = getUpcomingDoseGroup(meds, log, DEFAULT_TEST_PREFS.customSlotTimes, middayDate);
    expect(upcoming).not.toBeNull();
    expect(upcoming?.slot).toBe('evening');
    expect(upcoming?.totalCount).toBe(1);
    expect(upcoming?.allRecorded).toBe(false);
  });
});
