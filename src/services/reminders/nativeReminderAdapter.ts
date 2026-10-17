import { Capacitor } from '@capacitor/core';
import { LocalNotifications, type Channel, type LocalNotificationSchema } from '@capacitor/local-notifications';
import type { Medication, TimeSlot } from '../../types';
import type { ReminderAdapter, NotificationPermissionState, NotificationStatusInfo } from './reminderAdapter';
import { isMedicationScheduledForDate } from '../../engine/reminderScheduler';
import { getTodayDateString } from '../../utils/date';

const REMINDER_CHANNEL_ID = 'caredose_medication_channel';

/**
 * Deterministically generates a safe 32-bit positive integer ID for Capacitor LocalNotifications.
 * Capacitor requires IDs to be 32-bit integers (<= 2,147,483,647).
 */
export function generateNotificationId(medId: string, slot: string, dateStr: string): number {
  const combined = `${medId}_${slot}_${dateStr}`;
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    hash = (hash << 5) - hash + combined.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash % 2000000000) + 1;
}

export class NativeReminderAdapter implements ReminderAdapter {
  public readonly platform: 'android' | 'ios' = Capacitor.getPlatform() === 'ios' ? 'ios' : 'android';
  public readonly isNative: boolean = Capacitor.isNativePlatform();
  private channelInitialized = false;

  private async ensureChannel(): Promise<void> {
    if (!this.isNative || this.channelInitialized || this.platform !== 'android') return;

    try {
      const channel: Channel = {
        id: REMINDER_CHANNEL_ID,
        name: 'Medication Reminders',
        description: 'Scheduled alerts for daily prescribed medication doses',
        importance: 5, // High priority / heads-up notification
        sound: 'beep.wav',
        vibration: true,
        lights: true,
        lightColor: '#0F766E'
      };
      await LocalNotifications.createChannel(channel);
      this.channelInitialized = true;
    } catch (err) {
      console.warn('Could not initialize Android notification channel', err);
    }
  }

  public async getPermissionStatus(): Promise<NotificationPermissionState> {
    if (!this.isNative) return 'unsupported';

    try {
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display === 'granted') return 'granted';
      if (perm.display === 'denied') return 'denied';
      return 'default';
    } catch (err) {
      console.warn('Error checking native notification permissions', err);
      return 'default';
    }
  }

  public async requestPermission(): Promise<NotificationPermissionState> {
    if (!this.isNative) return 'unsupported';

    try {
      const result = await LocalNotifications.requestPermissions();
      if (result.display === 'granted') {
        await this.ensureChannel();
        return 'granted';
      }
      return result.display === 'denied' ? 'denied' : 'default';
    } catch (err) {
      console.warn('Error requesting native notification permissions', err);
      return 'denied';
    }
  }

  public async getStatusInfo(): Promise<NotificationStatusInfo> {
    if (!this.isNative) {
      return {
        platform: 'android',
        isNative: false,
        permission: 'unsupported',
        canScheduleExact: false,
        hasExactAlarmPermission: false,
        activeScheduledCount: 0,
        limitationsNotice: 'Native Android notifications require running inside the installed CareDose Android APK.'
      };
    }

    const perm = await this.getPermissionStatus();
    let pendingCount = 0;
    let nextScheduledTime: string | undefined = undefined;
    let canScheduleExact = true;

    try {
      const pending = await LocalNotifications.getPending();
      pendingCount = pending.notifications.length;
      if (pendingCount > 0) {
        const sorted = [...pending.notifications].sort((a, b) => {
          const tA = a.schedule?.at ? new Date(a.schedule.at).getTime() : 0;
          const tB = b.schedule?.at ? new Date(b.schedule.at).getTime() : 0;
          return tA - tB;
        });
        if (sorted[0]?.schedule?.at) {
          nextScheduledTime = new Date(sorted[0].schedule.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
      }

      // Check Android 12/14+ exact alarm capability if method available
      if (typeof (LocalNotifications as any).checkExactNotificationSetting === 'function') {
        const exactSetting = await (LocalNotifications as any).checkExactNotificationSetting();
        canScheduleExact = exactSetting?.exactAlarmSetting === 'granted';
      }
    } catch (err) {
      console.warn('Could not inspect pending notifications', err);
    }

    return {
      platform: this.platform,
      isNative: true,
      permission: perm,
      canScheduleExact,
      hasExactAlarmPermission: canScheduleExact,
      activeScheduledCount: pendingCount,
      nextScheduledNotificationTime: nextScheduledTime,
      limitationsNotice: canScheduleExact
        ? 'Reminders are scheduled with Android OS alarms. Note: Aggressive manufacturer battery savers or Doze mode may still slightly delay alerts. Opening CareDose daily refreshes and maintains reminder reliability.'
        : 'Exact alarm scheduling is currently restricted by Android. Reminders will fire within an inexact battery-optimized window. Enable "Alarms & Reminders" permission in Android Settings for exact timing.'
    };
  }

  /**
   * Calculates and schedules native OS notifications for the next 7 days.
   * Cancels outdated future notices and replaces them with user-confirmed regimens.
   */
  public async scheduleReminders(
    medications: Medication[],
    slotTimes: Record<TimeSlot, string>,
    options: {
      includeMedNames: boolean;
      defaultSnoozeMinutes: number;
    }
  ): Promise<{ scheduledCount: number; warnings?: string[] }> {
    if (!this.isNative) return { scheduledCount: 0 };

    const perm = await this.getPermissionStatus();
    if (perm !== 'granted') {
      return { scheduledCount: 0, warnings: ['Notification permission not granted.'] };
    }

    await this.ensureChannel();

    const now = new Date();
    const notificationsToSchedule: LocalNotificationSchema[] = [];
    const warnings: string[] = [];

    // Schedule a 7-day rolling window of doses
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset);
      const dateStr = getTodayDateString(targetDate);

      // Filter medications scheduled for this specific date
      const scheduledMeds = medications.filter(m => isMedicationScheduledForDate(m, targetDate));

      const slotKeys: TimeSlot[] = ['morning', 'midday', 'evening', 'bedtime'];
      for (const slot of slotKeys) {
        const medsInSlot = scheduledMeds.filter(m => m.timeSlots.includes(slot));
        if (medsInSlot.length === 0) continue;

        const timeStr = slotTimes[slot] || '08:00';
        const [hours, minutes] = timeStr.split(':').map(Number);
        const scheduledTime = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), hours, minutes, 0);

        // Skip if scheduled time is in the past
        if (scheduledTime.getTime() <= now.getTime()) {
          continue;
        }

        const slotLabel = slot.charAt(0).toUpperCase() + slot.slice(1);
        const notifId = generateNotificationId('group', slot, dateStr);

        let title = 'CareDose — Medication Reminder';
        let body = `Time for your ${slotLabel} medication (${medsInSlot.length} scheduled). Open CareDose to review directions.`;

        // If user explicitly consented to display medication names
        if (options.includeMedNames) {
          const medSummary = medsInSlot.map(m => `${m.name} ${m.dosage}`).join(', ');
          title = `CareDose — ${slotLabel} Doses`;
          body = `Take: ${medSummary}`;
        }

        notificationsToSchedule.push({
          id: notifId,
          title,
          body,
          channelId: REMINDER_CHANNEL_ID,
          schedule: {
            at: scheduledTime,
            allowWhileIdle: true // Attempts delivery in Doze mode
          },
          smallIcon: 'ic_stat_medication',
          extra: {
            slot,
            dateStr,
            medicationIds: medsInSlot.map(m => m.id)
          }
        });
      }
    }

    try {
      // Clear previous future scheduled reminders to avoid stale duplicates
      const pending = await LocalNotifications.getPending();
      if (pending.notifications.length > 0) {
        await LocalNotifications.cancel({ notifications: pending.notifications });
      }

      if (notificationsToSchedule.length > 0) {
        await LocalNotifications.schedule({
          notifications: notificationsToSchedule
        });
      }

      return { scheduledCount: notificationsToSchedule.length, warnings };
    } catch (err: any) {
      console.warn('Failed to schedule local notifications', err);
      return { scheduledCount: 0, warnings: [err.message || 'Scheduling error'] };
    }
  }

  public async cancelRemindersForMedication(medicationId: string): Promise<void> {
    if (!this.isNative) return;

    try {
      const pending = await LocalNotifications.getPending();
      const toCancel = pending.notifications.filter(n => {
        const medIds = n.extra?.medicationIds as string[] | undefined;
        return Array.isArray(medIds) && medIds.includes(medicationId);
      });

      if (toCancel.length > 0) {
        await LocalNotifications.cancel({ notifications: toCancel });
      }
    } catch (err) {
      console.warn('Error cancelling reminders for medication', err);
    }
  }

  public async cancelAllReminders(): Promise<void> {
    if (!this.isNative) return;

    try {
      const pending = await LocalNotifications.getPending();
      if (pending.notifications.length > 0) {
        await LocalNotifications.cancel({ notifications: pending.notifications });
      }
    } catch (err) {
      console.warn('Error cancelling all reminders', err);
    }
  }

  public async clearDeliveredNotification(dateStr: string, slot: TimeSlot): Promise<void> {
    if (!this.isNative) return;

    try {
      const notifId = generateNotificationId('group', slot, dateStr);
      await LocalNotifications.cancel({ notifications: [{ id: notifId }] });
    } catch (err) {
      console.warn('Error clearing delivered notification', err);
    }
  }

  public async sendTestNotification(includeMedNames: boolean): Promise<boolean> {
    if (!this.isNative) return false;

    const perm = await this.getPermissionStatus();
    if (perm !== 'granted') {
      const requested = await this.requestPermission();
      if (requested !== 'granted') return false;
    }

    await this.ensureChannel();

    try {
      const testId = Math.floor(Math.random() * 1000000) + 1;
      const testTime = new Date(Date.now() + 3000); // 3 seconds in the future

      const sampleTitle = 'CareDose — Test Notification';
      const sampleBody = includeMedNames
        ? 'Test alert: Lisinopril 20 mg (8:00 AM). Native Android reminders are active.'
        : 'You have 1 medication scheduled for 8:00 AM. Native Android reminders are active.';

      await LocalNotifications.schedule({
        notifications: [{
          id: testId,
          title: sampleTitle,
          body: sampleBody,
          channelId: REMINDER_CHANNEL_ID,
          schedule: { at: testTime, allowWhileIdle: true },
          smallIcon: 'ic_stat_medication'
        }]
      });
      return true;
    } catch (err) {
      console.warn('Error sending test notification', err);
      return false;
    }
  }

  public async snoozeReminder(_occurrenceKey: string, snoozeMinutes: number): Promise<void> {
    if (!this.isNative) return;

    try {
      const snoozeId = Math.floor(Math.random() * 1000000) + 1;
      const targetTime = new Date(Date.now() + snoozeMinutes * 60 * 1000);

      await LocalNotifications.schedule({
        notifications: [{
          id: snoozeId,
          title: 'CareDose — Snoozed Medication Reminder',
          body: `Your reminder was snoozed for ${snoozeMinutes} minutes. Open CareDose to log your dose.`,
          channelId: REMINDER_CHANNEL_ID,
          schedule: { at: targetTime, allowWhileIdle: true },
          smallIcon: 'ic_stat_medication'
        }]
      });
    } catch (err) {
      console.warn('Error scheduling snooze notification', err);
    }
  }
}
