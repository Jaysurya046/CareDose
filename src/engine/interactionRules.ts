import type { InteractionRule } from '../types';

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
    description: 'Combining blood thinners (anticoagulants/antiplatelets) with NSAID pain relievers dramatically escalates the risk of gastrointestinal bleeding and hemorrhagic complications.',
    clinicalAction: 'Avoid combination unless specifically directed by a hematologist/cardiologist. Acetaminophen (Tylenol) is often a safer alternative for pain management.'
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
    title: 'Life-Threatening Hyperkalemia Risk',
    description: 'ACE inhibitors and ARBs decrease potassium excretion. Taking them with potassium-sparing diuretics or potassium supplements can cause dangerous elevations in blood potassium, causing fatal cardiac arrhythmias.',
    clinicalAction: 'Requires frequent serum potassium and renal function monitoring. Do not take over-the-counter potassium supplements without physician approval.'
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
    title: 'Severe Rhabdomyolysis / Muscle Damage',
    description: 'Macrolide antibiotics and certain antifungals strongly inhibit CYP3A4 metabolism of statins, multiplying blood statin concentrations and risking severe muscle breakdown (rhabdomyolysis) and acute kidney injury.',
    clinicalAction: 'Statin therapy should temporarily be held during the course of macrolide antibiotic treatment.'
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
    title: 'Serotonin Syndrome Warning',
    description: 'Combining serotonergic antidepressants with tramadol or certain supplements can trigger toxic central nervous system serotonin accumulation (hyperthermia, seizures, tremors, delirium).',
    clinicalAction: 'Seek immediate medical attention if agitation, rapid heart rate, or muscle rigidity occurs.'
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
    title: 'Increased Upper GI Bleed Risk',
    description: 'SSRIs reduce platelet serotonin uptake and impair blood clotting, which compounds the gastrointestinal ulceration caused by NSAIDs.',
    clinicalAction: 'Consider stomach protection (such as a PPI like Omeprazole) if co-prescribed, or switch to acetaminophen.'
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
    title: 'Excessive Bradycardia & Heart Block Risk',
    description: 'Both beta-blockers and non-dihydropyridine calcium channel blockers suppress cardiac conduction and contraction, which can lead to severe bradycardia, hypotension, or AV heart block.',
    clinicalAction: 'Requires close pulse and blood pressure monitoring. Report dizziness, fainting, or heart rates under 50 bpm immediately.'
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
    description: 'Amiodarone significantly reduces digoxin renal clearance, often doubling serum digoxin concentrations and precipitating fatal ventricular arrhythmias, vision halos, and nausea.',
    clinicalAction: 'Digoxin dose typically must be reduced by 50% when initiating amiodarone, with serum level monitoring.'
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
    title: 'Severely Impaired Thyroid Hormone Absorption',
    description: 'Calcium, iron, and antacids bind to thyroid hormone in the stomach, dramatically decreasing absorption and leading to persistent hypothyroidism.',
    clinicalAction: 'Separate administration by at least 4 hours. Take Levothyroxine on an empty stomach with a full glass of water 60 minutes before breakfast.'
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
    description: 'Polyvalent cations in antacids or supplements chelate fluoroquinolone antibiotics, preventing gastrointestinal absorption and causing treatment failure.',
    clinicalAction: 'Take antibiotic 2 hours before or 6 hours after taking mineral supplements or antacids.'
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
    title: 'Severe Methotrexate Toxicity & Marrow Suppression',
    description: 'NSAIDs reduce renal perfusion and compete for tubular secretion, causing toxic methotrexate accumulation leading to fatal bone marrow suppression and gastrointestinal toxicity.',
    clinicalAction: 'Avoid concurrent use of NSAIDs with high-dose methotrexate. Strict rheumatologist supervision required for low-dose arthritis regimens.'
  }
];
