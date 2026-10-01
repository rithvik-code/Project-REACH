import type { EmergencyContact, LiveLocation } from '../types';

/**
 * REACH is India-first. These anchor locations move the whole command picture
 * onto real coordinates, so live weather, forecast disturbances and fire-weather
 * danger are pulled for a place that actually exists — not a synthetic district.
 */
export const INDIA_LOCATIONS: LiveLocation[] = [
  {
    id: 'in_dehradun',
    name: 'Dehradun',
    state: 'Uttarakhand',
    lat: 30.3165,
    lng: 78.0322,
    profile: ['flood', 'landslide', 'fire'],
    note: 'Doon valley — flash flooding on the Song/Rispana, landslide belt on the Mussoorie road, Chir pine forest fires in summer.',
  },
  {
    id: 'in_wayanad',
    name: 'Wayanad',
    state: 'Kerala',
    lat: 11.6854,
    lng: 76.132,
    profile: ['landslide', 'flood'],
    note: 'Western Ghats — high landslide susceptibility on lateritic slopes during the south-west monsoon.',
  },
  {
    id: 'in_mumbai',
    name: 'Mumbai',
    state: 'Maharashtra',
    lat: 19.076,
    lng: 72.8777,
    profile: ['flood', 'fire'],
    note: 'Coastal megacity — monsoon inundation, high-tide backflow and dense- settlement fire risk.',
  },
  {
    id: 'in_chennai',
    name: 'Chennai',
    state: 'Tamil Nadu',
    lat: 13.0827,
    lng: 80.2707,
    profile: ['flood', 'fire'],
    note: 'Coromandel coast — north-east monsoon flooding and cyclone landfall.',
  },
  {
    id: 'in_kolkata',
    name: 'Kolkata',
    state: 'West Bengal',
    lat: 22.5726,
    lng: 88.3639,
    profile: ['flood', 'fire'],
    note: 'Ganga delta — tidal flooding, cyclone surge and dense built-up fire risk.',
  },
  {
    id: 'in_shimla',
    name: 'Shimla',
    state: 'Himachal Pradesh',
    lat: 31.1048,
    lng: 77.1734,
    profile: ['landslide', 'fire'],
    note: 'Himalayan ridge town — slope failure and forest fire on steep deodar/pine slopes.',
  },
  {
    id: 'in_guwahati',
    name: 'Guwahati',
    state: 'Assam',
    lat: 26.1445,
    lng: 91.7362,
    profile: ['flood', 'landslide'],
    note: 'Brahmaputra valley — river flooding and hillside slides in the monsoon.',
  },
  {
    id: 'in_newdelhi',
    name: 'New Delhi',
    state: 'Delhi NCT',
    lat: 28.6139,
    lng: 77.209,
    profile: ['fire', 'flood'],
    note: 'Heat island, severe fire-weather in the pre-monsoon and urban flash flooding.',
  },
  {
    id: 'in_bhubaneswar',
    name: 'Bhubaneswar',
    state: 'Odisha',
    lat: 20.2961,
    lng: 85.8245,
    profile: ['flood', 'fire'],
    note: 'Bay of Bengal — cyclone landfall, storm surge and inland riverine flooding.',
  },
  {
    id: 'in_jaipur',
    name: 'Jaipur',
    state: 'Rajasthan',
    lat: 26.9124,
    lng: 75.7873,
    profile: ['fire', 'flood'],
    note: 'Semi-arid — extreme heat and fire weather, with flash flooding in the Aravalli catchments.',
  },
  {
    id: 'in_bengaluru',
    name: 'Bengaluru',
    state: 'Karnataka',
    lat: 12.9716,
    lng: 77.5946,
    profile: ['flood', 'fire'],
    note: 'Deccan plateau — urban flash flooding in the storm-water network and built-up fire risk.',
  },
  {
    id: 'in_visakhapatnam',
    name: 'Visakhapatnam',
    state: 'Andhra Pradesh',
    lat: 17.6868,
    lng: 83.2185,
    profile: ['flood', 'fire'],
    note: 'East coast — cyclone landfall, coastal flooding and forest fire in the Eastern Ghats.',
  },
];

export const LOCATION_BY_ID = Object.fromEntries(INDIA_LOCATIONS.map((l) => [l.id, l])) as Record<
  string,
  LiveLocation
>;

export const DEFAULT_LOCATION_ID = 'in_dehradun';

/** Forest / fire-prone belts used for the wildfire layer. Real-to-region anchors. */
export interface FireBelt {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** Forest/wildland cover proxy 0..1 */
  fuel: number;
  states: string;
  note: string;
}

export const FIRE_BELTS: FireBelt[] = [
  { id: 'fb_chir', name: 'Chir Pine Belt, Uttarakhand', lat: 30.1, lng: 78.3, fuel: 0.86, states: 'Uttarakhand', note: 'Chir pine forests are resin-rich and burn fast in April–June.' },
  { id: 'fb_mussoorie', name: 'Mussoorie Ridge Forest', lat: 30.45, lng: 78.08, fuel: 0.74, states: 'Uttarakhand', note: 'Steep ridge forest above Doon valley.' },
  { id: 'fb_aravalli', name: 'Aravalli Dry Scrub, Rajasthan', lat: 26.9, lng: 75.8, fuel: 0.68, states: 'Rajasthan', note: 'Dry deciduous scrub, high ignition risk in the pre-monsoon.' },
  { id: 'fb_bandipur', name: 'Bandipur–Nilgiri Belt', lat: 11.67, lng: 76.63, fuel: 0.72, states: 'Karnataka / Tamil Nadu', note: 'Deciduous forest with annual dry-season fire incidence.' },
  { id: 'fb_simlipal', name: 'Similipal Massif', lat: 21.9, lng: 86.3, fuel: 0.8, states: 'Odisha', note: 'Large dry deciduous forest, frequent spring fires.' },
  { id: 'fb_sundarban', name: 'Sundarbans Mangrove Fringe', lat: 21.95, lng: 88.9, fuel: 0.55, states: 'West Bengal', note: 'Mangrove edge dries out in the post-monsoon.' },
  { id: 'fb_gir', name: 'Gir Landscape, Gujarat', lat: 21.12, lng: 70.8, fuel: 0.7, states: 'Gujarat', note: 'Dry teak/scrub forest, pre-monsoon fire weather.' },
  { id: 'fb_kaziranga', name: 'Kaziranga Grassland', lat: 26.58, lng: 93.17, fuel: 0.66, states: 'Assam', note: 'Tall grassland — very fast-spreading surface fire.' },
  { id: 'fb_easterghats', name: 'Eastern Ghats Forest Belt', lat: 18.4, lng: 82.9, fuel: 0.7, states: 'Andhra Pradesh / Odisha', note: 'Dry deciduous forest with recurring summer fires.' },
];

/**
 * The brief's mandated safety numbers, plus India's core disaster helplines.
 * Kept separate from the editable contact registry so the assistant can always
 * reach for an authoritative number.
 */
export const NATIONAL_HOTLINES: EmergencyContact[] = [
  {
    id: 'nat_112',
    label: 'National Emergency (Police · Fire · Medical)',
    number: '112',
    category: 'national',
    note: 'Single emergency number for all of India — works from any phone, even without a SIM.',
    primary: true,
  },
  {
    id: 'nat_108',
    label: 'Ambulance / Medical Emergency',
    number: '108',
    category: 'medical',
    note: 'State-run emergency medical response with a dedicated ambulance fleet.',
    primary: true,
  },
  {
    id: 'nat_102',
    label: 'Ambulance (Pregnancy & Child)',
    number: '102',
    category: 'medical',
    note: 'Free transport for pregnant women, mothers and infants.',
    primary: true,
  },
  {
    id: 'nat_1078',
    label: 'Disaster Management Helpline',
    number: '1078',
    category: 'disaster',
    note: 'District/state disaster control room — relief, evacuation and shelter coordination.',
    primary: true,
  },
  {
    id: 'nat_fire',
    label: 'Fire & Rescue Service',
    number: '101',
    category: 'fire',
    note: 'State fire and rescue service. Use 112 if 101 does not connect.',
    primary: true,
  },
  {
    id: 'nat_ndrf',
    label: 'NDRF Disaster Response (Aerial & Rescue)',
    number: '011-24363260',
    category: 'rescue',
    note: 'National Disaster Response Force control room, for major calamities needing aerial rescue or relief.',
    primary: true,
  },
  {
    id: 'nat_ndrf2',
    label: 'NDRF Control Room (alternate)',
    number: '9711077372',
    category: 'rescue',
    note: 'Mobile control-room line for urgent NDRF deployment requests.',
    primary: true,
  },
  {
    id: 'nat_airamb',
    label: 'Air Ambulance Helpline',
    number: '9540161344',
    category: 'air',
    note: 'Private air medical evacuation coordination — helicopter/air ambulance for critical transfers.',
    primary: true,
  },
];

/** Maps a hazard theme to the single most useful number to show at the end of a reply. */
export const HOTLINE_BY_TOPIC: Record<string, string> = {
  medical: '108',
  fire: '101',
  flood: '1078',
  landslide: '1078',
  rescue: '011-24363260',
  air: '9540161344',
  missing: '112',
  general: '112',
  police: '112',
};
