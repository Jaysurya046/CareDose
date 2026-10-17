import type { 
  Medication, 
  PatientProfile, 
  DailyLog, 
  UserPreferences, 
  TimeSlot, 
  ReminderPreferences, 
  ReminderDeliveryState,
  MedicationStatus,
  BackupValidationResult
} from '../types';
import { generateLocalId } from '../utils/sanitize';
import { formatShortTime, getTodayDateString } from '../utils/date';
import { DEFAULT_PROFILE, DEFAULT_MEDICATIONS, DEFAULT_PREFERENCES, DEFAULT_REMINDER_PREFERENCES, DEFAULT_DELIVERY_STATE } from '../data/defaultData';
import {
  runStorageMigrations,
  loadStoredMedications,
  saveStoredMedications,
  loadStoredPatientProfile,
  saveStoredPatientProfile,
  loadStoredDailyLog,
  saveStoredDailyLog,
  loadStoredPreferences,
  saveStoredPreferences,
  loadStoredReminderPreferences,
  saveStoredReminderPreferences,
  loadStoredDeliveryState,
  saveStoredDeliveryState,
  exportAllDataAsJSON,
  validateBackupJSON,
  restoreBackupData,
  clearAllLocalData
} from '../storage/storage';

type StoreListener = () => void;

/**
 * Centralized in-memory observable store for CareDose application state.
 * Encapsulates reactive state management while delegating persistence and validation to the storage layer.
 */
class MedicationStore {
  private medications: Medication[] = [];
  private patientProfile: PatientProfile = DEFAULT_PROFILE;
  private dailyLog: DailyLog = { date: getTodayDateString(), doses: {} };
  private preferences: UserPreferences = DEFAULT_PREFERENCES;
  private reminderPreferences: ReminderPreferences = DEFAULT_REMINDER_PREFERENCES;
  private reminderDeliveryState: ReminderDeliveryState = DEFAULT_DELIVERY_STATE;
  private listeners: Set<StoreListener> = new Set();

  constructor() {
    runStorageMigrations();
    this.refreshFromStorage();
  }

  private refreshFromStorage(): void {
    this.medications = loadStoredMedications();
    this.patientProfile = loadStoredPatientProfile();
    this.dailyLog = loadStoredDailyLog();
    this.preferences = loadStoredPreferences();
    this.reminderPreferences = loadStoredReminderPreferences();
    this.reminderDeliveryState = loadStoredDeliveryState();
  }

  private notify(): void {
    this.listeners.forEach(cb => cb());
  }

  public subscribe(listener: StoreListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // Getters
  public getMedications(): Medication[] {
    return [...this.medications];
  }

  public getActiveMedications(): Medication[] {
    return this.medications.filter(m => m.isActive);
  }

  public getPatientProfile(): PatientProfile {
    return { ...this.patientProfile };
  }

  public getDailyLog(): DailyLog {
    return { ...this.dailyLog, doses: { ...this.dailyLog.doses } };
  }

  public getPreferences(): UserPreferences {
    return { ...this.preferences };
  }

  public getReminderPreferences(): ReminderPreferences {
    return {
      ...this.reminderPreferences,
      customSlotTimes: { ...this.reminderPreferences.customSlotTimes }
    };
  }

  public getReminderDeliveryState(): ReminderDeliveryState {
    return {
      lastDelivered: { ...this.reminderDeliveryState.lastDelivered },
      snoozedUntil: { ...this.reminderDeliveryState.snoozedUntil },
      dismissed: { ...this.reminderDeliveryState.dismissed }
    };
  }

  // Mutations
  public addMedication(med: Omit<Medication, 'id' | 'createdAt'>): Medication {
    const status: MedicationStatus = med.status || (med.isActive !== false ? 'active' : 'paused');
    const newMed: Medication = {
      ...med,
      id: generateLocalId('med'),
      status,
      isActive: status === 'active',
      remindersEnabled: med.remindersEnabled !== false,
      isPRN: !!med.isPRN,
      createdAt: new Date().toISOString()
    };
    this.medications.push(newMed);
    saveStoredMedications(this.medications);
    this.notify();
    return newMed;
  }

  public updateMedication(id: string, updates: Partial<Medication>): void {
    const index = this.medications.findIndex(m => m.id === id);
    if (index !== -1) {
      const current = this.medications[index];
      let newStatus: MedicationStatus = updates.status || current.status || (current.isActive ? 'active' : 'paused');
      if (updates.isActive !== undefined && updates.status === undefined) {
        newStatus = updates.isActive ? 'active' : 'paused';
      }
      const newIsActive = newStatus === 'active';

      this.medications[index] = {
        ...current,
        ...updates,
        status: newStatus,
        isActive: newIsActive
      };
      saveStoredMedications(this.medications);
      this.notify();
    }
  }

  public setMedicationStatus(id: string, status: MedicationStatus): void {
    this.updateMedication(id, { status, isActive: status === 'active' });
  }

  public pauseMedication(id: string): void {
    this.setMedicationStatus(id, 'paused');
  }

  public resumeMedication(id: string): void {
    this.setMedicationStatus(id, 'active');
  }

  public completeMedication(id: string): void {
    this.setMedicationStatus(id, 'completed');
  }

  public discontinueMedication(id: string): void {
    this.setMedicationStatus(id, 'discontinued');
  }

  public deleteMedication(id: string): void {
    this.medications = this.medications.filter(m => m.id !== id);
    saveStoredMedications(this.medications);
    this.notify();
  }

  public toggleMedicationActive(id: string): void {
    const med = this.medications.find(m => m.id === id);
    if (med) {
      const nextStatus: MedicationStatus = med.status === 'active' ? 'paused' : 'active';
      this.setMedicationStatus(id, nextStatus);
    }
  }

  public recordDose(medicationId: string, timeSlot: TimeSlot, taken: boolean): void {
    const key = `${medicationId}_${timeSlot}`;
    const timestamp = taken ? formatShortTime(new Date()) : undefined;

    this.dailyLog.doses[key] = {
      taken,
      timestamp
    };
    saveStoredDailyLog(this.dailyLog);

    // If taken, also clear active snooze for this date_slot occurrence
    if (taken) {
      const today = getTodayDateString();
      const slotKey = `${today}_${timeSlot}`;
      if (this.reminderDeliveryState.snoozedUntil[slotKey]) {
        delete this.reminderDeliveryState.snoozedUntil[slotKey];
        saveStoredDeliveryState(this.reminderDeliveryState);
      }
    }

    this.notify();
  }

  public updateProfile(profile: Partial<PatientProfile>): void {
    this.patientProfile = { ...this.patientProfile, ...profile };
    saveStoredPatientProfile(this.patientProfile);
    this.notify();
  }

  public updatePreferences(prefs: Partial<UserPreferences>): void {
    this.preferences = { ...this.preferences, ...prefs };
    saveStoredPreferences(this.preferences);
    this.notify();
  }

  public updateReminderPreferences(prefs: Partial<ReminderPreferences>): void {
    this.reminderPreferences = {
      ...this.reminderPreferences,
      ...prefs,
      customSlotTimes: {
        ...this.reminderPreferences.customSlotTimes,
        ...(prefs.customSlotTimes || {})
      }
    };
    saveStoredReminderPreferences(this.reminderPreferences);
    this.notify();
  }

  public updateReminderDeliveryState(updates: Partial<ReminderDeliveryState>): void {
    this.reminderDeliveryState = {
      lastDelivered: { ...this.reminderDeliveryState.lastDelivered, ...(updates.lastDelivered || {}) },
      snoozedUntil: { ...this.reminderDeliveryState.snoozedUntil, ...(updates.snoozedUntil || {}) },
      dismissed: { ...this.reminderDeliveryState.dismissed, ...(updates.dismissed || {}) }
    };
    saveStoredDeliveryState(this.reminderDeliveryState);
    this.notify();
  }

  public resetAllData(): void {
    this.medications = DEFAULT_MEDICATIONS;
    this.patientProfile = DEFAULT_PROFILE;
    this.dailyLog = { date: getTodayDateString(), doses: {} };
    this.preferences = DEFAULT_PREFERENCES;
    this.reminderPreferences = DEFAULT_REMINDER_PREFERENCES;
    this.reminderDeliveryState = DEFAULT_DELIVERY_STATE;
    saveStoredMedications(this.medications);
    saveStoredPatientProfile(this.patientProfile);
    saveStoredDailyLog(this.dailyLog);
    saveStoredPreferences(this.preferences);
    saveStoredReminderPreferences(this.reminderPreferences);
    saveStoredDeliveryState(this.reminderDeliveryState);
    this.notify();
  }

  public exportData(): string {
    return exportAllDataAsJSON();
  }

  public validateBackup(rawJson: string): BackupValidationResult {
    return validateBackupJSON(rawJson);
  }

  public restoreBackup(
    parsedData: any, 
    mode: 'replace' | 'merge'
  ): { success: boolean; message: string; restoredMedsCount: number } {
    const result = restoreBackupData(parsedData, mode);
    if (result.success) {
      this.refreshFromStorage();
      this.notify();
    }
    return result;
  }

  public permanentlyWipeData(): void {
    clearAllLocalData();
    this.medications = [];
    this.patientProfile = {
      name: '',
      dob: '',
      bloodType: '',
      allergies: [],
      emergencyContactName: '',
      emergencyContactPhone: '',
      emergencyContactRelation: '',
      primaryDoctorName: '',
      primaryDoctorPhone: '',
      preferredHospital: '',
      notes: ''
    };
    this.dailyLog = { date: getTodayDateString(), doses: {} };
    this.preferences = DEFAULT_PREFERENCES;
    this.reminderPreferences = DEFAULT_REMINDER_PREFERENCES;
    this.reminderDeliveryState = DEFAULT_DELIVERY_STATE;
    this.notify();
  }
}

export const medStore = new MedicationStore();
