import { medStore } from '../store/medStore';
import type { Medication, TimeSlot, PillVisual } from '../types';
import { searchDrugNames, type DrugSuggestion } from '../services/rxnorm';
import { renderPillVisualSelector } from './PillVisualSelector';

/**
 * Accessible modal dialog for adding or editing a prescription or OTC medication.
 */
export function openMedicationModal(existingMed?: Medication, onSaved?: () => void): void {
  document.querySelector('.modal-overlay')?.remove();

  const isEdit = !!existingMed;
  let visualState: PillVisual = {
    shape: existingMed?.pillVisual?.shape || 'round',
    color: existingMed?.pillVisual?.color || 'white'
  };
  const currentSlots: Set<TimeSlot> = new Set(existingMed?.timeSlots || ['morning']);

  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'modal-overlay';
  modalOverlay.setAttribute('role', 'dialog');
  modalOverlay.setAttribute('aria-modal', 'true');
  modalOverlay.setAttribute('aria-labelledby', 'modal-title');

  modalOverlay.innerHTML = `
    <div class="modal-dialog">
      <div class="modal-header">
        <h3 id="modal-title" style="font-size: 1.25rem; font-weight: 700;">
          ${isEdit ? 'Edit Medication' : 'Add New Medication'}
        </h3>
        <button type="button" class="btn btn-secondary btn-sm" id="btn-close-modal" aria-label="Close dialog">✕</button>
      </div>

      <form id="med-form" class="modal-body">
        <!-- Drug Name with Autocomplete -->
        <div class="form-group" style="position: relative;">
          <label for="drug-name-input" class="form-label">Brand or Generic Name *</label>
          <input 
            type="text" 
            id="drug-name-input" 
            class="form-input" 
            placeholder="e.g. Lisinopril, Warfarin, Metformin" 
            value="${existingMed?.name || ''}" 
            required 
            autocomplete="off"
          />
          <div id="autocomplete-dropdown" class="autocomplete-dropdown" style="display: none;"></div>
          <span class="form-hint">Type to search the offline drug catalog or remote RxNorm API.</span>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
          <div class="form-group">
            <label for="drug-generic-input" class="form-label">Generic Name (Optional)</label>
            <input type="text" id="drug-generic-input" class="form-input" placeholder="e.g. Lisinopril HCL" value="${existingMed?.genericName || ''}" />
          </div>

          <div class="form-group">
            <label for="drug-dosage-input" class="form-label">Dosage / Strength *</label>
            <input type="text" id="drug-dosage-input" class="form-input" placeholder="e.g. 20 mg, 500 mcg" value="${existingMed?.dosage || ''}" required />
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
          <div class="form-group">
            <label for="drug-form-select" class="form-label">Medication Form</label>
            <select id="drug-form-select" class="form-select">
              <option value="Tablet" ${existingMed?.form === 'Tablet' ? 'selected' : ''}>Tablet</option>
              <option value="Capsule" ${existingMed?.form === 'Capsule' ? 'selected' : ''}>Capsule</option>
              <option value="Liquid" ${existingMed?.form === 'Liquid' ? 'selected' : ''}>Liquid Solution</option>
              <option value="Inhaler" ${existingMed?.form === 'Inhaler' ? 'selected' : ''}>Inhaler</option>
              <option value="Patch" ${existingMed?.form === 'Patch' ? 'selected' : ''}>Transdermal Patch</option>
              <option value="Injection" ${existingMed?.form === 'Injection' ? 'selected' : ''}>Injection</option>
            </select>
          </div>

          <div class="form-group">
            <label for="drug-doctor-input" class="form-label">Prescribed By</label>
            <input type="text" id="drug-doctor-input" class="form-input" placeholder="e.g. Dr. Marcus Chen" value="${existingMed?.prescribedBy || ''}" />
          </div>
        </div>

        <!-- Schedule Slots Selection -->
        <div class="form-group">
          <label class="form-label">Daily Dose Schedule *</label>
          <div class="slot-checkbox-grid">
            <label class="slot-check-item">
              <input type="checkbox" name="timeSlot" value="morning" ${currentSlots.has('morning') ? 'checked' : ''} />
              <span>Morning (~8 AM)</span>
            </label>
            <label class="slot-check-item">
              <input type="checkbox" name="timeSlot" value="midday" ${currentSlots.has('midday') ? 'checked' : ''} />
              <span>Midday (~1 PM)</span>
            </label>
            <label class="slot-check-item">
              <input type="checkbox" name="timeSlot" value="evening" ${currentSlots.has('evening') ? 'checked' : ''} />
              <span>Evening (~6:30 PM)</span>
            </label>
            <label class="slot-check-item">
              <input type="checkbox" name="timeSlot" value="bedtime" ${currentSlots.has('bedtime') ? 'checked' : ''} />
              <span>Bedtime (~10 PM)</span>
            </label>
          </div>
        </div>

        <!-- Food & Instructions -->
        <div class="form-group">
          <label class="slot-check-item" style="padding: 0.5rem 0;">
            <input type="checkbox" id="with-food-check" ${existingMed?.withFood ? 'checked' : ''} />
            <span><strong>Take with food</strong> (requires meal or snack)</span>
          </label>
        </div>

        <div class="form-group">
          <label for="drug-instructions-input" class="form-label">Patient Instructions &amp; Notes</label>
          <textarea id="drug-instructions-input" class="form-textarea" placeholder="e.g. Take with a full glass of water. Do not crush.">${existingMed?.instructions || ''}</textarea>
        </div>

        <!-- Pill Appearance Selector Slot -->
        <div class="form-group pill-visualizer-box" id="pill-visualizer-slot"></div>

        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" id="btn-cancel-modal">Cancel</button>
          <button type="submit" class="btn btn-primary" id="btn-save-med">
            ${isEdit ? 'Save Changes' : 'Add Medication'}
          </button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(modalOverlay);

  // Bind Pill Visual Selector
  const visualSlot = modalOverlay.querySelector('#pill-visualizer-slot') as HTMLElement;
  const getVisual = renderPillVisualSelector(visualSlot, visualState, (v) => {
    visualState = v;
  });

  // Close handlers
  const closeModal = () => modalOverlay.remove();
  modalOverlay.querySelector('#btn-close-modal')?.addEventListener('click', closeModal);
  modalOverlay.querySelector('#btn-cancel-modal')?.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  // Autocomplete Engine
  const nameInput = modalOverlay.querySelector('#drug-name-input') as HTMLInputElement;
  const genericInput = modalOverlay.querySelector('#drug-generic-input') as HTMLInputElement;
  const dropdown = modalOverlay.querySelector('#autocomplete-dropdown') as HTMLElement;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  nameInput.addEventListener('input', () => {
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

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target as Node) && e.target !== nameInput) {
      dropdown.style.display = 'none';
    }
  });

  // Form Submission
  const form = modalOverlay.querySelector('#med-form') as HTMLFormElement;
  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const selectedSlots: TimeSlot[] = [];
    form.querySelectorAll<HTMLInputElement>('input[name="timeSlot"]:checked').forEach(cb => {
      selectedSlots.push(cb.value as TimeSlot);
    });

    if (selectedSlots.length === 0) {
      alert('Please select at least one daily time slot (Morning, Midday, Evening, or Bedtime).');
      return;
    }

    const medData = {
      name: nameInput.value.trim(),
      genericName: genericInput.value.trim() || undefined,
      dosage: (modalOverlay.querySelector('#drug-dosage-input') as HTMLInputElement).value.trim(),
      form: (modalOverlay.querySelector('#drug-form-select') as HTMLSelectElement).value,
      timeSlots: selectedSlots,
      withFood: (modalOverlay.querySelector('#with-food-check') as HTMLInputElement).checked,
      instructions: (modalOverlay.querySelector('#drug-instructions-input') as HTMLTextAreaElement).value.trim() || 'Take as prescribed.',
      pillVisual: getVisual(),
      prescribedBy: (modalOverlay.querySelector('#drug-doctor-input') as HTMLInputElement).value.trim() || undefined,
      isActive: true
    };

    if (isEdit && existingMed) {
      medStore.updateMedication(existingMed.id, medData);
    } else {
      medStore.addMedication(medData);
    }

    closeModal();
    if (onSaved) onSaved();
  });
}
