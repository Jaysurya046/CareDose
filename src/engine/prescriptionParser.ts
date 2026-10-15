/**
 * Conservative Clinical Prescription Parser & Ambiguity Evaluator.
 * 
 * CORE PRINCIPLES:
 * 1. CareDose assists with prescription transcription; it NEVER guesses or invents instructions.
 * 2. Drug database matches are SUGGESTIONS, not prescription verification.
 * 3. Never infer missing strength from marketed strengths.
 * 4. Never infer dose quantity from tablet strength.
 * 5. Unresolved ambiguity blocks active scheduling.
 */

import type {
  FieldStatus,
  PrescriptionMedicationDraft,
  TextRecognitionSegment,
  TimeSlot,
  BoundingBox
} from '../types';
import { COMMON_DRUG_CATALOG, type DrugCatalogEntry } from '../data/drugCatalog';
import { generateLocalId } from '../utils/sanitize';

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
 * Splits raw OCR or PDF text into distinct medication line blocks.
 */
export function segmentPrescriptionBlocks(rawText: string): string[] {
  if (!rawText || !rawText.trim()) return [];

  // Normalize line breaks
  const cleaned = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = cleaned.split('\n').map(l => l.trim()).filter(Boolean);

  const blocks: string[] = [];
  let currentBlock: string[] = [];

  // Common prescription item delimiters: "1.", "2.", "Rx", "Tab", "#"
  const itemHeaderRegex = /^(?:(?:\d+[\.\)]|Rx:?|Item\s*\d+:?|#\d+:?)\s+)/i;

  for (const line of lines) {
    // Ignore standalone clinic/administrative header lines if they have no drug or prescriber info
    if (/^(?:clinic|rx\s+pad|medical\s+center|patient|dob|address|phone|dea)\b/i.test(line) &&
        !line.match(/\d+\s*(?:mg|mcg|ml|mEq)/i)) {
      continue;
    }

    if (itemHeaderRegex.test(line)) {
      if (currentBlock.length > 0) {
        const textSoFar = currentBlock.join('\n');
        // Only push pre-existing block if it contains medication signals
        if (/\b(?:mg|mcg|ml|mEq|tablet|capsule|take|daily|bid|tid)\b/i.test(textSoFar) ||
            COMMON_DRUG_CATALOG.some(d => textSoFar.toLowerCase().includes(d.name.toLowerCase()))) {
          blocks.push(textSoFar);
        }
      }
      currentBlock = [line];
    } else {
      currentBlock.push(line);
    }
  }

  if (currentBlock.length > 0) {
    const textSoFar = currentBlock.join('\n');
    if (/\b(?:mg|mcg|ml|mEq|tablet|capsule|take|daily|bid|tid)\b/i.test(textSoFar) ||
        COMMON_DRUG_CATALOG.some(d => textSoFar.toLowerCase().includes(d.name.toLowerCase()))) {
      blocks.push(textSoFar);
    }
  }

  // If no numbered blocks detected, group into paragraphs or separate medication lines
  if (blocks.length <= 1 && lines.length > 1) {
    const candidateLines = lines.filter(l => 
      /\b(?:mg|mcg|tablet|capsule|daily|bid|tid|qid|po|take)\b/i.test(l) ||
      COMMON_DRUG_CATALOG.some(d => l.toLowerCase().includes(d.name.toLowerCase()))
    );

    if (candidateLines.length > 1) {
      return candidateLines;
    }
  }

  return blocks.length > 0 ? blocks : [cleaned.trim()];
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
        // Expand bounding box
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
    // Word boundary match
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
      // Extract first substantive word as draft name
      const cleanTokens = blockText
        .replace(/^(?:\d+[\.\)]|Rx:?|Item\s*\d+:?)\s*/i, '')
        .split(/\s+/)
        .filter(t => !/^(?:take|tab|tablet|cap|po|sig|daily|bid|tid)\b/i.test(t));

      const firstToken = cleanTokens[0] ? cleanTokens[0].replace(/[^a-zA-Z0-9-]/g, '') : '';

      if (firstToken && firstToken.length >= 3) {
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

  // Strict regex for numbers followed by medical strength units
  const strengthMatch = blockText.match(/\b(\d+(?:\.\d+)?)\s*(mg|mcg|mEq|g|ml|units?|%)\b/i);
  const unclearStrengthMatch = blockText.match(/\b(\d+[\?\*#_]+|\d+\s*[\?\*#_]+)\s*(?:mg|mcg|mEq|g|ml)/i);

  if (unclearStrengthMatch) {
    strength = unclearStrengthMatch[0];
    strengthStatus = 'uncertain';
    unclearReasons.strength = 'Strength numbers contain ambiguous or distorted characters.';
  } else if (strengthMatch) {
    strength = `${strengthMatch[1]} ${strengthMatch[2].toLowerCase()}`;
    strengthStatus = 'extracted';
  } else {
    strength = null;
    strengthStatus = 'uncertain';
    unclearReasons.strength = 'No dosage strength identified in prescription text. Do NOT guess standard strength.';
  }

  // 3. Dose Quantity vs Strength (Never merge!)
  let doseQuantity: string | null = null;
  let doseQuantityStatus: FieldStatus = 'extracted';

  // Look for instructions like "Take 2 tablets", "1 tab", "take 1 capsule", "2 puffs"
  const quantityMatch = blockText.match(/\b(?:take\s+)?([1-4]|one|two|three|four)\s+(tablet|tab|tablets|tabs|capsule|cap|capsules|caps|puff|puffs|drop|drops|ml)\b/i);

  if (quantityMatch) {
    const rawNum = quantityMatch[1].toLowerCase();
    const numMap: Record<string, string> = { one: '1', two: '2', three: '3', four: '4' };
    const parsedNum = numMap[rawNum] || rawNum;
    doseQuantity = `${parsedNum} ${quantityMatch[2].toLowerCase()}`;
    doseQuantityStatus = 'extracted';
  } else {
    // Default to null rather than assuming 1 tablet
    doseQuantity = null;
    doseQuantityStatus = 'uncertain';
    unclearReasons.doseQuantity = 'Dose quantity not explicitly specified. Confirm number of units per dose.';
  }

  // 4. Dosage Form (Tablet, Capsule, Liquid, Inhaler, Drops)
  let dosageForm: string | null = null;
  let dosageFormStatus: FieldStatus = 'extracted';

  if (/\b(?:tablet|tablets|tab|tabs)\b/i.test(blockText)) {
    dosageForm = 'Tablet';
  } else if (/\b(?:capsule|capsules|cap|caps)\b/i.test(blockText)) {
    dosageForm = 'Capsule';
  } else if (/\b(?:liquid|syrup|solution|suspension)\b/i.test(blockText)) {
    dosageForm = 'Liquid';
  } else if (/\b(?:inhaler|puffs?)\b/i.test(blockText)) {
    dosageForm = 'Inhaler';
  } else if (/\b(?:drops?|ophthalmic|otic)\b/i.test(blockText)) {
    dosageForm = 'Drops';
  } else if (/\b(?:cream|ointment|gel)\b/i.test(blockText)) {
    dosageForm = 'Topical';
  } else {
    dosageForm = 'Tablet'; // standard default but flagged
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
    // Do NOT silently invent 8 AM and 8 PM reminders without confirmation!
    scheduleStatus = 'uncertain';
    timeSlots.push('morning', 'evening'); // tentative proposal, marked uncertain
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
  } else if (/\b(?:once\s+daily|daily|every\s+day|qday|qd)\b/i.test(blockText)) {
    frequency = 'Once daily';
    if (/\b(?:morning|qam|breakfast)\b/i.test(blockText)) {
      timeSlots.push('morning');
    } else if (/\b(?:bedtime|qhs|evening|night)\b/i.test(blockText)) {
      timeSlots.push('bedtime');
    } else {
      // Missing clock time: requires user confirmation
      scheduleStatus = 'uncertain';
      unclearReasons.schedule = 'Prescription specifies "once daily" without exact time slot. Confirm morning, evening, or bedtime.';
    }
  } else if (/\b(?:as\s+needed|prn)\b/i.test(blockText)) {
    frequency = 'As needed (PRN)';
    scheduleStatus = 'extracted';
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

  instructions = instructionTokens.length > 0 ? instructionTokens.join('. ') : blockText.slice(0, 120);

  // 8. Prescriber details if explicitly present
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
 * Main parser entry point: parses raw text and OCR segments into structured drafts.
 */
export function parsePrescriptionText(
  rawText: string,
  segments: TextRecognitionSegment[] = []
): PrescriptionMedicationDraft[] {
  const blocks = segmentPrescriptionBlocks(rawText);
  const drafts: PrescriptionMedicationDraft[] = [];
  let detectedPrescriber: string | null = null;

  for (const block of blocks) {
    const parsed = parseBlock(block, segments);

    // If block has prescriber info, save it
    if (parsed.prescribedBy) {
      detectedPrescriber = parsed.prescribedBy;
    }

    // Filter out purely header/footer blocks that have no drug name, no strength, and are just prescriber/clinic info
    const isPureFooter = !parsed.name && !parsed.strength && parsed.nameStatus === 'unreadable' &&
      /^(?:dr\.?|doctor|physician|prescriber|clinic|npi|dea|rx|signature)/i.test(block.trim());

    if (isPureFooter) {
      continue;
    }

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
      prescribedBy: parsed.prescribedBy || detectedPrescriber,
      fieldStatuses,
      verificationStatus: 'pending',
      boundingBox: parsed.boundingBox,
      unclearReasons: parsed.unclearReasons,
      isExcluded: false
    });
  }

  // If a document-level prescriber was found, backfill any drafts without prescriber
  if (detectedPrescriber) {
    for (const d of drafts) {
      if (!d.prescribedBy) {
        d.prescribedBy = detectedPrescriber;
      }
    }
  }

  return drafts;
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
