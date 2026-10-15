/**
 * CareDose — Accessible Prescription Review & Verification Workspace.
 * 
 * Complies with Section 7 of Specifications:
 * - Two-column design on Desktop (Left: Document Viewport, Right: Extracted Fields).
 * - Stacked/tabbed switcher on Mobile with zero data loss.
 * - Field-level uncertainty indicators (never color alone).
 * - Interactive source region highlight.
 * - Strict blocking validation: unreadable or unconfirmed fields cannot activate schedules.
 */

import type {
  PrescriptionScanSession,
  PrescriptionMedicationDraft,
  TimeSlot,
  FieldStatus
} from '../types';
import { generateLocalId } from '../utils/sanitize';
import { findCatalogSuggestions, validateDraftForImport } from '../engine/prescriptionParser';
import { openPrescriptionImportSummary } from './PrescriptionImportSummary';

export function openPrescriptionReviewModal(
  session: PrescriptionScanSession,
  onComplete?: () => void
): void {
  // Remove existing modal if any
  const existing = document.getElementById('rx-review-modal');
  if (existing) existing.remove();

  const modalBackdrop = document.createElement('div');
  modalBackdrop.id = 'rx-review-modal';
  modalBackdrop.className = 'rx-modal-backdrop';
  modalBackdrop.setAttribute('role', 'dialog');
  modalBackdrop.setAttribute('aria-modal', 'true');
  modalBackdrop.setAttribute('aria-labelledby', 'rx-review-title');

  let currentZoom = 1.0;
  let currentPage = 1;
  let activeMobileTab: 'doc' | 'meds' = 'meds';
  let selectedDraftId: string | null = session.drafts[0]?.id || null;

  modalBackdrop.innerHTML = `
    <div class="rx-modal-card" tabindex="-1">
      <!-- Modal Header -->
      <div class="rx-modal-header">
        <div class="rx-modal-title-group">
          <h2 id="rx-review-title">Review Extracted Medications</h2>
          <p>Compare extracted clinical fields against your prescription. Confirm or clarify any ambiguous handwriting.</p>
        </div>
        <button type="button" class="rx-modal-close-btn" id="btn-close-review" aria-label="Close prescription review">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <!-- Mobile Tab Switcher -->
      <nav class="rx-mobile-tabs" aria-label="Review workspace views">
        <button type="button" class="rx-mobile-tab-btn" id="tab-btn-doc">
          <span>Original Document</span>
        </button>
        <button type="button" class="rx-mobile-tab-btn is-active" id="tab-btn-meds">
          <span>Extracted Medications (<span id="mobile-med-count">${session.drafts.length}</span>)</span>
        </button>
      </nav>

      <!-- Main Workspace -->
      <div class="rx-review-workspace">
        <!-- Left: Document Viewport -->
        <section class="rx-doc-pane" id="rx-doc-pane" aria-label="Original Prescription Document Viewer">
          <div class="rx-doc-toolbar">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <button type="button" class="btn btn-secondary btn-sm" id="btn-zoom-out" title="Zoom out document" aria-label="Zoom out">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              </button>
              <span id="zoom-label" style="font-size: 0.75rem; font-family: monospace; min-width: 44px; text-align: center;">100%</span>
              <button type="button" class="btn btn-secondary btn-sm" id="btn-zoom-in" title="Zoom in document" aria-label="Zoom in">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              </button>
              <button type="button" class="btn btn-secondary btn-sm" id="btn-zoom-reset" title="Reset zoom to fit">Reset</button>
            </div>

            ${session.pageCount > 1 ? `
              <div style="display: flex; align-items: center; gap: 0.5rem;">
                <button type="button" class="btn btn-secondary btn-sm" id="btn-prev-page" ${currentPage <= 1 ? 'disabled' : ''}>Prev</button>
                <span style="font-size: 0.8125rem;">Page ${currentPage} / ${session.pageCount}</span>
                <button type="button" class="btn btn-secondary btn-sm" id="btn-next-page" ${currentPage >= session.pageCount ? 'disabled' : ''}>Next</button>
              </div>
            ` : ''}
          </div>

          <div class="rx-doc-viewport" id="doc-viewport">
            <div class="rx-canvas-stage" id="canvas-stage">
              <img id="prescription-doc-img" alt="Scanned prescription original document" />
              <div class="rx-highlight-overlay" id="highlight-box" style="display: none;"></div>
            </div>
          </div>
        </section>

        <!-- Right: Extracted Medications List & Editing -->
        <section class="rx-review-pane" id="rx-review-pane" aria-label="Extracted medication candidates">
          <div class="rx-notice-banner notice-caution" id="safety-disclaimer">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink: 0;" aria-hidden="true">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
            <div>
              <strong>Transcription Safety Guard:</strong>
              CareDose assists with prescription transcription. It never invents instructions or assumes doses. Any unreadable handwriting must be confirmed with your pharmacist or prescribing doctor.
            </div>
          </div>

          <div id="rx-candidates-mount" style="display: flex; flex-direction: column; gap: 1rem;">
            <!-- Rendered dynamically -->
          </div>

          <div style="padding: 0.5rem 0;">
            <button type="button" class="btn btn-secondary" id="btn-add-missed-med" style="width: 100%;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              <span>Add Missed Medication</span>
            </button>
          </div>
        </section>
      </div>

      <!-- Footer Actions & Verification Status Bar -->
      <div class="rx-modal-footer">
        <div class="rx-footer-summary" id="rx-footer-summary">
          <!-- Rendered dynamically -->
        </div>
        <div class="rx-footer-btns">
          <button type="button" class="btn btn-secondary" id="btn-cancel-review">Cancel</button>
          <button type="button" class="btn btn-primary" id="btn-proceed-import">
            <span>Import Confirmed Medications</span>
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modalBackdrop);

  // References
  const docImg = modalBackdrop.querySelector('#prescription-doc-img') as HTMLImageElement;
  const highlightBox = modalBackdrop.querySelector('#highlight-box') as HTMLElement;
  const candidatesMount = modalBackdrop.querySelector('#rx-candidates-mount') as HTMLElement;
  const footerSummary = modalBackdrop.querySelector('#rx-footer-summary') as HTMLElement;
  const proceedBtn = modalBackdrop.querySelector('#btn-proceed-import') as HTMLButtonElement;
  const zoomLabel = modalBackdrop.querySelector('#zoom-label') as HTMLElement;

  const docPane = modalBackdrop.querySelector('#rx-doc-pane') as HTMLElement;
  const reviewPane = modalBackdrop.querySelector('#rx-review-pane') as HTMLElement;
  const tabBtnDoc = modalBackdrop.querySelector('#tab-btn-doc') as HTMLElement;
  const tabBtnMeds = modalBackdrop.querySelector('#tab-btn-meds') as HTMLElement;

  // Cleanup handler
  const cleanup = () => {
    modalBackdrop.remove();
  };

  modalBackdrop.querySelector('#btn-close-review')?.addEventListener('click', cleanup);
  modalBackdrop.querySelector('#btn-cancel-review')?.addEventListener('click', () => {
    if (confirm('Discard this prescription scan session? Unsaved entries will be lost.')) {
      cleanup();
    }
  });

  // Mobile Tab switching
  const updateMobileTabs = () => {
    if (activeMobileTab === 'doc') {
      docPane.classList.remove('mobile-hidden');
      reviewPane.classList.add('mobile-hidden');
      tabBtnDoc.classList.add('is-active');
      tabBtnMeds.classList.remove('is-active');
    } else {
      docPane.classList.add('mobile-hidden');
      reviewPane.classList.remove('mobile-hidden');
      tabBtnDoc.classList.remove('is-active');
      tabBtnMeds.classList.add('is-active');
    }
  };
  tabBtnDoc.addEventListener('click', () => {
    activeMobileTab = 'doc';
    updateMobileTabs();
  });
  tabBtnMeds.addEventListener('click', () => {
    activeMobileTab = 'meds';
    updateMobileTabs();
  });
  updateMobileTabs();

  // Document Zooming
  const updateZoom = (scale: number) => {
    currentZoom = Math.max(0.5, Math.min(3.0, scale));
    zoomLabel.textContent = `${Math.round(currentZoom * 100)}%`;
    docImg.style.width = `${Math.round(currentZoom * 100)}%`;
    updateHighlightBox();
  };

  modalBackdrop.querySelector('#btn-zoom-in')?.addEventListener('click', () => updateZoom(currentZoom + 0.25));
  modalBackdrop.querySelector('#btn-zoom-out')?.addEventListener('click', () => updateZoom(currentZoom - 0.25));
  modalBackdrop.querySelector('#btn-zoom-reset')?.addEventListener('click', () => updateZoom(1.0));

  // Load active page image
  const loadPageImage = (pageNum: number) => {
    const pageData = session.pages.find(p => p.pageNumber === pageNum) || session.pages[0];
    if (pageData) {
      docImg.src = pageData.imageDataUrl;
      docImg.onload = () => updateHighlightBox();
    }
  };
  loadPageImage(currentPage);

  // Update highlight box for selected draft
  const updateHighlightBox = () => {
    const draft = session.drafts.find(d => d.id === selectedDraftId);
    if (!draft || !draft.boundingBox || !docImg.naturalWidth) {
      highlightBox.style.display = 'none';
      return;
    }

    const naturalW = docImg.naturalWidth;
    const naturalH = docImg.naturalHeight;
    const renderedW = docImg.clientWidth || naturalW;
    const renderedH = docImg.clientHeight || naturalH;

    const scaleX = renderedW / naturalW;
    const scaleY = renderedH / naturalH;

    const bbox = draft.boundingBox;
    highlightBox.style.display = 'block';
    highlightBox.style.left = `${Math.round(bbox.x * scaleX)}px`;
    highlightBox.style.top = `${Math.round(bbox.y * scaleY)}px`;
    highlightBox.style.width = `${Math.round(bbox.width * scaleX)}px`;
    highlightBox.style.height = `${Math.round(bbox.height * scaleY)}px`;
  };

  // Helper to render field status badge
  const renderStatusBadge = (status: FieldStatus) => {
    switch (status) {
      case 'extracted':
        return `<span class="rx-field-status status-extracted" title="Machine-extracted. Needs your review.">Needs Review</span>`;
      case 'uncertain':
        return `<span class="rx-field-status status-uncertain" title="Text unclear or ambiguous. Confirmation required.">⚠️ Text Unclear</span>`;
      case 'unreadable':
        return `<span class="rx-field-status status-unreadable" title="Unable to read text reliably.">❌ Unreadable</span>`;
      case 'user_confirmed':
        return `<span class="rx-field-status status-confirmed" title="Verified against source document by user.">✓ Confirmed</span>`;
      case 'professionally_verified':
        return `<span class="rx-field-status status-verified" title="Clarified with doctor or pharmacist.">🩺 Clarified</span>`;
    }
  };

  // Render candidate cards
  const renderCandidates = () => {
    if (session.drafts.length === 0) {
      candidatesMount.innerHTML = `
        <div style="padding: 2rem; text-align: center; color: var(--text-muted);">
          <p>No medication candidates found.</p>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-empty-add">Add Medication Manually</button>
        </div>
      `;
      candidatesMount.querySelector('#btn-empty-add')?.addEventListener('click', () => {
        addManualCandidate();
      });
      updateFooter();
      return;
    }

    candidatesMount.innerHTML = session.drafts.map((draft, idx) => {
      const isSelected = draft.id === selectedDraftId;
      const isExcluded = !!draft.isExcluded;

      const hasUnresolvedIssues = Object.entries(draft.fieldStatuses).some(([_, s]) => 
        (s === 'uncertain' || s === 'unreadable') && draft.verificationStatus === 'pending'
      );

      return `
        <article class="rx-candidate-card ${isSelected ? 'is-selected' : ''} ${isExcluded ? 'is-excluded' : ''}" data-id="${draft.id}">
          <div class="rx-card-header">
            <div style="display: flex; align-items: center; gap: 0.5rem; overflow: hidden;">
              <span class="badge" style="font-weight: 700;">#${idx + 1}</span>
              <span class="rx-snippet-quote" title="Original text snippet: ${draft.sourceSnippet || 'Manual entry'}">
                "${draft.sourceSnippet || 'Manual entry'}"
              </span>
            </div>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              ${renderStatusBadge(
                draft.verificationStatus === 'professional_clarification' ? 'professionally_verified' :
                draft.verificationStatus === 'user_confirmed' ? 'user_confirmed' :
                (draft.fieldStatuses.name || 'extracted')
              )}
              <button type="button" class="btn btn-secondary btn-sm btn-toggle-exclude" data-id="${draft.id}" title="${isExcluded ? 'Include candidate' : 'Exclude from import'}">
                ${isExcluded ? 'Include' : 'Exclude'}
              </button>
            </div>
          </div>

          ${isExcluded ? `
            <div style="padding: 0.75rem 1.25rem; font-size: 0.8125rem; color: var(--text-muted);">
              This candidate is excluded and will NOT be imported into CareDose.
            </div>
          ` : `
            <div class="rx-card-body">
              ${hasUnresolvedIssues ? `
                <div class="rx-notice-banner notice-caution" style="padding: 0.625rem 0.75rem; font-size: 0.8125rem;">
                  <div>
                    <strong>Unresolved Clinical Information:</strong>
                    ${Object.entries(draft.unclearReasons || {}).map(([field, reason]) => `
                      <div>• <strong>${field}</strong>: ${reason}</div>
                    `).join('')}
                  </div>
                </div>
              ` : ''}

              <!-- Medication Identity Fields -->
              <div class="rx-field-grid">
                <div class="rx-field-row">
                  <div class="rx-field-label-wrap">
                    <label for="name-${draft.id}">Medication Name *</label>
                    ${renderStatusBadge(draft.fieldStatuses.name)}
                  </div>
                  <input 
                    type="text" 
                    id="name-${draft.id}" 
                    class="form-input med-name-input" 
                    data-id="${draft.id}" 
                    value="${draft.name || ''}" 
                    placeholder="e.g. Metformin" 
                  />
                  <!-- Candidate catalog suggestions helper -->
                  <div class="catalog-suggestions-box" id="suggestions-${draft.id}" style="display: none;"></div>
                </div>

                <div class="rx-field-row">
                  <div class="rx-field-label-wrap">
                    <label for="strength-${draft.id}">Strength &amp; Units *</label>
                    ${renderStatusBadge(draft.fieldStatuses.strength)}
                  </div>
                  <input 
                    type="text" 
                    id="strength-${draft.id}" 
                    class="form-input med-strength-input" 
                    data-id="${draft.id}" 
                    value="${draft.strength || ''}" 
                    placeholder="e.g. 500 mg (Do not merge with dose quantity)" 
                  />
                </div>
              </div>

              <!-- Dose Quantity & Dosage Form -->
              <div class="rx-field-grid">
                <div class="rx-field-row">
                  <div class="rx-field-label-wrap">
                    <label for="doseqty-${draft.id}">Dose Quantity</label>
                    ${renderStatusBadge(draft.fieldStatuses.doseQuantity)}
                  </div>
                  <input 
                    type="text" 
                    id="doseqty-${draft.id}" 
                    class="form-input med-doseqty-input" 
                    data-id="${draft.id}" 
                    value="${draft.doseQuantity || ''}" 
                    placeholder="e.g. 1 tablet, 2 puffs" 
                  />
                </div>

                <div class="rx-field-row">
                  <div class="rx-field-label-wrap">
                    <label for="form-${draft.id}">Dosage Form</label>
                    ${renderStatusBadge(draft.fieldStatuses.dosageForm)}
                  </div>
                  <select id="form-${draft.id}" class="form-input med-form-select" data-id="${draft.id}">
                    <option value="Tablet" ${draft.dosageForm === 'Tablet' ? 'selected' : ''}>Tablet</option>
                    <option value="Capsule" ${draft.dosageForm === 'Capsule' ? 'selected' : ''}>Capsule</option>
                    <option value="Liquid" ${draft.dosageForm === 'Liquid' ? 'selected' : ''}>Liquid / Syrup</option>
                    <option value="Inhaler" ${draft.dosageForm === 'Inhaler' ? 'selected' : ''}>Inhaler</option>
                    <option value="Drops" ${draft.dosageForm === 'Drops' ? 'selected' : ''}>Drops</option>
                    <option value="Topical" ${draft.dosageForm === 'Topical' ? 'selected' : ''}>Topical / Cream</option>
                  </select>
                </div>
              </div>

              <!-- Frequency & Scheduled Timing Slots -->
              <div class="rx-field-row">
                <div class="rx-field-label-wrap">
                  <label>Administration Schedule Slots *</label>
                  ${renderStatusBadge(draft.fieldStatuses.schedule)}
                </div>
                <div style="display: flex; gap: 1rem; flex-wrap: wrap; margin-top: 0.25rem;">
                  ${(['morning', 'midday', 'evening', 'bedtime'] as TimeSlot[]).map(slot => `
                    <label style="display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.875rem; text-transform: capitalize; cursor: pointer;">
                      <input 
                        type="checkbox" 
                        class="med-slot-checkbox" 
                        data-id="${draft.id}" 
                        value="${slot}" 
                        ${draft.timeSlots.includes(slot) ? 'checked' : ''} 
                      />
                      <span>${slot}</span>
                    </label>
                  `).join('')}
                </div>
              </div>

              <!-- Special Instructions & Prescriber -->
              <div class="rx-field-grid">
                <div class="rx-field-row">
                  <label for="instructions-${draft.id}" style="font-size: 0.8125rem; font-weight: 600;">Instructions / Sig</label>
                  <input 
                    type="text" 
                    id="instructions-${draft.id}" 
                    class="form-input med-instructions-input" 
                    data-id="${draft.id}" 
                    value="${draft.instructions || ''}" 
                    placeholder="e.g. Take with food" 
                  />
                </div>

                <div class="rx-field-row">
                  <label for="prescriber-${draft.id}" style="font-size: 0.8125rem; font-weight: 600;">Prescribed By</label>
                  <input 
                    type="text" 
                    id="prescriber-${draft.id}" 
                    class="form-input med-prescriber-input" 
                    data-id="${draft.id}" 
                    value="${draft.prescribedBy || ''}" 
                    placeholder="e.g. Dr. Sarah Smith" 
                  />
                </div>
              </div>

              <!-- Verification & Clarification Box -->
              <div class="rx-clarification-box">
                <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem;">
                  <button type="button" class="btn btn-sm ${draft.verificationStatus === 'user_confirmed' ? 'btn-primary' : 'btn-secondary'} btn-confirm-draft" data-id="${draft.id}">
                    ${draft.verificationStatus === 'user_confirmed' ? '✓ I Have Verified This Data' : 'Mark as Confirmed by Me'}
                  </button>

                  <label class="rx-clarification-toggle">
                    <input 
                      type="checkbox" 
                      class="clarification-checkbox" 
                      data-id="${draft.id}" 
                      ${draft.verificationStatus === 'professional_clarification' ? 'checked' : ''} 
                    />
                    <span>Clarified with Pharmacist / Doctor</span>
                  </label>
                </div>

                ${draft.verificationStatus === 'professional_clarification' ? `
                  <div style="margin-top: 0.5rem;">
                    <label for="clarify-notes-${draft.id}" style="font-size: 0.75rem; font-weight: 600; color: #115e59;">Clarification Details (Who, date, telephone or in-person):</label>
                    <input 
                      type="text" 
                      id="clarify-notes-${draft.id}" 
                      class="form-input clarify-notes-input" 
                      data-id="${draft.id}" 
                      value="${draft.clarificationNotes || ''}" 
                      placeholder="e.g. Confirmed with Dr. Smith via clinic telephone" 
                    />
                  </div>
                ` : ''}
              </div>
            </div>
          `}
        </article>
      `;
    }).join('');

    attachDraftCardEvents();
    updateFooter();
  };

  // Add missed medication manually
  const addManualCandidate = () => {
    const newDraft: PrescriptionMedicationDraft = {
      id: generateLocalId('draft'),
      sourceSnippet: 'Added manually during review session',
      name: '',
      genericName: null,
      strength: '',
      doseQuantity: '1 tablet',
      dosageForm: 'Tablet',
      frequency: 'Once daily',
      scheduledTimes: null,
      timeSlots: ['morning'],
      duration: null,
      instructions: '',
      rxCui: null,
      prescribedBy: null,
      fieldStatuses: {
        name: 'uncertain',
        strength: 'uncertain',
        doseQuantity: 'user_confirmed',
        dosageForm: 'user_confirmed',
        frequency: 'user_confirmed',
        schedule: 'user_confirmed'
      },
      verificationStatus: 'user_confirmed',
      isExcluded: false
    };
    session.drafts.push(newDraft);
    selectedDraftId = newDraft.id;
    renderCandidates();
  };

  modalBackdrop.querySelector('#btn-add-missed-med')?.addEventListener('click', addManualCandidate);

  // Attach event listeners to card inputs
  const attachDraftCardEvents = () => {
    // Card selection / highlight
    candidatesMount.querySelectorAll('.rx-candidate-card').forEach(card => {
      card.addEventListener('click', (e) => {
        // Avoid clicking inside input elements triggering re-select
        const target = e.target as HTMLElement;
        if (['INPUT', 'SELECT', 'BUTTON', 'LABEL'].includes(target.tagName)) return;

        const id = card.getAttribute('data-id');
        if (id && id !== selectedDraftId) {
          selectedDraftId = id;
          renderCandidates();
          updateHighlightBox();
        }
      });
    });

    // Exclude toggle
    candidatesMount.querySelectorAll('.btn-toggle-exclude').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = (e.currentTarget as HTMLElement).dataset.id!;
        const draft = session.drafts.find(d => d.id === id);
        if (draft) {
          draft.isExcluded = !draft.isExcluded;
          renderCandidates();
        }
      });
    });

    // Inputs: Name
    candidatesMount.querySelectorAll('.med-name-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const id = (e.currentTarget as HTMLElement).dataset.id!;
        const draft = session.drafts.find(d => d.id === id);
        const val = (e.target as HTMLInputElement).value;
        if (draft) {
          draft.name = val;
          draft.fieldStatuses.name = 'user_confirmed';
          if (draft.unclearReasons) delete draft.unclearReasons.name;
          updateFooter();

          const suggestionsMount = candidatesMount.querySelector(`#suggestions-${id}`) as HTMLElement;
          if (suggestionsMount) {
            const matches = findCatalogSuggestions(val);
            if (matches.length > 0) {
              suggestionsMount.style.display = 'block';
              suggestionsMount.innerHTML = `
                <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">
                  Possible catalog matches (suggestions only):<br/>
                  ${matches.map(m => `
                    <button type="button" class="btn btn-secondary btn-sm btn-pick-suggestion" data-draft-id="${id}" data-name="${m.name}" data-generic="${m.genericName || ''}" style="margin: 2px; padding: 2px 6px; font-size: 0.75rem;">
                      ${m.name} ${m.genericName ? `(${m.genericName})` : ''}
                    </button>
                  `).join('')}
                </div>
              `;
              suggestionsMount.querySelectorAll('.btn-pick-suggestion').forEach(btn => {
                btn.addEventListener('click', (ev) => {
                  ev.preventDefault();
                  const target = ev.currentTarget as HTMLElement;
                  const chosenName = target.dataset.name!;
                  const chosenGeneric = target.dataset.generic || null;
                  draft.name = chosenName;
                  draft.genericName = chosenGeneric;
                  draft.fieldStatuses.name = 'user_confirmed';
                  suggestionsMount.style.display = 'none';
                  renderCandidates();
                });
              });
            } else {
              suggestionsMount.style.display = 'none';
            }
          }
        }
      });
    });

    // Inputs: Strength
    candidatesMount.querySelectorAll('.med-strength-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const id = (e.currentTarget as HTMLElement).dataset.id!;
        const draft = session.drafts.find(d => d.id === id);
        if (draft) {
          draft.strength = (e.target as HTMLInputElement).value;
          draft.fieldStatuses.strength = 'user_confirmed';
          if (draft.unclearReasons) delete draft.unclearReasons.strength;
          updateFooter();
        }
      });
    });

    // Inputs: Dose Quantity
    candidatesMount.querySelectorAll('.med-doseqty-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const id = (e.currentTarget as HTMLElement).dataset.id!;
        const draft = session.drafts.find(d => d.id === id);
        if (draft) {
          draft.doseQuantity = (e.target as HTMLInputElement).value;
          draft.fieldStatuses.doseQuantity = 'user_confirmed';
          updateFooter();
        }
      });
    });

    // Inputs: Form
    candidatesMount.querySelectorAll('.med-form-select').forEach(select => {
      select.addEventListener('change', (e) => {
        const id = (e.currentTarget as HTMLElement).dataset.id!;
        const draft = session.drafts.find(d => d.id === id);
        if (draft) {
          draft.dosageForm = (e.target as HTMLSelectElement).value;
          draft.fieldStatuses.dosageForm = 'user_confirmed';
          updateFooter();
        }
      });
    });

    // Checkboxes: TimeSlots
    candidatesMount.querySelectorAll('.med-slot-checkbox').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const input = e.target as HTMLInputElement;
        const id = input.dataset.id!;
        const slot = input.value as TimeSlot;
        const draft = session.drafts.find(d => d.id === id);
        if (draft) {
          if (input.checked) {
            if (!draft.timeSlots.includes(slot)) draft.timeSlots.push(slot);
          } else {
            draft.timeSlots = draft.timeSlots.filter(s => s !== slot);
          }
          draft.fieldStatuses.schedule = 'user_confirmed';
          if (draft.unclearReasons) delete draft.unclearReasons.schedule;
          updateFooter();
        }
      });
    });

    // Inputs: Instructions
    candidatesMount.querySelectorAll('.med-instructions-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const id = (e.currentTarget as HTMLElement).dataset.id!;
        const draft = session.drafts.find(d => d.id === id);
        if (draft) {
          draft.instructions = (e.target as HTMLInputElement).value;
        }
      });
    });

    // Inputs: Prescriber
    candidatesMount.querySelectorAll('.med-prescriber-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const id = (e.currentTarget as HTMLElement).dataset.id!;
        const draft = session.drafts.find(d => d.id === id);
        if (draft) {
          draft.prescribedBy = (e.target as HTMLInputElement).value;
        }
      });
    });

    // User Confirmation Button
    candidatesMount.querySelectorAll('.btn-confirm-draft').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).dataset.id!;
        const draft = session.drafts.find(d => d.id === id);
        if (draft) {
          draft.verificationStatus = 'user_confirmed';
          // Mark fields user_confirmed
          Object.keys(draft.fieldStatuses).forEach(k => {
            draft.fieldStatuses[k] = 'user_confirmed';
          });
          draft.unclearReasons = {};
          renderCandidates();
        }
      });
    });

    // Professional Clarification Toggle
    candidatesMount.querySelectorAll('.clarification-checkbox').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const input = e.target as HTMLInputElement;
        const id = input.dataset.id!;
        const draft = session.drafts.find(d => d.id === id);
        if (draft) {
          if (input.checked) {
            draft.verificationStatus = 'professional_clarification';
            Object.keys(draft.fieldStatuses).forEach(k => {
              draft.fieldStatuses[k] = 'professionally_verified';
            });
            draft.unclearReasons = {};
          } else {
            draft.verificationStatus = 'pending';
          }
          renderCandidates();
        }
      });
    });

    // Clarification Notes input
    candidatesMount.querySelectorAll('.clarify-notes-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const id = (e.currentTarget as HTMLElement).dataset.id!;
        const draft = session.drafts.find(d => d.id === id);
        if (draft) {
          draft.clarificationNotes = (e.target as HTMLInputElement).value;
        }
      });
    });
  };

  // Update Footer summary and import button availability
  const updateFooter = () => {
    const included = session.drafts.filter(d => !d.isExcluded);
    const confirmedCount = included.filter(d => 
      d.verificationStatus === 'user_confirmed' || d.verificationStatus === 'professional_clarification'
    ).length;
    const excludedCount = session.drafts.filter(d => d.isExcluded).length;

    // Check if any included medication is blocked
    const validationResults = included.map(d => ({
      draft: d,
      validation: validateDraftForImport(d)
    }));

    const anyBlocked = validationResults.some(v => !v.validation.isSafeToImport);
    const safeCount = validationResults.filter(v => v.validation.isSafeToImport).length;

    footerSummary.innerHTML = `
      <strong>${session.drafts.length}</strong> candidates detected • 
      <span style="color: var(--status-safe-text); font-weight: 600;">${confirmedCount} confirmed</span> • 
      <span style="color: var(--text-muted);">${excludedCount} excluded</span>
      ${anyBlocked ? `
        <div style="color: var(--status-critical-text); font-size: 0.8125rem; margin-top: 0.25rem;">
          ⚠️ One or more medications contain unverified fields. Please confirm or clarify before importing.
        </div>
      ` : ''}
    `;

    if (safeCount === 0 || anyBlocked) {
      proceedBtn.disabled = true;
      proceedBtn.innerHTML = `<span>Import (${safeCount} Ready)</span>`;
      proceedBtn.title = 'Resolve uncertain fields or exclude candidates to import';
    } else {
      proceedBtn.disabled = false;
      proceedBtn.innerHTML = `<span>Import ${safeCount} Confirmed ${safeCount === 1 ? 'Medication' : 'Medications'}</span>`;
      proceedBtn.title = 'Proceed to safe medication import';
    }
  };

  // Proceed to Import
  proceedBtn.addEventListener('click', () => {
    const validDrafts = session.drafts.filter(d => !d.isExcluded && validateDraftForImport(d).isSafeToImport);
    if (validDrafts.length === 0) return;

    cleanup();
    openPrescriptionImportSummary(validDrafts, onComplete);
  });

  // Initial candidate render
  renderCandidates();
}
