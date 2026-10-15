import type { Medication, InteractionAlert, InteractionRule } from '../types';
import { CLINICAL_INTERACTION_RULES } from '../data/interactionRules';
import { normalizeDrugString } from '../utils/sanitize';

export type AssessmentStatus = 'interactions_found' | 'none_found_in_dataset' | 'insufficient_medications';

export interface SafetyEvaluationResult {
  status: AssessmentStatus;
  alerts: InteractionAlert[];
  evaluatedCount: number;
  unassessedNames: string[];
}

/**
 * Checks if a medication's normalized name or generic name matches any keyword in a rule's list.
 */
function medicationMatchesKeywords(med: Medication, keywords: string[]): boolean {
  if (!med.name || typeof med.name !== 'string') return false;

  const normalizedName = normalizeDrugString(med.name);
  const normalizedGeneric = med.genericName ? normalizeDrugString(med.genericName) : '';

  if (!normalizedName && !normalizedGeneric) return false;

  for (const keyword of keywords) {
    const kw = keyword.toLowerCase().trim();
    if (!kw) continue;

    // Direct token or substring match against sanitized strings
    if (normalizedName.includes(kw) || (normalizedGeneric && normalizedGeneric.includes(kw))) {
      return true;
    }
  }
  return false;
}

/**
 * Pure, deterministic evaluation of active medications against clinical safety rules.
 * Does not make network calls or access DOM.
 * Accurately distinguishes between known interactions detected, no interactions found in offline dataset,
 * and insufficient active medications.
 */
export function evaluateSafetyProfile(
  medications: Medication[],
  rules: InteractionRule[] = CLINICAL_INTERACTION_RULES
): SafetyEvaluationResult {
  const activeMeds = medications.filter(m => m && m.isActive && (m.name || m.genericName));

  if (activeMeds.length < 2) {
    return {
      status: 'insufficient_medications',
      alerts: [],
      evaluatedCount: activeMeds.length,
      unassessedNames: []
    };
  }

  const alerts: InteractionAlert[] = [];
  const seenPairKeys = new Set<string>();
  const matchedMedIds = new Set<string>();

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
            matchedMedIds.add(medA.id);
            matchedMedIds.add(medB.id);

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

  // Sort alerts deterministically: critical first, then caution, then mild, then alphabetically by title
  const severityRank: Record<string, number> = {
    critical: 0,
    caution: 1,
    mild: 2
  };

  alerts.sort((a, b) => {
    const diff = severityRank[a.severity] - severityRank[b.severity];
    if (diff !== 0) return diff;
    return a.title.localeCompare(b.title);
  });

  const unassessed = activeMeds
    .filter(m => !matchedMedIds.has(m.id))
    .map(m => m.name);

  return {
    status: alerts.length > 0 ? 'interactions_found' : 'none_found_in_dataset',
    alerts,
    evaluatedCount: activeMeds.length,
    unassessedNames: unassessed
  };
}

/**
 * Backward-compatible helper returning sorted InteractionAlert array.
 */
export function evaluateInteractions(
  medications: Medication[],
  rules: InteractionRule[] = CLINICAL_INTERACTION_RULES
): InteractionAlert[] {
  return evaluateSafetyProfile(medications, rules).alerts;
}
