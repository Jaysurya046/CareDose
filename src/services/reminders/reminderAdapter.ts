import type { Medication, TimeSlot } from '../../types';

export type NotificationPermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

export interface NotificationStatusInfo {
  platform: 'web' | 'android' | 'ios';
  isNative: boolean;
  permission: NotificationPermissionState;
  hasExactAlarmPermission?: boolean;
  canScheduleExact?: boolean;
  activeScheduledCount: number;
  nextScheduledNotificationTime?: string;
  limitationsNotice: string;
}

export interface ScheduledOccurrence {
  id: number;
  medicationId: string;
  medicationName: string;
  dosage: string;
  slot: TimeSlot;
  scheduledTime: Date;
  isPRN: boolean;
}

/**
 * Universal interface for platform-aware notification delivery.
 * Implementations exist for Web Browser (Notifications API + DOM Banner)
 * and Android Native (@capacitor/local-notifications).
 */
export interface ReminderAdapter {
  readonly platform: 'web' | 'android' | 'ios';
  readonly isNative: boolean;

  getPermissionStatus(): Promise<NotificationPermissionState>;
  requestPermission(): Promise<NotificationPermissionState>;
  getStatusInfo(): Promise<NotificationStatusInfo>;

  scheduleReminders(
    medications: Medication[],
    slotTimes: Record<TimeSlot, string>,
    options: {
      includeMedNames: boolean;
      defaultSnoozeMinutes: number;
    }
  ): Promise<{ scheduledCount: number; warnings?: string[] }>;

  cancelRemindersForMedication(medicationId: string): Promise<void>;
  cancelAllReminders(): Promise<void>;
  clearDeliveredNotification(dateStr: string, slot: TimeSlot): Promise<void>;
  sendTestNotification(includeMedNames: boolean): Promise<boolean>;
  snoozeReminder(occurrenceKey: string, snoozeMinutes: number): Promise<void>;
}
