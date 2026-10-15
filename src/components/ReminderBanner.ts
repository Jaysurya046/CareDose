import { medStore } from '../store/medStore';
import type { ScheduledReminderEvent, SnoozeInterval } from '../types';
import { applySnooze, applyDismiss, formatTimeForDisplay } from '../engine/reminderScheduler';

/**
 * Accessible in-app reminder banner displayed at the top of the main content view
 * when scheduled medication windows are currently due.
 */
export function renderReminderBanner(
  container: HTMLElement,
  dueEvents: ScheduledReminderEvent[],
  onNavigateToSlot?: (slot: string) => void
): void {
  if (dueEvents.length === 0) {
    container.innerHTML = '';
    return;
  }

  // Display the first due event prominently
  const event = dueEvents[0];
  const medsCount = event.medications.length;
  const slotName = event.slot.charAt(0).toUpperCase() + event.slot.slice(1);
  const displayTime = formatTimeForDisplay(event.scheduledTime);
  const prefs = medStore.getReminderPreferences();
  const snoozeMins = prefs.defaultSnoozeMinutes;

  const namesList = prefs.includeMedNames
    ? event.medications.map(m => m.name).join(', ')
    : `${medsCount} medication${medsCount > 1 ? 's' : ''}`;

  container.innerHTML = `
    <div class="reminder-banner ${event.isOverdue ? 'overdue' : ''}" role="region" aria-label="Medication dose reminder">
      <div class="reminder-banner-content">
        <div class="reminder-icon" aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
        </div>
        <div class="reminder-text-group">
          <div class="reminder-title-row">
            <strong class="reminder-title">
              ${event.isSnoozed ? 'Snoozed Reminder: ' : ''}${slotName} Dose Time (${displayTime})
            </strong>
            <span class="badge ${event.isOverdue ? 'badge-caution' : 'badge-safe'}">
              ${event.isOverdue ? 'Not Yet Recorded' : 'Due Now'}
            </span>
          </div>
          <p class="reminder-body">
            Scheduled: <strong>${namesList}</strong>. Please log your dose once taken.
          </p>
        </div>
      </div>

      <div class="reminder-actions-row">
        <button type="button" class="btn btn-primary btn-sm" id="btn-reminder-take" data-slot="${event.slot}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          <span>Mark as Taken</span>
        </button>

        <div class="snooze-group">
          <button type="button" class="btn btn-secondary btn-sm" id="btn-reminder-snooze" data-mins="${snoozeMins}">
            <span>Snooze (${snoozeMins}m)</span>
          </button>
        </div>

        <button type="button" class="btn btn-secondary btn-sm" id="btn-reminder-dismiss" title="Dismiss this reminder without recording dose">
          <span>Dismiss</span>
        </button>
      </div>
    </div>
  `;

  // Attach Take All in Slot Handler
  container.querySelector('#btn-reminder-take')?.addEventListener('click', () => {
    event.medications.forEach(m => {
      medStore.recordDose(m.id, event.slot, true);
    });
    if (onNavigateToSlot) {
      onNavigateToSlot(event.slot);
    }
  });

  // Attach Snooze Handler
  container.querySelector('#btn-reminder-snooze')?.addEventListener('click', (e) => {
    const mins = parseInt((e.currentTarget as HTMLElement).dataset.mins || '10', 10) as SnoozeInterval;
    const currentState = medStore.getReminderDeliveryState();
    const updated = applySnooze(currentState, event.date, event.slot, mins, new Date());
    medStore.updateReminderDeliveryState(updated);
  });

  // Attach Dismiss Handler
  container.querySelector('#btn-reminder-dismiss')?.addEventListener('click', () => {
    const currentState = medStore.getReminderDeliveryState();
    const updated = applyDismiss(currentState, event.date, event.slot, new Date());
    medStore.updateReminderDeliveryState(updated);
  });
}
