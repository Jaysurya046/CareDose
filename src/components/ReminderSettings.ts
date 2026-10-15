import { medStore } from '../store/medStore';
import type { TimeSlot, SnoozeInterval } from '../types';
import {
  getNotificationPermissionStatus,
  requestNotificationPermission,
  sendTestNotification
} from '../services/notificationService';

/**
 * Accessible modal dialog for configuring medication reminder preferences,
 * notification channels, slot times, and browser permissions.
 */
export function openReminderSettingsModal(onSaved?: () => void): void {
  document.querySelector('.modal-overlay')?.remove();

  const prefs = medStore.getReminderPreferences();
  let permissionStatus = getNotificationPermissionStatus();

  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'modal-overlay';
  modalOverlay.setAttribute('role', 'dialog');
  modalOverlay.setAttribute('aria-modal', 'true');
  modalOverlay.setAttribute('aria-labelledby', 'reminder-modal-title');

  modalOverlay.innerHTML = `
    <div class="modal-dialog">
      <div class="modal-header">
        <h3 id="reminder-modal-title" style="font-size: 1.25rem; font-weight: 700;">
          Medication Reminder Settings
        </h3>
        <button type="button" class="btn btn-secondary btn-sm" id="btn-close-reminder-modal" aria-label="Close dialog">✕</button>
      </div>

      <form id="reminder-form" class="modal-body">
        <!-- Master Enable/Disable -->
        <div class="form-group reminder-toggle-card">
          <label class="slot-check-item" style="font-size: 1.0625rem; font-weight: 700;">
            <input type="checkbox" id="reminders-enabled" ${prefs.enabled ? 'checked' : ''} />
            <span>Enable Medication Reminders</span>
          </label>
          <span class="form-hint" style="margin-left: 1.75rem;">
            When active, CareDose provides in-app reminders and browser notifications for scheduled dose times.
          </span>
        </div>

        <!-- System Notification Permission Row -->
        <div class="card" style="padding: 1rem; background: var(--bg-surface-alt); border: 1px solid var(--border-main);">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
            <div>
              <strong style="font-size: 0.9375rem; display: block;">Browser Notification Permission</strong>
              <span id="perm-status-label" class="badge ${permissionStatus === 'granted' ? 'badge-safe' : 'badge-caution'}" style="margin-top: 4px;">
                Status: ${permissionStatus.toUpperCase()}
              </span>
            </div>
            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
              ${permissionStatus !== 'granted' && permissionStatus !== 'unsupported' ? `
                <button type="button" class="btn btn-secondary btn-sm" id="btn-request-perm">
                  Grant Permission
                </button>
              ` : ''}
              <button type="button" class="btn btn-secondary btn-sm" id="btn-test-notification">
                Send Test Notification
              </button>
            </div>
          </div>
          ${permissionStatus === 'denied' ? `
            <p class="form-hint" style="color: var(--status-critical-text); margin-top: 0.5rem;">
              Notifications are currently blocked by your browser settings. To enable system alerts, please allow notifications for this site in your browser's site settings.
            </p>
          ` : ''}
        </div>

        <!-- Privacy Option: Include Drug Names -->
        <div class="form-group">
          <label class="form-label">Privacy &amp; Notification Content</label>
          <label class="slot-check-item">
            <input type="checkbox" id="reminders-include-names" ${prefs.includeMedNames ? 'checked' : ''} />
            <span>Display specific medication names in system notifications</span>
          </label>
          <span class="form-hint">
            Recommended: Leave unchecked to protect privacy on lock screens (shows generic dose reminder by default).
          </span>
        </div>

        <!-- Configurable Slot Timing -->
        <div class="form-group">
          <label class="form-label">Scheduled Reminder Times</label>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 0.75rem;">
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
          <label for="snooze-interval-select" class="form-label">Default Snooze Interval</label>
          <select id="snooze-interval-select" class="form-select">
            <option value="5" ${prefs.defaultSnoozeMinutes === 5 ? 'selected' : ''}>5 Minutes</option>
            <option value="10" ${prefs.defaultSnoozeMinutes === 10 ? 'selected' : ''}>10 Minutes</option>
            <option value="15" ${prefs.defaultSnoozeMinutes === 15 ? 'selected' : ''}>15 Minutes</option>
          </select>
        </div>

        <!-- Honest Browser Limitations Notice -->
        <div class="card" style="padding: 0.875rem 1rem; border-left: 4px solid var(--brand-primary); background: var(--bg-app);">
          <strong style="font-size: 0.875rem; color: var(--text-main);">Browser Reliability Notice</strong>
          <p style="font-size: 0.8125rem; color: var(--text-muted); margin-top: 0.25rem; line-height: 1.4;">
            CareDose operates locally in your browser. Reminders deliver reliably while CareDose is open. If your device sleeps or the browser is closed, notifications cannot be guaranteed. CareDose will summarize any unrecorded scheduled doses upon reopening.
          </p>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" id="btn-cancel-reminder">Cancel</button>
          <button type="submit" class="btn btn-primary">Save Preferences</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(modalOverlay);

  const closeModal = () => modalOverlay.remove();
  modalOverlay.querySelector('#btn-close-reminder-modal')?.addEventListener('click', closeModal);
  modalOverlay.querySelector('#btn-cancel-reminder')?.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  // Request Permission Action
  modalOverlay.querySelector('#btn-request-perm')?.addEventListener('click', async () => {
    const newStatus = await requestNotificationPermission();
    permissionStatus = newStatus;
    const label = modalOverlay.querySelector('#perm-status-label');
    if (label) {
      label.className = `badge ${newStatus === 'granted' ? 'badge-safe' : 'badge-caution'}`;
      label.textContent = `Status: ${newStatus.toUpperCase()}`;
    }
  });

  // Test Notification Action
  modalOverlay.querySelector('#btn-test-notification')?.addEventListener('click', async () => {
    if (permissionStatus !== 'granted') {
      const newStatus = await requestNotificationPermission();
      permissionStatus = newStatus;
    }
    const includeNames = (modalOverlay.querySelector('#reminders-include-names') as HTMLInputElement).checked;
    const sent = sendTestNotification(includeNames);
    if (!sent && permissionStatus !== 'granted') {
      alert('Browser notifications are not permitted. Please grant permission to test system notifications.');
    }
  });

  // Save Form Handler
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
}
