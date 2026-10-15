import type { Medication, PatientProfile, DailyLog, UserPreferences, PillShape, PillColor, TimeSlot, FontScale } from '../types';
import { DEFAULT_PROFILE, DEFAULT_MEDICATIONS, DEFAULT_PREFERENCES } from '../data/defaultData';
import { getTodayDateString } from '../utils/date';

export const CURRENT_SCHEMA_VERSION = 1;

export const STORAGE_KEYS = {
  SCHEMA_VERSION: 'caredose_schema_version',
  MEDICATIONS: 'caredose_medications_v1',
  PATIENT_PROFILE: 'caredose_patient_profile_v1',
  DAILY_LOG: 'caredose_daily_log_v1',
  PREFERENCES: 'caredose_preferences_v1'
} as const;

const VALID_SHAPES: Set<PillShape> = new Set(['capsule', 'round', 'oval', 'split']);
const VALID_COLORS: Set<PillColor> = new Set(['white', 'yellow', 'blue', 'pink', 'orange', 'green', 'purple', 'red']);
const VALID_SLOTS: Set<TimeSlot> = new Set(['morning', 'midday', 'evening', 'bedtime']);
const VALID_SCALES: Set<FontScale> = new Set(['standard', 'large', 'xlarge']);

/**
 * Validates a medication record structure. Returns true if valid.
 */
function isValidMedication(item: unknown): item is Medication {
  if (typeof item !== 'object' || item === null) return false;
  const m = item as Record<string, unknown>;
  return (
    typeof m.id === 'string' &&
    typeof m.name === 'string' &&
    typeof m.dosage === 'string' &&
    typeof m.form === 'string' &&
    Array.isArray(m.timeSlots) &&
    m.timeSlots.every(slot => typeof slot === 'string' && VALID_SLOTS.has(slot as TimeSlot)) &&
    typeof m.withFood === 'boolean' &&
    typeof m.instructions === 'string' &&
    typeof m.pillVisual === 'object' &&
    m.pillVisual !== null &&
    VALID_SHAPES.has((m.pillVisual as { shape?: PillShape }).shape as PillShape) &&
    VALID_COLORS.has((m.pillVisual as { color?: PillColor }).color as PillColor) &&
    typeof m.isActive === 'boolean'
  );
}

/**
 * Validates patient profile structure.
 */
function isValidPatientProfile(item: unknown): item is PatientProfile {
  if (typeof item !== 'object' || item === null) return false;
  const p = item as Record<string, unknown>;
  return (
    typeof p.name === 'string' &&
    typeof p.dob === 'string' &&
    typeof p.bloodType === 'string' &&
    Array.isArray(p.allergies) &&
    p.allergies.every(a => typeof a === 'string') &&
    typeof p.emergencyContactName === 'string' &&
    typeof p.emergencyContactPhone === 'string'
  );
}

/**
 * Validates daily log structure.
 */
function isValidDailyLog(item: unknown): item is DailyLog {
  if (typeof item !== 'object' || item === null) return false;
  const l = item as Record<string, unknown>;
  if (typeof l.date !== 'string' || typeof l.doses !== 'object' || l.doses === null) {
    return false;
  }
  const doses = l.doses as Record<string, unknown>;
  for (const key of Object.keys(doses)) {
    const d = doses[key];
    if (typeof d !== 'object' || d === null || typeof (d as { taken?: unknown }).taken !== 'boolean') {
      return false;
    }
  }
  return true;
}

/**
 * Validates user preferences structure.
 */
function isValidPreferences(item: unknown): item is UserPreferences {
  if (typeof item !== 'object' || item === null) return false;
  const p = item as Record<string, unknown>;
  return (
    typeof p.fontScale === 'string' &&
    VALID_SCALES.has(p.fontScale as FontScale) &&
    typeof p.highContrast === 'boolean'
  );
}

/**
 * Executes schema migrations if persisted schema version is outdated.
 */
export function runStorageMigrations(): void {
  try {
    const rawVersion = localStorage.getItem(STORAGE_KEYS.SCHEMA_VERSION);
    const version = rawVersion ? parseInt(rawVersion, 10) : 1;

    if (version < CURRENT_SCHEMA_VERSION) {
      // Future schema migrations will be sequenced here safely
    }

    localStorage.setItem(STORAGE_KEYS.SCHEMA_VERSION, CURRENT_SCHEMA_VERSION.toString());
  } catch (e) {
    console.warn('Storage migration check failed, proceeding with current schema', e);
  }
}

/**
 * Loads medications with schema validation and corrupted-record fallback.
 */
export function loadStoredMedications(): Medication[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.MEDICATIONS);
    if (!raw) return DEFAULT_MEDICATIONS;

    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const validMeds = parsed.filter(isValidMedication);
      if (validMeds.length > 0 || parsed.length === 0) {
        return validMeds;
      }
    }
    console.warn('Persisted medications corrupted or invalid schema, falling back to defaults');
    return DEFAULT_MEDICATIONS;
  } catch (e) {
    console.error('Failed to parse medications from localStorage', e);
    return DEFAULT_MEDICATIONS;
  }
}

export function saveStoredMedications(medications: Medication[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.MEDICATIONS, JSON.stringify(medications));
  } catch (e) {
    console.error('Failed to save medications to localStorage', e);
  }
}

/**
 * Loads patient profile with validation.
 */
export function loadStoredPatientProfile(): PatientProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PATIENT_PROFILE);
    if (!raw) return DEFAULT_PROFILE;

    const parsed: unknown = JSON.parse(raw);
    if (isValidPatientProfile(parsed)) {
      return parsed;
    }
    return DEFAULT_PROFILE;
  } catch (e) {
    console.error('Failed to load patient profile from localStorage', e);
    return DEFAULT_PROFILE;
  }
}

export function saveStoredPatientProfile(profile: PatientProfile): void {
  try {
    localStorage.setItem(STORAGE_KEYS.PATIENT_PROFILE, JSON.stringify(profile));
  } catch (e) {
    console.error('Failed to save patient profile to localStorage', e);
  }
}

/**
 * Loads today's daily log, rolling over if a new day has arrived.
 */
export function loadStoredDailyLog(): DailyLog {
  const today = getTodayDateString();
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DAILY_LOG);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isValidDailyLog(parsed) && parsed.date === today) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Failed to load daily log from localStorage', e);
  }

  // Fresh day rollover
  const newLog: DailyLog = { date: today, doses: {} };
  saveStoredDailyLog(newLog);
  return newLog;
}

export function saveStoredDailyLog(log: DailyLog): void {
  try {
    localStorage.setItem(STORAGE_KEYS.DAILY_LOG, JSON.stringify(log));
  } catch (e) {
    console.error('Failed to save daily log to localStorage', e);
  }
}

/**
 * Loads user display preferences.
 */
export function loadStoredPreferences(): UserPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PREFERENCES);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isValidPreferences(parsed)) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Failed to load preferences from localStorage', e);
  }
  return DEFAULT_PREFERENCES;
}

export function saveStoredPreferences(prefs: UserPreferences): void {
  try {
    localStorage.setItem(STORAGE_KEYS.PREFERENCES, JSON.stringify(prefs));
  } catch (e) {
    console.error('Failed to save preferences to localStorage', e);
  }
}

/**
 * Exports all local health and medication data as a formatted JSON document.
 */
export function exportAllDataAsJSON(): string {
  const exportPayload = {
    app: 'CareDose',
    exportedAt: new Date().toISOString(),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    patientProfile: loadStoredPatientProfile(),
    medications: loadStoredMedications(),
    dailyLog: loadStoredDailyLog(),
    preferences: loadStoredPreferences()
  };
  return JSON.stringify(exportPayload, null, 2);
}

/**
 * Permanently removes all local CareDose records from browser storage.
 */
export function clearAllLocalData(): void {
  Object.values(STORAGE_KEYS).forEach(key => {
    localStorage.removeItem(key);
  });
}
