import { medStore } from '../store/medStore';
import { formatPrintDate } from '../utils/date';
import { openPatientModal } from './PatientModal';

/**
 * Renders the Emergency Medical & Fridge Sheet designed for rapid reference by family,
 * caregivers, and emergency responders.
 */
export function renderFridgeSheet(container: HTMLElement): void {
  const profile = medStore.getPatientProfile();
  const activeMeds = medStore.getActiveMedications();
  const printDate = formatPrintDate(new Date());

  container.innerHTML = `
    <div class="fridge-sheet-container">
      <!-- On-screen Action Toolbar (Hidden during print) -->
      <div class="fridge-toolbar card no-print">
        <div class="toolbar-title-group">
          <div>
            <h2 style="font-size: 1.25rem; font-weight: 700;">Emergency Medical &amp; Fridge Sheet</h2>
            <p style="font-size: 0.875rem; color: var(--text-muted);">
              Print-ready emergency summary. Affix to the refrigerator door or keep in an accessible emergency binder.
            </p>
          </div>
        </div>

        <div class="toolbar-actions">
          <button type="button" class="btn btn-secondary" id="btn-edit-patient">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            <span>Edit Patient Info</span>
          </button>

          <button type="button" class="btn btn-primary" id="btn-print-sheet">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
              <polyline points="6 9 6 2 18 2 18 9"/>
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
              <rect x="6" y="14" width="12" height="8"/>
            </svg>
            <span>Print Emergency Sheet</span>
          </button>
        </div>
      </div>

      <!-- Printable Emergency Document Canvas -->
      <article class="fridge-document card" id="printable-fridge-area" aria-label="Printable Emergency Medical Information">
        <!-- Section A: Emergency Header -->
        <header class="print-header">
          <div class="print-header-left">
            <span class="emergency-badge" aria-hidden="true">CRITICAL MEDICAL REFERENCE</span>
            <h1 class="emergency-main-title">EMERGENCY MEDICAL INFORMATION</h1>
            <p class="print-subtitle">
              Patient: <strong>${profile.name || 'Not Specified'}</strong> • Generated: ${printDate}
            </p>
          </div>
          <div class="emergency-callout">
            <strong>ATTN: FIRST RESPONDERS</strong>
            <span>EMS / PARAMEDICS / ER</span>
          </div>
        </header>

        <!-- Notice of User-Maintained Record -->
        <div class="user-record-notice">
          Notice: This medical summary is maintained by the patient or family caregiver for rapid reference. Responders should verify active regimens via health systems when available.
        </div>

        <!-- Section B: Patient Demographics Grid -->
        <section class="print-patient-grid" aria-label="Patient Demographics">
          <div class="grid-cell">
            <span class="field-label">Patient Full Name</span>
            <span class="field-value patient-name-val">${profile.name || 'Not Specified'}</span>
          </div>
          <div class="grid-cell">
            <span class="field-label">Date of Birth</span>
            <span class="field-value">${profile.dob || 'Not Specified'}</span>
          </div>
          <div class="grid-cell">
            <span class="field-label">Blood Group</span>
            <span class="field-value">${profile.bloodType || 'Unknown / Not Reported'}</span>
          </div>
        </section>

        <!-- Section C: Critical Allergies -->
        <section class="print-allergies-box" aria-label="Known Drug Allergies and Reactions">
          <div class="allergy-header">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span class="allergy-title">KNOWN DRUG ALLERGIES &amp; ADVERSE REACTIONS</span>
          </div>
          <div class="allergy-list">
            ${profile.allergies.length > 0 
              ? profile.allergies.map(a => `<span class="allergy-tag">⚠️ ${a}</span>`).join(' ')
              : '<span class="no-allergies">No known drug allergies reported (NKDA)</span>'}
          </div>
        </section>

        <!-- Section D: Current Active Medications Table -->
        <section class="print-meds-section" aria-label="Current Active Medications">
          <div class="table-section-header">
            <h2 class="print-section-heading">
              Current Active Medications (${activeMeds.length})
            </h2>
            <span class="table-subtitle">All active daily schedules, dosages, and administration notes</span>
          </div>

          <div class="print-table-wrap">
            <table class="print-table" aria-label="Active Medication Schedule Table">
              <thead>
                <tr>
                  <th scope="col" style="width: 28%;">Medication &amp; Active Ingredient</th>
                  <th scope="col" style="width: 14%;">Strength / Form</th>
                  <th scope="col" style="width: 18%;">Schedule Times</th>
                  <th scope="col" style="width: 24%;">Instructions &amp; Food</th>
                  <th scope="col" style="width: 16%;">Prescribing Doctor</th>
                </tr>
              </thead>
              <tbody>
                ${activeMeds.length > 0 ? activeMeds.map(m => `
                  <tr>
                    <td class="med-cell-name">
                      <strong>${m.name}</strong>
                      ${m.genericName ? `<div class="print-generic-name">(${m.genericName})</div>` : ''}
                    </td>
                    <td>
                      <span class="print-dosage-badge">${m.dosage}</span>
                      <div class="print-form-name">${m.form}</div>
                    </td>
                    <td class="print-schedule-cell">
                      <strong>${m.timeSlots.map(s => s.toUpperCase()).join(', ')}</strong>
                    </td>
                    <td>
                      ${m.withFood ? '<span class="print-food-tag">[Take with food]</span> ' : ''}
                      <span>${m.instructions}</span>
                    </td>
                    <td>${m.prescribedBy || 'N/A'}</td>
                  </tr>
                `).join('') : `
                  <tr>
                    <td colspan="5" style="text-align: center; padding: 1.5rem;">No active medications currently registered.</td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
        </section>

        <!-- Section E: Emergency Contacts Grid -->
        <section class="print-footer-grid" aria-label="Emergency Contacts and Healthcare Providers">
          <div class="print-footer-box">
            <span class="field-label">PRIMARY EMERGENCY CONTACT</span>
            <div class="contact-name-row">
              <strong>${profile.emergencyContactName || 'None Listed'}</strong>
              ${profile.emergencyContactRelation ? `<span class="contact-relation">(${profile.emergencyContactRelation})</span>` : ''}
            </div>
            <div class="contact-phone-primary">
              ${profile.emergencyContactPhone || 'No phone provided'}
            </div>
          </div>

          <div class="print-footer-box">
            <span class="field-label">PRIMARY PHYSICIAN &amp; HOSPITAL</span>
            <div class="contact-name-row">
              <strong>${profile.primaryDoctorName || 'None Listed'}</strong>
            </div>
            <div class="contact-phone-primary">
              ${profile.primaryDoctorPhone || 'No office phone provided'}
            </div>
            <div class="contact-hospital">
              Preferred Hospital: <strong>${profile.preferredHospital || 'Local Emergency Center'}</strong>
            </div>
          </div>
        </section>

        <!-- Section F: Medical & Mobility Notes -->
        ${profile.notes ? `
          <section class="print-notes-box" aria-label="Special Medical Notes and Assistive Devices">
            <span class="field-label">SPECIAL MEDICAL NOTES, DEVICES &amp; MOBILITY:</span>
            <p class="print-notes-text">${profile.notes}</p>
          </section>
        ` : ''}

        <footer class="print-disclaimer">
          CareDose Patient Safety System • Local-first unencrypted device storage. Always confirm acute clinical protocols with medical control.
        </footer>
      </article>
    </div>
  `;

  // Attach handlers
  container.querySelector('#btn-print-sheet')?.addEventListener('click', () => {
    window.print();
  });

  container.querySelector('#btn-edit-patient')?.addEventListener('click', () => {
    openPatientModal(() => renderFridgeSheet(container));
  });
}
