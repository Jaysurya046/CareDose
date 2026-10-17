import { medStore } from '../store/medStore';
import type { TimeSlot, SnoozeInterval } from '../types';
import { reminderCoordinator } from '../services/reminders/reminderCoordinator';
import type { NotificationStatusInfo } from '../services/reminders/reminderAdapter';

/**
 * Accessible modal dialog for configuring medication reminder preferences,
 * platform notification permissions, slot times, and scheduling reliability status.
 */
export async function openReminderSettingsModal(onSaved?: () => void): Promise<void> {
  document.querySelector('.modal-overlay')?.remove();

  const prefs = medStore.getReminderPreferences();
  let statusInfo: NotificationStatusInfo = await reminderCoordinator.getStatus();

  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'modal-overlay';
  modalOverlay.setAttribute('role', 'dialog');
  modalOverlay.setAttribute('aria-modal', 'true');
  modalOverlay.setAttribute('aria-labelledby', 'reminder-modal-title');

  const render = () => {
    modalOverlay.innerHTML = `
      <div class="modal-dialog" style="max-width: 600px;">
        <div class="modal-header">
          <div>
            <h3 id="reminder-modal-title" style="font-size: 1.25rem; font-weight: 700; margin: 0;">
              Medication Reminder Settings
            </h3>
            <span class="badge" style="font-size: 0.75rem; margin-top: 4px; text-transform: uppercase;">
              Platform: ${statusInfo.isNative ? 'Android Native (OS Alarms)' : 'Web Browser (Local Engine)'}
            </span>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-close-reminder-modal" aria-label="Close dialog">✕</button>
        </div>

        <form id="reminder-form" class="modal-body" style="display: flex; flex-direction: column; gap: 1.25rem;">
          <!-- Master Enable/Disable Switch -->
          <div class="form-group reminder-toggle-card">
            <label class="slot-check-item" style="font-size: 1.0625rem; font-weight: 700;">
              <input type="checkbox" id="reminders-enabled" ${prefs.enabled ? 'checked' : ''} />
              <span>Enable Medication Reminders</span>
            </label>
            <span class="form-hint" style="margin-left: 1.75rem;">
              When active, CareDose triggers scheduled reminders for all active prescribed medications.
            </span>
          </div>

          <!-- Notification Permission & Status Card -->
          <div class="card" style="padding: 1rem; background: var(--bg-surface-alt); border: 1.5px solid var(--border-main);">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.75rem;">
              <div>
                <strong style="font-size: 0.9375rem; display: block;">Notification Permission</strong>
                <div style="display: flex; gap: 0.5rem; align-items: center; margin-top: 0.35rem; flex-wrap: wrap;">
                  <span id="perm-status-label" class="badge ${statusInfo.permission === 'granted' ? 'badge-safe' : 'badge-caution'}">
                    Permission: ${statusInfo.permission.toUpperCase()}
                  </span>
                  ${statusInfo.isNative ? `
                    <span class="badge ${statusInfo.canScheduleExact ? 'badge-safe' : 'badge-caution'}">
                      ${statusInfo.canScheduleExact ? 'Exact Alarms Active' : 'Battery-Optimized Window'}
                    </span>
                  ` : ''}
                </div>
              </div>
              <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                ${statusInfo.permission !== 'granted' && statusInfo.permission !== 'unsupported' ? `
                  <button type="button" class="btn btn-primary btn-sm" id="btn-request-perm">
                    Enable System Alerts
                  </button>
                ` : ''}
                <button type="button" class="btn btn-secondary btn-sm" id="btn-test-notification">
                  Send Test Alert
                </button>
              </div>
            </div>

            ${statusInfo.nextScheduledNotificationTime ? `
              <div style="font-size: 0.8125rem; color: var(--text-muted); margin-top: 0.6rem;">
                ⏰ Next scheduled OS alert: <strong>${statusInfo.nextScheduledNotificationTime}</strong> (${statusInfo.activeScheduledCount} upcoming scheduled)
              </div>
            ` : ''}

            ${statusInfo.permission === 'denied' ? `
              <p class="form-hint" style="color: var(--status-critical-text); margin-top: 0.5rem;">
                Notifications are currently blocked by system settings. Open your device Settings to allow notifications for CareDose.
              </p>
            ` : ''}
          </div>

          <!-- Privacy Option: Include Drug Names -->
          <div class="form-group">
            <label class="form-label" style="font-weight: 700;">Lock Screen Privacy &amp; Notification Content</label>
            <label class="slot-check-item">
              <input type="checkbox" id="reminders-include-names" ${prefs.includeMedNames ? 'checked' : ''} />
              <span>Include medication name &amp; dosage in system alerts</span>
            </label>
            <span class="form-hint">
              Default is generic ("Time for your scheduled dose") to protect health privacy on lock screens. Check to show medication names and instructions directly on alerts.
            </span>
          </div>

          <!-- Configurable Slot Timing -->
          <div class="form-group">
            <label class="form-label" style="font-weight: 700;">Default Dose Window Times</label>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 0.75rem;">
              <div>
                <label for="slot-time-morning" class="form-hint" style="font-weight: 600;">Morning</label>
                <input type="time" id="slot-time-morning" class="form-input" value="${prefs.customSlotTimes.morning || '08:00'}" required />
              </div>
              <div>
                <label for="slot-time-midday" class="form-hint" style="font-weight: 600;">Midday</label>
                <input type="time" id="slot-time-midday" class="form-input" value="${prefs.customSlotTimes.midday || '13:00'}" required />
              </div>
              <div>
                <label for="slot-time-evening" class="form-hint" style="font-weight: 600;">Evening</label>
                <input type="time" id="slot-time-evening" class="form-input" value="${prefs.customSlotTimes.evening || '18:30'}" required />
              </div>
              <div>
                <label for="slot-time-bedtime" class="form-hint" style="font-weight: 600;">Bedtime</label>
                <input type="time" id="slot-time-bedtime" class="form-input" value="${prefs.customSlotTimes.bedtime || '22:00'}" required />
              </div>
            </div>
          </div>

          <!-- Snooze Interval Picker -->
          <div class="form-group">
            <label for="snooze-interval-select" class="form-label" style="font-weight: 700;">Default Snooze Interval</label>
            <select id="snooze-interval-select" class="form-select">
              <option value="5" ${prefs.defaultSnoozeMinutes === 5 ? 'selected' : ''}>5 Minutes</option>
              <option value="10" ${prefs.defaultSnoozeMinutes === 10 ? 'selected' : ''}>10 Minutes</option>
              <option value="15" ${prefs.defaultSnoozeMinutes === 15 ? 'selected' : ''}>15 Minutes</option>
            </select>
          </div>

          <!-- Platform Scheduling Limitations Disclosure -->
          <div class="card" style="padding: 0.875rem 1rem; border-left: 4px solid var(--brand-primary); background: var(--bg-app);">
            <strong style="font-size: 0.875rem; color: var(--text-main);">
              ${statusInfo.isNative ? 'Android Reminder Delivery & Battery Limits' : 'Browser Delivery Limits'}
            </strong>
            <p style="font-size: 0.8125rem; color: var(--text-muted); margin-top: 0.25rem; line-height: 1.45;">
              ${statusInfo.limitationsNotice}
            </p>
          </div>

          <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.5rem;">
            <button type="button" class="btn btn-secondary" id="btn-cancel-reminder">Cancel</button>
            <button type="submit" class="btn btn-primary" style="font-weight: 700;">Save Preferences</button>
          </div>
        </form>
      </div>
    `;

    attachEvents();
  };

  const attachEvents = () => {
    const closeModal = () => modalOverlay.remove();
    modalOverlay.querySelector('#btn-close-reminder-modal')?.addEventListener('click', closeModal);
    modalOverlay.querySelector('#btn-cancel-reminder')?.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) closeModal();
    });

    // Request Permission Handler
    modalOverlay.querySelector('#btn-request-perm')?.addEventListener('click', async () => {
      await reminderCoordinator.requestPermission();
      statusInfo = await reminderCoordinator.getStatus();
      render();
    });

    // Test Notification Handler
    modalOverlay.querySelector('#btn-test-notification')?.addEventListener('click', async () => {
      const sent = await reminderCoordinator.sendTestNotification();
      if (!sent && statusInfo.permission !== 'granted') {
        alert('Notification permission is required to send system alerts. Please click "Enable System Alerts".');
      } else if (sent) {
        alert('Test notification sent!');
      }
    });

    // Save Preferences
    const form = modalOverlay.querySelector('#reminder-form') as HTMLFormElement;
    form.addEventListener('submit', (e) => {
      e.preventDefault();

      const enabled = (modalOverlay.querySelector('#reminders-enabled') as HTMLInputElement).checked;
      const includeMedNames = (modalOverlay.querySelector('#reminders-include-names') as HTMLInputElement).checked;
      const defaultSnoozeMinutes = parseInt(
        (modalOverlay.querySelector('#snooze-interval-select') as HTMLSelectElement).value,
        10
      ) as SnoozeInterval;

      const customSlotTimes: Record<TimeSlot, string> = {
        morning: (modalOverlay.querySelector('#slot-time-morning') as HTMLInputElement).value || '08:00',
        midday: (modalOverlay.querySelector('#slot-time-midday') as HTMLInputElement).value || '13:00',
        evening: (modalOverlay.querySelector('#slot-time-evening') as HTMLInputElement).value || '18:30',
        bedtime: (modalOverlay.querySelector('#slot-time-bedtime') as HTMLInputElement).value || '22:00'
      };

      medStore.updateReminderPreferences({
        enabled,
        includeMedNames,
        defaultSnoozeMinutes,
        customSlotTimes
      });

      closeModal();
      if (onSaved) onSaved();
    });
  };

  document.body.appendChild(modalOverlay);
  render();
}
