import { medStore } from '../store/medStore';
import type { FontScale } from '../types';

export function renderHeader(container: HTMLElement, currentTab: string, onTabChange: (tab: string) => void) {
  const profile = medStore.getPatientProfile();
  const prefs = medStore.getPreferences();

  const todayStr = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  container.innerHTML = `
    <header class="app-header no-print">
      <div class="container header-container">
        <div class="header-brand-row">
          <div class="brand-group">
            <div class="brand-logo" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2v20M2 12h20"/>
                <circle cx="12" cy="12" r="9"/>
              </svg>
            </div>
            <div>
              <div class="brand-title-wrap">
                <span class="brand-title">CareDose</span>
                <span class="brand-tag">Patient Safety</span>
              </div>
              <p class="brand-subtitle">For ${profile.name} • ${todayStr}</p>
            </div>
          </div>

          <!-- Accessibility Controls -->
          <div class="accessibility-controls" role="region" aria-label="Accessibility options">
            <div class="font-scaler-group" title="Adjust text size">
              <span class="ctrl-label">Text:</span>
              <button type="button" class="ctrl-btn ${prefs.fontScale === 'standard' ? 'active' : ''}" data-scale="standard" aria-label="Standard text size">A</button>
              <button type="button" class="ctrl-btn ${prefs.fontScale === 'large' ? 'active' : ''}" data-scale="large" aria-label="Large text size">A+</button>
              <button type="button" class="ctrl-btn ${prefs.fontScale === 'xlarge' ? 'active' : ''}" data-scale="xlarge" aria-label="Extra large text size">A++</button>
            </div>

            <button type="button" id="contrast-toggle-btn" class="ctrl-btn contrast-btn ${prefs.highContrast ? 'active' : ''}" aria-label="Toggle High Contrast Mode">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 2a10 10 0 0 1 0 20z" fill="currentColor"/>
              </svg>
              <span>${prefs.highContrast ? 'High Contrast: ON' : 'High Contrast'}</span>
            </button>
          </div>
        </div>

        <!-- Navigation Tabs -->
        <nav class="tabs-nav" aria-label="Application sections">
          <button type="button" class="tab-btn ${currentTab === 'timeline' ? 'active' : ''}" data-tab="timeline">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            <span>Daily Pillbox</span>
          </button>

          <button type="button" class="tab-btn ${currentTab === 'cabinet' ? 'active' : ''}" data-tab="cabinet">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/>
              <path d="m8.5 8.5 7 7"/>
            </svg>
            <span>Medications & Safety</span>
          </button>

          <button type="button" class="tab-btn ${currentTab === 'fridge' ? 'active' : ''}" data-tab="fridge">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 6 2 18 2 18 9"/>
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
              <rect x="6" y="14" width="12" height="8"/>
            </svg>
            <span>Emergency Fridge Sheet</span>
          </button>
        </nav>
      </div>
    </header>
  `;

  // Attach Font Scaler Events
  container.querySelectorAll('.ctrl-btn[data-scale]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const target = e.currentTarget as HTMLElement;
      const scale = target.dataset.scale as FontScale;
      medStore.updatePreferences({ fontScale: scale });
      document.documentElement.setAttribute('data-scale', scale);
    });
  });

  // Attach Contrast Event
  const contrastBtn = container.querySelector('#contrast-toggle-btn');
  contrastBtn?.addEventListener('click', () => {
    const isContrast = !medStore.getPreferences().highContrast;
    medStore.updatePreferences({ highContrast: isContrast });
    if (isContrast) {
      document.documentElement.setAttribute('data-contrast', 'high');
    } else {
      document.documentElement.removeAttribute('data-contrast');
    }
  });

  // Attach Tab Events
  container.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const target = e.currentTarget as HTMLElement;
      const tab = target.dataset.tab!;
      onTabChange(tab);
    });
  });
}
