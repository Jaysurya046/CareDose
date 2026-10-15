export type TimeSlot = 'morning' | 'midday' | 'evening' | 'bedtime';

export type PillShape = 'capsule' | 'round' | 'oval' | 'split';

export type PillColor = 
  | 'white' 
  | 'yellow' 
  | 'blue' 
  | 'pink' 
  | 'orange' 
  | 'green' 
  | 'purple' 
  | 'red';

export interface PillVisual {
  shape: PillShape;
  color: PillColor;
}

export interface Medication {
  id: string;
  name: string;
  genericName?: string;
  dosage: string;
  form: string; // e.g., 'Tablet', 'Capsule', 'Liquid', 'Inhaler'
  timeSlots: TimeSlot[];
  withFood: boolean;
  instructions: string;
  pillVisual: PillVisual;
  prescribedBy?: string;
  refillDate?: string;
  isActive: boolean;
  createdAt: string;
}

export interface PatientProfile {
  name: string;
  dob: string;
  bloodType: string;
  allergies: string[];
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelation: string;
  primaryDoctorName: string;
  primaryDoctorPhone: string;
  preferredHospital: string;
  notes: string;
}

export type AlertSeverity = 'critical' | 'caution' | 'mild';

export interface InteractionRule {
  id: string;
  drugAKeywords: string[];
  drugBKeywords: string[];
  severity: AlertSeverity;
  title: string;
  description: string;
  clinicalAction: string;
}

export interface InteractionAlert {
  ruleId: string;
  severity: AlertSeverity;
  drugA: string;
  drugB: string;
  title: string;
  description: string;
  clinicalAction: string;
}

export interface DoseRecord {
  taken: boolean;
  timestamp?: string;
}

export interface DailyLog {
  date: string; // YYYY-MM-DD
  // key is `${medicationId}_${timeSlot}`
  doses: Record<string, DoseRecord>;
}

export type FontScale = 'standard' | 'large' | 'xlarge';

export interface UserPreferences {
  fontScale: FontScale;
  highContrast: boolean;
}
