import { medStore } from '../store/medStore';
import type { BackupValidationResult } from '../types';
import { createPillBadgeHTML } from './PillBadge';
import { openMedicationModal } from './MedicationModal';
import { renderSafetyWatchdogBanner } from './SafetyWatchdogBanner';
import { openPrescriptionUploadModal } from './PrescriptionUploadModal';

export function renderMedicationCabinet(container: HTMLElement): void {
  const allMeds = medStore.getMedications();
  const activeCount = allMeds.filter(m => m.status === 'active').length;
  const pausedCount = allMeds.filter(m => m.status === 'paused').length;
  const completedCount = allMeds.filter(m => m.status === 'completed').length;

  let currentTab: 'all' | 'active' | 'paused' | 'completed' = 'all';
  let currentSearch = '';

  container.innerHTML = `
    <div class="cabinet-wrap">
      <!-- Clinical Safety Watchdog Banner -->
      <div id="cabinet-watchdog-mount"></div>

      <!-- Cabinet Header & Toolbar -->
      <div class="cabinet-header-bar card">
        <div class="cabinet-title-group">
          <div>
            <h2 class="cabinet-title">Medication Cabinet</h2>
            <p class="cabinet-subtitle">Manage prescribed medications, over-the-counter supplements, and administration schedules.</p>
          </div>
          <div class="cabinet-header-actions">
            <span class="badge badge-safe" aria-label="${activeCount} active medications">
              ${activeCount} Active / ${allMeds.length} Total
            </span>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-open-backup-hub" title="Export or restore local JSON backup">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              <span>Backup &amp; Restore</span>
            </button>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-clear-data" style="color: var(--status-critical-text);" title="Permanently clear local data">
              <span>Reset Data</span>
            </button>
          </div>
        </div>

        <!-- Primary Action Toolbar: Manual-First UX -->
        <div class="cabinet-controls-row">
          <div class="search-input-wrap">
            <label for="cabinet-search" class="visually-hidden">Search medications</label>
            <input 
              type="text" 
              id="cabinet-search" 
              class="form-input" 
              placeholder="Search by brand name, active ingredient, or strength..." 
            />
          </div>
          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
            <!-- Primary Action: Manual Entry -->
            <button type="button" class="btn btn-primary" id="btn-add-med" style="font-weight: 700;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              <span>Add Medication</span>
            </button>
            <!-- Secondary Action: Prescription OCR Import -->
            <button type="button" class="btn btn-secondary" id="btn-scan-rx" title="Import from prescription document (Optional)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                <circle cx="12" cy="13" r="4"></circle>
              </svg>
              <span>Import from Prescription (Optional)</span>
            </button>
          </div>
        </div>

        <!-- Medication Lifecycle Filter Tabs -->
        <div class="cabinet-tabs-row" role="tablist" aria-label="Medication status filter">
          <button type="button" class="cabinet-tab-btn is-active" data-tab="all" role="tab" aria-selected="true">
            All (${allMeds.length})
          </button>
          <button type="button" class="cabinet-tab-btn" data-tab="active" role="tab" aria-selected="false">
            Active (${activeCount})
          </button>
          <button type="button" class="cabinet-tab-btn" data-tab="paused" role="tab" aria-selected="false">
            Paused (${pausedCount})
          </button>
          <button type="button" class="cabinet-tab-btn" data-tab="completed" role="tab" aria-selected="false">
            Completed (${completedCount})
          </button>
        </div>
      </div>

      <!-- Medications Table & Responsive Cards -->
      <div class="cabinet-list card" id="cabinet-items-container">
        <!-- Rendered dynamically -->
      </div>

      <!-- Isolated Safety Demonstration Box -->
      <section class="dev-demo-card card" aria-label="Clinical interaction demonstration">
        <div class="dev-demo-content">
          <div class="dev-demo-text">
            <span class="badge" style="background: var(--bg-surface-alt); border: 1px solid var(--border-main); color: var(--text-muted); font-size: 0.75rem;">
              Educational Demonstration Tool
            </span>
            <h3 style="font-size: 0.9375rem; font-weight: 700; margin-top: 0.25rem;">Verify Drug Interaction Detection</h3>
            <p style="font-size: 0.8125rem; color: var(--text-muted); margin-top: 2px;">
              Caregivers and clinicians can simulate a known pharmacological conflict (adds Potassium Chloride to screen against Lisinopril) to verify that the safety watchdog functions.
            </p>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-demo-conflict" title="Add a conflicting medication to demo the safety watchdog">
            <span>Simulate Conflict Test</span>
          </button>
        </div>
      </section>
    </div>
  `;

  // Render Watchdog Banner
  const watchdogMount = container.querySelector('#cabinet-watchdog-mount') as HTMLElement;
  if (watchdogMount) {
    renderSafetyWatchdogBanner(watchdogMount);
  }

  // Demo conflict test handler
  container.querySelector('#btn-demo-conflict')?.addEventListener('click', () => {
    openMedicationModal({
      id: '',
      name: 'Potassium Chloride',
      genericName: 'Potassium Supplement (K-Dur)',
      dosage: '20 mEq',
      doseQuantity: '1 tablet',
      form: 'Tablet',
      route: 'Oral',
      frequency: 'Once daily',
      timeSlots: ['morning'],
      status: 'active',
      remindersEnabled: true,
      withFood: true,
      instructions: 'Take in the morning with a full glass of water and meal.',
      pillVisual: { shape: 'round', color: 'yellow' },
      prescribedBy: 'Over-the-counter',
      isActive: true,
      createdAt: new Date().toISOString()
    }, () => renderMedicationCabinet(container));
  });

  // Clear Local Data Handler
  container.querySelector('#btn-clear-data')?.addEventListener('click', () => {
    if (confirm('Permanently erase all locally stored patient profile data and medication schedules? This action cannot be reversed.')) {
      if (confirm('Please confirm once more: Reset all local data to factory defaults?')) {
        medStore.resetAllData();
        renderMedicationCabinet(container);
      }
    }
  });

  // Backup & Restore Hub Modal Handler
  container.querySelector('#btn-open-backup-hub')?.addEventListener('click', () => {
    openBackupRestoreModal(() => renderMedicationCabinet(container));
  });

  // Filter Tabs Event Handlers
  container.querySelectorAll('.cabinet-tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      container.querySelectorAll('.cabinet-tab-btn').forEach(b => {
        b.classList.remove('is-active');
        b.setAttribute('aria-selected', 'false');
      });
      const target = e.currentTarget as HTMLElement;
      target.classList.add('is-active');
      target.setAttribute('aria-selected', 'true');
      currentTab = target.dataset.tab as 'all' | 'active' | 'paused' | 'completed';
      renderItems();
    });
  });

  // Render Items based on search and tab
  const listContainer = container.querySelector('#cabinet-items-container') as HTMLElement;
  const searchInput = container.querySelector('#cabinet-search') as HTMLInputElement;

  const renderItems = () => {
    const query = currentSearch.toLowerCase().trim();
    let filtered = allMeds;

    // Apply tab filter
    if (currentTab !== 'all') {
      filtered = filtered.filter(m => m.status === currentTab);
    }

    // Apply search filter
    if (query) {
      filtered = filtered.filter(m => 
        m.name.toLowerCase().includes(query) || 
        (m.genericName && m.genericName.toLowerCase().includes(query)) ||
        m.dosage.toLowerCase().includes(query) ||
        (m.prescribedBy && m.prescribedBy.toLowerCase().includes(query))
      );
    }

    if (filtered.length === 0) {
      listContainer.innerHTML = `
        <div class="empty-cabinet-msg">
          <p>No medications found ${query ? `matching "<strong>${query}</strong>"` : `in the "${currentTab}" tab`}.</p>
          ${query ? `<button type="button" class="btn btn-secondary btn-sm" id="btn-clear-search" style="margin-top: 0.75rem;">Clear Search</button>` : ''}
        </div>
      `;
      listContainer.querySelector('#btn-clear-search')?.addEventListener('click', () => {
        searchInput.value = '';
        currentSearch = '';
        renderItems();
      });
      return;
    }

    listContainer.innerHTML = `
      <div class="cabinet-table-wrap">
        <table class="cabinet-table desktop-only" aria-label="Medication Cabinet List">
          <thead>
            <tr>
              <th scope="col" style="width: 56px;">Pill</th>
              <th scope="col">Medication &amp; Strength</th>
              <th scope="col">Dose &amp; Schedule</th>
              <th scope="col">Instructions</th>
              <th scope="col">Status</th>
              <th scope="col" style="text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map(med => {
              const statusClass = `badge-status-${med.status || (med.isActive ? 'active' : 'paused')}`;
              const isPaused = med.status === 'paused' || !med.isActive;
              const isCompleted = med.status === 'completed';

              return `
                <tr class="${isPaused ? 'is-paused' : ''} ${isCompleted ? 'is-completed' : ''}">
                  <td>
                    <div class="cabinet-pill-cell" aria-hidden="true">
                      ${createPillBadgeHTML(med.pillVisual)}
                    </div>
                  </td>
                  <td>
                    <div class="med-name-primary">
                      <strong>${med.name}</strong> 
                      <span class="med-strength-badge">${med.dosage}</span>
                      ${med.isPrescriptionImport ? `
                        <span class="badge" style="background: #f0fdfa; border: 1px solid #99f6e4; color: #0f766e; font-size: 0.6875rem;" title="Imported from prescription document and verified by user">
                          Rx Import
                        </span>
                      ` : ''}
                      ${med.isPRN ? `
                        <span class="badge badge-status-prn" style="font-size: 0.6875rem;">PRN</span>
                      ` : ''}
                    </div>
                    ${med.genericName ? `<div class="med-generic-label">${med.genericName} (${med.form})</div>` : `<div class="med-generic-label">${med.form}</div>`}
                  </td>
                  <td>
                    <div style="font-size: 0.875rem; font-weight: 600; color: var(--text-main);">
                      ${med.doseQuantity || '1 dose'} • ${med.frequency || 'Daily'}
                    </div>
                    <div class="timing-badge-group" style="margin-top: 0.25rem;">
                      ${med.remindersEnabled !== false 
                        ? (med.timeSlots.length > 0 
                            ? med.timeSlots.map(s => `<span class="badge">${s}</span>`).join(' ')
                            : '<span class="badge">No slots</span>')
                        : '<span class="badge" style="color: var(--text-muted);">No Reminders</span>'}
                    </div>
                  </td>
                  <td>
                    <div class="instructions-cell">
                      ${med.withFood ? '<span class="badge badge-caution">Take With Food</span>' : ''}
                      <span class="instructions-text">${med.instructions}</span>
                    </div>
                  </td>
                  <td>
                    <span class="badge ${statusClass}" style="text-transform: capitalize; font-weight: 700;">
                      ${med.status || (med.isActive ? 'Active' : 'Paused')}
                    </span>
                  </td>
                  <td style="text-align: right;">
                    <div class="action-btn-group">
                      ${med.status === 'active' ? `
                        <button type="button" class="btn btn-secondary btn-sm btn-pause-med" data-id="${med.id}" title="Pause reminders and daily scheduling">
                          Pause
                        </button>
                        <button type="button" class="btn btn-secondary btn-sm btn-complete-med" data-id="${med.id}" title="Mark treatment course completed">
                          Complete
                        </button>
                      ` : med.status === 'paused' ? `
                        <button type="button" class="btn btn-primary btn-sm btn-resume-med" data-id="${med.id}" title="Resume daily reminders">
                          Resume
                        </button>
                        <button type="button" class="btn btn-secondary btn-sm btn-complete-med" data-id="${med.id}" title="Mark treatment course completed">
                          Complete
                        </button>
                      ` : `
                        <button type="button" class="btn btn-secondary btn-sm btn-resume-med" data-id="${med.id}" title="Reactivate this medication">
                          Reactivate
                        </button>
                      `}
                      <button type="button" class="btn btn-secondary btn-sm btn-edit-med" data-id="${med.id}" aria-label="Edit ${med.name}">
                        Edit
                      </button>
                      <button type="button" class="btn btn-secondary btn-sm btn-delete-med" data-id="${med.id}" aria-label="Delete ${med.name}" style="color: var(--status-critical-text);">
                        ✕
                      </button>
                    </div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>

        <!-- Mobile & Tablet Responsive Cards Layout (screens <= 768px) -->
        <div class="cabinet-cards-mobile mobile-only" aria-label="Medication cards for mobile">
          ${filtered.map(med => {
            const statusClass = `badge-status-${med.status || (med.isActive ? 'active' : 'paused')}`;
            const isPaused = med.status === 'paused' || !med.isActive;

            return `
              <article class="cabinet-card-item ${isPaused ? 'is-paused' : ''}" data-id="${med.id}">
                <div class="cabinet-card-top">
                  <div class="cabinet-pill-cell" aria-hidden="true">
                    ${createPillBadgeHTML(med.pillVisual, 'large')}
                  </div>
                  <div class="cabinet-card-title-wrap">
                    <div class="med-name-primary">
                      <strong>${med.name}</strong>
                      <span class="med-strength-badge">${med.dosage}</span>
                      ${med.isPRN ? `<span class="badge badge-status-prn" style="font-size: 0.6875rem;">PRN</span>` : ''}
                    </div>
                    <div class="med-generic-label">
                      ${med.doseQuantity || '1 dose'} • ${med.form} (${med.frequency || 'Daily'})
                    </div>
                  </div>
                  <span class="badge ${statusClass}" style="text-transform: capitalize; font-size: 0.75rem;">
                    ${med.status}
                  </span>
                </div>

                <div class="cabinet-card-body">
                  <div class="timing-badge-group">
                    ${med.remindersEnabled !== false 
                      ? med.timeSlots.map(s => `<span class="badge">${s}</span>`).join(' ')
                      : '<span class="badge" style="color: var(--text-muted);">Reminders Disabled</span>'}
                    ${med.withFood ? '<span class="badge badge-caution">With Food</span>' : ''}
                  </div>
                  <p class="instructions-text" style="margin-top: 0.35rem;">${med.instructions}</p>
                </div>

                <div class="cabinet-card-actions">
                  ${med.status === 'active' ? `
                    <button type="button" class="btn btn-secondary btn-sm btn-pause-med" data-id="${med.id}">
                      Pause
                    </button>
                  ` : `
                    <button type="button" class="btn btn-primary btn-sm btn-resume-med" data-id="${med.id}">
                      Resume
                    </button>
                  `}
                  <button type="button" class="btn btn-secondary btn-sm btn-edit-med" data-id="${med.id}">
                    Edit
                  </button>
                  <button type="button" class="btn btn-secondary btn-sm btn-delete-med" data-id="${med.id}" style="color: var(--status-critical-text);">
                    Delete
                  </button>
                </div>
              </article>
            `;
          }).join('')}
        </div>
      </div>
    `;

    // Attach row events
    listContainer.querySelectorAll('.btn-pause-med').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).dataset.id!;
        medStore.pauseMedication(id);
        renderMedicationCabinet(container);
      });
    });

    listContainer.querySelectorAll('.btn-resume-med').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).dataset.id!;
        medStore.resumeMedication(id);
        renderMedicationCabinet(container);
      });
    });

    listContainer.querySelectorAll('.btn-complete-med').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).dataset.id!;
        const med = allMeds.find(m => m.id === id);
        if (med && confirm(`Mark treatment course for "${med.name} ${med.dosage}" as completed? Daily reminders will be halted, and historical dose records will be preserved.`)) {
          medStore.completeMedication(id);
          renderMedicationCabinet(container);
        }
      });
    });

    listContainer.querySelectorAll('.btn-edit-med').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).dataset.id!;
        const med = allMeds.find(m => m.id === id);
        if (med) {
          openMedicationModal(med, () => renderMedicationCabinet(container));
        }
      });
    });

    listContainer.querySelectorAll('.btn-delete-med').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).dataset.id!;
        const med = allMeds.find(m => m.id === id);
        if (med && confirm(`Remove "${med.name} ${med.dosage}" from your cabinet? This will delete its schedule and emergency sheet entry. Existing adherence history will remain preserved.`)) {
          medStore.deleteMedication(id);
          renderMedicationCabinet(container);
        }
      });
    });
  };

  renderItems();

  searchInput.addEventListener('input', () => {
    currentSearch = searchInput.value;
    renderItems();
  });

  // Header Actions
  container.querySelector('#btn-add-med')?.addEventListener('click', () => {
    openMedicationModal(undefined, () => renderMedicationCabinet(container));
  });

  container.querySelector('#btn-scan-rx')?.addEventListener('click', () => {
    openPrescriptionUploadModal(() => renderMedicationCabinet(container));
  });
}

/**
 * Validated Local Backup & Restore Hub
 * Supports Export with plaintext disclosure and Import with preview, validation,
 * duplicate detection, and Replace vs Merge restoration.
 */
function openBackupRestoreModal(onRestored: () => void): void {
  document.querySelector('.modal-overlay')?.remove();

  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'modal-overlay';
  modalOverlay.setAttribute('role', 'dialog');
  modalOverlay.setAttribute('aria-modal', 'true');
  modalOverlay.setAttribute('aria-labelledby', 'backup-modal-title');

  let selectedFileContent: string | null = null;
  let validationResult: BackupValidationResult | null = null;

  const renderContent = () => {
    modalOverlay.innerHTML = `
      <div class="modal-dialog" style="max-width: 580px;">
        <div class="modal-header">
          <h3 id="backup-modal-title" style="font-size: 1.25rem; font-weight: 700;">
            Local Backup &amp; Restore Hub
          </h3>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-close-backup-modal" aria-label="Close dialog">✕</button>
        </div>

        <div class="modal-body" style="display: flex; flex-direction: column; gap: 1.25rem;">
          <!-- Plaintext Security Disclosure Alert -->
          <div style="background: #fffbeb; border: 1.5px solid #fde68a; border-radius: var(--radius-md); padding: 0.875rem 1rem; font-size: 0.8125rem; color: #92400e;">
            <strong>⚠️ Privacy &amp; Data Notice:</strong>
            CareDose backups are exported as standard local JSON files. Exported files contain sensitive health information in plaintext and are not encrypted or password-protected. Store them securely.
          </div>

          <!-- Section 1: Export Backup -->
          <div class="card" style="padding: 1rem; border: 1px solid var(--border-main);">
            <h4 style="font-size: 1rem; font-weight: 700; margin: 0 0 0.25rem 0;">1. Export Local Backup</h4>
            <p style="font-size: 0.8125rem; color: var(--text-muted); margin: 0 0 0.75rem 0;">
              Save your medication cabinet, dosages, daily logs, and emergency profile to your local device.
            </p>
            <button type="button" class="btn btn-primary btn-sm" id="btn-download-backup">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              <span>Download Backup File (.json)</span>
            </button>
          </div>

          <!-- Section 2: Import & Restore Backup -->
          <div class="card" style="padding: 1rem; border: 1px solid var(--border-main);">
            <h4 style="font-size: 1rem; font-weight: 700; margin: 0 0 0.25rem 0;">2. Import &amp; Restore Backup</h4>
            <p style="font-size: 0.8125rem; color: var(--text-muted); margin: 0 0 0.75rem 0;">
              Select a previously exported CareDose JSON backup file to validate and restore.
            </p>
            <input type="file" id="backup-file-input" accept=".json,application/json" class="form-input" style="padding: 0.5rem;" />

            <!-- Validation Preview Slot -->
            <div id="backup-preview-slot" style="margin-top: 0.875rem;">
              ${renderPreviewHTML()}
            </div>
          </div>
        </div>

        <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 0.5rem;">
          <button type="button" class="btn btn-secondary" id="btn-cancel-backup">Close</button>
        </div>
      </div>
    `;

    attachEvents();
  };

  function renderPreviewHTML(): string {
    if (!validationResult) return '';

    if (!validationResult.isValid) {
      return `
        <div class="badge badge-caution" style="display: block; padding: 0.75rem; border-radius: var(--radius-sm); font-size: 0.8125rem;">
          <strong>❌ Invalid Backup File:</strong> ${validationResult.error || 'The selected file is not a valid CareDose backup schema.'}
        </div>
      `;
    }

    const counts = validationResult.recordCounts!;
    const hasDuplicates = (validationResult.duplicateCount || 0) > 0;

    return `
      <div style="background: var(--bg-surface-alt); border: 1.5px solid var(--border-main); border-radius: var(--radius-md); padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span class="badge badge-safe">✓ Valid CareDose Schema (v${validationResult.schemaVersion})</span>
          <span style="font-size: 0.75rem; color: var(--text-muted);">${counts.medications} Medications Found</span>
        </div>

        <div style="font-size: 0.8125rem; line-height: 1.5; color: var(--text-main);">
          <div>• Medications to restore: <strong>${counts.medications}</strong></div>
          <div>• Adherence dose logs: <strong>${counts.dailyLogDoses}</strong></div>
          <div>• Patient emergency profile: <strong>${counts.patientProfile ? 'Included' : 'None'}</strong></div>
          ${hasDuplicates ? `
            <div style="color: #b45309; margin-top: 0.25rem;">
              • <strong>${validationResult.duplicateCount} Duplicate conflict(s) detected:</strong> ${validationResult.duplicateNames?.join(', ')}
            </div>
          ` : ''}
        </div>

        <!-- Restore Mode Selection -->
        <div style="border-top: 1px solid var(--border-light); padding-top: 0.75rem;">
          <label class="form-label" style="font-weight: 700; margin-bottom: 0.35rem;">Choose Restore Strategy:</label>
          <div style="display: flex; flex-direction: column; gap: 0.5rem;">
            <label class="slot-check-item" style="padding: 0.25rem 0;">
              <input type="radio" name="restore-mode" value="merge" checked />
              <span><strong>Merge records (Recommended):</strong> Imports new medications while safely preserving non-conflicting existing records and logs.</span>
            </label>
            <label class="slot-check-item" style="padding: 0.25rem 0;">
              <input type="radio" name="restore-mode" value="replace" />
              <span><strong>Replace all records:</strong> Completely overwrites all current medications and logs with the backup contents.</span>
            </label>
          </div>
        </div>

        <button type="button" class="btn btn-primary" id="btn-confirm-restore" style="width: 100%; justify-content: center; font-weight: 700; margin-top: 0.25rem;">
          Confirm &amp; Restore Backup
        </button>
      </div>
    `;
  }

  function attachEvents(): void {
    const closeModal = () => modalOverlay.remove();
    modalOverlay.querySelector('#btn-close-backup-modal')?.addEventListener('click', closeModal);
    modalOverlay.querySelector('#btn-cancel-backup')?.addEventListener('click', closeModal);

    // Download Backup
    modalOverlay.querySelector('#btn-download-backup')?.addEventListener('click', () => {
      const dataStr = medStore.exportData();
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `caredose-health-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });

    // File Input Selection
    const fileInput = modalOverlay.querySelector('#backup-file-input') as HTMLInputElement;
    fileInput?.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          selectedFileContent = e.target?.result as string;
          validationResult = medStore.validateBackup(selectedFileContent);
          renderContent();
        } catch (err: any) {
          validationResult = { isValid: false, error: 'Could not read file: ' + err.message };
          renderContent();
        }
      };
      reader.readAsText(file);
    });

    // Confirm Restore
    modalOverlay.querySelector('#btn-confirm-restore')?.addEventListener('click', () => {
      if (!selectedFileContent || !validationResult || !validationResult.isValid) return;

      const modeRadio = modalOverlay.querySelector('input[name="restore-mode"]:checked') as HTMLInputElement;
      const mode = (modeRadio?.value || 'merge') as 'replace' | 'merge';

      const confirmMsg = mode === 'replace'
        ? 'Are you sure you want to REPLACE all current medications, daily logs, and profiles with the backup contents?'
        : 'Are you sure you want to MERGE this backup into your current CareDose data?';

      if (confirm(confirmMsg)) {
        const success = medStore.restoreBackup(selectedFileContent, mode);
        if (success) {
          alert('Backup restored successfully!');
          closeModal();
          onRestored();
        } else {
          alert('Failed to restore backup. State remains uncorrupted.');
        }
      }
    });
  }

  document.body.appendChild(modalOverlay);
  renderContent();
}
