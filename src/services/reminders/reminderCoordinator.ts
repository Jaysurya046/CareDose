import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';
import { medStore } from '../../store/medStore';
import type { ReminderAdapter, NotificationStatusInfo, NotificationPermissionState } from './reminderAdapter';
import { WebReminderAdapter } from './webReminderAdapter';
import { NativeReminderAdapter } from './nativeReminderAdapter';
import { calculateDueReminders } from '../../engine/reminderScheduler';
import { renderReminderBanner } from '../../components/ReminderBanner';

class ReminderCoordinator {
  private adapter: ReminderAdapter;
  private isNative: boolean;
  private initialized = false;
  private bannerMount: HTMLElement | null = null;
  private webCheckInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.isNative = Capacitor.isNativePlatform();
    this.adapter = this.isNative ? new NativeReminderAdapter() : new WebReminderAdapter();
  }

  public getAdapter(): ReminderAdapter {
    return this.adapter;
  }

  public async getStatus(): Promise<NotificationStatusInfo> {
    return this.adapter.getStatusInfo();
  }

  public async requestPermission(): Promise<NotificationPermissionState> {
    const res = await this.adapter.requestPermission();
    if (res === 'granted') {
      await this.rescheduleAll();
    }
    return res;
  }

  public async sendTestNotification(): Promise<boolean> {
    const prefs = medStore.getReminderPreferences();
    return this.adapter.sendTestNotification(prefs.includeMedNames);
  }

  /**
   * Reschedules alarms across the active adapter.
   */
  public async rescheduleAll(): Promise<void> {
    const meds = medStore.getMedications();
    const prefs = medStore.getReminderPreferences();

    if (!prefs.enabled) {
      await this.adapter.cancelAllReminders();
      return;
    }

    await this.adapter.scheduleReminders(meds, prefs.customSlotTimes, {
      includeMedNames: prefs.includeMedNames,
      defaultSnoozeMinutes: prefs.defaultSnoozeMinutes
    });
  }

  /**
   * Evaluates due reminders for in-app banner and web notification delivery.
   */
  public checkAndRenderInAppAlerts(): void {
    if (!this.bannerMount) return;

    const meds = medStore.getActiveMedications();
    const log = medStore.getDailyLog();
    const prefs = medStore.getReminderPreferences();
    const delivery = medStore.getReminderDeliveryState();

    const dueEvents = calculateDueReminders(meds, log, prefs, delivery, new Date());
    renderReminderBanner(this.bannerMount, dueEvents);
  }

  /**
   * Initializes the unified coordinator, lifecycle listeners, and storage subscriptions.
   */
  public initialize(bannerMount: HTMLElement): () => void {
    if (this.initialized) return () => {};
    this.initialized = true;
    this.bannerMount = bannerMount;

    // 1. Initial check and schedule
    this.checkAndRenderInAppAlerts();
    this.rescheduleAll();

    // 2. React to medStore mutations (medication added, edited, paused, deleted, dose recorded)
    let lastMedsJson = JSON.stringify(medStore.getMedications());
    let lastPrefsJson = JSON.stringify(medStore.getReminderPreferences());

    const unsubscribeStore = medStore.subscribe(() => {
      this.checkAndRenderInAppAlerts();

      const currentMedsJson = JSON.stringify(medStore.getMedications());
      const currentPrefsJson = JSON.stringify(medStore.getReminderPreferences());

      // If medication schedules or preferences changed, recalculate alarms
      if (currentMedsJson !== lastMedsJson || currentPrefsJson !== lastPrefsJson) {
        lastMedsJson = currentMedsJson;
        lastPrefsJson = currentPrefsJson;
        this.rescheduleAll();
      }
    });

    // 3. Android App Lifecycle listener (@capacitor/app)
    if (this.isNative) {
      App.addListener('appStateChange', (state) => {
        if (state.isActive) {
          // App resumed from background: refresh in-app alerts and reconcile reminders
          this.checkAndRenderInAppAlerts();
          this.rescheduleAll();
        }
      });

      // Handle notification action clicks
      LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
        this.checkAndRenderInAppAlerts();
        // If snooze action was triggered
        if (action.actionId === 'snooze') {
          const prefs = medStore.getReminderPreferences();
          this.adapter.snoozeReminder('local_action', prefs.defaultSnoozeMinutes);
        }
      });
    }

    // 4. Web browser ticker and visibility listeners
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        this.checkAndRenderInAppAlerts();
        if (this.isNative) {
          this.rescheduleAll();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);

    // 30-second interval ticker for web in-app banners
    this.webCheckInterval = setInterval(() => {
      this.checkAndRenderInAppAlerts();
    }, 30000);

    return () => {
      unsubscribeStore();
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
      if (this.webCheckInterval) clearInterval(this.webCheckInterval);
    };
  }
}

export const reminderCoordinator = new ReminderCoordinator();
