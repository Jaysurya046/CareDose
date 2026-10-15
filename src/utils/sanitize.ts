/**
 * Pure utility functions for string normalization and sanitization
 */

/**
 * Normalizes a drug name or active ingredient string for consistent keyword matching.
 * Strips common dosage strengths, units, formulation suffixes, and non-alphanumeric characters.
 */
export function normalizeDrugString(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  return text
    .toLowerCase()
    .replace(/[0-9]+(?:\.[0-9]+)?\s*(?:mg|mcg|g|ml|tablets?|capsules?|er|xr|sr|cr|hcl|sodium|potassium|calcium)\b/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Generates a unique, URL-safe local identifier.
 */
export function generateLocalId(prefix: string = 'id'): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 7);
  return `${prefix}-${timestamp}-${randomPart}`;
}
