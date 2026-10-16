import { describe, it, expect } from 'vitest';
import { parsePrescriptionTextWithDiagnostics, validateDraftForImport } from './prescriptionParser';

interface BenchmarkFixture {
  id: string;
  category: 
    | 'clear_printed'
    | 'low_quality_scanned'
    | 'simple_handwritten'
    | 'difficult_handwritten'
    | 'multiple_medications'
    | 'multiline_directions'
    | 'large_header_administrative'
    | 'no_identifiable_medications'
    | 'ambiguous_medication_name'
    | 'unclear_dosage_frequency'
    | 'mixed_printed_handwritten';
  description: string;
  rawText: string;
  expectedCandidateCount: number;
  expectedMedications?: {
    nameMatch?: RegExp;
    strengthMatch?: RegExp;
    dosageForm?: string;
    expectedSlots?: string[];
    shouldBeSafeWithoutEdit?: boolean;
  }[];
  forbiddenCandidateNames?: string[];
}

export const BENCHMARK_FIXTURES: BenchmarkFixture[] = [
  // 1. Large Header & Administrative Section (The Reproducible Failure)
  {
    id: 'dd-form-1289-with-valid-rx',
    category: 'large_header_administrative',
    description: 'DD Form 1289 military prescription with large header and valid Amoxicillin handwritten entry',
    rawText: `DD FORM 1289, MAY 1999
MILITARY HEALTH SYSTEM
DOD PRESCRIPTION
PATIENT NAME: DOE, JANE E.
RANK/STATUS: ACTIVE DUTY
SPONSOR SSN: 000-11-2222
DATE: 14 OCT 2026

Rx: Amoxicillin 500 mg capsules
Sig: Take 1 capsule by mouth three times daily for 10 days
Disp: 30
Refills: 0

DOCTOR: Dr. Marcus Vance, MD
SIGNATURE: Marcus Vance MD
CLINIC: FT SAM HOUSTON MED CLINIC`,
    expectedCandidateCount: 1,
    expectedMedications: [
      {
        nameMatch: /Amoxicillin/i,
        strengthMatch: /500\s*mg/i,
        dosageForm: 'Capsule'
      }
    ],
    forbiddenCandidateNames: ['DD', 'FORM', 'DOD', 'PRESCRIPTION', 'MILITARY', 'DOE', 'HOUSTON']
  },

  // 2. Blank DD Form 1289 (Zero Medications)
  {
    id: 'dd-form-1289-blank-form',
    category: 'no_identifiable_medications',
    description: 'Blank DD Form 1289 with form numbers and administrative labels only',
    rawText: `DD FORM 1289, MAY 1999
PREVIOUS EDITION MAY BE USED
DOD PRESCRIPTION
PATIENT NAME: ________________________
DATE: ________________
DOCTOR: _____________________________
SIGNATURE: __________________________`,
    expectedCandidateCount: 0,
    forbiddenCandidateNames: ['DD', 'FORM', 'DOD', 'PRESCRIPTION', 'EDITION', 'PATIENT', 'DOCTOR']
  },

  // 3. Hospital Discharge Header without Medications
  {
    id: 'hospital-discharge-summary-header-only',
    category: 'large_header_administrative',
    description: 'Hospital header and patient demographics without medication entries',
    rawText: `ST. JUDE REGIONAL MEDICAL CENTER
DEPARTMENT OF INPATIENT MEDICINE
DISCHARGE SUMMARY & CARE PLAN
PATIENT: Robert Langdon
MRN: 9812401
ADMIT DATE: 10/10/2026
DISCHARGE DATE: 10/14/2026
ATTENDING PHYSICIAN: Dr. Sarah Jenkins, MD
ROOM: 402-B`,
    expectedCandidateCount: 0,
    forbiddenCandidateNames: ['ST', 'JUDE', 'REGIONAL', 'MEDICAL', 'CENTER', 'DISCHARGE', 'PATIENT', 'JENKINS']
  },

  // 4. Clear Printed Single Rx: Atorvastatin
  {
    id: 'clear-printed-atorvastatin',
    category: 'clear_printed',
    description: 'Clear printed single prescription for Atorvastatin 20mg at bedtime',
    rawText: `METROPOLITAN HEALTH CLINIC
Rx: Atorvastatin 20 mg tablet
Sig: Take 1 tablet by mouth every night at bedtime
Disp: 90
Refills: 3
Prescriber: Dr. Robert King, MD`,
    expectedCandidateCount: 1,
    expectedMedications: [
      {
        nameMatch: /Atorvastatin/i,
        strengthMatch: /20\s*mg/i,
        dosageForm: 'Tablet',
        expectedSlots: ['bedtime']
      }
    ]
  },

  // 5. Multiple Medications (3 Items on Single Sheet)
  {
    id: 'multi-meds-3-items',
    category: 'multiple_medications',
    description: 'Three distinct printed medication items on one prescription',
    rawText: `DR. EMILY THORNE, MD
1. Lisinopril 10 mg tablet - Take 1 daily in the morning for blood pressure
2. Metformin 500 mg tablet - Take 1 tablet twice daily with morning and evening meals
3. Amlodipine 5 mg tablet - Take 1 tablet daily midday
Refills: 2`,
    expectedCandidateCount: 3,
    expectedMedications: [
      { nameMatch: /Lisinopril/i, strengthMatch: /10\s*mg/i },
      { nameMatch: /Metformin/i, strengthMatch: /500\s*mg/i },
      { nameMatch: /Amlodipine/i, strengthMatch: /5\s*mg/i }
    ],
    forbiddenCandidateNames: ['DR', 'EMILY', 'THORNE', 'TABLET', 'REFILLS']
  },

  // 6. Multiline Complex Sig Taper
  {
    id: 'multiline-prednisone-taper',
    category: 'multiline_directions',
    description: 'Multiline instructions with complex steroid taper',
    rawText: `Rx: Prednisone 10 mg tablets
Sig: Take 40 mg (4 tabs) daily for 3 days,
then 30 mg (3 tabs) daily for 3 days,
then 20 mg (2 tabs) daily for 3 days,
then 10 mg (1 tab) daily for 3 days,
then stop.
Disp: 30 tablets
Dr. David Chen`,
    expectedCandidateCount: 1,
    expectedMedications: [
      {
        nameMatch: /Prednisone/i,
        strengthMatch: /10\s*mg/i,
        dosageForm: 'Tablet'
      }
    ]
  },

  // 7. Simple Clean Handwritten Metformin
  {
    id: 'simple-handwritten-metformin',
    category: 'simple_handwritten',
    description: 'Clean handwritten Metformin 850mg prescription',
    rawText: `Rx Metformin 850 mg
1 tab twice daily morning and evening
#60`,
    expectedCandidateCount: 1,
    expectedMedications: [
      {
        nameMatch: /Metformin/i,
        strengthMatch: /850\s*mg/i,
        dosageForm: 'Tablet'
      }
    ]
  },

  // 8. Difficult / Faint Handwritten Entry
  {
    id: 'difficult-handwritten-faint',
    category: 'difficult_handwritten',
    description: 'Degraded handwritten drug entry with partial characters and 500mg',
    rawText: `Metf... 500 mg
tk 1 tab daily am`,
    expectedCandidateCount: 1,
    expectedMedications: [
      {
        nameMatch: /Metf/i,
        strengthMatch: /500\s*mg/i
      }
    ]
  },

  // 9. Completely Unreadable Scribble (Abstention)
  {
    id: 'completely-unreadable-scrawl',
    category: 'difficult_handwritten',
    description: 'Non-text symbols and unreadable marks that must not invent medications',
    rawText: `~~~~~ ???? ///////
~~~ ~~~~ ~~~
12/04/2026`,
    expectedCandidateCount: 0,
    forbiddenCandidateNames: ['~~~~~', '????', '12/04/2026']
  },

  // 10. Ambiguous Soundalike Name (Zantac)
  {
    id: 'ambiguous-soundalike-zantac',
    category: 'ambiguous_medication_name',
    description: 'Zantac 150mg correctly recognized without alter-hallucinations',
    rawText: `Rx: Zantac 150 mg
Take 1 tablet daily before bed
Disp: 30`,
    expectedCandidateCount: 1,
    expectedMedications: [
      {
        nameMatch: /Zantac/i,
        strengthMatch: /150\s*mg/i,
        dosageForm: 'Tablet'
      }
    ]
  },

  // 11. Missing Strength (Unclear Dosage)
  {
    id: 'missing-strength-gabapentin',
    category: 'unclear_dosage_frequency',
    description: 'Gabapentin without explicit strength; must flag strength as uncertain',
    rawText: `Rx: Gabapentin
Sig: Take 1 capsule three times daily
Disp: #90`,
    expectedCandidateCount: 1,
    expectedMedications: [
      {
        nameMatch: /Gabapentin/i,
        dosageForm: 'Capsule',
        shouldBeSafeWithoutEdit: false
      }
    ]
  },

  // 12. PRN / As Needed Inhaler
  {
    id: 'prn-albuterol-inhaler',
    category: 'unclear_dosage_frequency',
    description: 'Albuterol inhaler PRN; should not invent rigid morning/night schedule',
    rawText: `Rx: Albuterol HFA Inhaler 90 mcg
Sig: Inhale 2 puffs every 4 to 6 hours as needed for shortness of breath
Disp: 1 canister`,
    expectedCandidateCount: 1,
    expectedMedications: [
      {
        nameMatch: /Albuterol/i,
        strengthMatch: /90\s*mcg/i,
        dosageForm: 'Inhaler'
      }
    ]
  },

  // 13. Mixed Printed Form with Patient Name Trap
  {
    id: 'mixed-printed-form-patient-trap',
    category: 'mixed_printed_handwritten',
    description: 'Clinic pad with Patient and Doctor names that must not be extracted as drugs',
    rawText: `SUNSHINE COMMUNITY HEALTH CLINIC
PATIENT NAME: Charles Dickens
PHYSICIAN: Dr. Arthur Conan Doyle, MD
DATE: October 14, 2026

Rx: Penicillin VK 250 mg
Sig: Take 1 tablet four times daily (QID) for 7 days
Disp: 28 tabs`,
    expectedCandidateCount: 1,
    expectedMedications: [
      {
        nameMatch: /Penicillin/i,
        strengthMatch: /250\s*mg/i
      }
    ],
    forbiddenCandidateNames: ['Charles', 'Dickens', 'Arthur', 'Conan', 'Doyle', 'Sunshine', 'Community']
  },

  // 14. Pharmacy Receipt (Non-Prescription Document)
  {
    id: 'pharmacy-receipt-no-rx',
    category: 'no_identifiable_medications',
    description: 'Cash register sales receipt with store number and payment totals',
    rawText: `WALGREENS STORE #04829
123 MAIN STREET
SALE TRANS: 4912049
1 GROCERY ITEM     $3.99 T
SUBTOTAL           $3.99
TAX                $0.33
TOTAL              $4.32
VISA PURCHASE ****9812
THANK YOU FOR SHOPPING AT WALGREENS`,
    expectedCandidateCount: 0,
    forbiddenCandidateNames: ['WALGREENS', 'GROCERY', 'SUBTOTAL', 'VISA', 'PURCHASE']
  },

  // 15. Laboratory Test Requisition (Diagnostic Document)
  {
    id: 'lab-test-requisition',
    category: 'no_identifiable_medications',
    description: 'Lab test requisition sheet with ordered diagnostic panels',
    rawText: `QUEST DIAGNOSTICS REQUISITION
ORDERING MD: Dr. Gregory House
TESTS REQUESTED:
- Complete Blood Count (CBC) with diff
- Comprehensive Metabolic Panel (CMP)
- Lipid Panel fasting
- Hemoglobin A1c
SPECIMEN: Venous Blood`,
    expectedCandidateCount: 0,
    forbiddenCandidateNames: ['QUEST', 'DIAGNOSTICS', 'BLOOD', 'METABOLIC', 'LIPID', 'HEMOGLOBIN']
  },

  // 16. Low Quality Scanned PDF with Noise
  {
    id: 'low-quality-scanned-pdf-noise',
    category: 'low_quality_scanned',
    description: 'Noisy scan artifacts surrounding clean drug prescription',
    rawText: `|||| :::: .... ~~~~
Rx: Losartan Potassium 50 mg
Sig: 1 tab daily every morning
.... :::: ~~~~ ||||`,
    expectedCandidateCount: 1,
    expectedMedications: [
      {
        nameMatch: /Losartan/i,
        strengthMatch: /50\s*mg/i,
        expectedSlots: ['morning']
      }
    ]
  },

  // 17. Pediatric Liquid Oral Suspension
  {
    id: 'pediatric-liquid-suspension',
    category: 'clear_printed',
    description: 'Liquid antibiotic suspension with concentration strength',
    rawText: `Rx: Amoxicillin Oral Suspension 250 mg / 5 mL
Sig: Give 5 mL by mouth twice daily for 10 days
Disp: 100 mL bottle
Refills: 0`,
    expectedCandidateCount: 1,
    expectedMedications: [
      {
        nameMatch: /Amoxicillin/i,
        strengthMatch: /250\s*mg/i,
        dosageForm: 'Liquid'
      }
    ]
  },

  // 18. Ophthalmic Eye Drops
  {
    id: 'ophthalmic-eye-drops',
    category: 'clear_printed',
    description: 'Percentage-based strength eye drops with evening slot',
    rawText: `Rx: Latanoprost 0.005% ophthalmic solution
Sig: Instill 1 drop into both eyes once daily in the evening
Disp: 2.5 mL bottle`,
    expectedCandidateCount: 1,
    expectedMedications: [
      {
        nameMatch: /Latanoprost/i,
        strengthMatch: /0\.005%/i,
        dosageForm: 'Drops',
        expectedSlots: ['evening']
      }
    ]
  },

  // 19. Transdermal Patch with Controlled Warning
  {
    id: 'transdermal-patch-with-warning',
    category: 'clear_printed',
    description: 'Patch delivery system; administrative warnings must not be medications',
    rawText: `Rx: Fentanyl Transdermal Patch 25 mcg/hr
Apply 1 patch every 72 hours
WARNING: SCHEDULE II CONTROLLED SUBSTANCE
Dispense: 5 patches`,
    expectedCandidateCount: 1,
    expectedMedications: [
      {
        nameMatch: /Fentanyl/i,
        strengthMatch: /25\s*mcg\/hr/i
      }
    ],
    forbiddenCandidateNames: ['WARNING', 'SCHEDULE', 'CONTROLLED', 'SUBSTANCE', 'DISPENSE']
  },

  // 20. Dietary Supplement Disclaimer (Zero Rx)
  {
    id: 'dietary-supplement-disclaimer',
    category: 'no_identifiable_medications',
    description: 'Over-the-counter dietary supplement box text with FDA disclaimer',
    rawText: `ORGANIC MULTIVITAMIN COMPLEX
DIETARY SUPPLEMENT
* These statements have not been evaluated by the Food and Drug Administration.
This product is not intended to diagnose, treat, cure, or prevent any disease.
Manufactured for HealthLife Inc.
Lot: 89412 Exp: 12/28`,
    expectedCandidateCount: 0,
    forbiddenCandidateNames: ['ORGANIC', 'MULTIVITAMIN', 'DIETARY', 'SUPPLEMENT', 'FOOD', 'ADMINISTRATION']
  },

  // 21. Numbered Item Delimiters (#1, #2, #3)
  {
    id: 'numbered-delimiters-3-meds',
    category: 'multiple_medications',
    description: 'Three numbered items on one clinic sheet',
    rawText: `#1: Sertraline 50 mg - 1 tab every morning
#2: Zolpidem 10 mg - 1 tab bedtime as needed
#3: Hydrochlorothiazide 25 mg - 1 tab every morning`,
    expectedCandidateCount: 3,
    expectedMedications: [
      { nameMatch: /Sertraline/i, strengthMatch: /50\s*mg/i, expectedSlots: ['morning'] },
      { nameMatch: /Zolpidem/i, strengthMatch: /10\s*mg/i, expectedSlots: ['bedtime'] },
      { nameMatch: /Hydrochlorothiazide/i, strengthMatch: /25\s*mg/i, expectedSlots: ['morning'] }
    ]
  },

  // 22. BID Latin Abbreviation Parsing
  {
    id: 'bid-latin-abbreviation',
    category: 'unclear_dosage_frequency',
    description: 'Latin BID abbreviation mapping to two schedule slots',
    rawText: `Rx: Ciprofloxacin 500 mg
Sig: 1 tab po bid x 7d
Disp: 14 tabs`,
    expectedCandidateCount: 1,
    expectedMedications: [
      {
        nameMatch: /Ciprofloxacin/i,
        strengthMatch: /500\s*mg/i,
        dosageForm: 'Tablet',
        expectedSlots: ['morning', 'evening']
      }
    ]
  }
];

describe('Phase 3.1: Prescription Recognition Reliability & Robustness Benchmark', () => {
  it('evaluates candidate precision, recall, and safety across all 22 representative fixtures', () => {
    let truePositives = 0;
    let falsePositives = 0;
    let falseNegatives = 0;
    let totalHeaderRejections = 0;
    let totalUnsafeImportsBlocked = 0;

    const startTime = performance.now();

    for (const fixture of BENCHMARK_FIXTURES) {
      const { drafts, diagnostics } = parsePrescriptionTextWithDiagnostics(fixture.rawText);

      // Verify forbidden candidate names are NEVER extracted as medication names
      if (fixture.forbiddenCandidateNames) {
        for (const forbidden of fixture.forbiddenCandidateNames) {
          const matchedForbidden = drafts.find(d => 
            d.name && (
              d.name.toLowerCase() === forbidden.toLowerCase() ||
              d.name.toLowerCase().startsWith(forbidden.toLowerCase() + ' ')
            )
          );
          expect(
            matchedForbidden,
            `Fixture '${fixture.id}' incorrectly extracted administrative/header word '${forbidden}' as medication name!`
          ).toBeUndefined();
          totalHeaderRejections++;
        }
      }

      // Check candidate count match
      if (drafts.length === fixture.expectedCandidateCount) {
        truePositives += drafts.length;
      } else if (drafts.length > fixture.expectedCandidateCount) {
        const extra = drafts.length - fixture.expectedCandidateCount;
        falsePositives += extra;
        truePositives += fixture.expectedCandidateCount;
      } else {
        const missed = fixture.expectedCandidateCount - drafts.length;
        falseNegatives += missed;
        truePositives += drafts.length;
      }

      // If candidates are expected, verify field extractions
      if (fixture.expectedMedications) {
        expect(
          drafts.length,
          `Fixture '${fixture.id}' expected ${fixture.expectedCandidateCount} candidates but got ${drafts.length}: [${drafts.map(d => `${d.name} (${d.strength})`).join(', ')}]`
        ).toBe(fixture.expectedCandidateCount);

        fixture.expectedMedications.forEach((expected, i) => {
          const draft = drafts[i];
          expect(draft).toBeDefined();

          if (expected.nameMatch) {
            expect(draft.name).toMatch(expected.nameMatch);
          }
          if (expected.strengthMatch) {
            expect(draft.strength).toMatch(expected.strengthMatch);
          }
          if (expected.dosageForm) {
            expect(draft.dosageForm).toBe(expected.dosageForm);
          }
          if (expected.expectedSlots) {
            for (const slot of expected.expectedSlots) {
              expect(
                draft.timeSlots,
                `Fixture '${fixture.id}' draft '${draft.name}' (raw: ${draft.sourceSnippet}) expected slot '${slot}' but had [${draft.timeSlots.join(', ')}]`
              ).toContain(slot);
            }
          }
          if (expected.shouldBeSafeWithoutEdit === false) {
            const validation = validateDraftForImport(draft);
            expect(validation.isSafeToImport).toBe(false);
            totalUnsafeImportsBlocked++;
          }
        });
      }

      // Verify diagnostics are populated
      expect(diagnostics).toBeDefined();
      expect(diagnostics.classifiedZones.length).toBeGreaterThan(0);
      expect(diagnostics.candidateEvaluations.length).toBeGreaterThanOrEqual(drafts.length);
    }

    const durationMs = performance.now() - startTime;
    const precision = truePositives / (truePositives + falsePositives);
    const recall = truePositives / (truePositives + falseNegatives);

    console.log(`\n================ BENCHMARK EVALUATION SUMMARY ================`);
    console.log(`Fixtures Tested: ${BENCHMARK_FIXTURES.length}`);
    console.log(`True Positives: ${truePositives}`);
    console.log(`False Positives: ${falsePositives}`);
    console.log(`False Negatives: ${falseNegatives}`);
    console.log(`Candidate Precision: ${(precision * 100).toFixed(1)}%`);
    console.log(`Candidate Recall: ${(recall * 100).toFixed(1)}%`);
    console.log(`Administrative Words Safely Rejected: ${totalHeaderRejections}`);
    console.log(`Unsafe Imports Successfully Blocked: ${totalUnsafeImportsBlocked}`);
    console.log(`Total Parsing Time: ${durationMs.toFixed(1)} ms (${(durationMs / BENCHMARK_FIXTURES.length).toFixed(2)} ms/fixture)`);
    console.log(`==============================================================\n`);

    // Gating asserts
    expect(precision).toBeGreaterThanOrEqual(0.95);
    expect(recall).toBeGreaterThanOrEqual(0.95);
    expect(falsePositives).toBe(0);
  });
});
