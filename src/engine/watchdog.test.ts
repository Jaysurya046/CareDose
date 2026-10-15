import { describe, it, expect } from 'vitest';
import { evaluateInteractions, evaluateSafetyProfile } from './watchdog';
import type { Medication } from '../types';

function createMockMed(
  id: string, 
  name: string, 
  genericName?: string, 
  isActive: boolean = true
): Medication {
  return {
    id,
    name,
    genericName,
    dosage: '10mg',
    form: 'Tablet',
    timeSlots: ['morning'],
    withFood: false,
    instructions: 'Take daily',
    pillVisual: { shape: 'round', color: 'white' },
    isActive,
    createdAt: new Date().toISOString()
  };
}

describe('Clinical Watchdog Interaction Engine', () => {
  it('should detect critical interaction between Warfarin and Aspirin', () => {
    const meds: Medication[] = [
      createMockMed('1', 'Coumadin', 'Warfarin Sodium'),
      createMockMed('2', 'Bayer Aspirin', 'Aspirin')
    ];

    const alerts = evaluateInteractions(meds);
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    
    const bleedingAlert = alerts.find(a => a.ruleId === 'anticoagulant_nsaid');
    expect(bleedingAlert).toBeDefined();
    expect(bleedingAlert?.severity).toBe('critical');
    expect(bleedingAlert?.title).toContain('Internal Bleeding');
  });

  it('should detect critical interaction between Lisinopril and Potassium supplements', () => {
    const meds: Medication[] = [
      createMockMed('1', 'Lisinopril 20mg'),
      createMockMed('2', 'Potassium Chloride K-Dur')
    ];

    const alerts = evaluateInteractions(meds);
    const hyperkalemiaAlert = alerts.find(a => a.ruleId === 'ace_inhibitor_potassium');
    expect(hyperkalemiaAlert).toBeDefined();
    expect(hyperkalemiaAlert?.severity).toBe('critical');
    expect(hyperkalemiaAlert?.title).toContain('Hyperkalemia');
  });

  it('should detect statin and macrolide antibiotic conflict', () => {
    const meds: Medication[] = [
      createMockMed('1', 'Lipitor', 'Atorvastatin'),
      createMockMed('2', 'Biaxin', 'Clarithromycin')
    ];

    const alerts = evaluateInteractions(meds);
    const statinAlert = alerts.find(a => a.ruleId === 'statin_macrolide');
    expect(statinAlert).toBeDefined();
    expect(statinAlert?.severity).toBe('critical');
    expect(statinAlert?.title).toContain('Rhabdomyolysis');
  });

  it('should detect caution severity interactions like SSRI and NSAID', () => {
    const meds: Medication[] = [
      createMockMed('1', 'Zoloft 50mg', 'Sertraline'),
      createMockMed('2', 'Advil 200mg', 'Ibuprofen')
    ];

    const alerts = evaluateInteractions(meds);
    const ssriNsaidAlert = alerts.find(a => a.ruleId === 'ssri_nsaid_bleeding');
    expect(ssriNsaidAlert).toBeDefined();
    expect(ssriNsaidAlert?.severity).toBe('caution');
  });

  it('should return no alerts when medications are compatible in offline dataset', () => {
    const meds: Medication[] = [
      createMockMed('1', 'Lisinopril 20mg'),
      createMockMed('2', 'Metformin 500mg'),
      createMockMed('3', 'Atorvastatin 20mg')
    ];

    const result = evaluateSafetyProfile(meds);
    expect(result.status).toBe('none_found_in_dataset');
    expect(result.alerts.length).toBe(0);
    expect(result.evaluatedCount).toBe(3);
  });

  it('should ignore paused / inactive medications', () => {
    const meds: Medication[] = [
      createMockMed('1', 'Warfarin', undefined, true),
      createMockMed('2', 'Aspirin', undefined, false) // PAUSED
    ];

    const alerts = evaluateInteractions(meds);
    expect(alerts.length).toBe(0);
  });

  it('should handle single medication gracefully as insufficient_medications', () => {
    const meds: Medication[] = [
      createMockMed('1', 'Warfarin', undefined, true)
    ];

    const result = evaluateSafetyProfile(meds);
    expect(result.status).toBe('insufficient_medications');
    expect(result.alerts.length).toBe(0);
  });

  it('should safely handle unknown medications or missing generic names without throwing', () => {
    const meds: Medication[] = [
      createMockMed('1', 'UnknownCustomHerbalTea_XYZ', undefined, true),
      createMockMed('2', 'UnspecifiedVitaminBlend_ABC', undefined, true)
    ];

    const result = evaluateSafetyProfile(meds);
    expect(result.status).toBe('none_found_in_dataset');
    expect(result.alerts.length).toBe(0);
    expect(result.unassessedNames).toContain('UnknownCustomHerbalTea_XYZ');
  });

  it('should safely normalize dosage strings, salt names, and special characters', () => {
    const meds: Medication[] = [
      createMockMed('1', 'Coumadin 5.0 mg Tablets (Warfarin Sodium HCL)', undefined, true),
      createMockMed('2', 'Extra-Strength Aspirin, 325 mg (Enteric-Coated)', undefined, true)
    ];

    const alerts = evaluateInteractions(meds);
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    expect(alerts[0].ruleId).toBe('anticoagulant_nsaid');
  });
});
