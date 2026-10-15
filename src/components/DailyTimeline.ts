import { medStore } from '../store/medStore';
import type { TimeSlot } from '../types';
import { createPillBadgeHTML } from './PillBadge';
import { getUpcomingDoseGroup, formatTimeForDisplay } from '../engine/reminderScheduler';

interface SlotConfig {
  key: TimeSlot;
  label: string;
  defaultTime: string;
  iconSvg: string;
}

const SLOTS: SlotConfig[] = [
  {
    key: 'morning',
    label: 'Morning',
    defaultTime: '08:00',
    iconSvg: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>`
  },
  {
    key: 'midday',
    label: 'Midday / Lunch',
    defaultTime: '13:00',
    iconSvg: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`
  },
  {
    key: 'evening',
    label: 'Evening / Dinner',
    defaultTime: '18:30',
    iconSvg: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M17 18a5 5 0 0 0-10 0"/><line x1="12" y1="2" x2="12" y2="9"/><line x1="4.22" y1="10.22" x2="5.64" y2="11.64"/><line x1="1" y1="18" x2="3" y2="18"/><line x1="21" y1="18" x2="23" y2="18"/><line x1="18.36" y1="11.64" x2="19.78" y2="10.22"/><line x1="23" y1="22" x2="1" y2="22"/></svg>`
  },
  {
    key: 'bedtime',
    label: 'Bedtime',
    defaultTime: '22:00',
    iconSvg: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`
  }
];

export function renderDailyTimeline(container: HTMLElement): void {
  const activeMeds = medStore.getActiveMedications();
  const dailyLog = medStore.getDailyLog();
  const reminderPrefs = medStore.getReminderPreferences();
  const slotTimes = reminderPrefs.customSlotTimes;

  let totalDoses = 0;
  let takenDoses = 0;

  SLOTS.forEach(slot => {
    const medsInSlot = activeMeds.filter(m => m.timeSlots.includes(slot.key));
    totalDoses += medsInSlot.length;
    medsInSlot.forEach(m => {
      const record = dailyLog.doses[`${m.id}_${slot.key}`];
      if (record?.taken) takenDoses++;
    });
  });

  const percentage = totalDoses > 0 ? Math.round((takenDoses / totalDoses) * 100) : 0;
  const isAllComplete = totalDoses > 0 && takenDoses === totalDoses;

  // Calculate upcoming dose group
  const upcomingInfo = getUpcomingDoseGroup(activeMeds, dailyLog, slotTimes, new Date());

  const slotsHTML = SLOTS.map(slot => {
    const medsInSlot = activeMeds.filter(m => m.timeSlots.includes(slot.key));
    const timeDisplay = formatTimeForDisplay(slotTimes[slot.key] || slot.defaultTime);
    
    if (medsInSlot.length === 0) {
      return `
        <section class="timeline-slot empty-slot" aria-labelledby="slot-heading-${slot.key}">
          <div class="slot-header compact">
            <div class="slot-title-wrap">
              <span class="slot-icon">${slot.iconSvg}</span>
              <div>
                <h3 id="slot-heading-${slot.key}" class="slot-heading">${slot.label}</h3>
                <span class="slot-time">${timeDisplay}</span>
              </div>
            </div>
            <span class="slot-count badge">0 Scheduled</span>
          </div>
        </section>
      `;
    }

    const medCardsHTML = medsInSlot.map(med => {
      const doseKey = `${med.id}_${slot.key}`;
      const record = dailyLog.doses[doseKey];
      const isTaken = !!record?.taken;

      return `
        <article class="dose-card ${isTaken ? 'is-taken' : ''}" data-med-id="${med.id}" data-slot="${slot.key}">
          <div class="dose-card-main">
            <div class="dose-pill-visual" aria-hidden="true">
              ${createPillBadgeHTML(med.pillVisual, 'large')}
            </div>
            <div class="dose-details">
              <div class="dose-name-row">
                <h4 class="dose-name">${med.name}</h4>
                <span class="dose-strength">${med.dosage}</span>
                <span class="dose-form">${med.form}</span>
              </div>
              ${med.genericName ? `<p class="dose-generic">Active Ingredient: ${med.genericName}</p>` : ''}
              <div class="dose-instructions-row">
                ${med.withFood ? `<span class="badge badge-caution">Take with food</span>` : `<span class="badge">Take with water</span>`}
                <span class="dose-instruction-text">${med.instructions}</span>
              </div>
            </div>
          </div>

          <div class="dose-action-zone">
            ${isTaken ? `
              <div class="taken-status-box">
                <span class="taken-stamp">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  <span>Recorded at ${record.timestamp || 'Today'}</span>
                </span>
                <button type="button" class="btn btn-secondary btn-sm btn-undo-dose" data-med-id="${med.id}" data-slot="${slot.key}" aria-label="Undo recorded dose for ${med.name}">
                  Undo
                </button>
              </div>
            ` : `
              <button type="button" class="btn btn-primary btn-take-dose" data-med-id="${med.id}" data-slot="${slot.key}" aria-label="Mark ${med.name} ${med.dosage} as taken">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                <span>Mark as Taken</span>
              </button>
            `}
          </div>
        </article>
      `;
    }).join('');

    return `
      <section class="timeline-slot" aria-labelledby="slot-heading-${slot.key}">
        <div class="slot-header">
          <div class="slot-title-wrap">
            <span class="slot-icon">${slot.iconSvg}</span>
            <div>
              <h3 id="slot-heading-${slot.key}" class="slot-heading">${slot.label}</h3>
              <span class="slot-time">Target Time: ${timeDisplay}</span>
            </div>
          </div>
          <span class="slot-count badge">${medsInSlot.length} Medication${medsInSlot.length > 1 ? 's' : ''}</span>
        </div>
        <div class="slot-med-list">
          ${medCardsHTML}
        </div>
      </section>
    `;
  }).join('');

  container.innerHTML = `
    <div class="daily-timeline-wrap">
      <!-- Upcoming Dose Group Highlight -->
      ${upcomingInfo ? `
        <section class="upcoming-dose-card card" aria-label="Upcoming scheduled dose">
          <div class="upcoming-header">
            <div class="upcoming-badge-group">
              <span class="badge ${upcomingInfo.allRecorded ? 'badge-safe' : 'badge-caution'}">
                ${upcomingInfo.allRecorded ? 'Current Window Recorded' : 'Next Scheduled Window'}
              </span>
              <span class="upcoming-time-stamp">${upcomingInfo.slotLabel} — ${upcomingInfo.timeString}</span>
            </div>
            <span class="upcoming-count-tag">
              ${upcomingInfo.recordedCount} of ${upcomingInfo.totalCount} logged
            </span>
          </div>
          <div class="upcoming-meds-summary">
            <strong>Medications in this window:</strong>
            ${upcomingInfo.medications.map(m => `
              <span class="upcoming-med-chip">${m.name} (${m.dosage})</span>
            `).join(' ')}
          </div>
        </section>
      ` : ''}

      <!-- Daily Adherence Summary Bar -->
      <section class="adherence-card card" aria-label="Daily medication progress summary">
        <div class="adherence-header">
          <div>
            <span class="badge ${isAllComplete ? 'badge-safe' : 'badge-caution'}">
              ${isAllComplete ? 'All Doses Recorded for Today' : 'Daily Adherence Log'}
            </span>
            <h2 class="adherence-title">
              ${takenDoses} of ${totalDoses} doses recorded today (${percentage}%)
            </h2>
            <p class="adherence-disclaimer">
              Recorded doses indicate patient-logged adherence and do not replace clinical verification.
            </p>
          </div>
          <div class="adherence-controls">
            ${takenDoses > 0 ? `
              <button type="button" class="btn btn-secondary btn-sm" id="btn-reset-doses" title="Reset all checked items for today">
                Reset Today's Checkmarks
              </button>
            ` : ''}
          </div>
        </div>

        <div class="adherence-bar-track" role="progressbar" aria-valuenow="${percentage}" aria-valuemin="0" aria-valuemax="100" aria-label="Medication adherence percentage">
          <div class="adherence-bar-fill" style="width: ${percentage}%"></div>
        </div>
      </section>

      <!-- Time Slot Buckets -->
      <div class="slots-container">
        ${slotsHTML}
      </div>
    </div>
  `;

  // Attach Take Dose Handlers
  container.querySelectorAll('.btn-take-dose').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const target = e.currentTarget as HTMLElement;
      const medId = target.dataset.medId!;
      const slot = target.dataset.slot as TimeSlot;
      medStore.recordDose(medId, slot, true);
    });
  });

  // Attach Undo Handlers
  container.querySelectorAll('.btn-undo-dose').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const target = e.currentTarget as HTMLElement;
      const medId = target.dataset.medId!;
      const slot = target.dataset.slot as TimeSlot;
      medStore.recordDose(medId, slot, false);
    });
  });

  // Reset Today's Checkmarks
  container.querySelector('#btn-reset-doses')?.addEventListener('click', () => {
    if (confirm("Reset all checkmarks for today's doses? This will clear today's logged status.")) {
      const active = medStore.getActiveMedications();
      active.forEach(m => {
        m.timeSlots.forEach(s => {
          medStore.recordDose(m.id, s, false);
        });
      });
    }
  });
}
