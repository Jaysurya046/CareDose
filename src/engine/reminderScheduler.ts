import type { Medication, DailyLog, TimeSlot, ReminderPreferences, ReminderDeliveryState, ScheduledReminderEvent, SnoozeInterval } from '../types';
import { getTodayDateString } from '../utils/date';

export const ORDERED_SLOTS: TimeSlot[] = ['morning', 'midday', 'evening', 'bedtime'];

export interface UpcomingDoseInfo {
  slot: TimeSlot;
  slotLabel: string;
  timeString: string;
  medications: Medication[];
  totalCount: number;
  recordedCount: number;
  allRecorded: boolean;
  isToday: boolean;
}

/**
 * Parses "HH:MM" (24-hour) string on a given base date into a Date object.
 */
export function parseSlotTime(baseDate: Date, timeStr: string): Date {
  const parts = timeStr.split(':').map(p => parseInt(p, 10));
  const hours = isNaN(parts[0]) ? 8 : parts[0];
  const minutes = isNaN(parts[1]) ? 0 : parts[1];

  const result = new Date(baseDate);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

/**
 * Pure, deterministic evaluation of which medication reminders are currently due.
 * Does not interact with the DOM or system APIs.
 */
export function calculateDueReminders(
  activeMedications: Medication[],
  dailyLog: DailyLog,
  preferences: ReminderPreferences,
  deliveryState: ReminderDeliveryState,
  referenceDate: Date = new Date()
): ScheduledReminderEvent[] {
  if (!preferences.enabled) {
    return [];
  }

  const dateStr = getTodayDateString(referenceDate);
  const nowMs = referenceDate.getTime();
  const dueEvents: ScheduledReminderEvent[] = [];

  // Filter to active medications only
  const activeMeds = activeMedications.filter(m => m && m.isActive);
  if (activeMeds.length === 0) {
    return [];
  }

  for (const slot of ORDERED_SLOTS) {
    const medsInSlot = activeMeds.filter(m => m.timeSlots && m.timeSlots.includes(slot));
    if (medsInSlot.length === 0) {
      continue;
    }

    // Check which medications are already taken
    const unrecordedMeds = medsInSlot.filter(m => {
      const record = dailyLog.doses[`${m.id}_${slot}`];
      return !record || !record.taken;
    });

    // If all medications for this slot are already recorded as taken, no reminder needed
    if (unrecordedMeds.length === 0) {
      continue;
    }

    const occurrenceKey = `${dateStr}_${slot}`;
    const slotTimeStr = preferences.customSlotTimes[slot] || '08:00';
    const slotTargetDate = parseSlotTime(referenceDate, slotTimeStr);
    const slotTargetMs = slotTargetDate.getTime();

    // Check if dismissed
    const isDismissed = !!deliveryState.dismissed[occurrenceKey];

    // Check if snoozed
    const snoozedUntilMs = deliveryState.snoozedUntil[occurrenceKey];
    const isCurrentlySnoozed = snoozedUntilMs !== undefined && nowMs < snoozedUntilMs;
    const isSnoozeExpired = snoozedUntilMs !== undefined && nowMs >= snoozedUntilMs;

    if (isCurrentlySnoozed) {
      // Still in snooze window
      continue;
    }

    if (isSnoozeExpired) {
      // Snooze expired: trigger event
      const isOverdue = nowMs > slotTargetMs + 30 * 60 * 1000;
      dueEvents.push({
        slot,
        scheduledTime: slotTimeStr,
        date: dateStr,
        medications: unrecordedMeds,
        isSnoozed: true,
        isOverdue,
        isTaken: false
      });
      continue;
    }

    // Not snoozed: check normal schedule
    if (isDismissed) {
      // Dismissed for today and not re-snoozed
      continue;
    }

    // Has it reached the scheduled time?
    if (nowMs >= slotTargetMs) {
      // Has it already been delivered once without snooze?
      const alreadyDelivered = !!deliveryState.lastDelivered[occurrenceKey];
      if (!alreadyDelivered) {
        const isOverdue = nowMs > slotTargetMs + 30 * 60 * 1000;
        dueEvents.push({
          slot,
          scheduledTime: slotTimeStr,
          date: dateStr,
          medications: unrecordedMeds,
          isSnoozed: false,
          isOverdue,
          isTaken: false
        });
      }
    }
  }

  return dueEvents;
}

/**
 * Determines the next upcoming scheduled dose group for display in the Daily Pillbox.
 */
export function getUpcomingDoseGroup(
  activeMedications: Medication[],
  dailyLog: DailyLog,
  slotTimes: Record<TimeSlot, string>,
  referenceDate: Date = new Date()
): UpcomingDoseInfo | null {
  const activeMeds = activeMedications.filter(m => m && m.isActive);
  if (activeMeds.length === 0) return null;

  const nowMs = referenceDate.getTime();
  const slotLabels: Record<TimeSlot, string> = {
    morning: 'Morning',
    midday: 'Midday',
    evening: 'Evening',
    bedtime: 'Bedtime'
  };

  // 1. Look for unrecorded doses that are due or upcoming today
  for (const slot of ORDERED_SLOTS) {
    const medsInSlot = activeMeds.filter(m => m.timeSlots.includes(slot));
    if (medsInSlot.length === 0) continue;

    const timeStr = slotTimes[slot] || '08:00';
    const slotTargetDate = parseSlotTime(referenceDate, timeStr);

    let recordedCount = 0;
    medsInSlot.forEach(m => {
      if (dailyLog.doses[`${m.id}_${slot}`]?.taken) recordedCount++;
    });

    const allRecorded = recordedCount === medsInSlot.length;

    // If future or currently unrecorded
    if (slotTargetDate.getTime() >= nowMs || !allRecorded) {
      return {
        slot,
        slotLabel: slotLabels[slot],
        timeString: formatTimeForDisplay(timeStr),
        medications: medsInSlot,
        totalCount: medsInSlot.length,
        recordedCount,
        allRecorded,
        isToday: true
      };
    }
  }

  // 2. If all today's slots passed and all are recorded, return morning slot for tomorrow
  const firstSlotWithMeds = ORDERED_SLOTS.find(slot => activeMeds.some(m => m.timeSlots.includes(slot)));
  if (firstSlotWithMeds) {
    const meds = activeMeds.filter(m => m.timeSlots.includes(firstSlotWithMeds));
    const timeStr = slotTimes[firstSlotWithMeds] || '08:00';
    return {
      slot: firstSlotWithMeds,
      slotLabel: `${slotLabels[firstSlotWithMeds]} (Tomorrow)`,
      timeString: formatTimeForDisplay(timeStr),
      medications: meds,
      totalCount: meds.length,
      recordedCount: 0,
      allRecorded: false,
      isToday: false
    };
  }

  return null;
}

/**
 * Formats a 24h time string ("18:30") into a user-friendly string ("6:30 PM").
 */
export function formatTimeForDisplay(timeStr: string): string {
  const [hStr, mStr] = timeStr.split(':');
  let h = parseInt(hStr, 10);
  const m = mStr || '00';
  if (isNaN(h)) return timeStr;

  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}

/**
 * Formats the notification title and message based on user privacy preferences.
 * By default, returns generic message without sensitive drug names.
 */
export function formatReminderNotification(
  event: ScheduledReminderEvent,
  includeMedNames: boolean
): { title: string; body: string } {
  const count = event.medications.length;
  const displayTime = formatTimeForDisplay(event.scheduledTime);
  const slotName = event.slot.charAt(0).toUpperCase() + event.slot.slice(1);

  if (!includeMedNames) {
    return {
      title: 'CareDose — Medication Reminder',
      body: `You have ${count} ${slotName} medication${count > 1 ? 's' : ''} scheduled for ${displayTime}. Open CareDose to review.`
    };
  }

  const names = event.medications.map(m => m.name).join(', ');
  return {
    title: 'CareDose — Medication Reminder',
    body: `${slotName} dose (${displayTime}): ${names}. Open CareDose to log.`
  };
}

/**
 * Pure state reducer to snooze a reminder occurrence.
 */
export function applySnooze(
  state: ReminderDeliveryState,
  dateStr: string,
  slot: TimeSlot,
  snoozeMinutes: SnoozeInterval,
  currentDate: Date = new Date()
): ReminderDeliveryState {
  const key = `${dateStr}_${slot}`;
  const snoozeUntilMs = currentDate.getTime() + snoozeMinutes * 60 * 1000;

  return {
    ...state,
    snoozedUntil: {
      ...state.snoozedUntil,
      [key]: snoozeUntilMs
    }
  };
}

/**
 * Pure state reducer to dismiss a reminder occurrence.
 */
export function applyDismiss(
  state: ReminderDeliveryState,
  dateStr: string,
  slot: TimeSlot,
  currentDate: Date = new Date()
): ReminderDeliveryState {
  const key = `${dateStr}_${slot}`;
  const snoozed = { ...state.snoozedUntil };
  delete snoozed[key];

  return {
    ...state,
    snoozedUntil: snoozed,
    dismissed: {
      ...state.dismissed,
      [key]: currentDate.toISOString()
    }
  };
}

/**
 * Pure state reducer to mark a reminder occurrence as delivered.
 */
export function applyMarkDelivered(
  state: ReminderDeliveryState,
  dateStr: string,
  slot: TimeSlot,
  currentDate: Date = new Date()
): ReminderDeliveryState {
  const key = `${dateStr}_${slot}`;
  const snoozed = { ...state.snoozedUntil };
  delete snoozed[key];

  return {
    ...state,
    snoozedUntil: snoozed,
    lastDelivered: {
      ...state.lastDelivered,
      [key]: currentDate.toISOString()
    }
  };
}
