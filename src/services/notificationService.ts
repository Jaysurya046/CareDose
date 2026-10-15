import type { ScheduledReminderEvent, ReminderPreferences } from '../types';
import { formatReminderNotification } from '../engine/reminderScheduler';

/**
 * Service for managing browser Web Notifications with feature detection,
 * explicit permission requests, privacy filtering, and click-to-focus handling.
 */

export type NotificationPermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

/**
 * Checks whether the browser environment supports the Notifications API.
 */
export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/**
 * Returns current permission state ('granted' | 'denied' | 'default' | 'unsupported').
 */
export function getNotificationPermissionStatus(): NotificationPermissionState {
  if (!isNotificationSupported()) {
    return 'unsupported';
  }
  return Notification.permission as NotificationPermissionState;
}

/**
 * Requests notification permission from user upon explicit user action.
 */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (!isNotificationSupported()) {
    return 'unsupported';
  }

  try {
    const result = await Notification.requestPermission();
    return result as NotificationPermissionState;
  } catch (e) {
    console.warn('Failed to request notification permission', e);
    return Notification.permission as NotificationPermissionState;
  }
}

/**
 * Dispatches a system notification if permitted.
 * Focuses the window when clicked.
 */
export function dispatchSystemNotification(
  event: ScheduledReminderEvent,
  preferences: ReminderPreferences
): boolean {
  if (!isNotificationSupported() || Notification.permission !== 'granted') {
    return false;
  }

  const { title, body } = formatReminderNotification(event, preferences.includeMedNames);

  try {
    const notification = new Notification(title, {
      body,
      tag: `caredose_${event.date}_${event.slot}`, // Replaces duplicate notices for same slot
      icon: '/favicon.ico',
      requireInteraction: false
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
    };

    return true;
  } catch (e) {
    console.warn('Error creating browser system notification', e);
    return false;
  }
}

/**
 * Sends a test notification to verify system alert setup.
 */
export function sendTestNotification(includeMedNames: boolean): boolean {
  if (!isNotificationSupported() || Notification.permission !== 'granted') {
    return false;
  }

  try {
    const sampleText = includeMedNames
      ? 'Test dose: Lisinopril 20mg (8:00 AM). Notifications are active.'
      : 'You have 1 medication scheduled for 8:00 AM. Notifications are active.';

    const notification = new Notification('CareDose — Test Notification', {
      body: sampleText,
      icon: '/favicon.ico'
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
    };

    return true;
  } catch (e) {
    console.warn('Error sending test notification', e);
    return false;
  }
}
