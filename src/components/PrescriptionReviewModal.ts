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
  FieldStatus,
  RecognitionDiagnostics,
  BoundingBox
} from '../types';
import { generateLocalId } from '../utils/sanitize';
import { findCatalogSuggestions, validateDraftForImport } from '../engine/prescriptionParser';
import { recognizeCroppedRegion } from '../services/ocrService';
import { openPrescriptionImportSummary } from './PrescriptionImportSummary';
import { openPrescriptionUploadModal } from './PrescriptionUploadModal';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function openDiagnosticsModal(diagnostics?: RecognitionDiagnostics): void {
  const existing = document.getElementById('rx-diag-modal');
  if (existing) existing.remove();

  const backdrop = document.createElement('div');
  backdrop.id = 'rx-diag-modal';
  backdrop.className = 'rx-diagnostics-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-labelledby', 'rx-diag-title');

  if (!diagnostics) {
    backdrop.innerHTML = `
      <div class="rx-diagnostics-card" style="max-width: 500px;">
        <div class="rx-diagnostics-header">
          <h3 id="rx-diag-title" style="margin: 0; font-size: 1.125rem;">Prescription Layout &amp; Diagnostics</h3>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-close-diag">Close</button>
        </div>
        <div class="rx-diagnostics-body">
          <p style="color: var(--text-muted); font-size: 0.875rem; margin: 0;">No diagnostic telemetry recorded for this session.</p>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);
    backdrop.querySelector('#btn-close-diag')?.addEventListener('click', () => backdrop.remove());
    return;
  }

  backdrop.innerHTML = `
    <div class="rx-diagnostics-card">
      <div class="rx-diagnostics-header">
        <div>
          <h3 id="rx-diag-title" style="margin: 0; font-size: 1.125rem; font-weight: 700;">Developer Diagnostics: 5-Stage Pipeline &amp; Document Geometry</h3>
          <p style="margin: 0.25rem 0 0; font-size: 0.75rem; color: var(--text-muted);">
            Scan ID: <code>${escapeHtml(diagnostics.scanRunId || 'session-scan')}</code> • Engine: ${escapeHtml(diagnostics.ocrEngine || 'Tesseract.js v5 (Offline WASM)')} • ${diagnostics.totalRegions} document regions inspected
          </p>
        </div>
        <div style="display: flex; gap: 0.5rem; align-items: center;">
          <button type="button" class="btn btn-secondary btn-sm" id="btn-export-sanitized-report" title="Export a de-identified JSON diagnostic report for engineering review">
            <span>Export Sanitized Report</span>
          </button>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-close-diag">Close</button>
        </div>
      </div>

      <div class="rx-diagnostics-body">
        <div class="rx-notice-banner notice-info" style="font-size: 0.8125rem;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink: 0;" aria-hidden="true">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
          <div>
            <strong>100% On-Device Privacy:</strong> All OCR layout analysis, candidate evaluations, and diagnostics run purely inside browser memory. No patient information or scanned documents are logged or sent to any external service.
          </div>
        </div>

        ${diagnostics.stageFailureSummary ? `
          <div class="rx-notice-banner notice-caution" style="font-size: 0.8125rem;">
            <strong>Pipeline Status / Stage Notice:</strong>
            <div>${escapeHtml(diagnostics.stageFailureSummary)}</div>
          </div>
        ` : ''}

        <!-- Section 0: 5-Stage Pipeline Telemetry -->
        <div>
          <h4 style="font-size: 0.9375rem; font-weight: 700; margin: 0 0 0.5rem;">
            Pipeline Stage Telemetry (Stages 1 through 5)
          </h4>
          ${(diagnostics.stages && diagnostics.stages.length > 0) ? `
            <div style="display: flex; flex-direction: column; gap: 0.5rem;">
              ${diagnostics.stages.map(st => {
                const badgeClass = `stage-${st.status}`;
                const icon = st.status === 'success' ? '✓' : st.status === 'warning' ? '⚠️' : st.status === 'failed' ? '✗' : '–';
                return `
                  <div style="display: flex; align-items: flex-start; justify-content: space-between; padding: 0.625rem 0.75rem; background: var(--bg-surface-alt); border: 1px solid var(--border-light); border-radius: var(--radius-sm); font-size: 0.8125rem;">
                    <div>
                      <div style="font-weight: 600; color: var(--text-main);">${escapeHtml(st.name)}</div>
                      <div style="color: var(--text-muted); font-size: 0.75rem; margin-top: 2px;">${escapeHtml(st.summary)}</div>
                    </div>
                    <span class="rx-stage-badge ${badgeClass}" style="flex-shrink: 0; margin-left: 0.5rem;">
                      ${icon} ${st.status.toUpperCase()}
                    </span>
                  </div>
                `;
              }).join('')}
            </div>
          ` : `
            <p style="color: var(--text-muted); font-size: 0.8125rem;">Stage telemetry unavailable for this scan.</p>
          `}
        </div>

        <!-- Section 1: Candidate Evaluations -->
        <div>
          <h4 style="font-size: 0.9375rem; font-weight: 700; margin: 0 0 0.5rem; display: flex; align-items: center; justify-content: space-between;">
            <span>Candidate Evaluations (${diagnostics.candidateEvaluations.length})</span>
            <span style="font-size: 0.75rem; font-weight: 400; color: var(--text-muted);">
              ${diagnostics.candidateEvaluations.filter(e => e.accepted).length} accepted • ${diagnostics.candidateEvaluations.filter(e => !e.accepted).length} rejected
            </span>
          </h4>
          <div style="overflow-x: auto;">
            <table class="rx-diag-table">
              <thead>
                <tr>
                  <th style="width: 110px;">Status</th>
                  <th style="width: 30%;">Source Snippet</th>
                  <th>Acceptance / Rejection Reasons</th>
                  <th style="width: 120px;">Zone</th>
                </tr>
              </thead>
              <tbody>
                ${diagnostics.candidateEvaluations.length === 0 ? `
                  <tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 1rem;">No candidate blocks evaluated.</td></tr>
                ` : diagnostics.candidateEvaluations.map(ev => `
                  <tr>
                    <td>
                      <span class="rx-diag-badge ${ev.accepted ? 'badge-accepted' : 'badge-rejected'}">
                        ${ev.accepted ? '✓ Accepted' : '✗ Rejected'}
                      </span>
                    </td>
                    <td><code style="font-size: 0.75rem; font-family: monospace;">${escapeHtml(ev.rawText.slice(0, 100) || '(empty)')}</code></td>
                    <td>
                      <ul style="margin: 0; padding-left: 1.25rem; font-size: 0.75rem;">
                        ${ev.accepted ? `
                          <li>Positive evidence: ${ev.evidenceFound.join(', ') || 'Medication signature found'}</li>
                          ${ev.medicationName ? `<li>Detected drug name: <strong>${escapeHtml(ev.medicationName)}</strong></li>` : ''}
                        ` : `
                          <li>${escapeHtml(ev.rejectionReason || 'Rejected non-medication content')}</li>
                        `}
                      </ul>
                    </td>
                    <td style="font-size: 0.75rem;">
                      <span class="rx-diag-badge badge-boilerplate">${ev.zone}</span>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Section 2: Document Layout Classification & Coordinates -->
        <div>
          <h4 style="font-size: 0.9375rem; font-weight: 700; margin: 0 0 0.5rem;">
            Document Layout Classification (${diagnostics.classifiedZones.length} Classified Zones)
          </h4>
          <div style="overflow-x: auto;">
            <table class="rx-diag-table">
              <thead>
                <tr>
                  <th style="width: 170px;">Zone Type</th>
                  <th style="width: 150px;">Source Coordinates</th>
                  <th>Zone Snippet &amp; Classification Rule</th>
                </tr>
              </thead>
              <tbody>
                ${diagnostics.classifiedZones.map(r => {
                  const badgeClass = 
                    r.zone === 'document_header' ? 'badge-header' :
                    r.zone === 'patient_demographics' ? 'badge-demographics' :
                    r.zone === 'prescription_body' ? 'badge-body' :
                    r.zone === 'prescriber_footer' ? 'badge-footer' :
                    r.zone === 'administrative_boilerplate' ? 'badge-boilerplate' : 'badge-unknown';
                  return `
                    <tr>
                      <td><span class="rx-diag-badge ${badgeClass}">${r.zone}</span></td>
                      <td style="font-family: monospace; font-size: 0.75rem;">
                        ${r.bbox ? `x:${r.bbox.x}, y:${r.bbox.y}, w:${r.bbox.width}, h:${r.bbox.height}` : 'Doc Flow (Auto)'}
                      </td>
                      <td>
                        <div style="font-size: 0.75rem; font-weight: 600;">"${escapeHtml(r.snippet)}"</div>
                        <div style="font-size: 0.71875rem; color: var(--text-muted); margin-top: 2px;">Rule: ${escapeHtml(r.reason)}</div>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Section 3: Processing Passes & OCR Telemetry -->
        <div>
          <h4 style="font-size: 0.9375rem; font-weight: 700; margin: 0 0 0.5rem;">Pipeline Passes &amp; OCR Engine Telemetry</h4>
          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.75rem;">
            ${diagnostics.processingPasses.map(p => `
              <span class="badge" style="background: var(--bg-surface-alt); border: 1px solid var(--border-light); font-size: 0.75rem;">
                ✓ ${escapeHtml(p)}
              </span>
            `).join('')}
          </div>
          ${(diagnostics.ocrPasses && diagnostics.ocrPasses.length > 0) ? `
            <div style="overflow-x: auto;">
              <table class="rx-diag-table">
                <thead>
                  <tr>
                    <th>Pass #</th>
                    <th>Segmentation Mode (PSM)</th>
                    <th>Characters Extracted</th>
                    <th>Mean OCR Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  ${diagnostics.ocrPasses.map(p => `
                    <tr>
                      <td>Pass ${p.pass}</td>
                      <td>PSM ${p.psm}</td>
                      <td>${p.textLength} chars</td>
                      <td>${Math.round(p.meanConfidence)}%</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : ''}
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);
  backdrop.querySelector('#btn-close-diag')?.addEventListener('click', () => backdrop.remove());
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) backdrop.remove();
  });

  // Export Sanitized Diagnostic Report (Zero Patient PII)
  backdrop.querySelector('#btn-export-sanitized-report')?.addEventListener('click', () => {
    const sanitizedReport = {
      reportType: 'CareDose_OCR_Diagnostics_Sanitized',
      version: '3.2',
      exportedAt: new Date().toISOString(),
      scanRunId: diagnostics.scanRunId || 'session-scan',
      ocrEngine: diagnostics.ocrEngine || 'Tesseract.js v5 (Offline WASM)',
      documentDimensions: diagnostics.documentDimensions,
      stageFailureSummary: diagnostics.stageFailureSummary,
      stages: diagnostics.stages,
      totalRegions: diagnostics.totalRegions,
      classifiedZonesSummary: diagnostics.classifiedZones.reduce((acc: any, z) => {
        acc[z.zone] = (acc[z.zone] || 0) + 1;
        return acc;
      }, {}),
      candidateEvaluationsSummary: {
        totalEvaluated: diagnostics.candidateEvaluations.length,
        accepted: diagnostics.candidateEvaluations.filter(e => e.accepted).length,
        rejected: diagnostics.candidateEvaluations.filter(e => !e.accepted).length,
        rejectionReasons: diagnostics.candidateEvaluations.filter(e => !e.accepted).map(e => e.rejectionReason)
      },
      processingPasses: diagnostics.processingPasses
    };

    const blob = new Blob([JSON.stringify(sanitizedReport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `caredose-diagnostics-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

/**
 * Interactive Dialog for Region-Assisted Selection and Manual Transcription.
 */
function openRegionTranscriptionDialog(
  cropDataUrl: string,
  bbox: BoundingBox,
  onSave: (draft: PrescriptionMedicationDraft) => void
): void {
  const existing = document.getElementById('rx-region-transcribe-modal');
  if (existing) existing.remove();

  const backdrop = document.createElement('div');
  backdrop.id = 'rx-region-transcribe-modal';
  backdrop.className = 'rx-modal-backdrop';
  backdrop.style.zIndex = '1100';

  backdrop.innerHTML = `
    <div class="rx-modal-card" style="max-width: 600px; max-height: 90vh;" tabindex="-1">
      <div class="rx-modal-header">
        <div class="rx-modal-title-group">
          <h3 style="margin: 0; font-size: 1.125rem;">Region-Assisted Medication Extraction</h3>
          <p style="margin: 0.25rem 0 0; font-size: 0.75rem; color: var(--text-muted);">
            Isolated prescription region (${bbox.width}x${bbox.height} px).
          </p>
        </div>
        <button type="button" class="rx-modal-close-btn" id="btn-close-region-crop" aria-label="Close dialog">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <div class="rx-upload-body" style="padding: 1.25rem; overflow-y: auto; display: flex; flex-direction: column; gap: 1rem;">
        <!-- Cropped Image Preview -->
        <div style="background: #f8fafc; border: 1.5px solid var(--border-main); border-radius: var(--radius-md); padding: 0.75rem; text-align: center;">
          <div style="font-size: 0.75rem; font-weight: 600; color: var(--text-muted); margin-bottom: 0.5rem; text-align: left;">
            Selected Prescription Region:
          </div>
          <img src="${cropDataUrl}" alt="Selected prescription region" style="max-height: 120px; max-width: 100%; object-fit: contain; border-radius: 4px;" />
        </div>

        <!-- Recognition Status / Telemetry -->
        <div id="region-ocr-status" class="rx-notice-banner notice-info" style="font-size: 0.8125rem;">
          <span>Running targeted OCR on selected region (PSM 6 Line Mode)...</span>
        </div>

        <div class="rx-notice-banner notice-caution" style="font-size: 0.75rem;">
          <strong>Clinical Transcription Guard:</strong> Handwriting recognition has optical limitations. Verify that the transcribed name and strength match the doctor's handwriting before saving.
        </div>

        <!-- Form fields -->
        <div style="display: flex; flex-direction: column; gap: 0.75rem;">
          <div>
            <label for="reg-crop-name" style="display: block; font-size: 0.8125rem; font-weight: 600; margin-bottom: 0.25rem;">Medication Name *</label>
            <input type="text" id="reg-crop-name" class="form-input" placeholder="e.g. Amoxicillin, Paracetamol" />
            <div id="reg-crop-suggestions" style="display: none; margin-top: 0.25rem;"></div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
            <div>
              <label for="reg-crop-strength" style="display: block; font-size: 0.8125rem; font-weight: 600; margin-bottom: 0.25rem;">Strength *</label>
              <input type="text" id="reg-crop-strength" class="form-input" placeholder="e.g. 500 mg, 120 mg" />
            </div>
            <div>
              <label for="reg-crop-form" style="display: block; font-size: 0.8125rem; font-weight: 600; margin-bottom: 0.25rem;">Dosage Form</label>
              <select id="reg-crop-form" class="form-select">
                <option value="Tablet">Tablet</option>
                <option value="Capsule">Capsule</option>
                <option value="Liquid">Liquid / Syrup</option>
                <option value="Inhaler">Inhaler</option>
                <option value="Drops">Drops</option>
                <option value="Topical">Topical / Cream</option>
                <option value="Injection">Injection</option>
              </select>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
            <div>
              <label for="reg-crop-doseqty" style="display: block; font-size: 0.8125rem; font-weight: 600; margin-bottom: 0.25rem;">Dose Quantity</label>
              <input type="text" id="reg-crop-doseqty" class="form-input" value="1 tablet" />
            </div>
            <div>
              <label for="reg-crop-freq" style="display: block; font-size: 0.8125rem; font-weight: 600; margin-bottom: 0.25rem;">Frequency</label>
              <select id="reg-crop-freq" class="form-select">
                <option value="Once daily">Once daily</option>
                <option value="Twice daily">Twice daily (bid)</option>
                <option value="Three times daily">Three times daily (tid)</option>
                <option value="Four times daily">Four times daily (qid)</option>
                <option value="As needed (PRN)">As needed (PRN)</option>
              </select>
            </div>
          </div>

          <div>
            <label style="display: block; font-size: 0.8125rem; font-weight: 600; margin-bottom: 0.25rem;">Scheduled Slots</label>
            <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
              <label style="display: flex; align-items: center; gap: 0.35rem; font-size: 0.8125rem;">
                <input type="checkbox" class="reg-crop-slot" value="morning" checked /> Morning
              </label>
              <label style="display: flex; align-items: center; gap: 0.35rem; font-size: 0.8125rem;">
                <input type="checkbox" class="reg-crop-slot" value="midday" /> Midday
              </label>
              <label style="display: flex; align-items: center; gap: 0.35rem; font-size: 0.8125rem;">
                <input type="checkbox" class="reg-crop-slot" value="evening" /> Evening
              </label>
              <label style="display: flex; align-items: center; gap: 0.35rem; font-size: 0.8125rem;">
                <input type="checkbox" class="reg-crop-slot" value="bedtime" /> Bedtime
              </label>
            </div>
          </div>

          <div>
            <label for="reg-crop-instructions" style="display: block; font-size: 0.8125rem; font-weight: 600; margin-bottom: 0.25rem;">Instructions / Sig</label>
            <input type="text" id="reg-crop-instructions" class="form-input" placeholder="e.g. Take with food, after meals" />
          </div>
        </div>
      </div>

      <div class="rx-modal-footer">
        <button type="button" class="btn btn-secondary" id="btn-cancel-reg-crop">Cancel</button>
        <button type="button" class="btn btn-primary" id="btn-save-reg-crop">
          <span>Add to Medication Drafts</span>
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  const close = () => backdrop.remove();
  backdrop.querySelector('#btn-close-region-crop')?.addEventListener('click', close);
  backdrop.querySelector('#btn-cancel-reg-crop')?.addEventListener('click', close);

  const nameInput = backdrop.querySelector('#reg-crop-name') as HTMLInputElement;
  const strengthInput = backdrop.querySelector('#reg-crop-strength') as HTMLInputElement;
  const formSelect = backdrop.querySelector('#reg-crop-form') as HTMLSelectElement;
  const doseQtyInput = backdrop.querySelector('#reg-crop-doseqty') as HTMLInputElement;
  const freqSelect = backdrop.querySelector('#reg-crop-freq') as HTMLSelectElement;
  const instructionsInput = backdrop.querySelector('#reg-crop-instructions') as HTMLInputElement;
  const statusEl = backdrop.querySelector('#region-ocr-status') as HTMLElement;
  const suggestionsMount = backdrop.querySelector('#reg-crop-suggestions') as HTMLElement;

  // Run targeted OCR
  recognizeCroppedRegion(cropDataUrl, { psm: 6 })
    .then(res => {
      const recognized = res.text.trim();
      const conf = Math.round(res.confidence || 0);

      statusEl.className = 'rx-notice-banner notice-info';
      statusEl.innerHTML = `
        <div>
          <strong>Targeted OCR Result (PSM 6):</strong>
          <span style="font-family: monospace; background: #e2e8f0; padding: 2px 4px; border-radius: 3px;">"${escapeHtml(recognized || '(No text detected)')}"</span>
          <span style="font-size: 0.75rem; color: var(--text-muted); margin-left: 0.5rem;">(Confidence: ${conf}%)</span>
        </div>
      `;

      if (recognized) {
        const strengthMatch = recognized.match(/\b(\d+(?:\.\d+)?)\s*(mg|mcg|ml|g|%|me|m9|mq)\b/i);
        if (strengthMatch) {
          const rawU = strengthMatch[2].toLowerCase();
          const normU = (rawU === 'me' || rawU === 'm9' || rawU === 'mq') ? 'mg' : rawU;
          strengthInput.value = `${strengthMatch[1]} ${normU}`;
        }

        const tokens = recognized
          .replace(/^(?:\d+[\.\)]|Rx:?|Item\s*\d+:?|#\d+:?)\s*/i, '')
          .split(/\s+/)
          .map(t => t.replace(/[^a-zA-Z]/g, ''))
          .filter(t => t.length >= 3);

        if (tokens[0]) {
          nameInput.value = tokens[0];
          const matches = findCatalogSuggestions(tokens[0]);
          if (matches.length > 0) {
            suggestionsMount.style.display = 'block';
            suggestionsMount.innerHTML = `
              <div style="font-size: 0.75rem; color: var(--text-muted);">
                Suggested catalog matches:<br/>
                ${matches.map(m => `
                  <button type="button" class="btn btn-secondary btn-sm btn-reg-pick" data-name="${m.name}" style="margin: 2px; padding: 1px 5px; font-size: 0.75rem;">
                    ${m.name}
                  </button>
                `).join('')}
              </div>
            `;
            suggestionsMount.querySelectorAll('.btn-reg-pick').forEach(b => {
              b.addEventListener('click', (e) => {
                nameInput.value = (e.currentTarget as HTMLElement).dataset.name!;
                suggestionsMount.style.display = 'none';
              });
            });
          }
        }
      }
    })
    .catch(err => {
      statusEl.className = 'rx-notice-banner notice-caution';
      statusEl.innerHTML = `<span>Could not run automatic OCR: ${escapeHtml(err.message || String(err))}. Please type the prescription details manually.</span>`;
    });

  // Autocomplete on manual name typing
  nameInput.addEventListener('input', () => {
    const val = nameInput.value.trim();
    if (val.length >= 2) {
      const matches = findCatalogSuggestions(val);
      if (matches.length > 0) {
        suggestionsMount.style.display = 'block';
        suggestionsMount.innerHTML = `
          <div style="font-size: 0.75rem; color: var(--text-muted);">
            Suggested catalog matches:<br/>
            ${matches.map(m => `
              <button type="button" class="btn btn-secondary btn-sm btn-reg-pick" data-name="${m.name}" style="margin: 2px; padding: 1px 5px; font-size: 0.75rem;">
                ${m.name}
              </button>
            `).join('')}
          </div>
        `;
        suggestionsMount.querySelectorAll('.btn-reg-pick').forEach(b => {
          b.addEventListener('click', (e) => {
            nameInput.value = (e.currentTarget as HTMLElement).dataset.name!;
            suggestionsMount.style.display = 'none';
          });
        });
        return;
      }
    }
    suggestionsMount.style.display = 'none';
  });

  // Save handler
  backdrop.querySelector('#btn-save-reg-crop')?.addEventListener('click', () => {
    const medName = nameInput.value.trim();
    const strength = strengthInput.value.trim();

    if (!medName) {
      alert('Please enter a medication name before saving.');
      nameInput.focus();
      return;
    }

    const selectedSlots: TimeSlot[] = [];
    backdrop.querySelectorAll('.reg-crop-slot:checked').forEach(cb => {
      selectedSlots.push((cb as HTMLInputElement).value as TimeSlot);
    });

    const newDraft: PrescriptionMedicationDraft = {
      id: generateLocalId('draft'),
      sourceSnippet: `Selected region crop (${bbox.width}x${bbox.height}px)`,
      name: medName,
      genericName: null,
      strength: strength || null,
      doseQuantity: doseQtyInput.value.trim() || '1 tablet',
      dosageForm: formSelect.value,
      frequency: freqSelect.value,
      scheduledTimes: null,
      timeSlots: selectedSlots.length > 0 ? selectedSlots : ['morning'],
      duration: null,
      instructions: instructionsInput.value.trim() || null,
      rxCui: null,
      prescribedBy: null,
      fieldStatuses: {
        name: 'user_confirmed',
        strength: strength ? 'user_confirmed' : 'uncertain',
        doseQuantity: 'user_confirmed',
        dosageForm: 'user_confirmed',
        frequency: 'user_confirmed',
        schedule: 'user_confirmed'
      },
      verificationStatus: 'user_confirmed',
      boundingBox: bbox,
      isExcluded: false
    };

    onSave(newDraft);
    close();
  });
}

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
        <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
          <button type="button" class="btn btn-secondary btn-sm" id="btn-toggle-diagnostics" title="Inspect OCR layout regions and candidate acceptance/rejection diagnostics">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
            </svg>
            <span>Diagnostics</span>
          </button>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-retake-header" title="Retake or choose another prescription image">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <polyline points="23 4 23 10 17 10"></polyline>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
            </svg>
            <span>Retake Scan</span>
          </button>
          <button type="button" class="rx-modal-close-btn" id="btn-close-review" aria-label="Close prescription review">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
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
            <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
              <button type="button" class="btn btn-secondary btn-sm" id="btn-zoom-out" title="Zoom out document" aria-label="Zoom out">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              </button>
              <span id="zoom-label" style="font-size: 0.75rem; font-family: monospace; min-width: 44px; text-align: center;">100%</span>
              <button type="button" class="btn btn-secondary btn-sm" id="btn-zoom-in" title="Zoom in document" aria-label="Zoom in">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              </button>
              <button type="button" class="btn btn-secondary btn-sm" id="btn-zoom-reset" title="Reset zoom to fit">Reset</button>

              <button type="button" class="btn btn-secondary btn-sm" id="btn-select-region" title="Select and crop a handwritten medication region from the prescription image">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" stroke-dasharray="3 3"></rect>
                </svg>
                <span>Select Region</span>
              </button>
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
              <div class="rx-selection-marquee" id="selection-marquee" style="display: none;"></div>
              <div class="rx-region-instructions-toast" id="region-toast" style="display: none;">
                <span>Click and drag over a handwritten medication entry to crop &amp; recognize</span>
              </div>
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

  const canvasStage = modalBackdrop.querySelector('#canvas-stage') as HTMLElement;
  const selectRegionBtn = modalBackdrop.querySelector('#btn-select-region') as HTMLButtonElement;
  const selectionMarquee = modalBackdrop.querySelector('#selection-marquee') as HTMLElement;
  const regionToast = modalBackdrop.querySelector('#region-toast') as HTMLElement;

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

  modalBackdrop.querySelector('#btn-retake-header')?.addEventListener('click', () => {
    if (confirm('Retake or choose another prescription image? Any unimported review changes will be discarded.')) {
      cleanup();
      openPrescriptionUploadModal(onComplete);
    }
  });

  modalBackdrop.querySelector('#btn-toggle-diagnostics')?.addEventListener('click', () => {
    openDiagnosticsModal(session.diagnostics);
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

  // Region-assisted selection state & handlers
  let isSelectingRegion = false;
  let isMarqueeActive = false;
  let startClientX = 0;
  let startClientY = 0;

  const toggleRegionSelection = (force?: boolean) => {
    isSelectingRegion = typeof force === 'boolean' ? force : !isSelectingRegion;
    if (isSelectingRegion) {
      canvasStage.classList.add('is-selecting-mode');
      selectRegionBtn?.classList.remove('btn-secondary');
      selectRegionBtn?.classList.add('btn-primary');
      if (regionToast) regionToast.style.display = 'flex';
      activeMobileTab = 'doc';
      updateMobileTabs();
    } else {
      canvasStage.classList.remove('is-selecting-mode');
      selectRegionBtn?.classList.remove('btn-primary');
      selectRegionBtn?.classList.add('btn-secondary');
      if (regionToast) regionToast.style.display = 'none';
      if (selectionMarquee) selectionMarquee.style.display = 'none';
      isMarqueeActive = false;
    }
  };

  selectRegionBtn?.addEventListener('click', () => toggleRegionSelection());

  canvasStage.addEventListener('mousedown', (e: MouseEvent) => {
    if (!isSelectingRegion) return;
    isMarqueeActive = true;
    const rect = canvasStage.getBoundingClientRect();
    startClientX = e.clientX - rect.left;
    startClientY = e.clientY - rect.top;
    if (selectionMarquee) {
      selectionMarquee.style.display = 'block';
      selectionMarquee.style.left = `${startClientX}px`;
      selectionMarquee.style.top = `${startClientY}px`;
      selectionMarquee.style.width = '0px';
      selectionMarquee.style.height = '0px';
    }
  });

  canvasStage.addEventListener('mousemove', (e: MouseEvent) => {
    if (!isSelectingRegion || !isMarqueeActive || !selectionMarquee) return;
    const rect = canvasStage.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    const left = Math.min(startClientX, currentX);
    const top = Math.min(startClientY, currentY);
    const width = Math.abs(currentX - startClientX);
    const height = Math.abs(currentY - startClientY);

    selectionMarquee.style.left = `${left}px`;
    selectionMarquee.style.top = `${top}px`;
    selectionMarquee.style.width = `${width}px`;
    selectionMarquee.style.height = `${height}px`;
  });

  canvasStage.addEventListener('mouseup', (e: MouseEvent) => {
    if (!isSelectingRegion || !isMarqueeActive) return;
    isMarqueeActive = false;
    const rect = canvasStage.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    const left = Math.min(startClientX, currentX);
    const top = Math.min(startClientY, currentY);
    const width = Math.abs(currentX - startClientX);
    const height = Math.abs(currentY - startClientY);

    toggleRegionSelection(false);

    if (width >= 20 && height >= 15 && docImg.naturalWidth && docImg.clientWidth) {
      const scaleX = docImg.naturalWidth / docImg.clientWidth;
      const scaleY = docImg.naturalHeight / docImg.clientHeight;

      const naturalX = Math.round(left * scaleX);
      const naturalY = Math.round(top * scaleY);
      const naturalW = Math.round(width * scaleX);
      const naturalH = Math.round(height * scaleY);

      const offCanvas = document.createElement('canvas');
      offCanvas.width = naturalW;
      offCanvas.height = naturalH;
      const ctx = offCanvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(docImg, naturalX, naturalY, naturalW, naturalH, 0, 0, naturalW, naturalH);
        const cropDataUrl = offCanvas.toDataURL('image/png');
        openRegionTranscriptionDialog(
          cropDataUrl,
          { x: naturalX, y: naturalY, width: naturalW, height: naturalH, page: currentPage },
          (newDraft) => {
            session.drafts.push(newDraft);
            selectedDraftId = newDraft.id;
            activeMobileTab = 'meds';
            updateMobileTabs();
            renderCandidates();
            updateHighlightBox();
          }
        );
      }
    }
  });

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
        <div class="rx-empty-state">
          <div class="rx-empty-state-icon" aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <circle cx="12" cy="14" r="3"></circle>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
          </div>
          <h3>Handwriting Could Not Be Recognized</h3>
          <p style="max-width: 480px; margin: 0.5rem auto 1rem; color: var(--text-muted); font-size: 0.875rem; line-height: 1.5;">
            CareDose could not confidently read the handwritten medication information. You can select a medication region, enter the details manually, or confirm unclear information with your pharmacist.
          </p>

          ${session.diagnostics?.stageFailureSummary ? `
            <div class="rx-notice-banner notice-caution" style="text-align: left; font-size: 0.8125rem; margin-bottom: 0.5rem;">
              <strong>Diagnostic Status:</strong> ${escapeHtml(session.diagnostics.stageFailureSummary)}
            </div>
          ` : ''}

          <div class="rx-empty-state-actions">
            <button type="button" class="btn btn-primary" id="btn-empty-select-region">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" stroke-dasharray="3 3"></rect>
              </svg>
              <span>Select Medication Region</span>
            </button>
            <button type="button" class="btn btn-secondary" id="btn-empty-add-manual">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              <span>Enter Manually</span>
            </button>
            <button type="button" class="btn btn-secondary" id="btn-empty-retake">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <polyline points="23 4 23 10 17 10"></polyline>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
              </svg>
              <span>Replace Image / Retake</span>
            </button>
            <button type="button" class="btn btn-secondary" id="btn-empty-view-diag">
              <span>View Diagnostics</span>
            </button>
            <button type="button" class="btn btn-link" id="btn-empty-cancel" style="color: var(--text-muted); font-size: 0.875rem;">
              Cancel
            </button>
          </div>
        </div>
      `;

      candidatesMount.querySelector('#btn-empty-select-region')?.addEventListener('click', () => {
        toggleRegionSelection(true);
      });
      candidatesMount.querySelector('#btn-empty-retake')?.addEventListener('click', () => {
        cleanup();
        openPrescriptionUploadModal(onComplete);
      });
      candidatesMount.querySelector('#btn-empty-add-manual')?.addEventListener('click', () => {
        addManualCandidate();
      });
      candidatesMount.querySelector('#btn-empty-view-diag')?.addEventListener('click', () => {
        openDiagnosticsModal(session.diagnostics);
      });
      candidatesMount.querySelector('#btn-empty-cancel')?.addEventListener('click', () => {
        cleanup();
      });
      updateFooter();
      return;
    }

    candidatesMount.innerHTML = session.drafts.map((draft, idx) => {
      const isSelected = draft.id === selectedDraftId;
      const isExcluded = !!draft.isExcluded;

      const validation = validateDraftForImport(draft);

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
              <button type="button" class="btn btn-secondary btn-sm btn-delete-candidate" data-id="${draft.id}" title="Remove this candidate" aria-label="Remove candidate #${idx + 1}">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
                <span>Delete</span>
              </button>
            </div>
          </div>

          ${isExcluded ? `
            <div style="padding: 0.75rem 1.25rem; font-size: 0.8125rem; color: var(--text-muted);">
              This candidate is excluded and will NOT be imported into CareDose.
            </div>
          ` : `
            <div class="rx-card-body">
              ${!validation.isSafeToImport ? `
                <div class="rx-notice-banner notice-caution" style="padding: 0.625rem 0.75rem; font-size: 0.8125rem;">
                  <div>
                    <strong>Verification Required Before Import:</strong>
                    ${validation.blockingReasons.map(r => `
                      <div>• ${escapeHtml(r)}</div>
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

    // Delete candidate
    candidatesMount.querySelectorAll('.btn-delete-candidate').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = (e.currentTarget as HTMLElement).dataset.id!;
        if (confirm('Remove this medication candidate?')) {
          session.drafts = session.drafts.filter(d => d.id !== id);
          if (selectedDraftId === id) {
            selectedDraftId = session.drafts[0]?.id || null;
          }
          renderCandidates();
          updateHighlightBox();
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
