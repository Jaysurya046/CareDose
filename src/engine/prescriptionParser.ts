/**
 * Conservative Clinical Prescription Parser & Ambiguity Evaluator.
 * 
 * CORE PRINCIPLES:
 * 1. CareDose assists with prescription transcription; it NEVER guesses or invents instructions.
 * 2. Drug database matches are SUGGESTIONS, not prescription verification.
 * 3. Never infer missing strength from marketed strengths.
 * 4. Never infer dose quantity from tablet strength.
 * 5. Document headers, demographics, and form codes MUST NOT generate medication candidates.
 * 6. Unresolved ambiguity blocks active scheduling.
 */

import type {
  FieldStatus,
  PrescriptionMedicationDraft,
  TextRecognitionSegment,
  TimeSlot,
  BoundingBox,
  RecognitionDiagnostics,
  CandidateEvaluation
} from '../types';
import { COMMON_DRUG_CATALOG, type DrugCatalogEntry } from '../data/drugCatalog';
import { generateLocalId } from '../utils/sanitize';
import { segmentDocumentIntoRegions, hasMedicationEvidence } from './documentLayout';

interface ParsedBlockResult {
  name: string | null;
  nameStatus: FieldStatus;
  genericName?: string | null;
  strength: string | null;
  strengthStatus: FieldStatus;
  doseQuantity: string | null;
  doseQuantityStatus: FieldStatus;
  dosageForm: string | null;
  dosageFormStatus: FieldStatus;
  frequency: string | null;
  frequencyStatus: FieldStatus;
  scheduledTimes: string[] | null;
  timeSlots: TimeSlot[];
  scheduleStatus: FieldStatus;
  duration: string | null;
  instructions: string | null;
  prescribedBy: string | null;
  unclearReasons: Record<string, string>;
  sourceSnippet: string;
  boundingBox?: BoundingBox;
}

// Administrative and layout words that must NEVER be extracted as medication names
const NON_MEDICATION_WORDS = new Set([
  'dd', 'form', 'prescription', 'dod', 'patient', 'name', 'date', 'dob',
  'address', 'clinic', 'hospital', 'doctor', 'physician', 'prescriber',
  'pharmacy', 'department', 'dispensary', 'medical', 'center', 'signature',
  'order', 'item', 'refill', 'refills', 'generic', 'substitution', 'warning',
  'label', 'instructions', 'take', 'tk', 'give', 'tablet', 'tablets', 'tab', 'tabs',
  'capsule', 'capsules', 'cap', 'caps', 'pill', 'pills', 'drop', 'drops',
  'puff', 'puffs', 'unit', 'units', 'ml', 'mg', 'mcg', 'gm', 'dose', 'daily',
  'times', 'sign', 'sig', 'disp', 'dispense', 'ssn', 'sponsor', 'po', 'prn',
  'bid', 'tid', 'qid', 'qd', 'qhs', 'ward', 'bed', 'room', 'age', 'sex',
  'allergies', 'allergy', 'caution'
]);

/**
 * Searches the local offline catalog for suggestions without auto-selecting.
 */
export function findCatalogSuggestions(query: string): DrugCatalogEntry[] {
  if (!query || query.trim().length < 2) return [];
  const q = query.toLowerCase().trim();

  return COMMON_DRUG_CATALOG.filter(entry => {
    const nameMatch = entry.name.toLowerCase().includes(q);
    const genMatch = entry.genericName && entry.genericName.toLowerCase().includes(q);
    return nameMatch || genMatch;
  }).slice(0, 5);
}

/**
 * Splits raw OCR or PDF text into distinct medication line blocks using document layout awareness.
 * Explicitly groups multiline directions (Sig/Disp) with the preceding drug entry.
 */
export function segmentPrescriptionBlocks(rawText: string, segments: TextRecognitionSegment[] = []): string[] {
  if (!rawText || !rawText.trim()) return [];

  const regions = segmentDocumentIntoRegions(rawText, segments);
  const blocks: string[] = [];
  let currentBlockLines: string[] = [];

  // Item delimiter regex (e.g. "1. ", "2) ", "Rx:", "Item 1:")
  const itemHeaderRegex = /^(?:(?:\d+[\.\)]|Rx:?|Item\s*\d+:?|#\d+:?)\s+)/i;
  // Continuation lines: "Sig:", "Take", "Then", "Disp:", "Refills:", "1 tab", "#60"
  const continuationRegex = /^(?:sig\s*:|take\b|tk\b|give\b|then\b|followed\s+by\b|decrease\b|increase\b|taper\b|dispense\b|disp\s*:|refills?\s*:|with\s+food|do\s+not\s+crush|for\s+\d+|after\b|until\b|apply\b|instill\b|inhale\b|inject\b|#\s*\d+|\d+(?:-\d+)?\s*(?:tabs?|tablets?|caps?|capsules?|puffs?|drops?|ml|pills?|teaspoons?|tbs|tbsp|g)\b)/i;

  for (const reg of regions) {
    const text = reg.text.trim();
    if (!text) continue;

    // Discard non-prescription regions (headers, demographics, boilerplate)
    if (reg.zone === 'document_header' || reg.zone === 'patient_demographics' || reg.zone === 'administrative_boilerplate') {
      if (currentBlockLines.length > 0) {
        blocks.push(currentBlockLines.join('\n'));
        currentBlockLines = [];
      }
      continue;
    }

    // Prescriber footer line: finish current block, but do not start a medication block
    if (reg.zone === 'prescriber_footer') {
      if (currentBlockLines.length > 0) {
        blocks.push(currentBlockLines.join('\n'));
        currentBlockLines = [];
      }
      continue;
    }

    // If line starts with a new numbered/Rx item
    if (itemHeaderRegex.test(text)) {
      if (currentBlockLines.length > 0) {
        blocks.push(currentBlockLines.join('\n'));
      }
      currentBlockLines = [text];
    } else if (currentBlockLines.length > 0 && (continuationRegex.test(text) || !hasMedicationEvidence(text).hasEvidence)) {
      // Continuation of previous medication block (e.g. multiline Sig / directions)
      currentBlockLines.push(text);
    } else {
      // Line is in prescription body or has medication evidence
      const medCheck = hasMedicationEvidence(text);
      if (medCheck.hasEvidence) {
        if (currentBlockLines.length > 0) {
          blocks.push(currentBlockLines.join('\n'));
        }
        currentBlockLines = [text];
      } else if (currentBlockLines.length > 0) {
        currentBlockLines.push(text);
      }
    }
  }

  if (currentBlockLines.length > 0) {
    blocks.push(currentBlockLines.join('\n'));
  }

  // Fallback: if no blocks collected via regions, check lines with medication evidence
  if (blocks.length === 0) {
    const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const candidateLines = lines.filter(l => hasMedicationEvidence(l).hasEvidence);
    if (candidateLines.length > 0) {
      return candidateLines;
    }
  }

  return blocks;
}

/**
 * Parses an individual prescription line block into a safe draft.
 */
function parseBlock(
  blockText: string,
  segments: TextRecognitionSegment[]
): ParsedBlockResult {
  const unclearReasons: Record<string, string> = {};
  const lowerBlock = blockText.toLowerCase();

  // Find associated bounding box from segments if present
  let boundingBox: BoundingBox | undefined;
  for (const seg of segments) {
    if (seg.bbox && blockText.toLowerCase().includes(seg.text.toLowerCase())) {
      if (!boundingBox) {
        boundingBox = { ...seg.bbox };
      } else {
        const x2 = Math.max(boundingBox.x + boundingBox.width, seg.bbox.x + seg.bbox.width);
        const y2 = Math.max(boundingBox.y + boundingBox.height, seg.bbox.y + seg.bbox.height);
        boundingBox.x = Math.min(boundingBox.x, seg.bbox.x);
        boundingBox.y = Math.min(boundingBox.y, seg.bbox.y);
        boundingBox.width = x2 - boundingBox.x;
        boundingBox.height = y2 - boundingBox.y;
      }
    }
  }

  // 1. Medication Name Identification
  let detectedName: string | null = null;
  let detectedGeneric: string | null = null;
  let nameStatus: FieldStatus = 'extracted';

  // Check against offline catalog
  let matchedCatalogEntry: DrugCatalogEntry | null = null;
  for (const entry of COMMON_DRUG_CATALOG) {
    const entryName = entry.name.toLowerCase();
    const regex = new RegExp(`\\b${entryName}\\b`, 'i');
    if (regex.test(blockText)) {
      matchedCatalogEntry = entry;
      break;
    }
  }

  if (matchedCatalogEntry) {
    detectedName = matchedCatalogEntry.name;
    detectedGeneric = matchedCatalogEntry.genericName || null;
    nameStatus = 'extracted';
  } else {
    // Check for partial or fuzzy match (e.g., "Metf...", "Atorvas...")
    const partialMatch = COMMON_DRUG_CATALOG.find(entry => {
      const prefix = entry.name.slice(0, 4).toLowerCase();
      return prefix.length >= 4 && lowerBlock.includes(prefix);
    });

    if (partialMatch && /[.]{2,}|[?~]|(?:\b[a-zA-Z]{3,5}\.{2,}\b)/.test(blockText)) {
      detectedName = partialMatch.name;
      detectedGeneric = partialMatch.genericName || null;
      nameStatus = 'uncertain';
      unclearReasons.name = `Handwriting or truncated text matches possible candidate "${partialMatch.name}". Requires prescriber confirmation.`;
    } else {
      // Extract tokens, stripping numbers, Rx prefixes, and known stop words
      const cleanTokens = blockText
        .replace(/^(?:\d+[\.\)]|Rx:?|Item\s*\d+:?|#\d+:?)\s*/i, '')
        .split(/\s+/)
        .map(t => t.replace(/[^a-zA-Z0-9-]/g, ''))
        .filter(t => t.length >= 3 && !NON_MEDICATION_WORDS.has(t.toLowerCase()) && !/^\d+$/.test(t));

      const firstToken = cleanTokens[0] || '';

      if (firstToken && firstToken.length >= 3 && !NON_MEDICATION_WORDS.has(firstToken.toLowerCase())) {
        detectedName = firstToken;
        nameStatus = 'uncertain';
        unclearReasons.name = 'Medication name not found in standard formulary. Verify spelling with label or prescriber.';
      } else {
        detectedName = null;
        nameStatus = 'unreadable';
        unclearReasons.name = 'Unable to read medication name clearly.';
      }
    }
  }

  // Check if any segment associated with this name had very low OCR confidence
  const lowConfSegment = segments.find(s => 
    detectedName && 
    s.text.toLowerCase().includes(detectedName.toLowerCase()) && 
    typeof s.confidence === 'number' && 
    s.confidence < 60
  );

  if (lowConfSegment && nameStatus === 'extracted') {
    nameStatus = 'uncertain';
    unclearReasons.name = `Low optical confidence (${Math.round(lowConfSegment.confidence || 0)}%). Visual confirmation required.`;
  }

  // 2. Strength Extraction (e.g., "500 mg", "20 mEq", "10 mcg")
  let strength: string | null = null;
  let strengthStatus: FieldStatus = 'extracted';

  const strengthMatch = blockText.match(/\b(\d+(?:\.\d+)?)\s*(mg(?:\s*\/\s*\d+\s*ml)?|mcg(?:\s*\/\s*hr)?|mEq|g|ml|units?|%)(?:\b|(?=[^a-zA-Z0-9]))/i);
  const unclearStrengthMatch = blockText.match(/\b(\d+[\?\*#_]+|\d+\s*[\?\*#_]+)\s*(?:mg|mcg|mEq|g|ml)/i);

  if (unclearStrengthMatch) {
    strength = unclearStrengthMatch[0];
    strengthStatus = 'uncertain';
    unclearReasons.strength = 'Strength numbers contain ambiguous or distorted characters.';
  } else if (strengthMatch) {
    const rawUnit = strengthMatch[2].toLowerCase();
    strength = rawUnit === '%' ? `${strengthMatch[1]}%` : `${strengthMatch[1]} ${rawUnit}`.replace(/\s+/g, ' ');
    strengthStatus = 'extracted';
  } else {
    strength = null;
    strengthStatus = 'uncertain';
    unclearReasons.strength = 'No dosage strength identified in prescription text. Do NOT guess standard strength.';
  }

  // 3. Dose Quantity vs Strength (Never merge!)
  let doseQuantity: string | null = null;
  let doseQuantityStatus: FieldStatus = 'extracted';

  const quantityMatch = blockText.match(/\b(?:take\s+)?([1-4]|one|two|three|four)\s+(tablet|tab|tablets|tabs|capsule|cap|capsules|caps|puff|puffs|drop|drops|ml)\b/i);

  if (quantityMatch) {
    const rawNum = quantityMatch[1].toLowerCase();
    const numMap: Record<string, string> = { one: '1', two: '2', three: '3', four: '4' };
    const parsedNum = numMap[rawNum] || rawNum;
    doseQuantity = `${parsedNum} ${quantityMatch[2].toLowerCase()}`;
    doseQuantityStatus = 'extracted';
  } else {
    doseQuantity = null;
    doseQuantityStatus = 'uncertain';
    unclearReasons.doseQuantity = 'Dose quantity not explicitly specified. Confirm number of units per dose.';
  }

  // 4. Dosage Form (Tablet, Capsule, Liquid, Inhaler, Drops)
  let dosageForm: string | null = null;
  let dosageFormStatus: FieldStatus = 'extracted';

  if (/\b(?:drops?|ophthalmic|otic)\b/i.test(blockText)) {
    dosageForm = 'Drops';
  } else if (/\b(?:inhaler|puffs?|hfa)\b/i.test(blockText)) {
    dosageForm = 'Inhaler';
  } else if (/\b(?:tablet|tablets|tab|tabs)\b/i.test(blockText)) {
    dosageForm = 'Tablet';
  } else if (/\b(?:capsule|capsules|cap|caps)\b/i.test(blockText)) {
    dosageForm = 'Capsule';
  } else if (/\b(?:liquid|syrup|solution|suspension)\b/i.test(blockText)) {
    dosageForm = 'Liquid';
  } else if (/\b(?:cream|ointment|gel|patch)\b/i.test(blockText)) {
    dosageForm = 'Topical';
  } else {
    dosageForm = 'Tablet';
    dosageFormStatus = 'uncertain';
    unclearReasons.dosageForm = 'Dosage form not clearly stated.';
  }

  // 5. Frequency & Schedule Times
  let frequency: string | null = null;
  let frequencyStatus: FieldStatus = 'extracted';
  let scheduleStatus: FieldStatus = 'extracted';
  const timeSlots: TimeSlot[] = [];

  if (/\b(?:twice\s+daily|bid|q12h|every\s+12\s+hours?)\b/i.test(blockText)) {
    frequency = 'Twice daily';
    scheduleStatus = 'uncertain';
    timeSlots.push('morning', 'evening');
    unclearReasons.schedule = 'Prescription specifies "twice daily" without exact schedule hours. Please verify timing.';
  } else if (/\b(?:three\s+times\s+daily|tid|q8h)\b/i.test(blockText)) {
    frequency = 'Three times daily';
    scheduleStatus = 'uncertain';
    timeSlots.push('morning', 'midday', 'evening');
    unclearReasons.schedule = 'Prescription specifies "three times daily". Confirm schedule slots with prescriber.';
  } else if (/\b(?:four\s+times\s+daily|qid|q6h)\b/i.test(blockText)) {
    frequency = 'Four times daily';
    scheduleStatus = 'uncertain';
    timeSlots.push('morning', 'midday', 'evening', 'bedtime');
    unclearReasons.schedule = 'Prescription specifies "four times daily". Confirm exact slots.';
  } else if (/\b(?:once\s+daily|daily|every\s+day|qday|qd|every\s+night|nightly|every\s+morning|qam|qhs|at\s+bedtime|in\s+the\s+evening)\b/i.test(blockText)) {
    frequency = 'Once daily';
    if (/\b(?:morning|qam|breakfast|every\s+morning)\b/i.test(blockText)) {
      timeSlots.push('morning');
    } else if (/\b(?:midday|noon|lunch)\b/i.test(blockText)) {
      timeSlots.push('midday');
    } else if (/\b(?:evening|dinner)\b/i.test(blockText)) {
      timeSlots.push('evening');
    } else if (/\b(?:bedtime|qhs|night|nightly|every\s+night|at\s+bedtime)\b/i.test(blockText)) {
      timeSlots.push('bedtime');
    } else {
      scheduleStatus = 'uncertain';
      unclearReasons.schedule = 'Prescription specifies "once daily" without exact time slot. Confirm morning, evening, or bedtime.';
    }
  } else if (/\b(?:as\s+needed|prn)\b/i.test(blockText)) {
    frequency = 'As needed (PRN)';
    scheduleStatus = 'extracted';
    if (/\b(?:bedtime|qhs|night)\b/i.test(blockText)) {
      timeSlots.push('bedtime');
    } else if (/\b(?:morning|qam)\b/i.test(blockText)) {
      timeSlots.push('morning');
    }
  } else {
    frequency = null;
    frequencyStatus = 'uncertain';
    scheduleStatus = 'uncertain';
    unclearReasons.frequency = 'Administration frequency is missing or illegible.';
  }

  // 6. Duration
  let duration: string | null = null;
  const durationMatch = blockText.match(/\b(?:for\s+)?(\d+\s*(?:days?|weeks?|months?)|ongoing|\d+\s*day\s*supply)\b/i);
  if (durationMatch) {
    duration = durationMatch[0];
  }

  // 7. Special instructions (Food, Water, etc.)
  let instructions: string | null = null;
  const instructionTokens: string[] = [];

  if (/\b(?:with\s+food|with\s+meals?|after\s+food)\b/i.test(blockText)) {
    instructionTokens.push('Take with food');
  } else if (/\b(?:empty\s+stomach|before\s+meals?|before\s+food)\b/i.test(blockText)) {
    instructionTokens.push('Take on an empty stomach');
  }

  if (/\b(?:do\s+not\s+crush)\b/i.test(blockText)) {
    instructionTokens.push('Do not crush');
  }

  if (/\b(?:full\s+glass\s+of\s+water)\b/i.test(blockText)) {
    instructionTokens.push('Take with a full glass of water');
  }

  // Extract explicit Sig lines if present
  const sigMatch = blockText.match(/(?:sig\s*:|take\s+)([^.\n\r]+)/i);
  if (sigMatch && instructionTokens.length === 0) {
    instructionTokens.push(sigMatch[0].trim());
  }

  instructions = instructionTokens.length > 0 ? instructionTokens.join('. ') : '';

  // 8. Prescriber details if explicitly present in this block
  let prescribedBy: string | null = null;
  const prescriberMatch = blockText.match(/\b(?:dr\.?|doctor|physician|prescriber)\s+([a-zA-Z\s\.\,]{3,30})/i);
  if (prescriberMatch) {
    prescribedBy = `Dr. ${prescriberMatch[1].trim()}`;
  }

  return {
    name: detectedName,
    nameStatus,
    genericName: detectedGeneric,
    strength,
    strengthStatus,
    doseQuantity,
    doseQuantityStatus,
    dosageForm,
    dosageFormStatus,
    frequency,
    frequencyStatus,
    scheduledTimes: null,
    timeSlots,
    scheduleStatus,
    duration,
    instructions,
    prescribedBy,
    unclearReasons,
    sourceSnippet: blockText,
    boundingBox
  };
}

/**
 * Main layout-aware prescription parser entry point with comprehensive diagnostics.
 */
export function parsePrescriptionTextWithDiagnostics(
  rawText: string,
  segments: TextRecognitionSegment[] = []
): {
  drafts: PrescriptionMedicationDraft[];
  diagnostics: RecognitionDiagnostics;
} {
  const regions = segmentDocumentIntoRegions(rawText, segments);
  const blocks = segmentPrescriptionBlocks(rawText, segments);
  const drafts: PrescriptionMedicationDraft[] = [];
  const candidateEvaluations: CandidateEvaluation[] = [];

  // Identify any prescriber info at document level
  let documentPrescriber: string | null = null;
  for (const reg of regions) {
    if (reg.zone === 'prescriber_footer') {
      const match = reg.text.match(/\b(?:dr\.?|doctor|physician|prescriber)\s+([a-zA-Z\s\.\,]{3,30})/i);
      if (match) {
        documentPrescriber = `Dr. ${match[1].trim()}`;
      }
    }
  }

  for (const block of blocks) {
    const medEvidence = hasMedicationEvidence(block);
    const parsed = parseBlock(block, segments);

    // CRITICAL FILTER: Positive Evidence Requirement
    // A block must have at least one recognized medication indicator:
    // 1. Matched catalog entry, OR
    // 2. Strength units + form, OR
    // 3. Clinical strength, OR
    // 4. Legitimate unreadable drug candidate accompanied by dosage or instructions
    const hasCatalogName = parsed.name && COMMON_DRUG_CATALOG.some(d => d.name.toLowerCase() === parsed.name!.toLowerCase());
    const hasClinicalStrength = parsed.strength !== null;
    const isUncertainWithEvidence = parsed.name && parsed.nameStatus === 'uncertain' && (medEvidence.hasEvidence || hasClinicalStrength);
    const isUnreadableMedItem = parsed.nameStatus === 'unreadable' && (hasClinicalStrength || medEvidence.reasons.length >= 1);

    const isCredibleMedication = hasCatalogName || hasClinicalStrength || isUncertainWithEvidence || isUnreadableMedItem;

    if (!isCredibleMedication) {
      // Reject non-medication text (such as headers, form titles, demographic lines)
      candidateEvaluations.push({
        rawText: block,
        accepted: false,
        rejectionReason: 'Rejected non-medication text: Block lacks pharmaceutical name, clinical strength, or administration directions.',
        evidenceFound: medEvidence.reasons,
        zone: 'unknown'
      });
      continue;
    }

    // Accept candidate
    candidateEvaluations.push({
      rawText: block,
      accepted: true,
      medicationName: parsed.name,
      evidenceFound: medEvidence.reasons,
      zone: 'prescription_body'
    });

    const fieldStatuses: Record<string, FieldStatus> = {
      name: parsed.nameStatus,
      strength: parsed.strengthStatus,
      doseQuantity: parsed.doseQuantityStatus,
      dosageForm: parsed.dosageFormStatus,
      frequency: parsed.frequencyStatus,
      schedule: parsed.scheduleStatus
    };

    drafts.push({
      id: generateLocalId('draft'),
      sourceSnippet: parsed.sourceSnippet,
      name: parsed.name,
      genericName: parsed.genericName,
      strength: parsed.strength,
      doseQuantity: parsed.doseQuantity,
      dosageForm: parsed.dosageForm,
      frequency: parsed.frequency,
      scheduledTimes: parsed.scheduledTimes,
      timeSlots: parsed.timeSlots,
      duration: parsed.duration,
      instructions: parsed.instructions,
      rxCui: null,
      prescribedBy: parsed.prescribedBy || documentPrescriber,
      fieldStatuses,
      verificationStatus: 'pending',
      boundingBox: parsed.boundingBox,
      unclearReasons: parsed.unclearReasons,
      isExcluded: false
    });
  }

  // Backfill document prescriber if individual draft didn't extract one
  if (documentPrescriber) {
    for (const d of drafts) {
      if (!d.prescribedBy) {
        d.prescribedBy = documentPrescriber;
      }
    }
  }

  const diagnostics: RecognitionDiagnostics = {
    totalRegions: regions.length,
    classifiedZones: regions.map(r => ({
      zone: r.zone,
      snippet: r.text.slice(0, 80),
      bbox: r.bbox,
      reason: r.reason
    })),
    candidateEvaluations,
    processingPasses: ['Layout Region Segmentation', 'Administrative Zone Filtering', 'Clinical Evidence Extraction']
  };

  return { drafts, diagnostics };
}

/**
 * Standard parser entry point (returns drafts array).
 */
export function parsePrescriptionText(
  rawText: string,
  segments: TextRecognitionSegment[] = []
): PrescriptionMedicationDraft[] {
  return parsePrescriptionTextWithDiagnostics(rawText, segments).drafts;
}

/**
 * Validates whether a medication draft is clinically safe to enter active scheduling.
 * BLOCKING CONDITION: No medication enters active scheduling if name, strength,
 * or administration schedule is uncertain or unreadable without explicit user confirmation
 * or professional clarification.
 */
export function validateDraftForImport(draft: PrescriptionMedicationDraft): {
  isSafeToImport: boolean;
  canScheduleActiveReminder: boolean;
  blockingReasons: string[];
} {
  const blockingReasons: string[] = [];

  // Excluded candidates
  if (draft.isExcluded) {
    return {
      isSafeToImport: false,
      canScheduleActiveReminder: false,
      blockingReasons: ['Medication draft is marked as excluded.']
    };
  }

  // 1. Medication Name Check
  if (!draft.name || !draft.name.trim()) {
    blockingReasons.push('Medication name is missing or unreadable.');
  } else if (
    draft.fieldStatuses.name === 'unreadable' || 
    (draft.fieldStatuses.name === 'uncertain' && draft.verificationStatus === 'pending')
  ) {
    blockingReasons.push(`Medication identity ("${draft.name}") is uncertain and requires verification.`);
  }

  // 2. Strength Check
  if (!draft.strength || !draft.strength.trim()) {
    blockingReasons.push('Dosage strength is missing.');
  } else if (
    draft.fieldStatuses.strength === 'unreadable' ||
    (draft.fieldStatuses.strength === 'uncertain' && draft.verificationStatus === 'pending')
  ) {
    blockingReasons.push(`Dosage strength ("${draft.strength}") contains unverified characters.`);
  }

  // Check if draft has any unconfirmed blocking field
  const hasUnconfirmedBlockingField = Object.entries(draft.fieldStatuses).some(([field, status]) => {
    if (field === 'instructions' || field === 'prescribedBy') return false;
    return (status === 'uncertain' || status === 'unreadable') && draft.verificationStatus === 'pending';
  });

  if (hasUnconfirmedBlockingField && blockingReasons.length === 0) {
    blockingReasons.push('Prescription contains unresolved clinical fields that require confirmation.');
  }

  // Can we schedule active reminders?
  const canScheduleActiveReminder = 
    blockingReasons.length === 0 && 
    draft.timeSlots.length > 0 &&
    draft.fieldStatuses.schedule !== 'uncertain' &&
    draft.fieldStatuses.schedule !== 'unreadable';

  return {
    isSafeToImport: blockingReasons.length === 0,
    canScheduleActiveReminder,
    blockingReasons
  };
}
