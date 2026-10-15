import type { Medication, PatientProfile, DailyLog, UserPreferences, TimeSlot } from '../types';

const STORAGE_KEYS = {
  MEDICATIONS: 'caredose_medications_v1',
  PATIENT_PROFILE: 'caredose_patient_profile_v1',
  DAILY_LOG: 'caredose_daily_log_v1',
  PREFERENCES: 'caredose_preferences_v1'
};

function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const DEFAULT_PROFILE: PatientProfile = {
  name: 'Eleanor Vance',
  dob: '1952-04-18',
  bloodType: 'A+',
  allergies: ['Penicillin (Anaphylaxis)', 'Sulfa Drugs (Severe Rash)'],
  emergencyContactName: 'Sarah Vance',
  emergencyContactRelation: 'Daughter',
  emergencyContactPhone: '(555) 234-5678',
  primaryDoctorName: 'Dr. Marcus Chen, MD',
  primaryDoctorPhone: '(555) 890-1234',
  preferredHospital: 'Mercy Medical Center',
  notes: 'Fall risk; wears reading glasses and hearing aid in right ear.'
};

const DEFAULT_MEDICATIONS: Medication[] = [
  {
    id: 'med-1',
    name: 'Lisinopril',
    genericName: 'Lisinopril',
    dosage: '20 mg',
    form: 'Tablet',
    timeSlots: ['morning'],
    withFood: false,
    instructions: 'Take 1 tablet every morning with a full glass of water. Monitor blood pressure weekly.',
    pillVisual: { shape: 'round', color: 'pink' },
    prescribedBy: 'Dr. Marcus Chen',
    isActive: true,
    createdAt: new Date().toISOString()
  },
  {
    id: 'med-2',
    name: 'Metformin',
    genericName: 'Metformin HCL',
    dosage: '500 mg',
    form: 'Tablet',
    timeSlots: ['morning', 'evening'],
    withFood: true,
    instructions: 'Take with morning and evening meals to minimize stomach upset.',
    pillVisual: { shape: 'oval', color: 'white' },
    prescribedBy: 'Dr. Marcus Chen',
    isActive: true,
    createdAt: new Date().toISOString()
  },
  {
    id: 'med-3',
    name: 'Atorvastatin',
    genericName: 'Atorvastatin Calcium',
    dosage: '20 mg',
    form: 'Tablet',
    timeSlots: ['bedtime'],
    withFood: false,
    instructions: 'Take at bedtime. Avoid grapefruit products while taking this medication.',
    pillVisual: { shape: 'capsule', color: 'blue' },
    prescribedBy: 'Dr. Marcus Chen',
    isActive: true,
    createdAt: new Date().toISOString()
  }
];

const DEFAULT_PREFERENCES: UserPreferences = {
  fontScale: 'standard',
  highContrast: false
};

type StoreListener = () => void;

class MedicationStore {
  private medications: Medication[] = [];
  private patientProfile: PatientProfile = DEFAULT_PROFILE;
  private dailyLog: DailyLog = { date: getTodayDateString(), doses: {} };
  private preferences: UserPreferences = DEFAULT_PREFERENCES;
  private listeners: Set<StoreListener> = new Set();

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    try {
      // Medications
      const storedMeds = localStorage.getItem(STORAGE_KEYS.MEDICATIONS);
      if (storedMeds) {
        this.medications = JSON.parse(storedMeds);
      } else {
        this.medications = DEFAULT_MEDICATIONS;
        this.saveMedications();
      }

      // Profile
      const storedProfile = localStorage.getItem(STORAGE_KEYS.PATIENT_PROFILE);
      if (storedProfile) {
        this.patientProfile = JSON.parse(storedProfile);
      } else {
        this.patientProfile = DEFAULT_PROFILE;
        this.saveProfile();
      }

      // Preferences
      const storedPrefs = localStorage.getItem(STORAGE_KEYS.PREFERENCES);
      if (storedPrefs) {
        this.preferences = JSON.parse(storedPrefs);
      }

      // Daily Log
      const storedLog = localStorage.getItem(STORAGE_KEYS.DAILY_LOG);
      const today = getTodayDateString();
      if (storedLog) {
        const parsed: DailyLog = JSON.parse(storedLog);
        if (parsed.date === today) {
          this.dailyLog = parsed;
        } else {
          // New day rollover
          this.dailyLog = { date: today, doses: {} };
          this.saveDailyLog();
        }
      } else {
        this.dailyLog = { date: today, doses: {} };
        this.saveDailyLog();
      }
    } catch (e) {
      console.error('Failed to load CareDose local storage data', e);
      this.medications = DEFAULT_MEDICATIONS;
      this.patientProfile = DEFAULT_PROFILE;
    }
  }

  private saveMedications() {
    localStorage.setItem(STORAGE_KEYS.MEDICATIONS, JSON.stringify(this.medications));
  }

  private saveProfile() {
    localStorage.setItem(STORAGE_KEYS.PATIENT_PROFILE, JSON.stringify(this.patientProfile));
  }

  private saveDailyLog() {
    localStorage.setItem(STORAGE_KEYS.DAILY_LOG, JSON.stringify(this.dailyLog));
  }

  private savePreferences() {
    localStorage.setItem(STORAGE_KEYS.PREFERENCES, JSON.stringify(this.preferences));
  }

  private notify() {
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
      id: 'med-' + Date.now().toString(36) + Math.random().toString(36).substring(2, 5),
      createdAt: new Date().toISOString()
    };
    this.medications.push(newMed);
    this.saveMedications();
    this.notify();
    return newMed;
  }

  public updateMedication(id: string, updates: Partial<Medication>) {
    const index = this.medications.findIndex(m => m.id === id);
    if (index !== -1) {
      this.medications[index] = { ...this.medications[index], ...updates };
      this.saveMedications();
      this.notify();
    }
  }

  public deleteMedication(id: string) {
    this.medications = this.medications.filter(m => m.id !== id);
    this.saveMedications();
    this.notify();
  }

  public toggleMedicationActive(id: string) {
    const med = this.medications.find(m => m.id === id);
    if (med) {
      med.isActive = !med.isActive;
      this.saveMedications();
      this.notify();
    }
  }

  public recordDose(medicationId: string, timeSlot: TimeSlot, taken: boolean) {
    const key = `${medicationId}_${timeSlot}`;
    const timestamp = taken ? new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined;
    
    this.dailyLog.doses[key] = {
      taken,
      timestamp
    };
    this.saveDailyLog();
    this.notify();
  }

  public updateProfile(profile: Partial<PatientProfile>) {
    this.patientProfile = { ...this.patientProfile, ...profile };
    this.saveProfile();
    this.notify();
  }

  public updatePreferences(prefs: Partial<UserPreferences>) {
    this.preferences = { ...this.preferences, ...prefs };
    this.savePreferences();
    this.notify();
  }

  public resetAllData() {
    this.medications = DEFAULT_MEDICATIONS;
    this.patientProfile = DEFAULT_PROFILE;
    this.dailyLog = { date: getTodayDateString(), doses: {} };
    this.preferences = DEFAULT_PREFERENCES;
    this.saveMedications();
    this.saveProfile();
    this.saveDailyLog();
    this.savePreferences();
    this.notify();
  }
}

export const medStore = new MedicationStore();
