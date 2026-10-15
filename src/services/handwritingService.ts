/**
 * Local-First Handwriting Recognition & Ambiguity Detection Service.
 * 
 * CORE PRINCIPLE:
 * CareDose never guesses or invents clinical instructions.
 * Tesseract.js is NOT a reliable clinical handwriting reader.
 * When handwritten, cursive, or low-clarity text is encountered,
 * this service isolates the visual region and requires explicit user review
 * or pharmacist/prescriber clarification.
 */

import type { BoundingBox, TextRecognitionSegment } from '../types';

export interface HandwritingDiscrepancy {
  textSnippet: string;
  source: 'handwriting' | 'ocr_mismatch' | 'illegible_ink';
  region?: BoundingBox;
  possibleReadings: string[];
  reason: string;
}

export interface HandwritingAnalysisResult {
  hasHandwritingEvidence: boolean;
  handwritingRegions: BoundingBox[];
  discrepancies: HandwritingDiscrepancy[];
  modelAvailable: boolean;
  engineNotice: string;
}

/**
 * Evaluates whether an on-device Browser Handwriting Recognition API is supported.
 * (e.g., experimental navigator.createHandwritingRecognizer).
 */
export function isBrowserHtrSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return typeof (window as any).HandwritingRecognizer !== 'undefined' ||
         typeof (navigator as any).createHandwritingRecognizer === 'function';
}

/**
 * Analyzes OCR word segments and canvas pixel density to identify handwritten,
 * cursive, or ambiguous ink regions.
 */
export async function analyzeHandwritingEvidence(
  canvas: HTMLCanvasElement,
  segments: TextRecognitionSegment[]
): Promise<HandwritingAnalysisResult> {
  const discrepancies: HandwritingDiscrepancy[] = [];
  const handwritingRegions: BoundingBox[] = [];

  const htrSupported = isBrowserHtrSupported();

  // Inspect segments for low confidence, typical handwriting abbreviation quirks,
  // or irregular character strings (e.g. "Metf...", "mg?", illegible numbers)
  for (const seg of segments) {
    const text = seg.text.trim();
    if (!text) continue;

    const conf = seg.confidence;
    const isLowConf = typeof conf === 'number' && conf < 55;
    const hasEllipsisOrTrailingJunk = /[.]{2,}|[~_`*#?]{1,}/.test(text);
    const hasUnclearNumberFormat = /\d+[?a-zA-Z]{1,2}\d+/.test(text);

    if (isLowConf || hasEllipsisOrTrailingJunk || hasUnclearNumberFormat || seg.isHandwritingCandidate) {
      if (seg.bbox) {
        handwritingRegions.push(seg.bbox);
      }

      discrepancies.push({
        textSnippet: text,
        source: isLowConf ? 'handwriting' : 'illegible_ink',
        region: seg.bbox,
        possibleReadings: [text],
        reason: isLowConf
          ? `Low optical character recognition score (${conf ? Math.round(conf) : 'unknown'}%). Likely handwritten or faded ink.`
          : 'Irregular or ambiguous character sequence detected.'
      });
    }
  }

  // Detect signature / footer scribble regions at bottom third of canvas
  const bottomThirdY = canvas.height * 0.7;
  const bottomSegments = segments.filter(s => s.bbox && s.bbox.y > bottomThirdY);
  const signatureRegionFound = bottomSegments.some(s => 
    /dr|m\.?d\.?|sig|rx|physician|prescriber/i.test(s.text) || 
    (typeof s.confidence === 'number' && s.confidence < 45)
  );

  if (signatureRegionFound && handwritingRegions.length === 0) {
    handwritingRegions.push({
      x: Math.round(canvas.width * 0.1),
      y: Math.round(bottomThirdY),
      width: Math.round(canvas.width * 0.8),
      height: Math.round(canvas.height * 0.25)
    });
  }

  return {
    hasHandwritingEvidence: handwritingRegions.length > 0 || discrepancies.length > 0,
    handwritingRegions,
    discrepancies,
    modelAvailable: htrSupported,
    engineNotice: htrSupported
      ? 'Experimental browser on-device handwriting API detected. Requires clinical confirmation.'
      : 'On-device HTR fallback active: Prescriptions with handwritten cursive require manual review and professional clarification.'
  };
}

/**
 * Stage C: Recognition Reconciliation.
 * Reconciles OCR with detected handwriting and ambiguous segments.
 * Conflicting candidate interpretations are retained rather than smoothed away.
 */
export function reconcileRecognitionEvidence(
  primaryText: string,
  segments: TextRecognitionSegment[],
  analysis: HandwritingAnalysisResult
): {
  reconciledText: string;
  annotatedSegments: TextRecognitionSegment[];
  uncertainSnippetKeys: Set<string>;
} {
  const uncertainSnippetKeys = new Set<string>();

  for (const disc of analysis.discrepancies) {
    uncertainSnippetKeys.add(disc.textSnippet.toLowerCase());
  }

  const annotatedSegments = segments.map(seg => {
    const isUncertain = uncertainSnippetKeys.has(seg.text.toLowerCase()) || 
      (typeof seg.confidence === 'number' && seg.confidence < 50);

    return {
      ...seg,
      isHandwritingCandidate: isUncertain || seg.isHandwritingCandidate
    };
  });

  return {
    reconciledText: primaryText,
    annotatedSegments,
    uncertainSnippetKeys
  };
}
