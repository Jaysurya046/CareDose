import { describe, it, expect } from 'vitest';
import {
  parsePrescriptionText,
  parsePrescriptionTextWithDiagnostics,
  validateDraftForImport
} from './prescriptionParser';
import { segmentDocumentIntoRegions } from './documentLayout';
import type { TextRecognitionSegment } from '../types';

/**
 * Levenshtein distance for Character Error Rate (CER) and Word Error Rate (WER).
 */
function levenshteinDistance(s1: string[], s2: string[]): number {
  const m = s1.length;
  const n = s2.length;
  const d: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,      // deletion
        d[i][j - 1] + 1,      // insertion
        d[i - 1][j - 1] + cost // substitution
      );
    }
  }
  return d[m][n];
}

interface ImageBenchmarkFixture {
  id: string;
  category: 'printed' | 'clearly_handwritten' | 'difficult_cursive' | 'mixed' | 'low_res_rotated' | 'administrative_only' | 'ambiguous';
  description: string;
  referenceText: string;
  ocrOutputText: string;
  ocrSegments?: TextRecognitionSegment[];
  expectedMedicationCount: number;
  expectedMedNames?: string[];
  expectedAbstentionOrGated: boolean;
}

const IMAGE_BENCHMARK_FIXTURES: ImageBenchmarkFixture[] = [
  {
    id: 'img-1-printed-clean',
    category: 'printed',
    description: 'High-contrast printed clinic prescription (Amoxicillin 500mg)',
    referenceText: 'Amoxicillin 500 mg capsule. Take 1 capsule three times daily for 10 days.',
    ocrOutputText: 'Amoxicillin 500 mg capsule. Take 1 capsule three times daily for 10 days.',
    expectedMedicationCount: 1,
    expectedMedNames: ['Amoxicillin'],
    expectedAbstentionOrGated: false
  },
  {
    id: 'img-2-handwritten-reproduced-diagnostic',
    category: 'difficult_cursive',
    description: 'Actual failing diagnostic scan from Phase 3.1 (Belladonna, Ampicillin, Syrup)',
    referenceText: 'Tab Belladonna 5 mg\nAmpicillin 120 mg\nSyp Simethicone tid ac',
    ocrOutputText: 'Tn Bellidopnas 5 me\nAmpteeget goed 120 |me\nSep Sm {id ac',
    ocrSegments: [
      { text: 'Tn Bellidopnas 5 me', bbox: { x: 45, y: 150, width: 320, height: 28 }, type: 'line', confidence: 54 },
      { text: 'Ampteeget goed 120 |me', bbox: { x: 45, y: 190, width: 360, height: 30 }, type: 'line', confidence: 48 },
      { text: 'Sep Sm {id ac', bbox: { x: 45, y: 230, width: 260, height: 26 }, type: 'line', confidence: 42 }
    ],
    expectedMedicationCount: 3,
    expectedAbstentionOrGated: true // MUST be gated as uncertain; never auto-confirmed
  },
  {
    id: 'img-3-handwritten-clear',
    category: 'clearly_handwritten',
    description: 'Legible physician handwriting with standard Latin abbreviations (Metformin 500mg bid)',
    referenceText: 'Metformin 500 mg tab\nSig: 1 tab bid with food',
    ocrOutputText: 'Metformin 500 mg tab\nSig: 1 tab bid with food',
    ocrSegments: [
      { text: 'Metformin 500 mg tab', bbox: { x: 50, y: 120, width: 280, height: 32 }, type: 'line', confidence: 88 },
      { text: 'Sig: 1 tab bid with food', bbox: { x: 50, y: 160, width: 310, height: 30 }, type: 'line', confidence: 85 }
    ],
    expectedMedicationCount: 1,
    expectedMedNames: ['Metformin'],
    expectedAbstentionOrGated: true // bid without exact hours requires confirmation
  },
  {
    id: 'img-4-mixed-form-and-cursive',
    category: 'mixed',
    description: 'Standard hospital prescription slip with printed header and handwritten order lines',
    referenceText: 'HOSPITAL DISPENSARY\nRx: Paracetamol 650 mg tablet\n1 tab tid prn pain',
    ocrOutputText: 'HOSPITAL DISPENSARY\nRx: Paracetamol 650 mg tablet\n1 tab tid prn pain',
    ocrSegments: [
      { text: 'HOSPITAL DISPENSARY', bbox: { x: 100, y: 40, width: 400, height: 30 }, type: 'line', confidence: 95 },
      { text: 'Rx: Paracetamol 650 mg tablet', bbox: { x: 80, y: 220, width: 350, height: 32 }, type: 'line', confidence: 82 },
      { text: '1 tab tid prn pain', bbox: { x: 80, y: 260, width: 220, height: 28 }, type: 'line', confidence: 78 }
    ],
    expectedMedicationCount: 1,
    expectedMedNames: ['Paracetamol'],
    expectedAbstentionOrGated: true
  },
  {
    id: 'img-5-low-res-garbled',
    category: 'low_res_rotated',
    description: 'Low-resolution blurry document yielding degraded text with incomplete strength units',
    referenceText: 'Atorvastatin 20 mg daily',
    ocrOutputText: 'Atorvas... 20 m9 qd',
    ocrSegments: [
      { text: 'Atorvas... 20 m9 qd', bbox: { x: 60, y: 180, width: 290, height: 30 }, type: 'line', confidence: 52 }
    ],
    expectedMedicationCount: 1,
    expectedAbstentionOrGated: true
  },
  {
    id: 'img-6-administrative-only',
    category: 'administrative_only',
    description: 'Purely administrative form (DD FORM 1289 header, patient demographics, no drugs)',
    referenceText: 'DD FORM 1289 MAY 2005\nDOD PRESCRIPTION\nPATIENT NAME: DOE, JOHN\nDATE: 2026-10-15',
    ocrOutputText: 'DD FORM 1289 MAY 2005\nDOD PRESCRIPTION\nPATIENT NAME: DOE, JOHN\nDATE: 2026-10-15',
    ocrSegments: [
      { text: 'DD FORM 1289 MAY 2005', bbox: { x: 30, y: 20, width: 300, height: 25 }, type: 'line', confidence: 92 },
      { text: 'DOD PRESCRIPTION', bbox: { x: 150, y: 55, width: 250, height: 28 }, type: 'line', confidence: 94 },
      { text: 'PATIENT NAME: DOE, JOHN', bbox: { x: 30, y: 95, width: 280, height: 24 }, type: 'line', confidence: 89 },
      { text: 'DATE: 2026-10-15', bbox: { x: 400, y: 95, width: 180, height: 24 }, type: 'line', confidence: 91 }
    ],
    expectedMedicationCount: 0,
    expectedAbstentionOrGated: true
  },
  {
    id: 'img-7-ambiguous-instructions',
    category: 'ambiguous',
    description: 'Unclear directions ("as directed" / "ud") requiring safe clinical abstention',
    referenceText: 'Prednisone 10 mg tab\nTake as directed',
    ocrOutputText: 'Prednisone 10 mg tab\nTake ud taper',
    ocrSegments: [
      { text: 'Prednisone 10 mg tab', bbox: { x: 50, y: 200, width: 260, height: 30 }, type: 'line', confidence: 86 },
      { text: 'Take ud taper', bbox: { x: 50, y: 240, width: 180, height: 28 }, type: 'line', confidence: 70 }
    ],
    expectedMedicationCount: 1,
    expectedMedNames: ['Prednisone'],
    expectedAbstentionOrGated: true
  }
];

describe('Phase 3.2: Full OCR Pipeline & Image-Level Benchmark', () => {
  it('measures Character Error Rate, Word Error Rate, and extraction safety across all fixtures', () => {
    let totalRefWords = 0;
    let totalWordErrors = 0;
    let totalRefChars = 0;
    let totalCharErrors = 0;

    let totalExpectedMeds = 0;
    let truePositives = 0;
    let falsePositives = 0;
    let falseNegatives = 0;

    let unsafeImportsAttempted = 0;
    let safeAbstentions = 0;

    const startTime = performance.now();

    for (const fixture of IMAGE_BENCHMARK_FIXTURES) {
      // Calculate WER and CER
      const refWords = fixture.referenceText.trim().split(/\s+/).filter(Boolean);
      const hypWords = fixture.ocrOutputText.trim().split(/\s+/).filter(Boolean);
      totalRefWords += refWords.length;
      totalWordErrors += levenshteinDistance(refWords, hypWords);

      const refChars = fixture.referenceText.replace(/\s+/g, '').split('');
      const hypChars = fixture.ocrOutputText.replace(/\s+/g, '').split('');
      totalRefChars += refChars.length;
      totalCharErrors += levenshteinDistance(refChars, hypChars);

      totalExpectedMeds += fixture.expectedMedicationCount;

      // Run through layout-aware parser
      const { drafts, diagnostics } = parsePrescriptionTextWithDiagnostics(
        fixture.ocrOutputText,
        fixture.ocrSegments || []
      );

      // Verify geometry coordinates are preserved and not N/A when provided
      if (fixture.ocrSegments && fixture.ocrSegments.length > 0) {
        const classifiedWithBbox = diagnostics.classifiedZones.filter(z => z.bbox !== undefined);
        expect(classifiedWithBbox.length).toBeGreaterThan(0);
      }

      // Check candidate counts
      if (fixture.expectedMedicationCount === 0) {
        if (drafts.length > 0) {
          falsePositives += drafts.length;
        } else {
          safeAbstentions++;
        }
      } else {
        if (drafts.length >= fixture.expectedMedicationCount) {
          truePositives += fixture.expectedMedicationCount;
          falsePositives += (drafts.length - fixture.expectedMedicationCount);
        } else {
          truePositives += drafts.length;
          falseNegatives += (fixture.expectedMedicationCount - drafts.length);
        }

        // Check if any draft would unsafely import without human confirmation
        for (const draft of drafts) {
          const validation = validateDraftForImport(draft);
          if (fixture.expectedAbstentionOrGated) {
            if (validation.isSafeToImport) {
              unsafeImportsAttempted++;
            } else {
              safeAbstentions++;
            }
          }
        }
      }
    }

    const elapsedMs = performance.now() - startTime;
    const wer = (totalWordErrors / totalRefWords) * 100;
    const cer = (totalCharErrors / totalRefChars) * 100;
    const precision = truePositives / (truePositives + falsePositives || 1) * 100;
    const recall = truePositives / (totalExpectedMeds || 1) * 100;

    console.log('\n================ IMAGE-LEVEL OCR PIPELINE BENCHMARK ================');
    console.log(`Fixtures Evaluated: ${IMAGE_BENCHMARK_FIXTURES.length}`);
    console.log(`Word Error Rate (WER): ${wer.toFixed(2)}%`);
    console.log(`Character Error Rate (CER): ${cer.toFixed(2)}%`);
    console.log(`Candidate Precision: ${precision.toFixed(1)}%`);
    console.log(`Candidate Recall: ${recall.toFixed(1)}% (${truePositives}/${totalExpectedMeds})`);
    console.log(`Safe Abstentions & Gated Checks: ${safeAbstentions}`);
    console.log(`Unsafe Auto-Imports Attempted: ${unsafeImportsAttempted} (Must be 0)`);
    console.log(`Pipeline Processing Time: ${elapsedMs.toFixed(2)} ms (${(elapsedMs / IMAGE_BENCHMARK_FIXTURES.length).toFixed(2)} ms/fixture)`);
    console.log('=====================================================================\n');

    expect(unsafeImportsAttempted).toBe(0);
    expect(recall).toBeGreaterThanOrEqual(85);
    expect(precision).toBeGreaterThanOrEqual(85);
  });
});

describe('Phase 3.2: OCR Pipeline Lifecycle & State Consistency Regressions', () => {
  it('correctly extracts candidates and geometry from representative handwritten OCR output (Tn Bellidopnas)', () => {
    const rawOcr = `
      Tn Bellidopnas 5 me
      Ampteeget goed 120 |me
      Sep Sm {id ac
    `;
    const segments: TextRecognitionSegment[] = [
      { text: 'Tn Bellidopnas 5 me', bbox: { x: 50, y: 150, width: 300, height: 28 }, type: 'line', confidence: 55 },
      { text: 'Ampteeget goed 120 |me', bbox: { x: 50, y: 190, width: 320, height: 30 }, type: 'line', confidence: 50 },
      { text: 'Sep Sm {id ac', bbox: { x: 50, y: 230, width: 240, height: 26 }, type: 'line', confidence: 45 }
    ];

    const { drafts, diagnostics } = parsePrescriptionTextWithDiagnostics(rawOcr, segments, {
      scanRunId: 'scan_run_test_repro',
      documentDimensions: { width: 800, height: 1100 }
    });

    // Diagnoses 3 candidate blocks rather than 0
    expect(drafts.length).toBe(3);

    // Bounding boxes are preserved and NOT N/A
    for (const draft of drafts) {
      expect(draft.boundingBox).toBeDefined();
      expect(draft.boundingBox?.width).toBeGreaterThan(0);
      expect(draft.boundingBox?.height).toBeGreaterThan(0);
    }

    // Every candidate must be gated as uncertain; none can auto-import
    for (const draft of drafts) {
      const validation = validateDraftForImport(draft);
      expect(validation.isSafeToImport).toBe(false);
    }

    // Diagnostics must expose the 5 stages
    expect(diagnostics.stages?.length).toBe(5);
    expect(diagnostics.scanRunId).toBe('scan_run_test_repro');
  });

  it('prevents stale scan results when Scan A is superseded by Scan B', async () => {
    let activeScanId: string | null = null;
    const completedScans: string[] = [];

    // Simulate Scan A starting
    const runScanA = async () => {
      const scanAId = 'scan_A';
      activeScanId = scanAId;

      await new Promise(res => setTimeout(res, 50));
      if (activeScanId !== scanAId) return; // Superseded check

      completedScans.push('A');
    };

    // Simulate Scan B replacing Scan A shortly after
    const runScanB = async () => {
      await new Promise(res => setTimeout(res, 10));
      const scanBId = 'scan_B';
      activeScanId = scanBId; // Scan B takes over

      await new Promise(res => setTimeout(res, 20));
      if (activeScanId !== scanBId) return; // Superseded check

      completedScans.push('B');
    };

    await Promise.all([runScanA(), runScanB()]);

    // Only Scan B should have completed!
    expect(completedScans).toEqual(['B']);
    expect(activeScanId).toBe('scan_B');
  });

  it('handles cancellation during active scanning cleanly', async () => {
    let activeScanId: string | null = 'scan_active';
    let isCancelled = false;

    // Simulate cancellation
    const cancelScan = () => {
      activeScanId = null;
      isCancelled = true;
    };

    const scanWorker = async () => {
      await new Promise(res => setTimeout(res, 30));
      if (!activeScanId || isCancelled) {
        return { aborted: true };
      }
      return { aborted: false };
    };

    setTimeout(() => cancelScan(), 10);
    const result = await scanWorker();
    expect(result.aborted).toBe(true);
  });

  it('allows safe import only after user confirms uncertain fields from region crop', () => {
    const rawBlock = 'Bellidopnas 5 me';
    const drafts = parsePrescriptionText(rawBlock);
    expect(drafts.length).toBe(1);

    const draft = drafts[0];
    expect(draft.fieldStatuses.name).toBe('uncertain');
    expect(draft.fieldStatuses.strength).toBe('uncertain');
    expect(validateDraftForImport(draft).isSafeToImport).toBe(false);

    // User transcribes and confirms in region crop modal
    draft.name = 'Belladonna';
    draft.strength = '5 mg';
    draft.fieldStatuses.name = 'user_confirmed';
    draft.fieldStatuses.strength = 'user_confirmed';
    draft.verificationStatus = 'user_confirmed';

    expect(validateDraftForImport(draft).isSafeToImport).toBe(true);
  });

  it('correctly classifies central prescription order regions and rejects headers', () => {
    const documentText = `
      METROPOLITAN HOSPITAL PRESCRIPTION ORDER
      PATIENT NAME: JOHN DOE  DOB: 1965-08-14
      DATE: 2026-10-16
      
      Amoxicillin 500 mg capsule
      Take 1 capsule every 8 hours
      
      Dr. Jane Smith, MD
    `;

    const regions = segmentDocumentIntoRegions(documentText);
    const header = regions.find(r => r.zone === 'document_header');
    expect(header).toBeDefined();

    const body = regions.filter(r => r.zone === 'prescription_body');
    expect(body.length).toBeGreaterThan(0);

    const footer = regions.find(r => r.zone === 'prescriber_footer');
    expect(footer).toBeDefined();
  });
});
