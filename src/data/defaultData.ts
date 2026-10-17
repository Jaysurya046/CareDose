import type { Medication, PatientProfile, UserPreferences, ReminderPreferences, ReminderDeliveryState } from '../types';

export const DEFAULT_PROFILE: PatientProfile = {
  name: 'Tanjiro',
  dob: '2005-04-18',
  bloodType: 'A+',
  allergies: ['Penicillin (Anaphylaxis)', 'Sulfa Drugs (Severe Rash)'],
  emergencyContactName: 'Triganana Dootha',
  emergencyContactRelation: 'Son',
  emergencyContactPhone: '(+91 9076545673)',
  primaryDoctorName: 'Dr. Jaya Ch, MD',
  primaryDoctorPhone: '(+91 9865457892',
  preferredHospital: 'AIIMS Raipur',
  notes: 'Fall risk; wears reading glasses and hearing aid in right ear.'
};

export const DEFAULT_MEDICATIONS: Medication[] = [
  {
    id: 'med-1',
    name: 'Lisinopril',
    genericName: 'Lisinopril',
    dosage: '20 mg',
    doseQuantity: '1 tablet',
    form: 'Tablet',
    route: 'Oral',
    frequency: 'Once daily',
    isPRN: false,
    timeSlots: ['morning'],
    remindersEnabled: true,
    status: 'active',
    withFood: false,
    instructions: 'Take 1 tablet every morning with a full glass of water. Monitor blood pressure weekly.',
    pillVisual: { shape: 'round', color: 'pink' },
    prescribedBy: 'Dr. Marcus Chen',
    isActive: true,
    createdAt: '2026-01-01T08:00:00.000Z'
  },
  {
    id: 'med-2',
    name: 'Metformin',
    genericName: 'Metformin HCL',
    dosage: '500 mg',
    doseQuantity: '1 tablet',
    form: 'Tablet',
    route: 'Oral',
    frequency: 'Twice daily',
    isPRN: false,
    timeSlots: ['morning', 'evening'],
    remindersEnabled: true,
    status: 'active',
    withFood: true,
    instructions: 'Take with morning and evening meals to minimize stomach upset.',
    pillVisual: { shape: 'oval', color: 'white' },
    prescribedBy: 'Dr. Marcus Chen',
    isActive: true,
    createdAt: '2026-01-01T08:00:00.000Z'
  },
  {
    id: 'med-3',
    name: 'Atorvastatin',
    genericName: 'Atorvastatin Calcium',
    dosage: '20 mg',
    doseQuantity: '1 tablet',
    form: 'Tablet',
    route: 'Oral',
    frequency: 'Once daily',
    isPRN: false,
    timeSlots: ['bedtime'],
    remindersEnabled: true,
    status: 'active',
    withFood: false,
    instructions: 'Take at bedtime. Avoid grapefruit products while taking this medication.',
    pillVisual: { shape: 'capsule', color: 'blue' },
    prescribedBy: 'Dr. Marcus Chen',
    isActive: true,
    createdAt: '2026-01-01T08:00:00.000Z'
  }
];

export const DEFAULT_PREFERENCES: UserPreferences = {
  fontScale: 'standard',
  highContrast: false
};

export const DEFAULT_REMINDER_PREFERENCES: ReminderPreferences = {
  enabled: false,
  includeMedNames: false,
  defaultSnoozeMinutes: 10,
  customSlotTimes: {
    morning: '08:00',
    midday: '13:00',
    evening: '18:30',
    bedtime: '22:00'
  }
};

export const DEFAULT_DELIVERY_STATE: ReminderDeliveryState = {
  lastDelivered: {},
  snoozedUntil: {},
  dismissed: {}
};
