import type { Medication, TimeSlot } from '../../types';
import type { ReminderAdapter, NotificationPermissionState, NotificationStatusInfo } from './reminderAdapter';

export class WebReminderAdapter implements ReminderAdapter {
  public readonly platform: 'web' = 'web';
  public readonly isNative: boolean = false;

  public async getPermissionStatus(): Promise<NotificationPermissionState> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'unsupported';
    }
    return Notification.permission as NotificationPermissionState;
  }

  public async requestPermission(): Promise<NotificationPermissionState> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'unsupported';
    }
    try {
      const res = await Notification.requestPermission();
      return res as NotificationPermissionState;
    } catch (err) {
      console.warn('Failed to request web notification permission', err);
      return Notification.permission as NotificationPermissionState;
    }
  }

  public async getStatusInfo(): Promise<NotificationStatusInfo> {
    const perm = await this.getPermissionStatus();
    return {
      platform: 'web',
      isNative: false,
      permission: perm,
      canScheduleExact: false,
      hasExactAlarmPermission: false,
      activeScheduledCount: 0,
      limitationsNotice: 'Web browser notifications are best-effort and will only trigger while CareDose is open in an active or background browser tab. They do not survive browser shutdown or device sleep.'
    };
  }

  public async scheduleReminders(
    _medications: Medication[],
    _slotTimes: Record<TimeSlot, string>,
    _options: { includeMedNames: boolean; defaultSnoozeMinutes: number }
  ): Promise<{ scheduledCount: number; warnings?: string[] }> {
    // In web browser, scheduling is evaluated reactively via the 30s interval coordinator
    return { scheduledCount: 0 };
  }

  public async cancelRemindersForMedication(_medicationId: string): Promise<void> {
    // Handled in-memory by medStore
  }

  public async cancelAllReminders(): Promise<void> {
    // Handled in-memory
  }

  public async clearDeliveredNotification(_dateStr: string, _slot: TimeSlot): Promise<void> {
    // Web notifications close automatically or upon user click
  }

  public async sendTestNotification(includeMedNames: boolean): Promise<boolean> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return false;
    }
    if (Notification.permission !== 'granted') {
      const perm = await this.requestPermission();
      if (perm !== 'granted') return false;
    }

    try {
      const sampleText = includeMedNames
        ? 'Test dose: Lisinopril 20 mg (8:00 AM). Web notifications are active.'
        : 'You have 1 medication scheduled for 8:00 AM. Web notifications are active.';

      const n = new Notification('CareDose — Test Notification', {
        body: sampleText,
        icon: '/favicon.ico',
        tag: 'caredose_test_notification'
      });

      n.onclick = () => {
        window.focus();
        n.close();
      };
      return true;
    } catch (err) {
      console.warn('Error sending web test notification', err);
      return false;
    }
  }

  public async snoozeReminder(_occurrenceKey: string, _snoozeMinutes: number): Promise<void> {
    // Managed via medStore delivery state
  }
}
