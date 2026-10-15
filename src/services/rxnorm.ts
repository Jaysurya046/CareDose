import { COMMON_DRUG_CATALOG, type DrugCatalogEntry } from '../data/drugCatalog';

export interface DrugSuggestion {
  name: string;
  genericName?: string;
  category?: string;
}

const cache = new Map<string, DrugSuggestion[]>();

/**
 * Searches drug names using local offline reference catalog first,
 * with optional remote NIH RxNorm/RxNav enhancement when online.
 * Never transmits patient profiles, identifiers, or complete medication lists.
 */
export async function searchDrugNames(query: string): Promise<DrugSuggestion[]> {
  const trimmed = query.trim().toLowerCase();
  if (trimmed.length < 2) return [];

  if (cache.has(trimmed)) {
    return cache.get(trimmed)!;
  }

  // 1. Find instant local matches from curated catalog
  const localMatches: DrugSuggestion[] = COMMON_DRUG_CATALOG.filter((d: DrugCatalogEntry) => 
    d.name.toLowerCase().includes(trimmed) || 
    (d.genericName && d.genericName.toLowerCase().includes(trimmed))
  );

  // 2. Try fetching from NIH RxNorm REST endpoint if online
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000); // 2-second timeout

    const url = `https://rxnav.nlm.nih.gov/REST/drugs.json?name=${encodeURIComponent(trimmed)}`;
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data: unknown = await response.json();
      const remoteMatches: DrugSuggestion[] = [];

      // Safe validation of external API response structure
      if (typeof data === 'object' && data !== null && 'drugGroup' in data) {
        const drugGroup = (data as { drugGroup?: { conceptGroup?: unknown } }).drugGroup;
        const conceptGroups = drugGroup?.conceptGroup;

        if (Array.isArray(conceptGroups)) {
          for (const group of conceptGroups) {
            if (typeof group === 'object' && group !== null && 'conceptProperties' in group) {
              const props = (group as { conceptProperties?: unknown }).conceptProperties;
              if (Array.isArray(props)) {
                for (const prop of props) {
                  if (typeof prop === 'object' && prop !== null && 'name' in prop && typeof prop.name === 'string') {
                    const name = prop.name.trim();
                    const synonym = 'synonym' in prop && typeof prop.synonym === 'string' ? prop.synonym : undefined;
                    if (name && !remoteMatches.some(m => m.name.toLowerCase() === name.toLowerCase())) {
                      remoteMatches.push({
                        name,
                        genericName: synonym
                      });
                      if (remoteMatches.length >= 8) break;
                    }
                  }
                }
              }
            }
            if (remoteMatches.length >= 8) break;
          }
        }
      }

      // Merge remote and local (avoiding duplicates)
      const combined = [...localMatches];
      for (const rm of remoteMatches) {
        if (!combined.some(c => c.name.toLowerCase() === rm.name.toLowerCase())) {
          combined.push(rm);
        }
      }

      const results = combined.slice(0, 10);
      cache.set(trimmed, results);
      return results;
    }
  } catch {
    // Graceful offline fallback on network error, timeout, or CORS block
  }

  const results = localMatches.slice(0, 10);
  cache.set(trimmed, results);
  return results;
}
