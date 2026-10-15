import { describe, it, expect } from 'vitest';
import {
  parsePrescriptionText,
  segmentPrescriptionBlocks,
  validateDraftForImport,
  findCatalogSuggestions
} from './prescriptionParser';
import type { TextRecognitionSegment } from '../types';

describe('Prescription Parsing Engine & Safety Tests', () => {
  it('correctly segments multiple prescription items', () => {
    const rawText = `
      1. Lisinopril 10 mg tablet, take 1 tablet once daily in the morning
      2. Atorvastatin 20 mg tablet, take 1 tablet at bedtime
    `;
    const blocks = segmentPrescriptionBlocks(rawText);
    expect(blocks.length).toBe(2);
    expect(blocks[0]).toContain('Lisinopril');
    expect(blocks[1]).toContain('Atorvastatin');
  });

  it('extracts printed prescription details accurately without guessing', () => {
    const text = '1. Metformin 500 mg tablet. Take 1 tablet twice daily with food. For 30 days.';
    const drafts = parsePrescriptionText(text);

    expect(drafts.length).toBe(1);
    const draft = drafts[0];

    expect(draft.name).toBe('Metformin');
    expect(draft.fieldStatuses.name).toBe('extracted');
    expect(draft.strength).toBe('500 mg');
    expect(draft.fieldStatuses.strength).toBe('extracted');
    expect(draft.doseQuantity).toBe('1 tablet');
    expect(draft.dosageForm).toBe('Tablet');
    expect(draft.frequency).toBe('Twice daily');
    // Notice: schedule status must be marked UNCERTAIN because exact clock hours were not stated
    expect(draft.fieldStatuses.schedule).toBe('uncertain');
    expect(draft.instructions).toContain('Take with food');
  });

  it('does NOT merge tablet strength and dose quantity', () => {
    const text = 'Metformin 500 mg. Take 2 tablets twice daily.';
    const drafts = parsePrescriptionText(text);
    const draft = drafts[0];

    expect(draft.strength).toBe('500 mg');
    expect(draft.doseQuantity).toBe('2 tablets');
    // Strength is 500 mg, quantity is 2 tablets - distinct fields
    expect(draft.strength).not.toBe(draft.doseQuantity);
  });

  it('flags ambiguous handwriting (e.g. "Metf... 500") as UNCERTAIN candidate and never auto-confirms', () => {
    const text = 'Metf... 500 mg, take 1 daily';
    const drafts = parsePrescriptionText(text);
    const draft = drafts[0];

    // Candidate suggests Metformin, but status is strictly UNCERTAIN
    expect(draft.name).toBe('Metformin');
    expect(draft.fieldStatuses.name).toBe('uncertain');
    expect(draft.verificationStatus).toBe('pending');

    // Validation must block active import while pending
    const validation = validateDraftForImport(draft);
    expect(validation.isSafeToImport).toBe(false);
    expect(validation.blockingReasons.length).toBeGreaterThan(0);
    expect(validation.blockingReasons[0]).toContain('uncertain');
  });

  it('marks completely illegible medication text as UNREADABLE', () => {
    const text = '??? ***** ??? 10 mg daily';
    const drafts = parsePrescriptionText(text);
    const draft = drafts[0];

    expect(draft.fieldStatuses.name).toBe('unreadable');
    const validation = validateDraftForImport(draft);
    expect(validation.isSafeToImport).toBe(false);
    expect(validation.blockingReasons).toContain('Medication name is missing or unreadable.');
  });

  it('does NOT infer missing strength from standard marketed strengths', () => {
    const text = 'Amlodipine tablet, take 1 tablet daily';
    const drafts = parsePrescriptionText(text);
    const draft = drafts[0];

    expect(draft.name).toBe('Amlodipine');
    // CareDose must NEVER invent "5 mg" or "10 mg" just because they are common!
    expect(draft.strength).toBeNull();
    expect(draft.fieldStatuses.strength).toBe('uncertain');

    const validation = validateDraftForImport(draft);
    expect(validation.isSafeToImport).toBe(false);
    expect(validation.blockingReasons).toContain('Dosage strength is missing.');
  });

  it('flags low optical confidence OCR segments as uncertain', () => {
    const text = 'Coumadin 2 mg tablet daily';
    const segments: TextRecognitionSegment[] = [
      { text: 'Coumadin', confidence: 42, isHandwritingCandidate: true }, // Low confidence
      { text: '2', confidence: 95 },
      { text: 'mg', confidence: 98 }
    ];

    const drafts = parsePrescriptionText(text, segments);
    const draft = drafts[0];

    expect(draft.name).toBe('Coumadin');
    expect(draft.fieldStatuses.name).toBe('uncertain');
    expect(draft.unclearReasons?.name).toContain('Low optical confidence');
  });

  it('allows safe import only after user confirmation or professional clarification', () => {
    const text = 'Metformin 500 mg. Take 1 tablet twice daily with food.';
    const drafts = parsePrescriptionText(text);
    const draft = drafts[0];

    // Initially pending and schedule is uncertain
    expect(validateDraftForImport(draft).canScheduleActiveReminder).toBe(false);

    // User confirms exact details and clock timing
    draft.fieldStatuses.name = 'user_confirmed';
    draft.fieldStatuses.strength = 'user_confirmed';
    draft.fieldStatuses.schedule = 'user_confirmed';
    draft.verificationStatus = 'user_confirmed';
    draft.timeSlots = ['morning', 'evening'];

    const confirmedValidation = validateDraftForImport(draft);
    expect(confirmedValidation.isSafeToImport).toBe(true);
    expect(confirmedValidation.canScheduleActiveReminder).toBe(true);
  });

  it('supports recording professional prescriber/pharmacist clarification', () => {
    const text = 'Metf... 500 mg';
    const drafts = parsePrescriptionText(text);
    const draft = drafts[0];

    // Record pharmacist clarification
    draft.name = 'Metformin';
    draft.fieldStatuses.name = 'professionally_verified';
    draft.fieldStatuses.strength = 'professionally_verified';
    draft.fieldStatuses.schedule = 'professionally_verified';
    draft.verificationStatus = 'professional_clarification';
    draft.clarificationNotes = 'Clarified with Dr. Smith via telephone at 10:15 AM: Metformin 500mg BID.';
    draft.timeSlots = ['morning', 'evening'];

    const validation = validateDraftForImport(draft);
    expect(validation.isSafeToImport).toBe(true);
    expect(validation.canScheduleActiveReminder).toBe(true);
  });

  it('correctly respects excluded medication candidates', () => {
    const text = 'Aspirin 81 mg daily';
    const drafts = parsePrescriptionText(text);
    const draft = drafts[0];

    draft.isExcluded = true;
    const validation = validateDraftForImport(draft);
    expect(validation.isSafeToImport).toBe(false);
    expect(validation.blockingReasons).toContain('Medication draft is marked as excluded.');
  });

  it('provides catalog search suggestions as possible readings, not auto-verification', () => {
    const suggestions = findCatalogSuggestions('met');
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.some(s => s.name === 'Metformin')).toBe(true);
  });
});
