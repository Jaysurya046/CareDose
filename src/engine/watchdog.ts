import type { Medication, InteractionAlert, InteractionRule } from '../types';
import { CLINICAL_INTERACTION_RULES } from './interactionRules';

/**
 * Clean and normalize a drug name string for keyword matching
 */
function normalizeDrugString(text: string): string {
  return text
    .toLowerCase()
    .replace(/[0-9]+(?:\.[0-9]+)?\s*(?:mg|mcg|g|ml|tablets?|capsules?|er|xr|sr|cr|hcl)/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim();
}

/**
 * Checks if a medication matches any keyword in a rule's keyword list
 */
function medicationMatchesKeywords(med: Medication, keywords: string[]): boolean {
  const normalizedName = normalizeDrugString(med.name);
  const normalizedGeneric = med.genericName ? normalizeDrugString(med.genericName) : '';

  for (const keyword of keywords) {
    const kw = keyword.toLowerCase();
    // Direct token or substring match
    if (normalizedName.includes(kw) || (normalizedGeneric && normalizedGeneric.includes(kw))) {
      return true;
    }
  }
  return false;
}

/**
 * Evaluates active medications against the clinical safety matrix.
 * Returns sorted alerts (Critical severity first).
 */
export function evaluateInteractions(
  medications: Medication[], 
  rules: InteractionRule[] = CLINICAL_INTERACTION_RULES
): InteractionAlert[] {
  const activeMeds = medications.filter(m => m.isActive);
  if (activeMeds.length < 2) {
    return [];
  }

  const alerts: InteractionAlert[] = [];
  const seenPairKeys = new Set<string>();

  for (let i = 0; i < activeMeds.length; i++) {
    for (let j = i + 1; j < activeMeds.length; j++) {
      const medA = activeMeds[i];
      const medB = activeMeds[j];

      for (const rule of rules) {
        const directMatch = 
          medicationMatchesKeywords(medA, rule.drugAKeywords) && 
          medicationMatchesKeywords(medB, rule.drugBKeywords);
        
        const reverseMatch = 
          medicationMatchesKeywords(medB, rule.drugAKeywords) && 
          medicationMatchesKeywords(medA, rule.drugBKeywords);

        if (directMatch || reverseMatch) {
          const pairKey = [medA.id, medB.id, rule.id].sort().join('::');
          if (!seenPairKeys.has(pairKey)) {
            seenPairKeys.add(pairKey);
            alerts.push({
              ruleId: rule.id,
              severity: rule.severity,
              drugA: directMatch ? medA.name : medB.name,
              drugB: directMatch ? medB.name : medA.name,
              title: rule.title,
              description: rule.description,
              clinicalAction: rule.clinicalAction
            });
          }
        }
      }
    }
  }

  // Sort: critical first, then caution, then mild
  const severityRank: Record<string, number> = {
    critical: 0,
    caution: 1,
    mild: 2
  };

  return alerts.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
}
