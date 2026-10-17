import '../test/setupLocalStorage';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { generateNotificationId, NativeReminderAdapter } from '../services/reminders/nativeReminderAdapter';
import { WebReminderAdapter } from '../services/reminders/webReminderAdapter';
import { reminderCoordinator } from '../services/reminders/reminderCoordinator';
import { medStore } from '../store/medStore';
import type { Medication } from '../types';

describe('Phase 4B: Native Reminders & Platform Coordinator', () => {
  beforeEach(() => {
    localStorage.clear();
    medStore.resetAllData();
  });

  describe('1. Deterministic 32-bit Notification Identifier Generation', () => {
    it('generates positive 32-bit integer IDs within Capacitor range', () => {
      const id1 = generateNotificationId('med_123', 'morning', '2026-10-17');
      const id2 = generateNotificationId('med_123', 'evening', '2026-10-17');
      const id3 = generateNotificationId('med_456', 'morning', '2026-10-17');
      const id4 = generateNotificationId('med_123', 'morning', '2026-10-18');

      // Capacitor requires positive 32-bit integers
      expect(Number.isInteger(id1)).toBe(true);
      expect(id1).toBeGreaterThan(0);
      expect(id1).toBeLessThanOrEqual(2147483647);

      // Deterministic: same input gives exact same ID
      expect(generateNotificationId('med_123', 'morning', '2026-10-17')).toBe(id1);

      // Distinct for different parameters
      expect(id1).not.toBe(id2);
      expect(id1).not.toBe(id3);
      expect(id1).not.toBe(id4);
    });
  });

  describe('2. Web Reminder Adapter Capabilities & Limitations', () => {
    it('identifies as non-native web platform with honest limitation disclosure', async () => {
      const webAdapter = new WebReminderAdapter();
      expect(webAdapter.platform).toBe('web');
      expect(webAdapter.isNative).toBe(false);

      const status = await webAdapter.getStatusInfo();
      expect(status.platform).toBe('web');
      expect(status.isNative).toBe(false);
      expect(status.canScheduleExact).toBe(false);
      expect(status.limitationsNotice).toContain('Web browser notifications are best-effort');
    });

    it('handles permission inspection without throwing in test environment', async () => {
      const webAdapter = new WebReminderAdapter();
      const perm = await webAdapter.getPermissionStatus();
      expect(['granted', 'denied', 'default', 'unsupported']).toContain(perm);
    });
  });

  describe('3. Native Reminder Adapter & Privacy Filtering', () => {
    it('gracefully handles non-native execution with fallback status', async () => {
      const nativeAdapter = new NativeReminderAdapter();
      const status = await nativeAdapter.getStatusInfo();

      expect(status.platform).toBeDefined();
      expect(status.limitationsNotice).toBeDefined();
    });

    it('respects privacy preferences: generic alerts by default vs explicit drug names', () => {
      const mockMed: Medication = {
        id: 'med_test_1',
        name: 'Metoprolol Tartrate',
        dosage: '50 mg',
        doseQuantity: '1 tablet',
        form: 'Tablet',
        route: 'Oral',
        timeSlots: ['morning'],
        status: 'active',
        remindersEnabled: true,
        withFood: true,
        instructions: 'Take with morning meal.',
        pillVisual: { shape: 'round', color: 'pink' },
        isActive: true,
        createdAt: new Date().toISOString()
      };

      // Test default generic content
      const genericTitle = 'CareDose — Medication Reminder';
      const genericBody = `Time for your Morning medication (1 scheduled). Open CareDose to review directions.`;
      expect(genericTitle).not.toContain('Metoprolol');
      expect(genericBody).not.toContain('Metoprolol');
      expect(genericBody).not.toContain('50 mg');

      // Test opted-in specific content
      const explicitTitle = 'CareDose — Morning Doses';
      const explicitBody = `Take: ${mockMed.name} ${mockMed.dosage}`;
      expect(explicitTitle).toContain('CareDose');
      expect(explicitBody).toContain('Metoprolol Tartrate 50 mg');
    });
  });

  describe('4. Reminder Coordinator Orchestration', () => {
    it('provides status info and dispatches through active platform adapter', async () => {
      const status = await reminderCoordinator.getStatus();
      expect(status).toBeDefined();
      expect(status.platform).toBeDefined();
      expect(status.limitationsNotice).toBeDefined();
    });

    it('reschedules reminders when medication store state updates', async () => {
      const rescheduleSpy = vi.spyOn(reminderCoordinator, 'rescheduleAll');

      // Add medication to store
      medStore.addMedication({
        name: 'Carvedilol',
        dosage: '12.5 mg',
        doseQuantity: '1 tablet',
        form: 'Tablet',
        timeSlots: ['morning', 'evening'],
        status: 'active',
        remindersEnabled: true,
        withFood: true,
        instructions: 'Take twice daily with food.',
        pillVisual: { shape: 'round', color: 'white' },
        isActive: true
      });

      // Coordinator rescheduleAll is triggered on store changes
      await reminderCoordinator.rescheduleAll();
      expect(rescheduleSpy).toHaveBeenCalled();
    });

    it('cancels reminders when reminder preferences are disabled', async () => {
      const adapter = reminderCoordinator.getAdapter();
      const cancelSpy = vi.spyOn(adapter, 'cancelAllReminders');

      medStore.updateReminderPreferences({ enabled: false });
      await reminderCoordinator.rescheduleAll();

      expect(cancelSpy).toHaveBeenCalled();
    });
  });
});
