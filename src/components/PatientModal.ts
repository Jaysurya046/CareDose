import { medStore } from '../store/medStore';

/**
 * Accessible modal dialog for editing patient demographics and emergency contact information.
 */
export function openPatientModal(onSaved: () => void): void {
  document.querySelector('.modal-overlay')?.remove();
  const profile = medStore.getPatientProfile();

  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'modal-overlay';
  modalOverlay.setAttribute('role', 'dialog');
  modalOverlay.setAttribute('aria-modal', 'true');
  modalOverlay.setAttribute('aria-labelledby', 'patient-modal-title');

  modalOverlay.innerHTML = `
    <div class="modal-dialog">
      <div class="modal-header">
        <h3 id="patient-modal-title" style="font-size: 1.25rem; font-weight: 700;">Edit Patient & Emergency Profile</h3>
        <button type="button" class="btn btn-secondary btn-sm" id="btn-close-patient-modal" aria-label="Close dialog">✕</button>
      </div>

      <form id="patient-form" class="modal-body">
        <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 1rem;">
          <div class="form-group">
            <label class="form-label" for="pat-name">Patient Full Name *</label>
            <input type="text" id="pat-name" class="form-input" value="${profile.name}" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="pat-blood">Blood Type</label>
            <input type="text" id="pat-blood" class="form-input" value="${profile.bloodType}" placeholder="e.g. A+" />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="pat-dob">Date of Birth</label>
          <input type="date" id="pat-dob" class="form-input" value="${profile.dob}" />
        </div>

        <div class="form-group">
          <label class="form-label" for="pat-allergies">Known Drug Allergies (Comma separated) *</label>
          <input type="text" id="pat-allergies" class="form-input" value="${profile.allergies.join(', ')}" placeholder="e.g. Penicillin, Sulfa, Aspirin" />
          <span class="form-hint">Crucial for emergency personnel. Enter "None" if no known drug allergies.</span>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
          <div class="form-group">
            <label class="form-label" for="pat-em-name">Emergency Contact Name</label>
            <input type="text" id="pat-em-name" class="form-input" value="${profile.emergencyContactName}" />
          </div>
          <div class="form-group">
            <label class="form-label" for="pat-em-rel">Relationship</label>
            <input type="text" id="pat-em-rel" class="form-input" value="${profile.emergencyContactRelation}" placeholder="e.g. Daughter, Spouse" />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="pat-em-phone">Emergency Contact Phone *</label>
          <input type="tel" id="pat-em-phone" class="form-input" value="${profile.emergencyContactPhone}" required />
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
          <div class="form-group">
            <label class="form-label" for="pat-doc-name">Primary Doctor Name</label>
            <input type="text" id="pat-doc-name" class="form-input" value="${profile.primaryDoctorName}" />
          </div>
          <div class="form-group">
            <label class="form-label" for="pat-doc-phone">Doctor Office Phone</label>
            <input type="tel" id="pat-doc-phone" class="form-input" value="${profile.primaryDoctorPhone}" />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="pat-hospital">Preferred Hospital</label>
          <input type="text" id="pat-hospital" class="form-input" value="${profile.preferredHospital}" />
        </div>

        <div class="form-group">
          <label class="form-label" for="pat-notes">Special Medical Notes / Devices</label>
          <textarea id="pat-notes" class="form-textarea" placeholder="e.g. Pacemaker, diabetic, uses walker, hard of hearing">${profile.notes}</textarea>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" id="btn-cancel-pat">Cancel</button>
          <button type="submit" class="btn btn-primary">Save Information</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(modalOverlay);

  const close = () => modalOverlay.remove();
  modalOverlay.querySelector('#btn-close-patient-modal')?.addEventListener('click', close);
  modalOverlay.querySelector('#btn-cancel-pat')?.addEventListener('click', close);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) close();
  });

  const form = modalOverlay.querySelector('#patient-form') as HTMLFormElement;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const allergiesStr = (modalOverlay.querySelector('#pat-allergies') as HTMLInputElement).value;
    const allergies = allergiesStr
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    medStore.updateProfile({
      name: (modalOverlay.querySelector('#pat-name') as HTMLInputElement).value.trim(),
      bloodType: (modalOverlay.querySelector('#pat-blood') as HTMLInputElement).value.trim(),
      dob: (modalOverlay.querySelector('#pat-dob') as HTMLInputElement).value,
      allergies,
      emergencyContactName: (modalOverlay.querySelector('#pat-em-name') as HTMLInputElement).value.trim(),
      emergencyContactRelation: (modalOverlay.querySelector('#pat-em-rel') as HTMLInputElement).value.trim(),
      emergencyContactPhone: (modalOverlay.querySelector('#pat-em-phone') as HTMLInputElement).value.trim(),
      primaryDoctorName: (modalOverlay.querySelector('#pat-doc-name') as HTMLInputElement).value.trim(),
      primaryDoctorPhone: (modalOverlay.querySelector('#pat-doc-phone') as HTMLInputElement).value.trim(),
      preferredHospital: (modalOverlay.querySelector('#pat-hospital') as HTMLInputElement).value.trim(),
      notes: (modalOverlay.querySelector('#pat-notes') as HTMLTextAreaElement).value.trim()
    });

    close();
    onSaved();
  });
}
