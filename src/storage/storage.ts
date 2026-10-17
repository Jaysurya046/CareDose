import type { 
  Medication, 
  PatientProfile, 
  DailyLog, 
  UserPreferences, 
  PillShape, 
  PillColor, 
  TimeSlot, 
  FontScale, 
  ReminderPreferences, 
  ReminderDeliveryState, 
  SnoozeInterval,
  BackupValidationResult,
  MedicationStatus
} from '../types';
import { DEFAULT_PROFILE, DEFAULT_MEDICATIONS, DEFAULT_PREFERENCES, DEFAULT_REMINDER_PREFERENCES, DEFAULT_DELIVERY_STATE } from '../data/defaultData';
import { getTodayDateString } from '../utils/date';
import { generateLocalId } from '../utils/sanitize';

export const CURRENT_SCHEMA_VERSION = 2;

export const STORAGE_KEYS = {
  SCHEMA_VERSION: 'caredose_schema_version',
  MEDICATIONS: 'caredose_medications_v1',
  PATIENT_PROFILE: 'caredose_patient_profile_v1',
  DAILY_LOG: 'caredose_daily_log_v1',
  PREFERENCES: 'caredose_preferences_v1',
  REMINDER_PREFS: 'caredose_reminder_prefs_v1',
  REMINDER_DELIVERY: 'caredose_reminder_delivery_v1'
} as const;

const VALID_SHAPES: Set<PillShape> = new Set(['capsule', 'round', 'oval', 'split']);
const VALID_COLORS: Set<PillColor> = new Set(['white', 'yellow', 'blue', 'pink', 'orange', 'green', 'purple', 'red']);
const VALID_SLOTS: Set<TimeSlot> = new Set(['morning', 'midday', 'evening', 'bedtime']);
const VALID_SCALES: Set<FontScale> = new Set(['standard', 'large', 'xlarge']);
const VALID_SNOOZE: Set<SnoozeInterval> = new Set([5, 10, 15]);
const VALID_STATUSES = new Set(['active', 'paused', 'completed', 'discontinued']);

/**
 * Validates a medication record structure. Returns true if valid.
 */
function isValidMedication(item: unknown): item is Medication {
  if (typeof item !== 'object' || item === null) return false;
  const m = item as Record<string, unknown>;
  const hasBaseFields = (
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

  if (!hasBaseFields) return false;

  // Optional status check
  if (m.status !== undefined && (typeof m.status !== 'string' || !VALID_STATUSES.has(m.status))) {
    return false;
  }

  // Optional arrays check
  if (m.weekdays !== undefined && (!Array.isArray(m.weekdays) || !m.weekdays.every(d => typeof d === 'number' && d >= 0 && d <= 6))) {
    return false;
  }
  if (m.customTimes !== undefined && (!Array.isArray(m.customTimes) || !m.customTimes.every(t => typeof t === 'string'))) {
    return false;
  }

  return true;
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
 * Validates reminder preferences.
 */
function isValidReminderPreferences(item: unknown): item is ReminderPreferences {
  if (typeof item !== 'object' || item === null) return false;
  const r = item as Record<string, unknown>;
  if (
    typeof r.enabled !== 'boolean' ||
    typeof r.includeMedNames !== 'boolean' ||
    !VALID_SNOOZE.has(r.defaultSnoozeMinutes as SnoozeInterval) ||
    typeof r.customSlotTimes !== 'object' ||
    r.customSlotTimes === null
  ) {
    return false;
  }
  const times = r.customSlotTimes as Record<string, unknown>;
  return VALID_SLOTS.has('morning') &&
    typeof times.morning === 'string' &&
    typeof times.midday === 'string' &&
    typeof times.evening === 'string' &&
    typeof times.bedtime === 'string';
}

/**
 * Validates reminder delivery state.
 */
function isValidDeliveryState(item: unknown): item is ReminderDeliveryState {
  if (typeof item !== 'object' || item === null) return false;
  const d = item as Record<string, unknown>;
  return (
    typeof d.lastDelivered === 'object' && d.lastDelivered !== null &&
    typeof d.snoozedUntil === 'object' && d.snoozedUntil !== null &&
    typeof d.dismissed === 'object' && d.dismissed !== null
  );
}

/**
 * Executes schema migrations if persisted schema version is outdated.
 */
export function runStorageMigrations(): void {
  try {
    const rawVersion = localStorage.getItem(STORAGE_KEYS.SCHEMA_VERSION);
    const version = rawVersion ? parseInt(rawVersion, 10) : 1;

    if (version < 2) {
      // Migrate v1 to v2: ensure status, remindersEnabled, and isPRN exist
      const rawMeds = localStorage.getItem(STORAGE_KEYS.MEDICATIONS);
      if (rawMeds) {
        try {
          const parsed = JSON.parse(rawMeds);
          if (Array.isArray(parsed)) {
            const migrated = parsed.map((m: any) => ({
              ...m,
              status: (m.status as MedicationStatus) || (m.isActive !== false ? 'active' : 'paused'),
              isActive: m.status ? m.status === 'active' : (m.isActive !== false),
              remindersEnabled: m.remindersEnabled !== undefined ? m.remindersEnabled : true,
              isPRN: m.isPRN || false
            }));
            localStorage.setItem(STORAGE_KEYS.MEDICATIONS, JSON.stringify(migrated));
          }
        } catch (err) {
          console.warn('Storage migration to v2 failed for medications', err);
        }
      }
    }

    localStorage.setItem(STORAGE_KEYS.SCHEMA_VERSION, CURRENT_SCHEMA_VERSION.toString());
  } catch (e) {
    console.warn('Storage migration check failed, proceeding with current schema', e);
  }
}

/**
 * Loads medications with schema validation, lifecycle normalization, and corrupted-record fallback.
 */
export function loadStoredMedications(): Medication[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.MEDICATIONS);
    if (!raw) return DEFAULT_MEDICATIONS;

    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const validMeds = parsed.filter(isValidMedication).map(m => {
        const status = (m.status as MedicationStatus) || (m.isActive !== false ? 'active' : 'paused');
        return {
          ...m,
          status,
          isActive: status === 'active',
          remindersEnabled: m.remindersEnabled !== false,
          isPRN: !!m.isPRN
        };
      });
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
 * Loads reminder preferences.
 */
export function loadStoredReminderPreferences(): ReminderPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.REMINDER_PREFS);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isValidReminderPreferences(parsed)) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Failed to load reminder preferences from localStorage', e);
  }
  return DEFAULT_REMINDER_PREFERENCES;
}

export function saveStoredReminderPreferences(prefs: ReminderPreferences): void {
  try {
    localStorage.setItem(STORAGE_KEYS.REMINDER_PREFS, JSON.stringify(prefs));
  } catch (e) {
    console.error('Failed to save reminder preferences to localStorage', e);
  }
}

/**
 * Loads reminder delivery state.
 */
export function loadStoredDeliveryState(): ReminderDeliveryState {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.REMINDER_DELIVERY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isValidDeliveryState(parsed)) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Failed to load reminder delivery state from localStorage', e);
  }
  return DEFAULT_DELIVERY_STATE;
}

export function saveStoredDeliveryState(state: ReminderDeliveryState): void {
  try {
    localStorage.setItem(STORAGE_KEYS.REMINDER_DELIVERY, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save reminder delivery state to localStorage', e);
  }
}

/**
 * Exports all local health and medication data as a formatted JSON document.
 * Includes clear security notice that export contains unencrypted plaintext personal health information.
 */
export function exportAllDataAsJSON(): string {
  const exportPayload = {
    app: 'CareDose',
    securityNotice: 'PLAINTEXT HEALTH DATA WARNING: This export contains unencrypted patient profiles, medication regimens, and adherence logs in standard plaintext JSON format. Handle and store securely.',
    exportedAt: new Date().toISOString(),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    patientProfile: loadStoredPatientProfile(),
    medications: loadStoredMedications(),
    dailyLog: loadStoredDailyLog(),
    preferences: loadStoredPreferences(),
    reminderPreferences: loadStoredReminderPreferences(),
    reminderDeliveryState: loadStoredDeliveryState()
  };
  return JSON.stringify(exportPayload, null, 2);
}

/**
 * Validates an imported backup JSON string and identifies duplicate medications.
 */
export function validateBackupJSON(rawJson: string): BackupValidationResult {
  try {
    if (!rawJson || !rawJson.trim()) {
      return { isValid: false, error: 'Backup file is empty.' };
    }

    const data = JSON.parse(rawJson);
    if (typeof data !== 'object' || data === null) {
      return { isValid: false, error: 'Backup root structure is invalid.' };
    }

    const appName = typeof data.app === 'string' ? data.app.toLowerCase() : '';
    if (appName !== 'caredose' && appName !== 'caredose_backup') {
      return { isValid: false, error: 'Missing or invalid CareDose backup signature.' };
    }

    if (!Array.isArray(data.medications)) {
      return { isValid: false, error: 'Backup does not contain valid medication records.' };
    }

    // Check duplicates against active storage
    const currentMeds = loadStoredMedications();
    const duplicateNames: string[] = [];
    let duplicateCount = 0;

    for (const bMed of data.medications) {
      if (typeof bMed === 'object' && bMed !== null && typeof bMed.name === 'string') {
        const isDup = currentMeds.some(c => 
          c.id === bMed.id || 
          (c.name.trim().toLowerCase() === bMed.name.trim().toLowerCase() && 
           c.dosage.trim().toLowerCase() === (bMed.dosage || '').trim().toLowerCase())
        );
        if (isDup) {
          duplicateCount++;
          if (!duplicateNames.includes(bMed.name)) {
            duplicateNames.push(bMed.name);
          }
        }
      }
    }

    return {
      isValid: true,
      schemaVersion: data.schemaVersion || data.version || CURRENT_SCHEMA_VERSION,
      recordCounts: {
        medications: data.medications.length,
        patientProfile: isValidPatientProfile(data.patientProfile),
        dailyLogDoses: data.dailyLog?.doses ? Object.keys(data.dailyLog.doses).length : 0
      },
      duplicateCount,
      duplicateNames,
      plaintextNotice: data.securityNotice || 'CareDose local backup contains sensitive health data in plaintext JSON.',
      parsedData: data
    };
  } catch (err: any) {
    return { isValid: false, error: `JSON Parse error: ${err.message || 'Invalid JSON format'}` };
  }
}

/**
 * Restores CareDose data from validated backup data.
 * Supports 'replace' (clean overwrite) or 'merge' (adds non-duplicate records, preserving existing data).
 */
export function restoreBackupData(
  parsedData: any, 
  mode: 'replace' | 'merge'
): { success: boolean; message: string; restoredMedsCount: number } {
  try {
    let dataObj = parsedData;
    if (typeof parsedData === 'string') {
      try {
        dataObj = JSON.parse(parsedData);
      } catch (e: any) {
        return { success: false, message: 'Invalid JSON string: ' + e.message, restoredMedsCount: 0 };
      }
    }

    if (!dataObj || !Array.isArray(dataObj.medications)) {
      return { success: false, message: 'Invalid backup dataset.', restoredMedsCount: 0 };
    }

    const backupMeds = dataObj.medications.filter(isValidMedication).map((m: Medication) => {
      const status = (m.status as MedicationStatus) || (m.isActive !== false ? 'active' : 'paused');
      return {
        ...m,
        status,
        isActive: status === 'active',
        remindersEnabled: m.remindersEnabled !== false,
        isPRN: !!m.isPRN
      };
    });

    if (mode === 'replace') {
      saveStoredMedications(backupMeds);
      if (isValidPatientProfile(dataObj.patientProfile)) {
        saveStoredPatientProfile(dataObj.patientProfile);
      }
      if (isValidDailyLog(dataObj.dailyLog)) {
        saveStoredDailyLog(dataObj.dailyLog);
      }
      if (isValidPreferences(dataObj.preferences)) {
        saveStoredPreferences(dataObj.preferences);
      }
      if (isValidReminderPreferences(dataObj.reminderPreferences)) {
        saveStoredReminderPreferences(dataObj.reminderPreferences);
      }
      return {
        success: true,
        message: `Successfully restored ${backupMeds.length} medications and all patient records in replace mode.`,
        restoredMedsCount: backupMeds.length
      };
    } else {
      // Merge mode
      const currentMeds = loadStoredMedications();
      const existingKeySet = new Set(currentMeds.map(c => `${c.name.trim().toLowerCase()}_${c.dosage.trim().toLowerCase()}`));
      const existingIdSet = new Set(currentMeds.map(c => c.id));

      let addedCount = 0;
      const mergedMeds = [...currentMeds];

      for (const bMed of backupMeds) {
        const key = `${bMed.name.trim().toLowerCase()}_${bMed.dosage.trim().toLowerCase()}`;
        if (!existingKeySet.has(key)) {
          // Non-duplicate: add safely with unique ID if needed
          const safeId = existingIdSet.has(bMed.id) ? generateLocalId('med') : bMed.id;
          mergedMeds.push({ ...bMed, id: safeId });
          existingIdSet.add(safeId);
          existingKeySet.add(key);
          addedCount++;
        }
      }

      saveStoredMedications(mergedMeds);

      // Merge patient profile if current profile is blank
      const currentProfile = loadStoredPatientProfile();
      if ((!currentProfile.name || currentProfile.name.trim() === '') && isValidPatientProfile(dataObj.patientProfile)) {
        saveStoredPatientProfile(dataObj.patientProfile);
      }

      // Merge daily logs without clobbering existing logged doses
      if (dataObj.dailyLog?.doses) {
        const currentDailyLog = loadStoredDailyLog();
        const mergedDoses = { ...dataObj.dailyLog.doses, ...currentDailyLog.doses };
        saveStoredDailyLog({ ...currentDailyLog, doses: mergedDoses });
      }

      return {
        success: true,
        message: `Successfully merged backup: added ${addedCount} new medication(s).`,
        restoredMedsCount: addedCount
      };
    }
  } catch (err: any) {
    return {
      success: false,
      message: `Failed to restore backup: ${err.message || 'Storage error'}`,
      restoredMedsCount: 0
    };
  }
}


/**
 * Permanently removes all local CareDose records from browser storage.
 */
export function clearAllLocalData(): void {
  Object.values(STORAGE_KEYS).forEach(key => {
    localStorage.removeItem(key);
  });
}
