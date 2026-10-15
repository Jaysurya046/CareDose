/**
 * CareDose — Safe Prescription Import Pipeline & Duplicate Reconciliation.
 * 
 * Complies with Section 9 & 10 of Specifications:
 * - Detects existing medication duplicates.
 * - Imports only validated, confirmed medication records into medStore.
 * - Records provenance ("User-Confirmed Prescription").
 * - Automatically triggers Safety Watchdog evaluation on the updated cabinet.
 */

import type { PrescriptionMedicationDraft, Medication } from '../types';
import { medStore } from '../store/medStore';

export function openPrescriptionImportSummary(
  confirmedDrafts: PrescriptionMedicationDraft[],
  onComplete?: () => void
): void {
  const existing = document.getElementById('rx-import-modal');
  if (existing) existing.remove();

  const modalBackdrop = document.createElement('div');
  modalBackdrop.id = 'rx-import-modal';
  modalBackdrop.className = 'rx-modal-backdrop';
  modalBackdrop.setAttribute('role', 'dialog');
  modalBackdrop.setAttribute('aria-modal', 'true');
  modalBackdrop.setAttribute('aria-labelledby', 'rx-import-title');

  const existingMeds = medStore.getMedications();

  // Detect duplicates against active cabinet
  const duplicateMap = new Map<string, Medication>();
  for (const draft of confirmedDrafts) {
    if (!draft.name) continue;
    const match = existingMeds.find(m => m.name.toLowerCase() === draft.name!.toLowerCase());
    if (match) {
      duplicateMap.set(draft.id, match);
    }
  }

  // User resolution choices for duplicates: 'add_new' | 'update_existing' | 'skip'
  const duplicateActions: Record<string, 'add_new' | 'update_existing' | 'skip'> = {};
  duplicateMap.forEach((_, draftId) => {
    duplicateActions[draftId] = 'add_new'; // default safe action
  });

  const renderContent = (isImported = false) => {
    if (isImported) {
      return `
        <div class="rx-modal-card upload-dialog" tabindex="-1">
          <div class="rx-modal-header" style="background: #f0fdfa;">
            <div class="rx-modal-title-group">
              <h2 id="rx-import-title" style="color: #0f766e;">Medications Successfully Imported</h2>
              <p>Your confirmed prescription records have been added to your Medication Cabinet.</p>
            </div>
          </div>
          <div class="rx-upload-body">
            <div class="rx-notice-banner notice-info">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
              <div>
                <strong>${confirmedDrafts.length} Confirmed ${confirmedDrafts.length === 1 ? 'Medication' : 'Medications'} Saved</strong>
                <div>Reminder schedules have been updated. The Clinical Safety Watchdog has automatically evaluated your updated regimen.</div>
              </div>
            </div>

            <div style="margin-top: 1rem; display: flex; justify-content: flex-end;">
              <button type="button" class="btn btn-primary" id="btn-done-import">
                View in Medication Cabinet
              </button>
            </div>
          </div>
        </div>
      `;
    }

    return `
      <div class="rx-modal-card upload-dialog" tabindex="-1">
        <div class="rx-modal-header">
          <div class="rx-modal-title-group">
            <h2 id="rx-import-title">Prescription Review Complete</h2>
            <p>Confirm import of ${confirmedDrafts.length} validated ${confirmedDrafts.length === 1 ? 'medication' : 'medications'}.</p>
          </div>
          <button type="button" class="rx-modal-close-btn" id="btn-close-import" aria-label="Cancel import">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div class="rx-upload-body">
          <div style="display: flex; flex-direction: column; gap: 0.75rem;">
            ${confirmedDrafts.map(draft => {
              const duplicate = duplicateMap.get(draft.id);

              return `
                <div class="card" style="padding: 1rem; border: 1px solid var(--border-light); background: var(--bg-surface-alt);">
                  <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem;">
                    <div>
                      <strong style="font-size: 1rem; color: var(--text-main);">${draft.name}</strong>
                      <span class="badge" style="margin-left: 0.35rem;">${draft.strength}</span>
                      <div style="font-size: 0.8125rem; color: var(--text-muted); margin-top: 0.25rem;">
                        ${draft.dosageForm || 'Tablet'} • ${draft.timeSlots.join(', ') || 'No slot assigned'}
                        ${draft.doseQuantity ? ` • ${draft.doseQuantity}` : ''}
                      </div>
                    </div>
                    <span class="badge badge-safe">
                      ${draft.verificationStatus === 'professional_clarification' ? '🩺 Clarified' : '✓ Confirmed'}
                    </span>
                  </div>

                  ${duplicate ? `
                    <div class="rx-notice-banner notice-caution" style="margin-top: 0.75rem; font-size: 0.8125rem;">
                      <div>
                        <strong>Existing Medication Found:</strong> "${duplicate.name} ${duplicate.dosage}" is already in your cabinet.
                        <div style="margin-top: 0.5rem; display: flex; gap: 0.75rem; flex-wrap: wrap;">
                          <label style="display: inline-flex; align-items: center; gap: 0.25rem; cursor: pointer;">
                            <input type="radio" name="dup-${draft.id}" value="add_new" ${duplicateActions[draft.id] === 'add_new' ? 'checked' : ''} class="dup-radio" data-id="${draft.id}" />
                            <span>Add as New Entry</span>
                          </label>
                          <label style="display: inline-flex; align-items: center; gap: 0.25rem; cursor: pointer;">
                            <input type="radio" name="dup-${draft.id}" value="update_existing" ${duplicateActions[draft.id] === 'update_existing' ? 'checked' : ''} class="dup-radio" data-id="${draft.id}" />
                            <span>Update Existing Record</span>
                          </label>
                          <label style="display: inline-flex; align-items: center; gap: 0.25rem; cursor: pointer;">
                            <input type="radio" name="dup-${draft.id}" value="skip" ${duplicateActions[draft.id] === 'skip' ? 'checked' : ''} class="dup-radio" data-id="${draft.id}" />
                            <span>Skip This One</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  ` : ''}
                </div>
              `;
            }).join('')}
          </div>

          <div style="margin-top: 1.25rem; display: flex; justify-content: flex-end; gap: 0.75rem;">
            <button type="button" class="btn btn-secondary" id="btn-cancel-import-step">Back to Review</button>
            <button type="button" class="btn btn-primary" id="btn-confirm-final-import">
              Confirm &amp; Save to Cabinet
            </button>
          </div>
        </div>
      </div>
    `;
  };

  modalBackdrop.innerHTML = renderContent(false);
  document.body.appendChild(modalBackdrop);

  const attachEvents = () => {
    modalBackdrop.querySelector('#btn-close-import')?.addEventListener('click', () => modalBackdrop.remove());
    modalBackdrop.querySelector('#btn-cancel-import-step')?.addEventListener('click', () => modalBackdrop.remove());

    modalBackdrop.querySelectorAll('.dup-radio').forEach(radio => {
      radio.addEventListener('change', (e) => {
        const input = e.target as HTMLInputElement;
        const id = input.dataset.id!;
        duplicateActions[id] = input.value as any;
      });
    });

    modalBackdrop.querySelector('#btn-confirm-final-import')?.addEventListener('click', () => {
      // Execute safe import into medStore
      for (const draft of confirmedDrafts) {
        if (!draft.name || !draft.strength) continue;

        const action = duplicateActions[draft.id] || 'add_new';
        const existingMed = duplicateMap.get(draft.id);

        if (action === 'skip') {
          continue;
        }

        const pillShape = (draft.dosageForm === 'Capsule' ? 'capsule' : 'round') as any;

        if (action === 'update_existing' && existingMed) {
          // Update existing
          medStore.updateMedication(existingMed.id, {
            dosage: draft.strength,
            form: draft.dosageForm || existingMed.form,
            timeSlots: draft.timeSlots.length > 0 ? draft.timeSlots : existingMed.timeSlots,
            instructions: draft.instructions || existingMed.instructions,
            isPrescriptionImport: true,
            prescriptionVerificationStatus: draft.verificationStatus,
            importedAt: new Date().toISOString()
          });
        } else {
          // Add as new entry
          medStore.addMedication({
            name: draft.name,
            genericName: draft.genericName || undefined,
            dosage: draft.strength,
            form: draft.dosageForm || 'Tablet',
            timeSlots: draft.timeSlots,
            withFood: draft.instructions?.toLowerCase().includes('food') || false,
            instructions: draft.instructions || '',
            pillVisual: {
              shape: pillShape,
              color: 'white'
            },
            prescribedBy: draft.prescribedBy || undefined,
            isActive: true,
            isPrescriptionImport: true,
            prescriptionVerificationStatus: draft.verificationStatus,
            importedAt: new Date().toISOString()
          });
        }
      }

      // Show success screen
      modalBackdrop.innerHTML = renderContent(true);
      modalBackdrop.querySelector('#btn-done-import')?.addEventListener('click', () => {
        modalBackdrop.remove();
        if (onComplete) onComplete();
      });
    });
  };

  attachEvents();
}
