import type { EmergencyContact } from '../types';

/**
 * Emergency number card system. The first block is national and should never
 * be removed — the rest are district-configurable.
 */
export const DEFAULT_CONTACTS: EmergencyContact[] = [
  {
    id: 'c_national',
    label: 'National Emergency',
    number: '112',
    category: 'national',
    note: 'Single number for police, fire and medical help. Works on locked phones.',
    primary: true,
  },
  {
    id: 'c_ambulance',
    label: 'Ambulance / Medical Emergency',
    number: '108',
    category: 'medical',
    note: 'State emergency ambulance service. Alternate: 102.',
    primary: true,
  },
  {
    id: 'c_ambulance_alt',
    label: 'Ambulance (Alternate)',
    number: '102',
    category: 'medical',
    note: 'Pregnancy, child and general medical transport.',
  },
  {
    id: 'c_disaster',
    label: 'Disaster Management Control Room',
    number: '1078',
    category: 'disaster',
    note: 'District disaster control room. Alternate: 108.',
    primary: true,
  },
  {
    id: 'c_ndrf',
    label: 'NDRF — National Disaster Response Force',
    number: '011-24363260',
    category: 'disaster',
    note: 'Control room for major calamities. Mobile: 9711077372.',
    primary: true,
  },
  {
    id: 'c_ndrf_mobile',
    label: 'NDRF Mobile Command',
    number: '9711077372',
    category: 'rescue',
    note: 'Aerial rescue and relief operations coordination.',
  },
  {
    id: 'c_airamb',
    label: 'Air Ambulance Helpline',
    number: '9540161344',
    category: 'air',
    note: 'Private air medical evacuation coordination. Have exact coordinates ready.',
    primary: true,
  },
  {
    id: 'c_fire',
    label: 'Fire & Rescue Services',
    number: '101',
    category: 'fire',
    note: 'Fire brigade, collapse and hazmat response. Also reachable via 112.',
  },
  {
    id: 'c_police',
    label: 'Police Control Room',
    number: '100',
    category: 'police',
    note: 'Law and order, evacuation enforcement, missing persons. Also via 112.',
  },
  {
    id: 'c_hospital_general',
    label: 'Varun Valley District Hospital',
    number: '+91 90000 11000',
    category: 'hospital',
    note: 'Trauma centre, 420 beds, helipad. Emergency gate: n_general.',
  },
  {
    id: 'c_hospital_hillcrest',
    label: 'Hillcrest Community Hospital',
    number: '+91 90000 11010',
    category: 'hospital',
    note: '120 beds, helipad, limited trauma capability.',
  },
  {
    id: 'c_rescue',
    label: 'District Rescue Teams (SDRF)',
    number: '1070',
    category: 'rescue',
    note: 'State disaster response force — swift-water and rope rescue.',
  },
  {
    id: 'c_relief',
    label: 'Relief & Shelter Coordination',
    number: '1077',
    category: 'disaster',
    note: 'Shelter allocation, relief material and food distribution.',
  },
  {
    id: 'c_health',
    label: 'Health Helpline',
    number: '104',
    category: 'medical',
    note: 'Medical advice, ambulance guidance and hospital bed status.',
  },
];

export const CATEGORY_LABEL: Record<EmergencyContact['category'], string> = {
  national: 'National',
  medical: 'Medical',
  disaster: 'Disaster',
  police: 'Police',
  fire: 'Fire',
  hospital: 'Hospital',
  rescue: 'Rescue',
  air: 'Air Rescue',
};
