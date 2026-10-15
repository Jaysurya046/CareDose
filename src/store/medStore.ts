import type { Medication, PatientProfile, DailyLog, UserPreferences, TimeSlot } from '../types';
import { generateLocalId } from '../utils/sanitize';
import { formatShortTime, getTodayDateString } from '../utils/date';
import { DEFAULT_PROFILE, DEFAULT_MEDICATIONS, DEFAULT_PREFERENCES } from '../data/defaultData';
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
  exportAllDataAsJSON,
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

  // Mutations
  public addMedication(med: Omit<Medication, 'id' | 'createdAt'>): Medication {
    const newMed: Medication = {
      ...med,
      id: generateLocalId('med'),
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
      this.medications[index] = { ...this.medications[index], ...updates };
      saveStoredMedications(this.medications);
      this.notify();
    }
  }

  public deleteMedication(id: string): void {
    this.medications = this.medications.filter(m => m.id !== id);
    saveStoredMedications(this.medications);
    this.notify();
  }

  public toggleMedicationActive(id: string): void {
    const med = this.medications.find(m => m.id === id);
    if (med) {
      med.isActive = !med.isActive;
      saveStoredMedications(this.medications);
      this.notify();
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

  public resetAllData(): void {
    this.medications = DEFAULT_MEDICATIONS;
    this.patientProfile = DEFAULT_PROFILE;
    this.dailyLog = { date: getTodayDateString(), doses: {} };
    this.preferences = DEFAULT_PREFERENCES;
    saveStoredMedications(this.medications);
    saveStoredPatientProfile(this.patientProfile);
    saveStoredDailyLog(this.dailyLog);
    saveStoredPreferences(this.preferences);
    this.notify();
  }

  public exportData(): string {
    return exportAllDataAsJSON();
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
    this.notify();
  }
}

export const medStore = new MedicationStore();
