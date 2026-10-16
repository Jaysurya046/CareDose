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
  isPrescriptionImport?: boolean;
  prescriptionVerificationStatus?: VerificationStatus;
  importedAt?: string;
}

export type FieldStatus =
  | 'extracted'
  | 'uncertain'
  | 'unreadable'
  | 'user_confirmed'
  | 'professionally_verified';

export type VerificationStatus =
  | 'pending'
  | 'user_confirmed'
  | 'professional_clarification';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  page?: number;
}

export interface TextRecognitionSegment {
  text: string;
  confidence?: number;
  bbox?: BoundingBox;
  isHandwritingCandidate?: boolean;
}

export interface TextRecognitionResult {
  text: string;
  source: 'ocr' | 'handwriting' | 'pdf_text';
  confidence?: number;
  region?: BoundingBox;
  alternatives?: string[];
  segments?: TextRecognitionSegment[];
  pageIndex?: number;
}

export interface PrescriptionMedicationDraft {
  id: string;
  sourceSnippet: string;
  name: string | null;
  genericName?: string | null;
  strength: string | null;
  doseQuantity: string | null;
  dosageForm: string | null;
  frequency: string | null;
  scheduledTimes: string[] | null;
  timeSlots: TimeSlot[];
  duration: string | null;
  instructions: string | null;
  rxCui: string | null;
  prescribedBy: string | null;
  fieldStatuses: Record<string, FieldStatus>;
  verificationStatus: VerificationStatus;
  clarificationNotes?: string;
  boundingBox?: BoundingBox;
  unclearReasons?: Record<string, string>;
  isExcluded?: boolean;
}

export type DocumentZoneType =
  | 'document_header'
  | 'patient_demographics'
  | 'prescription_body'
  | 'prescriber_footer'
  | 'administrative_boilerplate'
  | 'unknown';

export interface DocumentRegion {
  id: string;
  zone: DocumentZoneType;
  text: string;
  confidence?: number;
  bbox?: BoundingBox;
  reason: string;
  isPrescriptionCandidate: boolean;
}

export interface CandidateEvaluation {
  rawText: string;
  accepted: boolean;
  medicationName?: string | null;
  rejectionReason?: string;
  evidenceFound: string[];
  zone: DocumentZoneType;
}

export interface RecognitionDiagnostics {
  totalRegions: number;
  classifiedZones: Array<{
    zone: DocumentZoneType;
    snippet: string;
    bbox?: BoundingBox;
    reason: string;
  }>;
  candidateEvaluations: CandidateEvaluation[];
  processingPasses: string[];
  ocrPasses?: Array<{
    pass: number;
    psm: number;
    textLength: number;
    meanConfidence: number;
  }>;
}

export interface PrescriptionScanSession {
  id: string;
  fileName: string;
  fileType: 'image' | 'pdf';
  fileSize: number;
  pageCount: number;
  currentPage: number;
  pages: Array<{
    pageNumber: number;
    imageDataUrl: string;
    rawText: string;
    segments: TextRecognitionSegment[];
  }>;
  drafts: PrescriptionMedicationDraft[];
  diagnostics?: RecognitionDiagnostics;
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

export type SnoozeInterval = 5 | 10 | 15;

export interface ReminderPreferences {
  enabled: boolean;
  includeMedNames: boolean;
  defaultSnoozeMinutes: SnoozeInterval;
  customSlotTimes: Record<TimeSlot, string>; // HH:MM in 24-hr format, e.g. "08:00"
}

export interface ReminderDeliveryState {
  lastDelivered: Record<string, string>; // key: `${date}_${slot}`, value: ISO timestamp
  snoozedUntil: Record<string, number>;  // key: `${date}_${slot}`, value: epoch timestamp ms
  dismissed: Record<string, string>;     // key: `${date}_${slot}`, value: ISO timestamp
}

export interface ScheduledReminderEvent {
  slot: TimeSlot;
  scheduledTime: string;
  date: string;
  medications: Medication[];
  isSnoozed: boolean;
  isOverdue: boolean;
  isTaken: boolean;
}
