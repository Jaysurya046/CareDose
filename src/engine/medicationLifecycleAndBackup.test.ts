import '../test/setupLocalStorage';
import { describe, it, expect, beforeEach } from 'vitest';
import { medStore } from '../store/medStore';
import { isMedicationScheduledForDate, calculateDueReminders } from './reminderScheduler';
import { 
  validateBackupJSON, 
  exportAllDataAsJSON,
  runStorageMigrations,
  CURRENT_SCHEMA_VERSION,
  STORAGE_KEYS
} from '../storage/storage';

describe('Phase 4A: Medication Lifecycle, Scheduling & Backup/Restore', () => {
  beforeEach(() => {
    localStorage.clear();
    medStore.resetAllData();
  });

  describe('1. Fast Medication Creation and Editing', () => {
    it('creates multiple medications consecutively with distinct IDs and clean defaults', () => {
      const med1 = medStore.addMedication({
        name: 'Amlodipine',
        dosage: '5 mg',
        doseQuantity: '1 tablet',
        form: 'Tablet',
        route: 'Oral',
        frequency: 'Once daily',
        timeSlots: ['morning'],
        status: 'active',
        remindersEnabled: true,
        withFood: false,
        instructions: 'Take in morning.',
        pillVisual: { shape: 'round', color: 'white' },
        isActive: true
      });

      const med2 = medStore.addMedication({
        name: 'Metformin',
        dosage: '500 mg',
        doseQuantity: '1 tablet',
        form: 'Tablet',
        route: 'Oral',
        frequency: 'Twice daily',
        timeSlots: ['morning', 'evening'],
        status: 'active',
        remindersEnabled: true,
        withFood: true,
        instructions: 'Take with breakfast and dinner.',
        pillVisual: { shape: 'oval', color: 'white' },
        isActive: true
      });

      expect(med1.id).not.toBe(med2.id);
      expect(med1.name).toBe('Amlodipine');
      expect(med2.name).toBe('Metformin');
      expect(med1.doseQuantity).toBe('1 tablet');
      expect(med1.dosage).toBe('5 mg');

      const all = medStore.getMedications();
      expect(all.some(m => m.id === med1.id)).toBe(true);
      expect(all.some(m => m.id === med2.id)).toBe(true);
    });

    it('updates medication strength, directions, and custom times without clinical leakage', () => {
      const med = medStore.addMedication({
        name: 'Lisinopril',
        dosage: '10 mg',
        doseQuantity: '1 tablet',
        form: 'Tablet',
        route: 'Oral',
        frequency: 'Once daily',
        timeSlots: ['morning'],
        status: 'active',
        remindersEnabled: true,
        withFood: false,
        instructions: 'Take every morning.',
        pillVisual: { shape: 'round', color: 'yellow' },
        isActive: true
      });

      // Update clinical strength, dose count, and add exact custom clock time
      medStore.updateMedication(med.id, {
        dosage: '20 mg',
        doseQuantity: '2 tablets',
        customTimes: ['08:30', '20:30'],
        instructions: 'Take two tablets with water.'
      });

      const updated = medStore.getMedications().find(m => m.id === med.id);
      expect(updated).toBeDefined();
      expect(updated!.dosage).toBe('20 mg');
      expect(updated!.doseQuantity).toBe('2 tablets');
      expect(updated!.customTimes).toEqual(['08:30', '20:30']);
      expect(updated!.instructions).toBe('Take two tablets with water.');
    });
  });

  describe('2. Medication Lifecycle Semantics (Active, Paused, Completed, Discontinued)', () => {
    it('pauses and resumes medication, suppressing reminders when paused', () => {
      const med = medStore.addMedication({
        name: 'Hydrochlorothiazide',
        dosage: '25 mg',
        doseQuantity: '1 tablet',
        form: 'Tablet',
        timeSlots: ['morning'],
        status: 'active',
        remindersEnabled: true,
        withFood: false,
        instructions: 'Take in morning.',
        pillVisual: { shape: 'round', color: 'blue' },
        isActive: true
      });

      expect(med.status).toBe('active');
      expect(med.isActive).toBe(true);
      expect(isMedicationScheduledForDate(med, new Date())).toBe(true);

      // Pause treatment
      medStore.pauseMedication(med.id);
      const paused = medStore.getMedications().find(m => m.id === med.id)!;
      expect(paused.status).toBe('paused');
      expect(paused.isActive).toBe(false);
      // Must not generate reminders or schedule doses
      expect(isMedicationScheduledForDate(paused, new Date())).toBe(false);

      // Resume treatment
      medStore.resumeMedication(med.id);
      const resumed = medStore.getMedications().find(m => m.id === med.id)!;
      expect(resumed.status).toBe('active');
      expect(resumed.isActive).toBe(true);
      expect(isMedicationScheduledForDate(resumed, new Date())).toBe(true);
    });

    it('completes medication course and halts reminders while preserving history', () => {
      const med = medStore.addMedication({
        name: 'Amoxicillin',
        dosage: '500 mg',
        doseQuantity: '1 capsule',
        form: 'Capsule',
        timeSlots: ['morning', 'midday', 'evening'],
        status: 'active',
        remindersEnabled: true,
        withFood: true,
        instructions: 'Take 3 times daily for 10 days.',
        pillVisual: { shape: 'capsule', color: 'pink' },
        isActive: true
      });

      // Record a dose before completing
      medStore.recordDose(med.id, 'morning', true);
      const logBefore = medStore.getDailyLog();
      expect(logBefore.doses[`${med.id}_morning`]?.taken).toBe(true);

      // Complete course
      medStore.completeMedication(med.id);
      const completed = medStore.getMedications().find(m => m.id === med.id)!;
      expect(completed.status).toBe('completed');
      expect(completed.isActive).toBe(false);
      expect(isMedicationScheduledForDate(completed, new Date())).toBe(false);

      // Verify dose log history is still preserved
      const logAfter = medStore.getDailyLog();
      expect(logAfter.doses[`${med.id}_morning`]?.taken).toBe(true);
    });

    it('discontinues medication with historical record integrity', () => {
      const med = medStore.addMedication({
        name: 'Simvastatin',
        dosage: '20 mg',
        form: 'Tablet',
        timeSlots: ['bedtime'],
        status: 'active',
        remindersEnabled: true,
        withFood: false,
        instructions: 'Take at night.',
        pillVisual: { shape: 'oval', color: 'yellow' },
        isActive: true
      });

      medStore.discontinueMedication(med.id);
      const discontinued = medStore.getMedications().find(m => m.id === med.id)!;
      expect(discontinued.status).toBe('discontinued');
      expect(discontinued.isActive).toBe(false);
      expect(isMedicationScheduledForDate(discontinued, new Date())).toBe(false);
    });
  });

  describe('3. As-Needed (PRN) Rules and Date/Weekday Filtering', () => {
    it('does not generate automatic scheduled reminders for PRN medications', () => {
      const prnMed = medStore.addMedication({
        name: 'Albuterol HFA',
        dosage: '90 mcg/actuation',
        doseQuantity: '2 puffs',
        form: 'Inhaler',
        frequency: 'As needed (PRN)',
        isPRN: true,
        timeSlots: ['morning'], // slots ignored when isPRN = true
        status: 'active',
        remindersEnabled: false,
        withFood: false,
        instructions: 'Inhale 2 puffs every 4-6 hours as needed for shortness of breath.',
        pillVisual: { shape: 'round', color: 'blue' },
        isActive: true
      });

      expect(isMedicationScheduledForDate(prnMed, new Date())).toBe(false);

      // Verify reminder scheduler does not return due reminders for this PRN med
      const due = calculateDueReminders(
        [prnMed],
        { date: '2026-10-17', doses: {} },
        { enabled: true, includeMedNames: true, defaultSnoozeMinutes: 10, customSlotTimes: { morning: '08:00', midday: '13:00', evening: '18:30', bedtime: '22:00' } },
        { lastDelivered: {}, snoozedUntil: {}, dismissed: {} },
        new Date('2026-10-17T08:05:00')
      );
      expect(due).toHaveLength(0);
    });

    it('respects startDate in the future and endDate in the past', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);
      const futureDateStr = futureDate.toISOString().slice(0, 10);

      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 5);
      const pastDateStr = pastDate.toISOString().slice(0, 10);

      const medFuture = medStore.addMedication({
        name: 'Future Med',
        dosage: '10 mg',
        form: 'Tablet',
        timeSlots: ['morning'],
        status: 'active',
        startDate: futureDateStr,
        remindersEnabled: true,
        withFood: false,
        instructions: 'Starts next week.',
        pillVisual: { shape: 'round', color: 'white' },
        isActive: true
      });

      const medPast = medStore.addMedication({
        name: 'Expired Med',
        dosage: '10 mg',
        form: 'Tablet',
        timeSlots: ['morning'],
        status: 'active',
        endDate: pastDateStr,
        remindersEnabled: true,
        withFood: false,
        instructions: 'Ended last week.',
        pillVisual: { shape: 'round', color: 'white' },
        isActive: true
      });

      const today = new Date();
      expect(isMedicationScheduledForDate(medFuture, today)).toBe(false);
      expect(isMedicationScheduledForDate(medPast, today)).toBe(false);
    });

    it('respects weekday schedule filters (e.g. only Mon/Wed/Fri)', () => {
      const mwfMed = medStore.addMedication({
        name: 'Methotrexate',
        dosage: '15 mg',
        form: 'Tablet',
        timeSlots: ['morning'],
        status: 'active',
        weekdays: [1, 3, 5], // Mon, Wed, Fri
        remindersEnabled: true,
        withFood: false,
        instructions: 'Take once on scheduled days.',
        pillVisual: { shape: 'round', color: 'yellow' },
        isActive: true
      });

      // Construct a Monday (day 1) and a Tuesday (day 2)
      const monday = new Date('2026-10-19T10:00:00'); // Oct 19, 2026 is Monday
      const tuesday = new Date('2026-10-20T10:00:00'); // Oct 20, 2026 is Tuesday

      expect(isMedicationScheduledForDate(mwfMed, monday)).toBe(true);
      expect(isMedicationScheduledForDate(mwfMed, tuesday)).toBe(false);
    });
  });

  describe('4. Schema Migration & Data Normalization', () => {
    it('migrates legacy v1 storage schema to v2 without data loss', () => {
      // Simulate raw v1 data in localStorage
      const v1Med = {
        id: 'med_legacy_001',
        name: 'Legacy Aspirin',
        dosage: '81 mg',
        form: 'Tablet',
        timeSlots: ['morning'],
        withFood: true,
        instructions: 'Take with food.',
        pillVisual: { shape: 'round', color: 'white' },
        isActive: true,
        createdAt: '2026-01-01T00:00:00.000Z'
      };

      localStorage.setItem(STORAGE_KEYS.MEDICATIONS, JSON.stringify([v1Med]));
      localStorage.setItem(STORAGE_KEYS.SCHEMA_VERSION, '1');

      // Run migration
      runStorageMigrations();

      // Check schema version updated
      const currentVersion = parseInt(localStorage.getItem(STORAGE_KEYS.SCHEMA_VERSION) || '0', 10);
      expect(currentVersion).toBe(CURRENT_SCHEMA_VERSION);

      // Check migrated medication attributes
      const migratedRaw = JSON.parse(localStorage.getItem(STORAGE_KEYS.MEDICATIONS) || '[]');
      expect(migratedRaw).toHaveLength(1);
      expect(migratedRaw[0].name).toBe('Legacy Aspirin');
      expect(migratedRaw[0].status).toBe('active');
      expect(migratedRaw[0].remindersEnabled).toBe(true);
      expect(migratedRaw[0].isPRN).toBe(false);
    });
  });

  describe('5. Validated Local Backup & Restore', () => {
    it('exports data with plaintext health information warning', () => {
      const jsonStr = exportAllDataAsJSON();
      expect(jsonStr).toContain('CareDose');
      expect(jsonStr).toContain('PLAINTEXT HEALTH DATA WARNING');
      expect(jsonStr).toContain('"schemaVersion": 2');

      const parsed = JSON.parse(jsonStr);
      expect(parsed.medications).toBeInstanceOf(Array);
      expect(parsed.patientProfile).toBeDefined();
      expect(parsed.dailyLog).toBeDefined();
    });

    it('validates backup JSON and detects duplicates by name and dosage', () => {
      // Export current state
      const backupStr = exportAllDataAsJSON();

      const validation = validateBackupJSON(backupStr);
      expect(validation.isValid).toBe(true);
      expect(validation.schemaVersion).toBe(2);
      expect(validation.recordCounts?.medications).toBeGreaterThan(0);
      // All current meds exist in storage, so duplicateCount will match
      expect(validation.duplicateCount).toBe(validation.recordCounts?.medications);
    });

    it('rejects malformed or invalid backup content safely', () => {
      const invalidJSON = "{ corrupted: true, incomplete ";
      const result1 = validateBackupJSON(invalidJSON);
      expect(result1.isValid).toBe(false);
      expect(result1.error).toContain('JSON Parse error');

      const wrongSchema = JSON.stringify({ type: 'unknown_app', data: [1, 2, 3] });
      const result2 = validateBackupJSON(wrongSchema);
      expect(result2.isValid).toBe(false);
      expect(result2.error).toContain('Missing or invalid CareDose backup signature');
    });

    it('safely restores data in "merge" mode preserving existing records and daily logs', () => {
      // Create an existing medication
      const existing = medStore.addMedication({
        name: 'Existing Med',
        dosage: '100 mg',
        form: 'Tablet',
        timeSlots: ['morning'],
        status: 'active',
        remindersEnabled: true,
        withFood: false,
        instructions: 'Existing instructions.',
        pillVisual: { shape: 'round', color: 'white' },
        isActive: true
      });

      // Record a dose
      medStore.recordDose(existing.id, 'morning', true);

      // Create backup data with a different new medication
      const newBackupData = {
        app: 'caredose_backup',
        version: 2,
        exportedAt: new Date().toISOString(),
        medications: [{
          id: 'med_imported_999',
          name: 'Imported Atorvastatin',
          dosage: '40 mg',
          doseQuantity: '1 tablet',
          form: 'Tablet',
          route: 'Oral',
          frequency: 'Once daily',
          timeSlots: ['evening'],
          status: 'active',
          remindersEnabled: true,
          withFood: false,
          instructions: 'Take at night.',
          pillVisual: { shape: 'oval', color: 'white' },
          isActive: true,
          createdAt: new Date().toISOString()
        }],
        dailyLog: { date: '2026-10-17', doses: {} }
      };

      const result = medStore.restoreBackup(newBackupData, 'merge');
      expect(result.success).toBe(true);

      // Re-read from store
      const allMeds = medStore.getMedications();
      expect(allMeds.some(m => m.id === existing.id)).toBe(true);
      expect(allMeds.some(m => m.name === 'Imported Atorvastatin')).toBe(true);

      // Adherence check
      const log = medStore.getDailyLog();
      expect(log.doses[`${existing.id}_morning`]?.taken).toBe(true);
    });

    it('restores data in "replace" mode cleanly replacing all records', () => {
      const replacementData = {
        app: 'caredose_backup',
        version: 2,
        exportedAt: new Date().toISOString(),
        medications: [{
          id: 'med_solo_001',
          name: 'Single Replacement Drug',
          dosage: '50 mg',
          form: 'Tablet',
          timeSlots: ['morning'],
          status: 'active',
          remindersEnabled: true,
          withFood: false,
          instructions: 'Sole medication.',
          pillVisual: { shape: 'round', color: 'green' },
          isActive: true,
          createdAt: new Date().toISOString()
        }],
        patientProfile: {
          name: 'Restored Patient',
          dob: '1955-05-15',
          bloodType: 'O+',
          allergies: ['Penicillin'],
          emergencyContactName: 'Jane Doe',
          emergencyContactPhone: '555-0199',
          notes: 'Restored from cloudless backup'
        },
        dailyLog: { date: '2026-10-17', doses: {} }
      };

      const result = medStore.restoreBackup(replacementData, 'replace');
      expect(result.success).toBe(true);

      const allMeds = medStore.getMedications();
      expect(allMeds).toHaveLength(1);
      expect(allMeds[0].name).toBe('Single Replacement Drug');

      const profile = medStore.getPatientProfile();
      expect(profile.name).toBe('Restored Patient');
      expect(profile.allergies).toContain('Penicillin');
    });
  });
});
