import { describe, it, expect } from 'vitest';
import { parsePrescriptionText, validateDraftForImport } from './prescriptionParser';
import { evaluateSafetyProfile } from './watchdog';
import type { Medication, TextRecognitionSegment } from '../types';

describe('Prescription Scan & Safe Medication Import Pipeline Integration', () => {
  it('extracts multiple medications from a synthetic printed prescription', () => {
    const syntheticDoc = `
      MEDICAL CLINIC RX
      Patient: Jane Doe  DOB: 1955-04-12
      Date: 2026-10-15
      
      1. Lisinopril 20 mg tablet
         Sig: Take 1 tablet once daily in the morning with water.
         Disp: 30 tablets  Refills: 3
      
      2. Atorvastatin 40 mg tablet
         Sig: Take 1 tablet once daily at bedtime.
         Disp: 30 tablets  Refills: 3
      
      Dr. Sarah Jenkins, MD  NPI: 1234567890
    `;

    const drafts = parsePrescriptionText(syntheticDoc);
    expect(drafts.length).toBe(2);

    const lisinopril = drafts[0];
    expect(lisinopril.name).toBe('Lisinopril');
    expect(lisinopril.strength).toBe('20 mg');
    expect(lisinopril.doseQuantity).toBe('1 tablet');
    expect(lisinopril.timeSlots).toContain('morning');
    expect(lisinopril.prescribedBy).toContain('Jenkins');

    const atorvastatin = drafts[1];
    expect(atorvastatin.name).toBe('Atorvastatin');
    expect(atorvastatin.strength).toBe('40 mg');
    expect(atorvastatin.doseQuantity).toBe('1 tablet');
    expect(atorvastatin.timeSlots).toContain('bedtime');
  });

  it('handles unknown/regional brand medications absent from common catalog safely as manual candidates', () => {
    // E.g., a regional brand like "Pantocid" or custom compound
    const regionalRx = 'Pantocid 40 mg tablet. Take 1 tablet once daily before breakfast.';
    const drafts = parsePrescriptionText(regionalRx);

    expect(drafts.length).toBe(1);
    const draft = drafts[0];
    expect(draft.name).toBe('Pantocid');
    // Because it is not in the US offline catalog, it is flagged uncertain for verification
    expect(draft.fieldStatuses.name).toBe('uncertain');
    expect(draft.strength).toBe('40 mg');

    // Safe import is blocked until verified
    expect(validateDraftForImport(draft).isSafeToImport).toBe(false);

    // After user verifies against packaging
    draft.fieldStatuses.name = 'user_confirmed';
    draft.verificationStatus = 'user_confirmed';
    draft.fieldStatuses.schedule = 'user_confirmed';
    expect(validateDraftForImport(draft).isSafeToImport).toBe(true);
  });

  it('blocks active reminders when dose schedule is ambiguous without user confirmation', () => {
    const ambiguousDoc = 'Metoprolol 25 mg tablet. Take twice daily.';
    const drafts = parsePrescriptionText(ambiguousDoc);
    const draft = drafts[0];

    expect(draft.frequency).toBe('Twice daily');
    // Without exact clock hours, schedule status is uncertain
    expect(draft.fieldStatuses.schedule).toBe('uncertain');

    const validation = validateDraftForImport(draft);
    expect(validation.canScheduleActiveReminder).toBe(false);

    // Resolving schedule allows scheduling
    draft.fieldStatuses.schedule = 'user_confirmed';
    draft.verificationStatus = 'user_confirmed';
    draft.timeSlots = ['morning', 'evening'];
    expect(validateDraftForImport(draft).canScheduleActiveReminder).toBe(true);
  });

  it('verifies that imported medications trigger interaction watchdog screening', () => {
    // Scenario: User already has Lisinopril 20mg active in cabinet
    const existingMed: Medication = {
      id: 'med_lisinopril',
      name: 'Lisinopril',
      genericName: 'ACE Inhibitor',
      dosage: '20 mg',
      form: 'Tablet',
      timeSlots: ['morning'],
      withFood: false,
      instructions: 'Take in morning',
      pillVisual: { shape: 'round', color: 'yellow' },
      isActive: true,
      createdAt: '2026-10-01'
    };

    // User scans a prescription for Potassium Chloride
    const potassiumRx = 'Potassium Chloride 20 mEq tablet. Take 1 tablet once daily in morning with food.';
    const drafts = parsePrescriptionText(potassiumRx);
    const potassiumDraft = drafts[0];

    // Confirm and validate import
    potassiumDraft.fieldStatuses.name = 'user_confirmed';
    potassiumDraft.fieldStatuses.strength = 'user_confirmed';
    potassiumDraft.fieldStatuses.schedule = 'user_confirmed';
    potassiumDraft.verificationStatus = 'user_confirmed';

    const importedMed: Medication = {
      id: 'med_potassium',
      name: potassiumDraft.name!,
      dosage: potassiumDraft.strength!,
      form: potassiumDraft.dosageForm || 'Tablet',
      timeSlots: potassiumDraft.timeSlots,
      withFood: true,
      instructions: potassiumDraft.instructions || '',
      pillVisual: { shape: 'round', color: 'white' },
      isActive: true,
      createdAt: new Date().toISOString(),
      isPrescriptionImport: true,
      prescriptionVerificationStatus: potassiumDraft.verificationStatus
    };

    // Run Safety Watchdog screening on combined active medications
    const activeRegimen = [existingMed, importedMed];
    const result = evaluateSafetyProfile(activeRegimen);

    // Should detect the well-known hyperkalemia risk between ACE inhibitor and Potassium
    expect(result.alerts.length).toBeGreaterThan(0);
    const acePotassiumAlert = result.alerts.find(a => 
      a.drugA.toLowerCase().includes('lisinopril') || a.drugB.toLowerCase().includes('lisinopril')
    );
    expect(acePotassiumAlert).toBeDefined();
    expect(acePotassiumAlert?.severity).toBe('critical');
  });

  it('preserves conflicting OCR and handwriting readings without automatic smoothing', () => {
    const noisyText = 'Metf... 500 mg daily';
    const lowConfSegments: TextRecognitionSegment[] = [
      { text: 'Metf...', confidence: 45, isHandwritingCandidate: true },
      { text: '500', confidence: 92 },
      { text: 'mg', confidence: 95 }
    ];

    const drafts = parsePrescriptionText(noisyText, lowConfSegments);
    expect(drafts.length).toBe(1);
    const draft = drafts[0];

    expect(draft.fieldStatuses.name).toBe('uncertain');
    expect(draft.unclearReasons?.name).toBeDefined();
    // Cannot activate schedule without confirmation
    expect(validateDraftForImport(draft).isSafeToImport).toBe(false);
  });
});
