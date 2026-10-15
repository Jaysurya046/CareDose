import { medStore } from '../store/medStore';
import { calculateDueReminders, applyMarkDelivered } from './reminderScheduler';
import { dispatchSystemNotification } from '../services/notificationService';
import { renderReminderBanner } from '../components/ReminderBanner';

let checkIntervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Evaluates active reminders, updates in-app banner, and triggers browser notifications if due.
 */
export function checkAndDispatchReminders(mountElement: HTMLElement): void {
  const activeMeds = medStore.getActiveMedications();
  const dailyLog = medStore.getDailyLog();
  const prefs = medStore.getReminderPreferences();
  const deliveryState = medStore.getReminderDeliveryState();

  const dueEvents = calculateDueReminders(activeMeds, dailyLog, prefs, deliveryState, new Date());

  // 1. Render or clear in-app reminder banner
  renderReminderBanner(mountElement, dueEvents);

  // 2. Dispatch browser system notifications for events that haven't been delivered
  if (prefs.enabled && dueEvents.length > 0) {
    let stateModified = false;
    let updatedDeliveryState = deliveryState;

    dueEvents.forEach(event => {
      const occurrenceKey = `${event.date}_${event.slot}`;
      // If snoozed or not yet delivered to the OS
      if (!event.isSnoozed && !updatedDeliveryState.lastDelivered[occurrenceKey]) {
        const sent = dispatchSystemNotification(event, prefs);
        if (sent) {
          updatedDeliveryState = applyMarkDelivered(updatedDeliveryState, event.date, event.slot, new Date());
          stateModified = true;
        }
      }
    });

    if (stateModified) {
      medStore.updateReminderDeliveryState(updatedDeliveryState);
    }
  }
}

/**
 * Initializes the reminder background evaluation loop and window focus/visibility listeners.
 */
export function initReminderCoordinator(mountElement: HTMLElement): () => void {
  // Initial check
  checkAndDispatchReminders(mountElement);

  // Subscribe to store updates (dose logs, edits, snoozes)
  const unsubscribe = medStore.subscribe(() => {
    checkAndDispatchReminders(mountElement);
  });

  // Re-check when browser tab regains focus or becomes visible
  const handleVisibility = () => {
    if (document.visibilityState === 'visible') {
      checkAndDispatchReminders(mountElement);
    }
  };
  document.addEventListener('visibilitychange', handleVisibility);
  window.addEventListener('focus', handleVisibility);

  // 30-second interval ticker for timely alerts while app is open
  if (checkIntervalId) clearInterval(checkIntervalId);
  checkIntervalId = setInterval(() => {
    checkAndDispatchReminders(mountElement);
  }, 30000);

  return () => {
    unsubscribe();
    document.removeEventListener('visibilitychange', handleVisibility);
    window.removeEventListener('focus', handleVisibility);
    if (checkIntervalId) clearInterval(checkIntervalId);
  };
}
