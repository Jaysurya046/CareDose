import './style.css';
import { medStore } from './store/medStore';
import { renderHeader } from './components/Header';
import { renderDailyTimeline } from './components/DailyTimeline';
import { renderMedicationCabinet } from './components/MedicationCabinet';
import { renderFridgeSheet } from './components/FridgeSheet';
import { initReminderCoordinator } from './engine/reminderCoordinator';

// Initialize application state
let currentTab: string = 'timeline';

const headerMount = document.getElementById('header-mount')!;
const reminderMount = document.getElementById('reminder-mount')!;
const viewMount = document.getElementById('view-mount')!;

function applyInitialPreferences(): void {
  const prefs = medStore.getPreferences();
  if (prefs.fontScale) {
    document.documentElement.setAttribute('data-scale', prefs.fontScale);
  }
  if (prefs.highContrast) {
    document.documentElement.setAttribute('data-contrast', 'high');
  }
}

function renderCurrentView(): void {
  renderHeader(headerMount, currentTab, (newTab) => {
    currentTab = newTab;
    renderCurrentView();
  });

  if (currentTab === 'timeline') {
    renderDailyTimeline(viewMount);
  } else if (currentTab === 'cabinet') {
    renderMedicationCabinet(viewMount);
  } else if (currentTab === 'fridge') {
    renderFridgeSheet(viewMount);
  }
}

// Initial mount
applyInitialPreferences();
renderCurrentView();

// Initialize proactive in-app reminder system and visibility listeners
initReminderCoordinator(reminderMount);

// Subscribe to store updates for reactive re-rendering
medStore.subscribe(() => {
  renderCurrentView();
});

// Keyboard shortcuts for quick navigation
window.addEventListener('keydown', (e) => {
  if (e.altKey && e.key === '1') {
    currentTab = 'timeline';
    renderCurrentView();
  } else if (e.altKey && e.key === '2') {
    currentTab = 'cabinet';
    renderCurrentView();
  } else if (e.altKey && e.key === '3') {
    currentTab = 'fridge';
    renderCurrentView();
  }
});
