import { medStore } from '../store/medStore';
import { createPillBadgeHTML } from './PillBadge';
import { openMedicationModal } from './MedicationModal';
import { renderSafetyWatchdogBanner } from './SafetyWatchdogBanner';

export function renderMedicationCabinet(container: HTMLElement): void {
  const allMeds = medStore.getMedications();

  container.innerHTML = `
    <div class="cabinet-wrap">
      <!-- Safety Watchdog at top of cabinet -->
      <div id="cabinet-watchdog-mount"></div>

      <!-- Cabinet Header Bar -->
      <div class="cabinet-header-bar card">
        <div class="cabinet-title-group">
          <div>
            <h2 class="cabinet-title">Medication Cabinet</h2>
            <p class="cabinet-subtitle">Manage prescriptions, over-the-counter supplements, and schedules.</p>
          </div>
          <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
            <span class="badge badge-safe">${allMeds.filter(m => m.isActive).length} Active / ${allMeds.length} Total</span>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-export-data" title="Export all patient & medication data as JSON file">
              Export Data
            </button>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-clear-data" style="color: var(--status-critical-text);" title="Permanently clear local data">
              Clear All Data
            </button>
          </div>
        </div>

        <div class="cabinet-controls-row">
          <div class="search-input-wrap">
            <input type="text" id="cabinet-search" class="form-input" placeholder="Search medication or generic..." />
          </div>
          <button type="button" class="btn btn-primary" id="btn-add-med">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            <span>Add Medication</span>
          </button>
        </div>
      </div>

      <!-- Medications Table / List -->
      <div class="cabinet-list card" id="cabinet-items-container">
        <!-- Rendered dynamically -->
      </div>
    </div>
  `;

  // Render Watchdog Banner
  const watchdogMount = container.querySelector('#cabinet-watchdog-mount') as HTMLElement;
  if (watchdogMount) {
    renderSafetyWatchdogBanner(watchdogMount, () => {
      openMedicationModal(undefined, () => renderMedicationCabinet(container));
    });
  }

  // Export Data Handler
  container.querySelector('#btn-export-data')?.addEventListener('click', () => {
    const dataStr = medStore.exportData();
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `caredose-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  // Clear Local Data Handler
  container.querySelector('#btn-clear-data')?.addEventListener('click', () => {
    if (confirm('Are you sure you want to permanently erase all locally stored patient data and medications? This action cannot be undone.')) {
      if (confirm('Please confirm once more: All local data will be reset.')) {
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
        </div>
      `;
      return;
    }

    listContainer.innerHTML = `
      <div class="cabinet-table-wrap">
        <table class="cabinet-table" aria-label="Medication Cabinet List">
          <thead>
            <tr>
              <th scope="col" style="width: 50px;">Visual</th>
              <th scope="col">Medication & Strength</th>
              <th scope="col">Daily Timing</th>
              <th scope="col">Food / Instructions</th>
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
                    ${med.withFood ? '<span class="badge badge-caution">With Food</span>' : ''}
                    <span class="instructions-text">${med.instructions}</span>
                  </div>
                </td>
                <td>
                  <button type="button" class="btn btn-sm ${med.isActive ? 'btn-secondary' : 'btn-danger'} btn-toggle-active" data-id="${med.id}">
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
        if (med && confirm(`Delete "${med.name} ${med.dosage}" from the medication record?`)) {
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

  container.querySelector('#btn-add-med')?.addEventListener('click', () => {
    openMedicationModal(undefined, () => renderMedicationCabinet(container));
  });
}
