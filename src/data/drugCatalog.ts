export interface DrugCatalogEntry {
  name: string;
  genericName?: string;
  category?: string;
}

/**
 * Curated offline reference catalog for instantaneous, zero-latency drug search.
 * Ensures the app functions completely offline without network dependency.
 */
export const COMMON_DRUG_CATALOG: DrugCatalogEntry[] = [
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
