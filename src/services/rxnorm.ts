export interface DrugSuggestion {
  name: string;
  genericName?: string;
  category?: string;
}

// Comprehensive offline fallback list for instantaneous, zero-latency autocomplete
const COMMON_DRUGS: DrugSuggestion[] = [
  { name: 'Advil', genericName: 'Ibuprofen', category: 'NSAID / Pain' },
  { name: 'Aleve', genericName: 'Naproxen', category: 'NSAID / Pain' },
  { name: 'Albuterol', genericName: 'Albuterol Sulfate', category: 'Bronchodilator' },
  { name: 'Amlodipine', genericName: 'Amlodipine Besylate', category: 'Blood Pressure / CCB' },
  { name: 'Aspirin', genericName: 'Acetylsalicylic Acid', category: 'Antiplatelet / Pain' },
  { name: 'Atorvastatin', genericName: 'Atorvastatin Calcium (Lipitor)', category: 'Statin / Cholesterol' },
  { name: 'Carvedilol', genericName: 'Carvedilol (Coreg)', category: 'Beta-Blocker' },
  { name: 'Celebrex', genericName: 'Celecoxib', category: 'NSAID / Cox-2' },
  { name: 'Ciprofloxacin', genericName: 'Ciprofloxacin (Cipro)', category: 'Fluoroquinolone Antibiotic' },
  { name: 'Clarithromycin', genericName: 'Clarithromycin (Biaxin)', category: 'Macrolide Antibiotic' },
  { name: 'Clopidogrel', genericName: 'Clopidogrel (Plavix)', category: 'Antiplatelet' },
  { name: 'Coumadin', genericName: 'Warfarin Sodium', category: 'Anticoagulant' },
  { name: 'Digoxin', genericName: 'Digoxin (Lanoxin)', category: 'Cardiac Glycoside' },
  { name: 'Diltiazem', genericName: 'Diltiazem (Cardizem)', category: 'Calcium Channel Blocker' },
  { name: 'Eliquis', genericName: 'Apixaban', category: 'Anticoagulant / DOAC' },
  { name: 'Escitalopram', genericName: 'Escitalopram (Lexapro)', category: 'SSRI Antidepressant' },
  { name: 'Fluoxetine', genericName: 'Fluoxetine (Prozac)', category: 'SSRI Antidepressant' },
  { name: 'Furosemide', genericName: 'Furosemide (Lasix)', category: 'Loop Diuretic' },
  { name: 'Gabapentin', genericName: 'Gabapentin (Neurontin)', category: 'Neuropathic Agent' },
  { name: 'Hydrochlorothiazide', genericName: 'HCTZ (Microzide)', category: 'Thiazide Diuretic' },
  { name: 'Ibuprofen', genericName: 'Ibuprofen (Advil/Motrin)', category: 'NSAID' },
  { name: 'Levothyroxine', genericName: 'Levothyroxine (Synthroid)', category: 'Thyroid Hormone' },
  { name: 'Lipitor', genericName: 'Atorvastatin', category: 'Statin' },
  { name: 'Lisinopril', genericName: 'Lisinopril (Zestril/Prinivil)', category: 'ACE Inhibitor' },
  { name: 'Losartan', genericName: 'Losartan Potassium (Cozaar)', category: 'ARB' },
  { name: 'Metformin', genericName: 'Metformin HCL (Glucophage)', category: 'Antidiabetic' },
  { name: 'Metoprolol', genericName: 'Metoprolol Tartrate / Succinate', category: 'Beta-Blocker' },
  { name: 'Omeprazole', genericName: 'Omeprazole (Prilosec)', category: 'Proton Pump Inhibitor' },
  { name: 'Pantoprazole', genericName: 'Pantoprazole (Protonix)', category: 'Proton Pump Inhibitor' },
  { name: 'Plavix', genericName: 'Clopidogrel', category: 'Antiplatelet' },
  { name: 'Potassium Chloride', genericName: 'K-Dur / Klor-Con', category: 'Electrolyte' },
  { name: 'Prednisone', genericName: 'Prednisone (Deltasone)', category: 'Corticosteroid' },
  { name: 'Sertraline', genericName: 'Sertraline (Zoloft)', category: 'SSRI Antidepressant' },
  { name: 'Simvastatin', genericName: 'Simvastatin (Zocor)', category: 'Statin' },
  { name: 'Spironolactone', genericName: 'Spironolactone (Aldactone)', category: 'Potassium-Sparing Diuretic' },
  { name: 'Synthroid', genericName: 'Levothyroxine Sodium', category: 'Thyroid Hormone' },
  { name: 'Tramadol', genericName: 'Tramadol (Ultram)', category: 'Analgesic / Opioid-like' },
  { name: 'Tylenol', genericName: 'Acetaminophen (APAP)', category: 'Analgesic / Antipyretic' },
  { name: 'Verapamil', genericName: 'Verapamil (Calan)', category: 'Calcium Channel Blocker' },
  { name: 'Warfarin', genericName: 'Warfarin (Coumadin)', category: 'Anticoagulant' },
  { name: 'Xarelto', genericName: 'Rivaroxaban', category: 'Anticoagulant / DOAC' },
  { name: 'Zoloft', genericName: 'Sertraline', category: 'SSRI' }
];

const cache = new Map<string, DrugSuggestion[]>();

/**
 * Searches drug names via NIH RxNorm public API with fast local fallback
 */
export async function searchDrugNames(query: string): Promise<DrugSuggestion[]> {
  const trimmed = query.trim().toLowerCase();
  if (trimmed.length < 2) return [];

  if (cache.has(trimmed)) {
    return cache.get(trimmed)!;
  }

  // 1. First, find instant local matches
  const localMatches = COMMON_DRUGS.filter(d => 
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
      const data = await response.json();
      const conceptGroups = data?.drugGroup?.conceptGroup;
      
      const remoteMatches: DrugSuggestion[] = [];
      if (Array.isArray(conceptGroups)) {
        for (const group of conceptGroups) {
          if (Array.isArray(group.conceptProperties)) {
            for (const prop of group.conceptProperties) {
              if (prop.name && !remoteMatches.some(m => m.name.toLowerCase() === prop.name.toLowerCase())) {
                remoteMatches.push({
                  name: prop.name,
                  genericName: prop.synonym || undefined
                });
                if (remoteMatches.length >= 8) break;
              }
            }
          }
          if (remoteMatches.length >= 8) break;
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
    // Graceful fallback to local catalog on network/CORS error or offline
  }

  const results = localMatches.slice(0, 10);
  cache.set(trimmed, results);
  return results;
}
