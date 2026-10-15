import { medStore } from '../store/medStore';
import { createPillBadgeHTML } from './PillBadge';
import { openMedicationModal } from './MedicationModal';
import { renderSafetyWatchdogBanner } from './SafetyWatchdogBanner';
import { openPrescriptionUploadModal } from './PrescriptionUploadModal';

export function renderMedicationCabinet(container: HTMLElement): void {
  const allMeds = medStore.getMedications();
  const activeCount = allMeds.filter(m => m.isActive).length;

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
            <span class="badge badge-safe" aria-label="${activeCount} active medications out of ${allMeds.length} total">
              ${activeCount} Active / ${allMeds.length} Total
            </span>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-export-data" title="Export all patient & medication data as JSON backup">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              <span>Export Backup</span>
            </button>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-clear-data" style="color: var(--status-critical-text);" title="Permanently clear local data">
              <span>Reset Data</span>
            </button>
          </div>
        </div>

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
            <button type="button" class="btn btn-secondary" id="btn-scan-rx" title="Scan or photograph prescription document">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                <circle cx="12" cy="13" r="4"></circle>
              </svg>
              <span>Scan Prescription</span>
            </button>
            <button type="button" class="btn btn-primary" id="btn-add-med">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              <span>Add Medication</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Medications Table & Responsive Cards -->
      <div class="cabinet-list card" id="cabinet-items-container">
        <!-- Rendered dynamically -->
      </div>

      <!-- Isolated Safety Demonstration Box (Separated from normal patient workflows) -->
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
      form: 'Tablet',
      timeSlots: ['morning'],
      withFood: true,
      instructions: 'Take in the morning with a full glass of water and meal.',
      pillVisual: { shape: 'round', color: 'yellow' },
      prescribedBy: 'Over-the-counter',
      isActive: true,
      createdAt: new Date().toISOString()
    }, () => renderMedicationCabinet(container));
  });

  // Export Data Handler
  container.querySelector('#btn-export-data')?.addEventListener('click', () => {
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

  // Clear Local Data Handler
  container.querySelector('#btn-clear-data')?.addEventListener('click', () => {
    if (confirm('Permanently erase all locally stored patient profile data and medication schedules? This action cannot be reversed.')) {
      if (confirm('Please confirm once more: Reset all local data to factory defaults?')) {
        medStore.resetAllData();
        renderMedicationCabinet(container);
      }
    }
  });

  // Render Items based on search
  const listContainer = container.querySelector('#cabinet-items-container') as HTMLElement;
  const searchInput = container.querySelector('#cabinet-search') as HTMLInputElement;

  const renderItems = (filter = '') => {
    const query = filter.toLowerCase().trim();
    const filtered = allMeds.filter(m => 
      m.name.toLowerCase().includes(query) || 
      (m.genericName && m.genericName.toLowerCase().includes(query)) ||
      m.dosage.toLowerCase().includes(query)
    );

    if (filtered.length === 0) {
      listContainer.innerHTML = `
        <div class="empty-cabinet-msg">
          <p>No medications found matching "<strong>${filter}</strong>".</p>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-clear-search" style="margin-top: 0.75rem;">Clear Search</button>
        </div>
      `;
      listContainer.querySelector('#btn-clear-search')?.addEventListener('click', () => {
        searchInput.value = '';
        renderItems('');
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
              <th scope="col">Scheduled Times</th>
              <th scope="col">Instructions</th>
              <th scope="col">Status</th>
              <th scope="col" style="text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map(med => `
              <tr class="${med.isActive ? '' : 'is-paused'}">
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
                        User-Confirmed Rx
                      </span>
                    ` : ''}
                  </div>
                  ${med.genericName ? `<div class="med-generic-label">${med.genericName} (${med.form})</div>` : ''}
                </td>
                <td>
                  <div class="timing-badge-group">
                    ${med.timeSlots.map(s => `<span class="badge">${s}</span>`).join(' ')}
                  </div>
                </td>
                <td>
                  <div class="instructions-cell">
                    ${med.withFood ? '<span class="badge badge-caution">Take With Food</span>' : ''}
                    <span class="instructions-text">${med.instructions}</span>
                  </div>
                </td>
                <td>
                  <button type="button" class="btn btn-sm ${med.isActive ? 'btn-secondary' : 'btn-danger'} btn-toggle-active" data-id="${med.id}" aria-label="Toggle active status for ${med.name}">
                    ${med.isActive ? 'Active' : 'Paused'}
                  </button>
                </td>
                <td style="text-align: right;">
                  <div class="action-btn-group">
                    <button type="button" class="btn btn-secondary btn-sm btn-edit-med" data-id="${med.id}" aria-label="Edit ${med.name}">
                      Edit
                    </button>
                    <button type="button" class="btn btn-secondary btn-sm btn-delete-med" data-id="${med.id}" aria-label="Delete ${med.name}" style="color: var(--status-critical-text);">
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <!-- Mobile & Tablet Responsive Cards Layout (screens <= 768px) -->
        <div class="cabinet-cards-mobile mobile-only" aria-label="Medication cards for mobile">
          ${filtered.map(med => `
            <article class="cabinet-card-item ${med.isActive ? '' : 'is-paused'}" data-id="${med.id}">
              <div class="cabinet-card-top">
                <div class="cabinet-pill-cell" aria-hidden="true">
                  ${createPillBadgeHTML(med.pillVisual, 'large')}
                </div>
                <div class="cabinet-card-title-wrap">
                  <div class="med-name-primary">
                    <strong>${med.name}</strong>
                    <span class="med-strength-badge">${med.dosage}</span>
                    ${med.isPrescriptionImport ? `
                      <span class="badge" style="background: #f0fdfa; border: 1px solid #99f6e4; color: #0f766e; font-size: 0.6875rem;">
                        User-Confirmed Rx
                      </span>
                    ` : ''}
                  </div>
                  ${med.genericName ? `<div class="med-generic-label">${med.genericName} • ${med.form}</div>` : ''}
                </div>
                <button type="button" class="btn btn-sm ${med.isActive ? 'btn-secondary' : 'btn-danger'} btn-toggle-active" data-id="${med.id}">
                  ${med.isActive ? 'Active' : 'Paused'}
                </button>
              </div>

              <div class="cabinet-card-body">
                <div class="timing-badge-group">
                  ${med.timeSlots.map(s => `<span class="badge">${s}</span>`).join(' ')}
                  ${med.withFood ? '<span class="badge badge-caution">With Food</span>' : ''}
                </div>
                <p class="instructions-text" style="margin-top: 0.35rem;">${med.instructions}</p>
              </div>

              <div class="cabinet-card-actions">
                <button type="button" class="btn btn-secondary btn-sm btn-edit-med" data-id="${med.id}">
                  Edit Details
                </button>
                <button type="button" class="btn btn-secondary btn-sm btn-delete-med" data-id="${med.id}" style="color: var(--status-critical-text);">
                  Delete
                </button>
              </div>
            </article>
          `).join('')}
        </div>
      </div>
    `;

    // Attach row events
    listContainer.querySelectorAll('.btn-toggle-active').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).dataset.id!;
        medStore.toggleMedicationActive(id);
        renderMedicationCabinet(container);
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
        if (med && confirm(`Remove "${med.name} ${med.dosage}" from your medication schedule? This action will delete its schedule and emergency sheet entry.`)) {
          medStore.deleteMedication(id);
          renderMedicationCabinet(container);
        }
      });
    });
  };

  renderItems();

  searchInput.addEventListener('input', () => {
    renderItems(searchInput.value);
  });

  container.querySelector('#btn-scan-rx')?.addEventListener('click', () => {
    openPrescriptionUploadModal(() => renderMedicationCabinet(container));
  });

  container.querySelector('#btn-add-med')?.addEventListener('click', () => {
    openMedicationModal(undefined, () => renderMedicationCabinet(container));
  });
}
