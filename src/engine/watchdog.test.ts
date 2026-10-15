import { describe, it, expect } from 'vitest';
import { evaluateInteractions } from './watchdog';
import type { Medication } from '../types';

function createMockMed(id: string, name: string, genericName?: string, isActive: boolean = true): Medication {
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

  it('should return no alerts when medications are safe/compatible', () => {
    const meds: Medication[] = [
      createMockMed('1', 'Lisinopril 20mg'),
      createMockMed('2', 'Metformin 500mg'),
      createMockMed('3', 'Atorvastatin 20mg')
    ];

    const alerts = evaluateInteractions(meds);
    expect(alerts.length).toBe(0);
  });

  it('should ignore paused / inactive medications', () => {
    const meds: Medication[] = [
      createMockMed('1', 'Warfarin', undefined, true),
      createMockMed('2', 'Aspirin', undefined, false) // PAUSED
    ];

    const alerts = evaluateInteractions(meds);
    expect(alerts.length).toBe(0);
  });
});
