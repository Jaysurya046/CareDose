import type { InteractionRule } from '../types';

/**
 * Curated offline pharmacological interaction reference dataset.
 * Sources: FDA drug labels, clinical pharmacology compendia, and published guidelines.
 * All rules operate on active ingredients and common brand names.
 */
export const CLINICAL_INTERACTION_RULES: InteractionRule[] = [
  {
    id: 'anticoagulant_nsaid',
    drugAKeywords: [
      'warfarin', 'coumadin', 'jantoven', 'heparin', 'eliquis', 'apixaban', 
      'xarelto', 'rivaroxaban', 'pradaxa', 'dabigatran', 'plavix', 'clopidogrel'
    ],
    drugBKeywords: [
      'aspirin', 'ibuprofen', 'advil', 'motrin', 'naproxen', 'aleve', 
      'celecoxib', 'celebrex', 'meloxicam', 'mobic', 'diclofenac', 'voltaren', 'indomethacin'
    ],
    severity: 'critical',
    title: 'Severe Internal Bleeding Hazard',
    description: 'Combining blood thinners (anticoagulants/antiplatelets) with NSAID pain relievers escalates the risk of major gastrointestinal bleeding and hemorrhagic complications.',
    clinicalAction: 'Avoid concurrent use unless specifically directed and monitored by a physician. Acetaminophen (Tylenol) is frequently considered a safer alternative for mild-to-moderate pain.'
  },
  {
    id: 'ace_inhibitor_potassium',
    drugAKeywords: [
      'lisinopril', 'prinivil', 'zestril', 'enalapril', 'vasotec', 'ramipril', 
      'altace', 'benazepril', 'lotensin', 'losartan', 'cozaar', 'valsartan', 'diovan'
    ],
    drugBKeywords: [
      'spironolactone', 'aldactone', 'potassium chloride', 'k-dur', 'klor-con', 
      'potassium gluconate', 'triamterene', 'eplerenone', 'inspra'
    ],
    severity: 'critical',
    title: 'Severe Hyperkalemia Risk',
    description: 'ACE inhibitors and ARBs decrease potassium excretion. Combining them with potassium-sparing diuretics or potassium supplements can cause dangerous elevations in serum potassium, potentially precipitating cardiac arrhythmias.',
    clinicalAction: 'Requires periodic serum potassium and renal function monitoring. Do not take over-the-counter potassium supplements without explicit physician direction.'
  },
  {
    id: 'statin_macrolide',
    drugAKeywords: [
      'atorvastatin', 'lipitor', 'simvastatin', 'zocor', 'lovastatin', 'mevacor'
    ],
    drugBKeywords: [
      'clarithromycin', 'biaxin', 'erythromycin', 'e-mycin', 'ketoconazole', 
      'nizoral', 'itraconazole', 'sporanox'
    ],
    severity: 'critical',
    title: 'Severe Rhabdomyolysis / Muscle Breakdown',
    description: 'Macrolide antibiotics and certain azole antifungals strongly inhibit CYP3A4 metabolism of statins, multiplying systemic statin exposure and risking severe rhabdomyolysis and acute kidney injury.',
    clinicalAction: 'Statin therapy should generally be temporarily paused during the course of macrolide antibiotic treatment as directed by a prescriber.'
  },
  {
    id: 'ssri_tramadol_serotonin',
    drugAKeywords: [
      'sertraline', 'zoloft', 'fluoxetine', 'prozac', 'escitalopram', 'lexapro', 
      'citalopram', 'celexa', 'paroxetine', 'paxil', 'duloxetine', 'cymbalta', 'venlafaxine', 'effexor'
    ],
    drugBKeywords: [
      'tramadol', 'ultram', 'st. john\'s wort', 'dextromethorphan', 'linezolid', 'zyvox'
    ],
    severity: 'critical',
    title: 'Serotonin Toxicity / Syndrome Risk',
    description: 'Combining serotonergic antidepressants with tramadol or other serotonergic agents can trigger central nervous system serotonin toxicity (agitation, hyperreflexia, hyperthermia, tremors).',
    clinicalAction: 'Seek prompt medical attention if neuromuscular hyperactivity, confusion, rapid heart rate, or unexplained fever occurs.'
  },
  {
    id: 'ssri_nsaid_bleeding',
    drugAKeywords: [
      'sertraline', 'zoloft', 'fluoxetine', 'prozac', 'escitalopram', 'lexapro', 
      'citalopram', 'celexa', 'paroxetine', 'paxil', 'duloxetine', 'cymbalta'
    ],
    drugBKeywords: [
      'aspirin', 'ibuprofen', 'advil', 'motrin', 'naproxen', 'aleve'
    ],
    severity: 'caution',
    title: 'Increased Gastrointestinal Bleed Risk',
    description: 'SSRIs reduce platelet serotonin uptake and impair primary hemostasis, compounding the gastric mucosal irritation and ulceration caused by NSAIDs.',
    clinicalAction: 'Discuss gastroprotective therapy (e.g., proton pump inhibitor) or alternative analgesics with your healthcare provider.'
  },
  {
    id: 'beta_blocker_ccb',
    drugAKeywords: [
      'metoprolol', 'lopressor', 'toprol', 'atenolol', 'tenormin', 'carvedilol', 'coreg', 'bisoprolol'
    ],
    drugBKeywords: [
      'verapamil', 'calan', 'verelan', 'diltiazem', 'cardizem', 'tiazac'
    ],
    severity: 'caution',
    title: 'Bradycardia & Heart Block Risk',
    description: 'Concurrent administration of beta-blockers and non-dihydropyridine calcium channel blockers exerts additive negative chronotropic and dromotropic effects, risking severe bradycardia or heart block.',
    clinicalAction: 'Requires close pulse and blood pressure monitoring. Promptly report dizziness, fainting episodes, or resting heart rate below 50 bpm.'
  },
  {
    id: 'digoxin_amiodarone',
    drugAKeywords: [
      'digoxin', 'lanoxin'
    ],
    drugBKeywords: [
      'amiodarone', 'cordarone', 'pacerone', 'verapamil', 'clarithromycin'
    ],
    severity: 'critical',
    title: 'Digoxin Toxicity Hazard',
    description: 'Amiodarone significantly reduces digoxin renal and non-renal clearance, often increasing serum digoxin levels by 50% to 100% and precipitating life-threatening toxicity.',
    clinicalAction: 'Digoxin dosage usually requires reduction by 30% to 50% upon starting amiodarone, accompanied by serum digoxin concentration monitoring.'
  },
  {
    id: 'levothyroxine_calcium_iron',
    drugAKeywords: [
      'levothyroxine', 'synthroid', 'levoxyl', 'tirosint', 'armour thyroid'
    ],
    drugBKeywords: [
      'calcium carbonate', 'tums', 'caltrate', 'ferrous sulfate', 'iron', 
      'multivitamin with iron', 'omeprazole', 'prilosec'
    ],
    severity: 'caution',
    title: 'Impaired Thyroid Hormone Absorption',
    description: 'Polyvalent metal ions (calcium, iron) and antacids bind to levothyroxine in the gastrointestinal tract, significantly decreasing bioavailability.',
    clinicalAction: 'Separate administration by at least 4 hours. Take levothyroxine on an empty stomach with water at least 30 to 60 minutes before breakfast.'
  },
  {
    id: 'quinolone_minerals',
    drugAKeywords: [
      'ciprofloxacin', 'cipro', 'levofloxacin', 'levaquin', 'moxifloxacin', 'avelox'
    ],
    drugBKeywords: [
      'calcium', 'magnesium', 'antacid', 'aluminum hydroxide', 'sucralfate', 'zinc'
    ],
    severity: 'caution',
    title: 'Antibiotic Inactivation via Chelation',
    description: 'Di- and trivalent cations form insoluble chelate complexes with fluoroquinolones, preventing adequate intestinal absorption and risking clinical treatment failure.',
    clinicalAction: 'Administer the fluoroquinolone antibiotic at least 2 hours before or 6 hours after mineral supplements or cation-containing antacids.'
  },
  {
    id: 'methotrexate_nsaid',
    drugAKeywords: [
      'methotrexate', 'trexall', 'rasuvo'
    ],
    drugBKeywords: [
      'ibuprofen', 'advil', 'motrin', 'naproxen', 'aleve', 'aspirin', 'meloxicam'
    ],
    severity: 'critical',
    title: 'Methotrexate Toxicity & Bone Marrow Suppression',
    description: 'NSAIDs impair renal perfusion and inhibit tubular secretion of methotrexate, elevating serum concentrations to toxic levels and risking severe bone marrow suppression.',
    clinicalAction: 'Avoid concurrent NSAID use with moderate or high-dose methotrexate regimens. Close rheumatologist supervision required for low-dose weekly arthritis therapy.'
  }
];
