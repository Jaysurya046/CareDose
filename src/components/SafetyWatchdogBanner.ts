import { medStore } from '../store/medStore';
import { evaluateSafetyProfile } from '../engine/watchdog';

/**
 * Renders the interaction safety status banner with calm, factual clinical warnings.
 * Explicitly distinguishes known alerts from absence of evidence in the offline dataset.
 */
export function renderSafetyWatchdogBanner(
  container: HTMLElement,
  onQuickAddMed?: (name: string, generic: string) => void
): void {
  const activeMeds = medStore.getActiveMedications();
  const evaluation = evaluateSafetyProfile(activeMeds);
  const alerts = evaluation.alerts;

  if (evaluation.status === 'insufficient_medications') {
    container.innerHTML = `
      <div class="safety-banner safe no-print">
        <div class="safety-banner-icon safe-icon" aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <path d="m9 12 2 2 4-4"/>
          </svg>
        </div>
        <div class="safety-banner-content">
          <div class="safety-title-row">
            <h3 class="safety-title">Interaction Watchdog Active</h3>
            <span class="badge badge-safe">Monitoring ${activeMeds.length} Active Medication</span>
          </div>
          <p class="safety-desc">Add at least two medications to evaluate potential drug-drug interactions against the curated reference safety matrix.</p>
        </div>
      </div>
    `;
    return;
  }

  if (evaluation.status === 'none_found_in_dataset') {
    container.innerHTML = `
      <div class="safety-banner safe no-print">
        <div class="safety-banner-icon safe-icon" aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <path d="m9 12 2 2 4-4"/>
          </svg>
        </div>
        <div class="safety-banner-content">
          <div class="safety-title-row">
            <h3 class="safety-title">No Known Interactions in Local Safety Dataset</h3>
            <span class="badge badge-safe">${activeMeds.length} Meds Assessed</span>
          </div>
          <p class="safety-desc">No interactions were identified in the offline clinical dataset. <em>Note: Lack of an alert does not guarantee safety.</em> Always confirm regimens with your doctor or pharmacist.</p>
        </div>
        <div class="safety-banner-action">
          <button type="button" class="btn btn-secondary btn-sm" id="btn-demo-conflict" title="Add a conflicting medication to demo the safety watchdog">
            <span>Demo Conflict Test</span>
          </button>
        </div>
      </div>
    `;

    const demoBtn = container.querySelector('#btn-demo-conflict');
    demoBtn?.addEventListener('click', () => {
      if (onQuickAddMed) {
        onQuickAddMed('Potassium Chloride', 'Potassium Supplement');
      } else {
        medStore.addMedication({
          name: 'Potassium Chloride',
          genericName: 'Potassium Supplement',
          dosage: '20 mEq',
          form: 'Tablet',
          timeSlots: ['morning'],
          withFood: true,
          instructions: 'Take in the morning with a full meal.',
          pillVisual: { shape: 'round', color: 'yellow' },
          prescribedBy: 'Over-the-counter',
          isActive: true
        });
      }
    });
    return;
  }

  // Active interaction alerts detected
  const hasCritical = alerts.some(a => a.severity === 'critical');
  const bannerClass = hasCritical ? 'critical' : 'caution';
  const iconColor = hasCritical ? 'var(--status-critical-text)' : 'var(--status-caution-text)';

  const alertsHTML = alerts.map((alert) => `
    <div class="alert-item ${alert.severity}">
      <div class="alert-item-header">
        <div class="alert-title-group">
          <span class="badge badge-${alert.severity}">${alert.severity.toUpperCase()}</span>
          <strong class="alert-item-title">${alert.title}</strong>
        </div>
        <div class="alert-drugs-tag">Between: <u>${alert.drugA}</u> &amp; <u>${alert.drugB}</u></div>
      </div>
      <p class="alert-item-desc">${alert.description}</p>
      <div class="alert-item-action">
        <strong>Recommended Clinical Action:</strong> ${alert.clinicalAction}
      </div>
    </div>
  `).join('');

  container.innerHTML = `
    <div class="safety-banner ${bannerClass} no-print" role="alert">
      <div class="safety-banner-icon ${bannerClass}-icon" aria-hidden="true">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2.5">
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      </div>
      <div class="safety-banner-content">
        <div class="safety-title-row">
          <h3 class="safety-title">${hasCritical ? 'Critical Drug-Drug Interaction Warning' : 'Medication Interaction Precaution'}</h3>
          <span class="badge badge-${hasCritical ? 'critical' : 'caution'}">${alerts.length} Potential Conflict${alerts.length > 1 ? 's' : ''} Identified</span>
        </div>
        <div class="alerts-list">
          ${alertsHTML}
        </div>
      </div>
    </div>
  `;
}
