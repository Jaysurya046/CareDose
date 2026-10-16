/**
 * Layout-Aware Prescription Document Region Analysis.
 * 
 * Accurately classifies regions into:
 * - document_header (e.g. "DD FORM 1289", "DOD PRESCRIPTION", "CLINIC RX")
 * - patient_demographics (e.g. "PATIENT NAME", "DOB", "DATE", "SSN")
 * - prescription_body (contains Rx, drug names, strength, Sig, directions)
 * - prescriber_footer (physician name, NPI, DEA, signature)
 * - administrative_boilerplate ("GENERIC SUBSTITUTION", "REFILLS 0 1 2 3", "FOR PHARMACY USE")
 * 
 * CORE SAFETY RULE:
 * Administrative, demographic, and header regions must NEVER independently generate medication candidates!
 */

import type { BoundingBox, DocumentRegion, DocumentZoneType, TextRecognitionSegment } from '../types';
import { COMMON_DRUG_CATALOG } from '../data/drugCatalog';
import { generateLocalId } from '../utils/sanitize';

// Regex patterns for document classification
const HEADER_FORM_REGEX = /^(?:dd\s*form\s*\d+|da\s*form\s*\d+|va\s*form\s*\d+|dod\s*prescription|prescription\s*(?:blank|pad|form|order)|military\s*(?:health|hospital)|department\s*of\s*defense|medical\s*(?:center|clinic|facility)|general\s*hospital|outpatient\s*pharmacy|health\s*(?:services|system)|clinic\s*rx|rx\s*pad)\b/i;

const DEMOGRAPHICS_REGEX = /^(?:patient(?:\s*name)?|pt(?:\s*name)?|name\s*:|dob\s*:|date\s*of\s*birth|age\s*:|sex\s*:|gender\s*:|ssn\s*:|id\s*(?:no|num|number)?\s*:|sponsor|fmp|date\s*:|address\s*:|phone\s*:|tel\s*:|bed\s*(?:no)?\s*:|ward\s*:|allerg(?:y|ies)\s*:|weight\s*:|height\s*:)/i;

const ADMIN_BOILERPLATE_REGEX = /(?:generic\s*substitut|dispense\s*as\s*written|daw\b|do\s*not\s*substitute|refill(?:s)?\s*[:\s]*(?:none|no|0|1|2|3|4|5|prn|\d+)|for\s*pharmacy\s*use|pharmacist\s*(?:only|signature)|safety\s*cap|label\s*:|warning\s*:\s*federal\s*law|security\s*features|tamper\s*resistant)/i;

const PRESCRIBER_FOOTER_REGEX = /^(?:prescriber(?:\s*name)?|physician(?:\s*name)?|doctor\s*:|dr\.?\s+[a-z]+|m\.?d\.?|d\.?o\.?|npi\s*:|dea\s*(?:no|number)?\s*:|state\s*lic|signature(?:\s*of\s*prescriber)?|date\s*signed)\b/i;

const PRESCRIPTION_BODY_TRIGGERS = /\b(?:rx\b|sig\b|take\b|dispense|disp\s*:|po\b|bid\b|tid\b|qid\b|prn\b|q\d+h\b|daily|morning|bedtime|every\s+\d+|with\s+food)\b/i;

const CLINICAL_STRENGTH_REGEX = /\b\d+(?:\.\d+)?\s*(?:mg|mcg|ml|mEq|units?|%|g)\b/i;

const DOSAGE_FORM_REGEX = /\b(?:tablet|tablets|tab|tabs|capsule|capsules|cap|caps|liquid|syrup|solution|suspension|inhaler|puffs?|drops?|topical|cream|ointment)\b/i;

/**
 * Checks whether a line contains strong evidence of being a medication.
 */
export function hasMedicationEvidence(text: string): { hasEvidence: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const clean = text.trim();

  // 1. Direct drug catalog match
  const matchedDrug = COMMON_DRUG_CATALOG.find(d => {
    const nameRegex = new RegExp(`\\b${d.name}\\b`, 'i');
    return nameRegex.test(clean);
  });

  if (matchedDrug) {
    reasons.push(`Matched catalog formulary drug "${matchedDrug.name}"`);
  }

  // 2. Strength match (e.g. 500 mg, 10 mcg)
  const hasStrength = CLINICAL_STRENGTH_REGEX.test(clean);
  if (hasStrength) {
    reasons.push('Contains pharmaceutical strength with units');
  }

  // 3. Dosage form match
  const hasForm = DOSAGE_FORM_REGEX.test(clean);
  if (hasForm) {
    reasons.push('Contains dosage form descriptor');
  }

  // 4. Clinical directions (Sig)
  const hasDirections = PRESCRIPTION_BODY_TRIGGERS.test(clean);
  if (hasDirections) {
    reasons.push('Contains administration direction keyword (Sig/Take/Frequency)');
  }

  // Explicit item numbering (e.g. "1. ", "Rx: ")
  const isNumbered = /^(?:(?:\d+[\.\)]|Rx:?|Item\s*\d+:?|#\d+:?)\s+)/i.test(clean);
  if (isNumbered) {
    reasons.push('Preceded by medication item delimiter (Rx / numbered entry)');
  }

  // Positive evidence: A catalog match, or clinical strength, or combinations of form/directions/numbering
  const hasEvidence = (
    matchedDrug !== undefined ||
    hasStrength ||
    (hasForm && (hasDirections || isNumbered)) ||
    (isNumbered && hasDirections)
  );

  return {
    hasEvidence,
    reasons
  };
}

/**
 * Classifies an individual text line into its functional document zone.
 */
export function classifyTextLine(
  lineText: string,
  lineIndex: number,
  totalLines: number,
  normalizedY?: number // 0.0 (top) to 1.0 (bottom)
): { zone: DocumentZoneType; reason: string; confidence: number } {
  const trimmed = lineText.trim();
  if (!trimmed) {
    return { zone: 'unknown', reason: 'Empty line', confidence: 1.0 };
  }

  const yPos = typeof normalizedY === 'number' ? normalizedY : (lineIndex / Math.max(totalLines, 1));
  const medEvidence = hasMedicationEvidence(trimmed);

  // If the line has strong medication evidence, prioritize prescription body
  // UNLESS it's clearly a prescriber signature line (e.g., "Dr. Smith, MD")
  if (medEvidence.hasEvidence && !PRESCRIBER_FOOTER_REGEX.test(trimmed)) {
    return {
      zone: 'prescription_body',
      reason: `Identified prescription body: ${medEvidence.reasons.join(', ')}`,
      confidence: 0.95
    };
  }

  // Document Header: Form titles, clinic logos, DoD / hospital headers (typically in top 35% of page)
  if (HEADER_FORM_REGEX.test(trimmed) || (yPos < 0.25 && /(?:clinic|hospital|dispensary|prescription|health|department)/i.test(trimmed))) {
    return {
      zone: 'document_header',
      reason: 'Matches document title, form number (e.g. DD FORM 1289), or clinic/hospital header',
      confidence: 0.92
    };
  }

  // Patient Demographics (Name, DOB, Date, SSN, Age, Address)
  if (DEMOGRAPHICS_REGEX.test(trimmed) || (yPos < 0.45 && /^(?:date|name|dob|ssn|age|sex)\s*[:]/i.test(trimmed))) {
    return {
      zone: 'patient_demographics',
      reason: 'Contains patient identification or administrative demographic field',
      confidence: 0.90
    };
  }

  // Administrative boilerplate (Generic substitution, Refills, pharmacy use box)
  if (ADMIN_BOILERPLATE_REGEX.test(trimmed)) {
    return {
      zone: 'administrative_boilerplate',
      reason: 'Administrative boilerplate (refill counts, generic substitution disclaimers, pharmacy use)',
      confidence: 0.88
    };
  }

  // Prescriber Footer / Signature (Doctor, NPI, DEA, signature)
  if (PRESCRIBER_FOOTER_REGEX.test(trimmed) || (yPos > 0.65 && /(?:dr\.?|m\.?d\.?|prescriber|dea|npi|signature)/i.test(trimmed))) {
    return {
      zone: 'prescriber_footer',
      reason: 'Doctor identification, license/NPI, or prescriber signature block',
      confidence: 0.89
    };
  }

  // If in the middle zone (Y between 0.25 and 0.80) and not classified as admin/header
  if (yPos >= 0.20 && yPos <= 0.80) {
    if (medEvidence.reasons.length > 0) {
      return {
        zone: 'prescription_body',
        reason: `Prescription body candidate in active order zone: ${medEvidence.reasons.join(', ')}`,
        confidence: 0.75
      };
    }
  }

  return {
    zone: 'unknown',
    reason: 'Unclassified text block with no distinct layout or clinical indicators',
    confidence: 0.50
  };
}

/**
 * Segments raw document text and OCR bounding segments into structured layout regions.
 */
export function segmentDocumentIntoRegions(
  rawText: string,
  segments: TextRecognitionSegment[] = [],
  pageHeight = 1000
): DocumentRegion[] {
  if (!rawText || !rawText.trim()) return [];

  const cleaned = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = cleaned.split('\n').map(l => l.trim()).filter(Boolean);
  const regions: DocumentRegion[] = [];

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];

    // Find bounding box from segments if available
    let lineBbox: BoundingBox | undefined;
    for (const seg of segments) {
      if (seg.bbox && line.toLowerCase().includes(seg.text.toLowerCase())) {
        if (!lineBbox) {
          lineBbox = { ...seg.bbox };
        } else {
          const x2 = Math.max(lineBbox.x + lineBbox.width, seg.bbox.x + seg.bbox.width);
          const y2 = Math.max(lineBbox.y + lineBbox.height, seg.bbox.y + seg.bbox.height);
          lineBbox.x = Math.min(lineBbox.x, seg.bbox.x);
          lineBbox.y = Math.min(lineBbox.y, seg.bbox.y);
          lineBbox.width = x2 - lineBbox.x;
          lineBbox.height = y2 - lineBbox.y;
        }
      }
    }

    const normalizedY = lineBbox ? (lineBbox.y / Math.max(pageHeight, 1)) : (idx / Math.max(lines.length, 1));
    const classification = classifyTextLine(line, idx, lines.length, normalizedY);

    const isPrescriptionCandidate = (
      classification.zone === 'prescription_body' ||
      (classification.zone === 'unknown' && hasMedicationEvidence(line).hasEvidence)
    );

    regions.push({
      id: generateLocalId('region'),
      zone: classification.zone,
      text: line,
      bbox: lineBbox,
      reason: classification.reason,
      isPrescriptionCandidate
    });
  }

  return regions;
}
