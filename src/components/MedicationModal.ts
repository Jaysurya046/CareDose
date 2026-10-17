import { medStore } from '../store/medStore';
import type { Medication, TimeSlot, PillVisual, MedicationStatus } from '../types';
import { searchDrugNames, type DrugSuggestion } from '../services/rxnorm';
import { renderPillVisualSelector } from './PillVisualSelector';

const WEEKDAYS = [
  { day: 1, label: 'Mon', full: 'Monday' },
  { day: 2, label: 'Tue', full: 'Tuesday' },
  { day: 3, label: 'Wed', full: 'Wednesday' },
  { day: 4, label: 'Thu', full: 'Thursday' },
  { day: 5, label: 'Fri', full: 'Friday' },
  { day: 6, label: 'Sat', full: 'Saturday' },
  { day: 0, label: 'Sun', full: 'Sunday' }
];

/**
 * Accessible 4-step wizard modal for manual-first medication management.
 * Step 1: Medication Details (Name, Generic, Strength, Form, Visual)
 * Step 2: Prescribed Directions (Dose Quantity, Route, Frequency, Instructions, PRN, Dates)
 * Step 3: Reminder Schedule (Slots, Custom Times, Weekdays, Enabled Toggle)
 * Step 4: Review & Explicit Save
 * Fast Entry: "Add Another Medication" optimization for rapid initial setup.
 */
export function openMedicationModal(existingMed?: Medication, onSaved?: () => void): void {
  document.querySelector('.modal-overlay')?.remove();

  const isEdit = !!existingMed;

  // Wizard State
  let currentStep = 1;
  const formData = {
    name: existingMed?.name || '',
    genericName: existingMed?.genericName || '',
    dosage: existingMed?.dosage || '',
    doseQuantity: existingMed?.doseQuantity || '1 tablet',
    form: existingMed?.form || 'Tablet',
    route: existingMed?.route || 'Oral',
    frequency: existingMed?.frequency || 'Once daily',
    instructions: existingMed?.instructions || 'Take as prescribed.',
    withFood: existingMed?.withFood ?? false,
    isPRN: existingMed?.isPRN ?? false,
    prescribedBy: existingMed?.prescribedBy || '',
    startDate: existingMed?.startDate || new Date().toISOString().slice(0, 10),
    endDate: existingMed?.endDate || '',
    duration: existingMed?.duration || 'Ongoing',
    isOngoing: !existingMed?.endDate,
    remindersEnabled: existingMed?.remindersEnabled ?? (!existingMed?.isPRN),
    timeSlots: new Set<TimeSlot>(existingMed?.timeSlots || ['morning']),
    customTimes: [...(existingMed?.customTimes || [])],
    weekdays: new Set<number>(existingMed?.weekdays || [0, 1, 2, 3, 4, 5, 6]),
    allDays: !existingMed?.weekdays || existingMed.weekdays.length === 7,
    status: (existingMed?.status || 'active') as MedicationStatus,
    visualState: {
      shape: existingMed?.pillVisual?.shape || 'round',
      color: existingMed?.pillVisual?.color || 'white'
    } as PillVisual
  };

  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'modal-overlay';
  modalOverlay.setAttribute('role', 'dialog');
  modalOverlay.setAttribute('aria-modal', 'true');
  modalOverlay.setAttribute('aria-labelledby', 'modal-wizard-title');

  const closeModal = () => {
    modalOverlay.remove();
  };

  const render = () => {
    modalOverlay.innerHTML = `
      <div class="modal-dialog" style="max-width: 640px;">
        <div class="modal-header">
          <div>
            <h3 id="modal-wizard-title" style="font-size: 1.25rem; font-weight: 700;">
              ${isEdit ? 'Edit Medication' : 'Add Medication'}
            </h3>
            <p style="font-size: 0.8125rem; color: var(--text-muted); margin-top: 2px;">
              Step ${currentStep} of 4 — ${getStepTitle(currentStep)}
            </p>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-close-modal" aria-label="Close dialog">✕</button>
        </div>

        <!-- Wizard Stepper Indicator -->
        <nav class="wizard-stepper" aria-label="Medication Entry Steps">
          <div class="step-item ${currentStep === 1 ? 'is-active' : ''} ${currentStep > 1 ? 'is-completed' : ''}" data-step="1">
            <span class="step-number">1</span>
            <span>Details</span>
          </div>
          <span class="step-separator">›</span>
          <div class="step-item ${currentStep === 2 ? 'is-active' : ''} ${currentStep > 2 ? 'is-completed' : ''}" data-step="2">
            <span class="step-number">2</span>
            <span>Directions</span>
          </div>
          <span class="step-separator">›</span>
          <div class="step-item ${currentStep === 3 ? 'is-active' : ''} ${currentStep > 3 ? 'is-completed' : ''}" data-step="3">
            <span class="step-number">3</span>
            <span>Schedule</span>
          </div>
          <span class="step-separator">›</span>
          <div class="step-item ${currentStep === 4 ? 'is-active' : ''}" data-step="4">
            <span class="step-number">4</span>
            <span>Review</span>
          </div>
        </nav>

        <div class="modal-body" id="wizard-step-body" style="padding-top: 1rem;">
          <!-- Validation Banner -->
          <div id="step-error-banner" class="badge badge-caution" style="display: none; width: 100%; padding: 0.6rem 0.75rem; margin-bottom: 1rem; border-radius: var(--radius-sm);"></div>

          ${renderCurrentStepContent()}
        </div>

        <div class="modal-footer" style="display: flex; justify-content: space-between; align-items: center; gap: 0.75rem;">
          <button type="button" class="btn btn-secondary" id="btn-wizard-back">
            ${currentStep === 1 ? 'Cancel' : '← Back'}
          </button>
          <div style="display: flex; gap: 0.5rem;">
            ${currentStep < 4 ? `
              <button type="button" class="btn btn-primary" id="btn-wizard-next">
                ${currentStep === 3 ? 'Next: Review →' : 'Next →'}
              </button>
            ` : `
              <button type="button" class="btn btn-primary" id="btn-wizard-save" style="font-weight: 700;">
                ✓ ${isEdit ? 'Save Changes' : 'Confirm & Save Medication'}
              </button>
            `}
          </div>
        </div>
      </div>
    `;

    attachStepEvents();
  };

  function getStepTitle(step: number): string {
    switch (step) {
      case 1: return 'Medication Details';
      case 2: return 'Prescribed Directions';
      case 3: return 'Reminder Schedule';
      case 4: return 'Review & Confirm';
      default: return '';
    }
  }

  function renderCurrentStepContent(): string {
    if (currentStep === 1) {
      return `
        <!-- STEP 1: MEDICATION DETAILS -->
        <div class="form-group" style="position: relative;">
          <label for="step1-name-input" class="form-label">Medication Name *</label>
          <input 
            type="text" 
            id="step1-name-input" 
            class="form-input" 
            placeholder="e.g. Lisinopril, Metformin, Atorvastatin" 
            value="${escapeHtml(formData.name)}" 
            required 
            autocomplete="off"
            autofocus
          />
          <div id="autocomplete-dropdown" class="autocomplete-dropdown" style="display: none;"></div>
          <span class="form-hint">Type for autocomplete terminology assistance, or enter any brand/generic/OTC name manually.</span>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
          <div class="form-group">
            <label for="step1-generic-input" class="form-label">Generic Name (Optional)</label>
            <input 
              type="text" 
              id="step1-generic-input" 
              class="form-input" 
              placeholder="e.g. Lisinopril dihydrate" 
              value="${escapeHtml(formData.genericName)}" 
            />
          </div>

          <div class="form-group">
            <label for="step1-dosage-input" class="form-label">Medication Strength &amp; Units *</label>
            <input 
              type="text" 
              id="step1-dosage-input" 
              class="form-input" 
              placeholder="e.g. 500 mg, 20 mEq, 100 mcg" 
              value="${escapeHtml(formData.dosage)}" 
              required 
            />
            <span class="form-hint">Clinical strength of each unit (distinct from dose count).</span>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
          <div class="form-group">
            <label for="step1-form-select" class="form-label">Dosage Form</label>
            <select id="step1-form-select" class="form-select">
              <option value="Tablet" ${formData.form === 'Tablet' ? 'selected' : ''}>Tablet</option>
              <option value="Capsule" ${formData.form === 'Capsule' ? 'selected' : ''}>Capsule</option>
              <option value="Liquid" ${formData.form === 'Liquid' ? 'selected' : ''}>Liquid / Syrup / Solution</option>
              <option value="Inhaler" ${formData.form === 'Inhaler' ? 'selected' : ''}>Inhaler / Aerosol</option>
              <option value="Drops" ${formData.form === 'Drops' ? 'selected' : ''}>Drops (Eye / Ear)</option>
              <option value="Patch" ${formData.form === 'Patch' ? 'selected' : ''}>Transdermal Patch</option>
              <option value="Injection" ${formData.form === 'Injection' ? 'selected' : ''}>Injection</option>
              <option value="Cream" ${formData.form === 'Cream' ? 'selected' : ''}>Cream / Ointment</option>
              <option value="Other" ${formData.form === 'Other' ? 'selected' : ''}>Other</option>
            </select>
          </div>

          <div class="form-group">
            <label for="step1-prescriber-input" class="form-label">Prescribed By (Optional)</label>
            <input 
              type="text" 
              id="step1-prescriber-input" 
              class="form-input" 
              placeholder="e.g. Dr. Marcus Chen" 
              value="${escapeHtml(formData.prescribedBy)}" 
            />
          </div>
        </div>

        <!-- Pill Appearance Slot -->
        <div class="form-group">
          <label class="form-label">Pill Appearance &amp; Color Tag</label>
          <div class="pill-visualizer-box" id="step1-pill-slot"></div>
        </div>
      `;
    }

    if (currentStep === 2) {
      return `
        <!-- STEP 2: PRESCRIBED DIRECTIONS -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
          <div class="form-group">
            <label for="step2-quantity-input" class="form-label">Dose Quantity per Administration *</label>
            <input 
              type="text" 
              id="step2-quantity-input" 
              class="form-input" 
              placeholder="e.g. 1 tablet, 2 puffs, 5 mL" 
              value="${escapeHtml(formData.doseQuantity)}" 
              required 
            />
            <span class="form-hint">How much the patient takes at one time (distinct from strength).</span>
          </div>

          <div class="form-group">
            <label for="step2-route-select" class="form-label">Route of Administration</label>
            <select id="step2-route-select" class="form-select">
              <option value="Oral" ${formData.route === 'Oral' ? 'selected' : ''}>Oral (By Mouth)</option>
              <option value="Sublingual" ${formData.route === 'Sublingual' ? 'selected' : ''}>Sublingual (Under Tongue)</option>
              <option value="Inhalation" ${formData.route === 'Inhalation' ? 'selected' : ''}>Inhalation (Breathe In)</option>
              <option value="Topical" ${formData.route === 'Topical' ? 'selected' : ''}>Topical (On Skin)</option>
              <option value="Ophthalmic" ${formData.route === 'Ophthalmic' ? 'selected' : ''}>Ophthalmic (Eye)</option>
              <option value="Otic" ${formData.route === 'Otic' ? 'selected' : ''}>Otic (Ear)</option>
              <option value="Subcutaneous" ${formData.route === 'Subcutaneous' ? 'selected' : ''}>Subcutaneous (Injection)</option>
              <option value="Other" ${formData.route === 'Other' ? 'selected' : ''}>Other</option>
            </select>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
          <div class="form-group">
            <label for="step2-frequency-select" class="form-label">Prescription Frequency</label>
            <select id="step2-frequency-select" class="form-select">
              <option value="Once daily" ${formData.frequency === 'Once daily' ? 'selected' : ''}>Once daily</option>
              <option value="Twice daily" ${formData.frequency === 'Twice daily' ? 'selected' : ''}>Twice daily</option>
              <option value="Three times daily" ${formData.frequency === 'Three times daily' ? 'selected' : ''}>Three times daily</option>
              <option value="Four times daily" ${formData.frequency === 'Four times daily' ? 'selected' : ''}>Four times daily</option>
              <option value="Every other day" ${formData.frequency === 'Every other day' ? 'selected' : ''}>Every other day</option>
              <option value="Weekly" ${formData.frequency === 'Weekly' ? 'selected' : ''}>Weekly</option>
              <option value="As needed (PRN)" ${formData.frequency === 'As needed (PRN)' ? 'selected' : ''}>As needed (PRN)</option>
              <option value="Custom" ${formData.frequency === 'Custom' ? 'selected' : ''}>Custom instructions</option>
            </select>
          </div>

          <div class="form-group" style="display: flex; flex-direction: column; justify-content: center;">
            <label class="slot-check-item" style="padding: 0.6rem 0.5rem; margin-top: 1.25rem; background: var(--bg-surface-alt); border-radius: var(--radius-sm); border: 1px solid var(--border-light);">
              <input type="checkbox" id="step2-prn-check" ${formData.isPRN ? 'checked' : ''} />
              <span><strong>As-Needed (PRN) Medication</strong></span>
            </label>
          </div>
        </div>

        <div class="form-group">
          <label class="slot-check-item" style="padding: 0.5rem 0;">
            <input type="checkbox" id="step2-food-check" ${formData.withFood ? 'checked' : ''} />
            <span><strong>Take with food</strong> (requires meal or snack)</span>
          </label>
        </div>

        <div class="form-group">
          <label for="step2-instructions-input" class="form-label">Prescribed Directions &amp; Patient Instructions</label>
          <textarea 
            id="step2-instructions-input" 
            class="form-textarea" 
            placeholder="e.g. Take with a full glass of water. Do not crush or chew."
            rows="2"
          >${escapeHtml(formData.instructions)}</textarea>
          <span class="form-hint">CareDose preserves exact user-confirmed instructions. It does not invent or alter clinical directions.</span>
        </div>

        <!-- Treatment Duration & Dates -->
        <div style="border-top: 1px solid var(--border-light); padding-top: 0.875rem; margin-top: 0.875rem;">
          <label class="form-label" style="font-weight: 700; margin-bottom: 0.5rem;">Treatment Course &amp; Dates</label>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
            <div class="form-group">
              <label for="step2-start-date" class="form-label">Start Date</label>
              <input type="date" id="step2-start-date" class="form-input" value="${formData.startDate}" />
            </div>

            <div class="form-group">
              <label class="form-label">Treatment Type</label>
              <select id="step2-course-type" class="form-select">
                <option value="ongoing" ${formData.isOngoing ? 'selected' : ''}>Ongoing / Long-term Therapy</option>
                <option value="fixed" ${!formData.isOngoing ? 'selected' : ''}>Fixed Course (End Date)</option>
              </select>
            </div>
          </div>

          <div id="step2-fixed-fields" style="display: ${formData.isOngoing ? 'none' : 'grid'}; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 0.5rem;">
            <div class="form-group">
              <label for="step2-end-date" class="form-label">End Date</label>
              <input type="date" id="step2-end-date" class="form-input" value="${formData.endDate}" />
            </div>
            <div class="form-group">
              <label for="step2-duration-desc" class="form-label">Duration Note</label>
              <input type="text" id="step2-duration-desc" class="form-input" placeholder="e.g. 7 days, 2 weeks" value="${escapeHtml(formData.duration)}" />
            </div>
          </div>
        </div>
      `;
    }

    if (currentStep === 3) {
      return `
        <!-- STEP 3: REMINDER SCHEDULE -->
        <div class="form-group" style="background: var(--bg-surface-alt); padding: 0.875rem; border-radius: var(--radius-md); border: 1px solid var(--border-main);">
          <label class="slot-check-item" style="padding: 0;">
            <input type="checkbox" id="step3-reminders-toggle" ${formData.remindersEnabled ? 'checked' : ''} />
            <span style="font-size: 0.9375rem;"><strong>Enable Scheduled Reminders for this Medication</strong></span>
          </label>
          <p style="font-size: 0.8125rem; color: var(--text-muted); margin-top: 0.35rem; margin-left: 1.6rem;">
            When enabled, CareDose triggers daily scheduled alerts and organizes doses in your Daily Pillbox.
          </p>
        </div>

        ${formData.isPRN ? `
          <div class="badge badge-status-prn" style="display: block; padding: 0.75rem; margin-bottom: 1rem; border-radius: var(--radius-sm); font-size: 0.8125rem;">
            <strong>ℹ As-Needed (PRN) Medication:</strong> PRN medications do not require fixed recurring alarms. Reminders can remain disabled unless you have a specific administration window confirmed with your doctor.
          </div>
        ` : ''}

        <div id="step3-schedule-controls" style="display: ${formData.remindersEnabled ? 'block' : 'none'};">
          <!-- Daily Slot Checkboxes -->
          <div class="form-group">
            <label class="form-label" style="font-weight: 700;">Daily Dose Time Windows *</label>
            <div class="slot-checkbox-grid">
              <label class="slot-check-item">
                <input type="checkbox" name="timeSlot" value="morning" ${formData.timeSlots.has('morning') ? 'checked' : ''} />
                <span>Morning (~8 AM)</span>
              </label>
              <label class="slot-check-item">
                <input type="checkbox" name="timeSlot" value="midday" ${formData.timeSlots.has('midday') ? 'checked' : ''} />
                <span>Midday (~1 PM)</span>
              </label>
              <label class="slot-check-item">
                <input type="checkbox" name="timeSlot" value="evening" ${formData.timeSlots.has('evening') ? 'checked' : ''} />
                <span>Evening (~6:30 PM)</span>
              </label>
              <label class="slot-check-item">
                <input type="checkbox" name="timeSlot" value="bedtime" ${formData.timeSlots.has('bedtime') ? 'checked' : ''} />
                <span>Bedtime (~10 PM)</span>
              </label>
            </div>
            <span class="form-hint">
              If your prescription states "twice daily" without exact times, select the standard windows that fit your daily care routine.
            </span>
          </div>

          <!-- Custom Specific Times (Optional) -->
          <div class="form-group" style="border-top: 1px solid var(--border-light); padding-top: 0.875rem;">
            <label class="form-label">Custom Exact Clock Times (Optional)</label>
            <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
              <input type="time" id="step3-custom-time-input" class="form-input" style="max-width: 140px;" />
              <button type="button" class="btn btn-secondary btn-sm" id="btn-add-custom-time">Add Exact Time</button>
            </div>
            <div id="step3-custom-times-list" style="display: flex; gap: 0.35rem; flex-wrap: wrap; margin-top: 0.5rem;">
              ${formData.customTimes.map(t => `
                <span class="badge" style="display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.25rem 0.5rem;">
                  ${t}
                  <button type="button" class="btn-remove-custom-time" data-time="${t}" style="background: none; border: none; cursor: pointer; color: var(--text-muted); font-size: 0.75rem;">✕</button>
                </span>
              `).join('')}
            </div>
          </div>

          <!-- Weekday Selection -->
          <div class="form-group" style="border-top: 1px solid var(--border-light); padding-top: 0.875rem;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <label class="form-label" style="font-weight: 700; margin: 0;">Days of the Week</label>
              <div style="display: flex; gap: 0.5rem;">
                <button type="button" class="btn btn-secondary btn-sm" id="btn-select-all-days" style="font-size: 0.75rem; padding: 0.2rem 0.5rem;">Every Day</button>
                <button type="button" class="btn btn-secondary btn-sm" id="btn-select-weekdays" style="font-size: 0.75rem; padding: 0.2rem 0.5rem;">Mon-Fri</button>
              </div>
            </div>
            <div class="weekday-chips-grid">
              ${WEEKDAYS.map(w => `
                <label class="weekday-chip" title="${w.full}">
                  <input type="checkbox" name="weekday" value="${w.day}" ${formData.weekdays.has(w.day) ? 'checked' : ''} />
                  <span>${w.label}</span>
                </label>
              `).join('')}
            </div>
            <span class="form-hint">Doses will only appear on selected days. Default is all 7 days.</span>
          </div>
        </div>
      `;
    }

    if (currentStep === 4) {
      const slotLabels: string[] = Array.from(formData.timeSlots).map(s => {
        switch (s) {
          case 'morning': return 'Morning (~8 AM)';
          case 'midday': return 'Midday (~1 PM)';
          case 'evening': return 'Evening (~6:30 PM)';
          case 'bedtime': return 'Bedtime (~10 PM)';
        }
      });
      if (formData.customTimes.length > 0) {
        slotLabels.push(...formData.customTimes);
      }

      const weekdaySummary = formData.weekdays.size === 7 
        ? 'Every day (Mon-Sun)' 
        : Array.from(formData.weekdays).map(d => WEEKDAYS.find(w => w.day === d)?.label).filter(Boolean).join(', ');

      return `
        <!-- STEP 4: REVIEW & CONFIRM -->
        <div class="med-review-card">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <h4 style="font-size: 1.25rem; font-weight: 800; color: var(--text-main); margin: 0;">
                ${escapeHtml(formData.name)}
              </h4>
              <span class="badge" style="font-size: 0.875rem; font-weight: 700; margin-top: 0.25rem;">
                ${escapeHtml(formData.dosage)}
              </span>
            </div>
            <span class="badge ${formData.status === 'active' ? 'badge-status-active' : 'badge-status-paused'}">
              Status: ${formData.status.toUpperCase()}
            </span>
          </div>

          <div class="med-review-row">
            <span class="med-review-label">Dosage Form &amp; Route:</span>
            <span class="med-review-val">${escapeHtml(formData.form)} • ${escapeHtml(formData.route)}</span>
          </div>

          <div class="med-review-row">
            <span class="med-review-label">Prescribed Dose:</span>
            <span class="med-review-val">${escapeHtml(formData.doseQuantity)} (${escapeHtml(formData.frequency)})</span>
          </div>

          <div class="med-review-row">
            <span class="med-review-label">As-Needed (PRN):</span>
            <span class="med-review-val">${formData.isPRN ? 'Yes (Symptom-based)' : 'No (Scheduled Daily)'}</span>
          </div>

          <div class="med-review-row">
            <span class="med-review-label">Scheduled Windows:</span>
            <span class="med-review-val">
              ${formData.remindersEnabled 
                ? (slotLabels.length > 0 ? slotLabels.join(', ') : 'None specified') 
                : '<span style="color: var(--text-muted);">Reminders Disabled</span>'}
            </span>
          </div>

          <div class="med-review-row">
            <span class="med-review-label">Scheduled Days:</span>
            <span class="med-review-val">${weekdaySummary}</span>
          </div>

          <div class="med-review-row">
            <span class="med-review-label">Treatment Period:</span>
            <span class="med-review-val">
              From ${formData.startDate} ${formData.endDate ? `to ${formData.endDate} (${formData.duration})` : '(Ongoing)'}
            </span>
          </div>

          <div class="med-review-row">
            <span class="med-review-label">Instructions:</span>
            <span class="med-review-val">
              ${formData.withFood ? '<span class="badge badge-caution" style="margin-right: 0.25rem;">With Food</span>' : ''}
              ${escapeHtml(formData.instructions)}
            </span>
          </div>

          ${formData.prescribedBy ? `
            <div class="med-review-row">
              <span class="med-review-label">Prescribed By:</span>
              <span class="med-review-val">${escapeHtml(formData.prescribedBy)}</span>
            </div>
          ` : ''}
        </div>

        <div style="background: var(--bg-surface-alt); border-left: 3px solid var(--brand-primary); padding: 0.75rem 1rem; border-radius: var(--radius-sm); margin-top: 1rem; font-size: 0.8125rem; color: var(--text-muted);">
          <strong>Verification Notice:</strong> Confirm that medication name, clinical strength, and directions reflect the verified prescription before saving. CareDose updates your cabinet, safety watchdog, and pillbox upon confirmation.
        </div>
      `;
    }

    return '';
  }

  function showValidationError(msg: string): void {
    const banner = modalOverlay.querySelector('#step-error-banner') as HTMLElement;
    if (banner) {
      banner.textContent = msg;
      banner.style.display = 'block';
      banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function clearValidationError(): void {
    const banner = modalOverlay.querySelector('#step-error-banner') as HTMLElement;
    if (banner) {
      banner.style.display = 'none';
      banner.textContent = '';
    }
  }

  function validateStep(step: number): boolean {
    clearValidationError();

    if (step === 1) {
      const nameInput = modalOverlay.querySelector('#step1-name-input') as HTMLInputElement;
      const dosageInput = modalOverlay.querySelector('#step1-dosage-input') as HTMLInputElement;
      const genericInput = modalOverlay.querySelector('#step1-generic-input') as HTMLInputElement;
      const formSelect = modalOverlay.querySelector('#step1-form-select') as HTMLSelectElement;
      const prescriberInput = modalOverlay.querySelector('#step1-prescriber-input') as HTMLInputElement;

      if (!nameInput || !nameInput.value.trim()) {
        showValidationError('Please enter the medication or brand name.');
        nameInput?.focus();
        return false;
      }
      if (!dosageInput || !dosageInput.value.trim()) {
        showValidationError('Please enter the medication strength & units (e.g. 500 mg, 20 mEq).');
        dosageInput?.focus();
        return false;
      }

      // Sync form data
      formData.name = nameInput.value.trim();
      formData.genericName = genericInput?.value.trim() || '';
      formData.dosage = dosageInput.value.trim();
      formData.form = formSelect?.value || 'Tablet';
      formData.prescribedBy = prescriberInput?.value.trim() || '';
      return true;
    }

    if (step === 2) {
      const quantityInput = modalOverlay.querySelector('#step2-quantity-input') as HTMLInputElement;
      const routeSelect = modalOverlay.querySelector('#step2-route-select') as HTMLSelectElement;
      const freqSelect = modalOverlay.querySelector('#step2-frequency-select') as HTMLSelectElement;
      const prnCheck = modalOverlay.querySelector('#step2-prn-check') as HTMLInputElement;
      const foodCheck = modalOverlay.querySelector('#step2-food-check') as HTMLInputElement;
      const instrInput = modalOverlay.querySelector('#step2-instructions-input') as HTMLTextAreaElement;
      const startDateInput = modalOverlay.querySelector('#step2-start-date') as HTMLInputElement;
      const courseSelect = modalOverlay.querySelector('#step2-course-type') as HTMLSelectElement;
      const endDateInput = modalOverlay.querySelector('#step2-end-date') as HTMLInputElement;
      const durationInput = modalOverlay.querySelector('#step2-duration-desc') as HTMLInputElement;

      if (!quantityInput || !quantityInput.value.trim()) {
        showValidationError('Please enter the dose quantity per administration (e.g. 1 tablet, 2 puffs).');
        quantityInput?.focus();
        return false;
      }

      const isOngoing = courseSelect?.value === 'ongoing';
      if (!isOngoing && endDateInput?.value && startDateInput?.value) {
        if (new Date(endDateInput.value) < new Date(startDateInput.value)) {
          showValidationError('Treatment end date cannot be earlier than start date.');
          endDateInput?.focus();
          return false;
        }
      }

      formData.doseQuantity = quantityInput.value.trim();
      formData.route = routeSelect?.value || 'Oral';
      formData.frequency = freqSelect?.value || 'Once daily';
      formData.isPRN = !!prnCheck?.checked;
      formData.withFood = !!foodCheck?.checked;
      formData.instructions = instrInput?.value.trim() || 'Take as prescribed.';
      formData.startDate = startDateInput?.value || new Date().toISOString().slice(0, 10);
      formData.isOngoing = isOngoing;
      formData.endDate = isOngoing ? '' : (endDateInput?.value || '');
      formData.duration = isOngoing ? 'Ongoing' : (durationInput?.value.trim() || 'Fixed course');

      // If PRN, update reminder default
      if (formData.isPRN && !existingMed) {
        formData.remindersEnabled = false;
      }
      return true;
    }

    if (step === 3) {
      const remindersToggle = modalOverlay.querySelector('#step3-reminders-toggle') as HTMLInputElement;
      const enabled = !!remindersToggle?.checked;
      formData.remindersEnabled = enabled;

      if (enabled) {
        const selectedSlots = new Set<TimeSlot>();
        modalOverlay.querySelectorAll<HTMLInputElement>('input[name="timeSlot"]:checked').forEach(cb => {
          selectedSlots.add(cb.value as TimeSlot);
        });
        formData.timeSlots = selectedSlots;

        const selectedDays = new Set<number>();
        modalOverlay.querySelectorAll<HTMLInputElement>('input[name="weekday"]:checked').forEach(cb => {
          selectedDays.add(parseInt(cb.value, 10));
        });
        formData.weekdays = selectedDays.size > 0 ? selectedDays : new Set([0, 1, 2, 3, 4, 5, 6]);

        if (!formData.isPRN && formData.timeSlots.size === 0 && formData.customTimes.length === 0) {
          showValidationError('Please select at least one daily dose time window (Morning, Midday, Evening, Bedtime) or enter a custom clock time.');
          return false;
        }
      }
      return true;
    }

    return true;
  }

  function attachStepEvents(): void {
    // Stepper navigation click
    modalOverlay.querySelectorAll('.step-item').forEach(item => {
      item.addEventListener('click', () => {
        const targetStep = parseInt((item as HTMLElement).dataset.step || '1', 10);
        if (targetStep < currentStep) {
          currentStep = targetStep;
          render();
        } else if (targetStep > currentStep) {
          if (validateStep(currentStep)) {
            currentStep = targetStep;
            render();
          }
        }
      });
    });

    // Close and Cancel buttons
    modalOverlay.querySelector('#btn-close-modal')?.addEventListener('click', closeModal);
    modalOverlay.querySelector('#btn-wizard-back')?.addEventListener('click', () => {
      if (currentStep === 1) {
        closeModal();
      } else {
        currentStep--;
        render();
      }
    });

    // Next button
    modalOverlay.querySelector('#btn-wizard-next')?.addEventListener('click', () => {
      if (validateStep(currentStep)) {
        currentStep++;
        render();
      }
    });

    // Save button (Step 4)
    modalOverlay.querySelector('#btn-wizard-save')?.addEventListener('click', () => {
      saveMedication();
    });

    // Step 1 specific events:
    if (currentStep === 1) {
      const visualSlot = modalOverlay.querySelector('#step1-pill-slot') as HTMLElement;
      if (visualSlot) {
        renderPillVisualSelector(visualSlot, formData.visualState, (v) => {
          formData.visualState = v;
        });
      }

      // RxNorm Autocomplete
      const nameInput = modalOverlay.querySelector('#step1-name-input') as HTMLInputElement;
      const genericInput = modalOverlay.querySelector('#step1-generic-input') as HTMLInputElement;
      const dropdown = modalOverlay.querySelector('#autocomplete-dropdown') as HTMLElement;
      let debounceTimer: ReturnType<typeof setTimeout> | null = null;

      nameInput?.addEventListener('input', () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        const query = nameInput.value.trim();
        if (query.length < 2) {
          dropdown.style.display = 'none';
          return;
        }

        debounceTimer = setTimeout(async () => {
          const suggestions: DrugSuggestion[] = await searchDrugNames(query);
          if (suggestions.length === 0) {
            dropdown.style.display = 'none';
            return;
          }

          dropdown.innerHTML = suggestions.map(s => `
            <div class="autocomplete-item" data-name="${s.name}" data-generic="${s.genericName || ''}">
              <strong>${s.name}</strong>
              ${s.genericName ? `<small>(${s.genericName})</small>` : ''}
              ${s.category ? `<span class="badge" style="font-size:0.7rem; float:right;">${s.category}</span>` : ''}
            </div>
          `).join('');
          dropdown.style.display = 'block';

          dropdown.querySelectorAll('.autocomplete-item').forEach(item => {
            item.addEventListener('click', (e) => {
              const target = e.currentTarget as HTMLElement;
              nameInput.value = target.dataset.name || '';
              if (target.dataset.generic && !genericInput.value) {
                genericInput.value = target.dataset.generic;
              }
              dropdown.style.display = 'none';
            });
          });
        }, 250);
      });

      // Outside click hides dropdown
      document.addEventListener('click', (e) => {
        if (dropdown && !dropdown.contains(e.target as Node) && e.target !== nameInput) {
          dropdown.style.display = 'none';
        }
      });
    }

    // Step 2 specific events:
    if (currentStep === 2) {
      const courseSelect = modalOverlay.querySelector('#step2-course-type') as HTMLSelectElement;
      const fixedFields = modalOverlay.querySelector('#step2-fixed-fields') as HTMLElement;
      courseSelect?.addEventListener('change', () => {
        if (courseSelect.value === 'fixed') {
          fixedFields.style.display = 'grid';
        } else {
          fixedFields.style.display = 'none';
        }
      });

      const prnCheck = modalOverlay.querySelector('#step2-prn-check') as HTMLInputElement;
      const freqSelect = modalOverlay.querySelector('#step2-frequency-select') as HTMLSelectElement;
      prnCheck?.addEventListener('change', () => {
        if (prnCheck.checked && freqSelect.value !== 'As needed (PRN)') {
          freqSelect.value = 'As needed (PRN)';
        }
      });
      freqSelect?.addEventListener('change', () => {
        if (freqSelect.value === 'As needed (PRN)') {
          prnCheck.checked = true;
        }
      });
    }

    // Step 3 specific events:
    if (currentStep === 3) {
      const remindersToggle = modalOverlay.querySelector('#step3-reminders-toggle') as HTMLInputElement;
      const scheduleControls = modalOverlay.querySelector('#step3-schedule-controls') as HTMLElement;
      remindersToggle?.addEventListener('change', () => {
        if (scheduleControls) {
          scheduleControls.style.display = remindersToggle.checked ? 'block' : 'none';
        }
      });

      // Custom times handler
      const customTimeInput = modalOverlay.querySelector('#step3-custom-time-input') as HTMLInputElement;
      modalOverlay.querySelector('#btn-add-custom-time')?.addEventListener('click', () => {
        const timeVal = customTimeInput?.value;
        if (timeVal && !formData.customTimes.includes(timeVal)) {
          formData.customTimes.push(timeVal);
          formData.customTimes.sort();
          render();
        }
      });

      modalOverlay.querySelectorAll('.btn-remove-custom-time').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const timeToRemove = (e.currentTarget as HTMLElement).dataset.time;
          formData.customTimes = formData.customTimes.filter(t => t !== timeToRemove);
          render();
        });
      });

      // Weekday shortcut buttons
      modalOverlay.querySelector('#btn-select-all-days')?.addEventListener('click', () => {
        formData.weekdays = new Set([0, 1, 2, 3, 4, 5, 6]);
        render();
      });
      modalOverlay.querySelector('#btn-select-weekdays')?.addEventListener('click', () => {
        formData.weekdays = new Set([1, 2, 3, 4, 5]);
        render();
      });
    }
  }

  function saveMedication(): void {
    const medPayload = {
      name: formData.name,
      genericName: formData.genericName || undefined,
      dosage: formData.dosage,
      doseQuantity: formData.doseQuantity,
      form: formData.form,
      route: formData.route,
      frequency: formData.frequency,
      isPRN: formData.isPRN,
      timeSlots: Array.from(formData.timeSlots),
      customTimes: formData.customTimes.length > 0 ? formData.customTimes : undefined,
      weekdays: formData.weekdays.size === 7 ? undefined : Array.from(formData.weekdays),
      startDate: formData.startDate,
      endDate: formData.isOngoing ? undefined : (formData.endDate || undefined),
      duration: formData.isOngoing ? 'Ongoing' : formData.duration,
      remindersEnabled: formData.remindersEnabled,
      status: formData.status,
      withFood: formData.withFood,
      instructions: formData.instructions,
      pillVisual: formData.visualState,
      prescribedBy: formData.prescribedBy || undefined,
      isActive: formData.status === 'active'
    };

    if (isEdit && existingMed) {
      medStore.updateMedication(existingMed.id, medPayload);
      closeModal();
      if (onSaved) onSaved();
    } else {
      const added = medStore.addMedication(medPayload);
      showFastEntrySuccess(added);
    }
  }

  /**
   * Fast Entry UX: Immediate confirmation with choice to Add Another Medication
   * or return to Cabinet. Prevents clinical default pollution between entries.
   */
  function showFastEntrySuccess(med: Medication): void {
    modalOverlay.innerHTML = `
      <div class="modal-dialog" style="max-width: 520px;">
        <div class="modal-body" style="padding: 2rem 1.5rem;">
          <div class="fast-entry-success-card">
            <div class="fast-entry-success-icon" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <div>
              <h3 style="font-size: 1.25rem; font-weight: 800; color: #166534; margin: 0;">
                Medication Saved
              </h3>
              <p style="font-size: 1rem; font-weight: 600; color: var(--text-main); margin-top: 0.35rem;">
                <strong>${escapeHtml(med.name)}</strong> (${escapeHtml(med.dosage)})
              </p>
              <p style="font-size: 0.8125rem; color: var(--text-muted); margin-top: 0.25rem;">
                Updated in Medication Cabinet, Daily Pillbox, Safety Watchdog, and Emergency Sheet.
              </p>
            </div>

            <div style="display: flex; flex-direction: column; width: 100%; gap: 0.75rem; margin-top: 0.5rem;">
              <button type="button" class="btn btn-primary" id="btn-add-another-med" style="width: 100%; justify-content: center; padding: 0.75rem;">
                + Add Another Medication
              </button>
              <button type="button" class="btn btn-secondary" id="btn-done-fast-entry" style="width: 100%; justify-content: center;">
                Done &amp; View Cabinet
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    modalOverlay.querySelector('#btn-add-another-med')?.addEventListener('click', () => {
      // Re-initialize with clean slate: no dose/frequency/clinical carryover
      openMedicationModal(undefined, onSaved);
    });

    modalOverlay.querySelector('#btn-done-fast-entry')?.addEventListener('click', () => {
      closeModal();
      if (onSaved) onSaved();
    });
  }

  function escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  document.body.appendChild(modalOverlay);
  render();
}
