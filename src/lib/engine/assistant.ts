import { DEFAULT_CONTACTS } from '../data/emergencyContacts';
import { NATIONAL_HOTLINES } from '../data/india';
import { ROAD_BY_ID, ZONE_BY_ID } from '../data/region';
import type { Analysis } from './analysis';
import type { Hotline } from '../types';
import { formatNumber } from '../geo';

export interface AssistantReply {
  id: string;
  kind: 'system' | 'guidance' | 'contact' | 'unknown' | 'chat';
  badge: string;
  title: string;
  body: string[];
  bullets: string[];
  sources: string[];
  disclaimer?: string;
  confidence: number;
  followups: string[];
  /**
   * The single most useful emergency number for this situation. Every reply
   * carries one, so the answer always ends with a way to actually get help.
   */
  hotline?: Hotline;
}

/** Resolve a hotline from the national registry by number or label fragment. */
export function hotlineByNumber(number: string): Hotline {
  const found = NATIONAL_HOTLINES.find((c) => c.number === number);
  if (found) {
    return { label: found.label, number: found.number, note: found.note, category: found.category };
  }
  return { label: 'National Emergency', number: '112', note: 'Single emergency number for all of India.', category: 'national' };
}

/** The hotline best matched to a free-text situation, used by the online LLM path too. */
export function hotlineForSituation(text: string): Hotline {
  const l = text.toLowerCase();
  if (/fire|burn|smoke|blast|explosion|gas leak|lpg|cylinder/.test(l)) return hotlineByNumber('101');
  if (/heart|cardiac|bleed|injur|unconscious|breath|stroke|drown|snake|bite|electric|shock|fracture|pregnan|deliver/.test(l))
    return hotlineByNumber('108');
  if (/missing|lost|abduct|traffick|police|theft|crime|assault/.test(l)) return hotlineByNumber('112');
  if (/trapped|stranded|rescue|collapse|buried|aerial|helicopter|boat/.test(l)) return hotlineByNumber('011-24363260');
  if (/heat|heatwave|sunstroke|dehydrat/.test(l)) return hotlineByNumber('108');
  if (/flood|landslide|cyclone|earthquake|storm|evacuat|shelter|relief/.test(l)) return hotlineByNumber('1078');
  if (/air ambulance|airlift|critical transfer|icu transfer/.test(l)) return hotlineByNumber('9540161344');
  return hotlineByNumber('112');
}

export interface AssistantContext {
  analysis: Analysis;
  offline: boolean;
  /** free-text profile the resident has set, e.g. "elderly parent at home" */
  profile: string;
  selectedZoneId: string | null;
  /** name of the monitored Indian location, when a live weather feed is active */
  locationName?: string;
  /** one-line summary of current live conditions */
  weatherSummary?: string;
  /** one-line summary of the most significant forecast disturbance */
  disturbanceSummary?: string;
  /** bullet list of forecast disturbances */
  disturbanceBullets?: string[];
}

interface KbEntry {
  id: string;
  title: string;
  keywords: string[];
  body: string[];
  bullets: string[];
  hazard: 'flood' | 'landslide' | 'fire' | 'general';
  phase: 'before' | 'during' | 'after';
  followups: string[];
  /** number to append to this reply, defaults to 112 */
  hotline?: string;
}

/* ------------------------------------------------------------------ */
/* Controlled emergency knowledge base (ships with the app, works offline) */
/* ------------------------------------------------------------------ */

export const KNOWLEDGE_BASE: KbEntry[] = [
  {
    id: 'flood_during',
    title: 'What to do during a flood',
    keywords: ['flood', 'flooding', 'water', 'rising', 'inundation', 'submerged', 'during flood'],
    hazard: 'flood',
    phase: 'during',
    body: [
      'Move to higher ground immediately. Do not wait for an official evacuation order if water is already entering your street.',
      'Never walk or drive through moving water. Fifteen centimetres of moving water can knock an adult down; sixty centimetres can float a car.',
    ],
    bullets: [
      'Avoid riverbanks, causeways, bridges and open storm drains',
      'If trapped, go to the highest floor — never a closed attic or roof void',
      'Signal for help with a torch, whistle or bright cloth',
      'Switch off mains power and gas only if you can reach them safely',
      'Boil or treat all drinking water',
    ],
    followups: ['What should I carry during evacuation?', 'Where is the nearest shelter?'],
  },
  {
    id: 'flood_before',
    title: 'Preparing for a flood',
    keywords: ['prepare', 'before flood', 'ready', 'go bag', 'go-bag', 'kit', 'pack'],
    hazard: 'flood',
    phase: 'before',
    body: ['Prepare before water arrives — evacuation is far safer when your bag is already packed.'],
    bullets: [
      'Go-bag: water, dry food, torch, power bank, medicines, ID, cash',
      'Move documents and electronics to the highest floor',
      'Charge all phones and power banks fully',
      'Save 112, 108, 1078 offline',
      'Agree a family meeting point outside the district',
      'Keep 3 days of drinking water (4 L per person per day)',
    ],
    followups: ['What roads should I avoid?', 'Open my preparedness checklist'],
  },
  {
    id: 'flood_after',
    title: 'After a flood',
    keywords: ['after flood', 'water receded', 'return home', 'clean up', 'mould', 'mold'],
    hazard: 'flood',
    phase: 'after',
    body: ['Do not return home until authorities declare the area safe.'],
    bullets: [
      'Watch for structural damage, sinkholes and weakened bridges',
      'Avoid floodwater — it can carry sewage, chemicals and live electricity',
      'Have electricals inspected before restoring power',
      'Photograph damage for relief claims',
      'Disinfect and dry the home to prevent disease',
    ],
    followups: ['How do I report damage?', 'What are the health risks after a flood?'],
  },
  {
    id: 'landslide_during',
    title: 'What to do during a landslide',
    keywords: ['landslide', 'slide', 'mudslide', 'slope', 'debris', 'rockfall'],
    hazard: 'landslide',
    phase: 'during',
    body: [
      'Move sideways out of the path of the slide, not downhill. Slides travel faster than you can run downhill.',
      'If escape is impossible, curl into a tight ball and protect your head.',
    ],
    bullets: [
      'Stay alert for secondary slides — they follow within minutes',
      'Keep away from the toe of the slope and the debris channel',
      'Indoors: take cover under sturdy furniture and stay away from windows',
      'Watch for flooding upstream if a slide has dammed a stream',
    ],
    followups: ['Which zones are at landslide risk right now?', 'What are landslide warning signs?'],
  },
  {
    id: 'landslide_signs',
    title: 'Landslide warning signs',
    keywords: ['warning signs', 'cracks', 'tilting', 'rumbling', 'signs', 'detect'],
    hazard: 'landslide',
    phase: 'before',
    body: ['Slopes usually give warning before they fail.'],
    bullets: [
      'New cracks in walls, roads or the ground',
      'Doors and windows suddenly sticking',
      'Tilting poles, trees or fence posts',
      'Muddy springs appearing where there were none',
      'Faint rumbling or cracking sounds',
      'Small debris flows at the base of a slope',
    ],
    followups: ['What should I do during a landslide?', 'Which hill roads are at risk?'],
  },
  {
    id: 'evacuation_kit',
    title: 'What to carry during evacuation',
    keywords: ['carry', 'bring', 'take', 'evacuation', 'bag', 'supplies', 'belongings'],
    hazard: 'general',
    phase: 'during',
    body: ['Carry only what you can move with quickly. Prioritise life, then documents, then comfort.'],
    bullets: [
      'Water (2 L minimum) and ready-to-eat dry food',
      'Torch with spare batteries and a power bank',
      '7 days of personal medicines and a copy of prescriptions',
      'ID documents in a waterproof pouch',
      'Cash in small notes — ATMs and card networks usually fail',
      'A whistle, and warm clothing or a blanket',
      'Baby formula, sanitary items and pet food if relevant',
    ],
    followups: ['Where is the nearest shelter?', 'What should I carry for an elderly person?'],
  },
  {
    id: 'missing_person',
    title: 'If someone is missing',
    keywords: ['missing', 'lost', 'cannot find', 'can not find', 'separated', 'search', 'find person'],
    hazard: 'general',
    phase: 'during',
    body: [
      'File a Missing Person report in REACH immediately — do not wait 24 hours. In a disaster, early reporting is the single biggest factor in locating someone.',
      'Give the last known location, the time last seen and what they were wearing.',
    ],
    bullets: [
      'Use Community Reports → Missing Person',
      'Share only responder-visible contact details',
      'Check the Safe Person board before filing — they may already be marked safe',
      'Report to police (100) or the district control room (1078) for official search',
      'If the person needs medicine or is non-verbal, say so explicitly in the description',
    ],
    followups: ['How do I mark myself safe?', 'Where is the missing persons board?'],
  },
  {
    id: 'injured',
    title: 'If someone is injured',
    keywords: ['injured', 'bleeding', 'hurt', 'unconscious', 'broken', 'wound', 'cpr', 'first aid'],
    hazard: 'general',
    phase: 'during',
    body: [
      'Call 108 or 112 immediately for an ambulance. If the road is blocked, say so — the dispatcher can arrange helicopter transfer.',
    ],
    bullets: [
      'Do not move someone with a suspected spinal injury unless they are in immediate danger',
      'Apply firm pressure to control bleeding with a clean cloth',
      'Keep the person warm and conscious; talk to them',
      'Note the exact location and nearest landmark for the ambulance',
      'Air evacuation: Air Ambulance 9540161344, NDRF 011-24363260 / 9711077372',
    ],
    followups: ['Which hospital is reachable right now?', 'How do I request an air ambulance?'],
  },
  {
    id: 'water_safety',
    title: 'Safe drinking water in a disaster',
    keywords: ['water', 'drink', 'boil', 'purify', 'cholera', 'diarrhoea', 'diarrhea', 'safe water'],
    hazard: 'general',
    phase: 'during',
    body: ['Assume all standing water is contaminated, including water from taps in a flooded area.'],
    bullets: [
      'Boil for at least 1 minute, or use chlorine/iodine tablets',
      'Store treated water in a clean covered container',
      'Do not use floodwater for washing food or utensils',
      'Watch for diarrhoea — oral rehydration salts are the first response',
      'Seek care if symptoms persist beyond 24 hours (104 health helpline)',
    ],
    followups: ['What should I carry during evacuation?', 'What are the health risks after a flood?'],
  },
  {
    id: 'evacuation_order',
    title: 'If an evacuation is ordered',
    keywords: ['evacuate', 'evacuation', 'leave', 'order', 'mandatory', 'should i leave'],
    hazard: 'general',
    phase: 'during',
    body: [
      'Follow the assigned route and shelter from the SafeRoute tab — REACH has already scored the road network for hazard exposure and removed closed corridors.',
    ],
    bullets: [
      'Take the least-risk route, not the shortest one',
      'Help neighbours who cannot self-evacuate',
      'Switch off power and lock your home',
      'Register at the shelter so your family can find you',
      'Do not return until the area is declared safe',
    ],
    followups: ['Where is the nearest shelter?', 'Why is the suggested route longer?'],
  },
  {
    id: 'trapped',
    title: 'If you are trapped',
    keywords: ['trapped', 'stuck', 'no exit', 'help me', 'rescue me', 'cannot get out'],
    hazard: 'general',
    phase: 'during',
    body: [
      'Trigger an SOS in REACH. It will queue your location even without connectivity and transmit the moment a signal returns.',
    ],
    bullets: [
      'Move to the highest or most stable point you can reach',
      'Conserve phone battery — lower brightness and avoid constant calls',
      'Signal with a torch, whistle or brightly coloured cloth',
      'Call 112, then 108 if there are injuries',
      'Bang on a pipe or wall in a rhythmic pattern if you hear rescuers',
    ],
    followups: ['How do I trigger an SOS?', 'How does the offline queue work?'],
  },
  {
    id: 'shelter_what',
    title: 'What a shelter provides',
    keywords: ['shelter', 'camp', 'refuge', 'what will i get', 'facilities'],
    hazard: 'general',
    phase: 'during',
    body: ['Shelters provide temporary living space, basic food, drinking water and first aid.'],
    bullets: [
      'Bring your own medicines and personal documents',
      'Register on arrival so you can be traced by family',
      'Some shelters have medical posts, generators and helipad access',
      'Report any capacity change so REACH can rebalance allocations',
    ],
    followups: ['Where is the nearest shelter?', 'Which shelter has the most free capacity?'],
  },
  {
    id: 'offline_how',
    title: 'What still works offline',
    keywords: ['offline', 'no internet', 'no network', 'signal', 'disconnected', 'airplane'],
    hazard: 'general',
    phase: 'during',
    body: [
      'REACH is offline-first. Cached maps, downloaded hazard layers, emergency contacts, shelter information, this assistant and your SOS queue all keep working without internet.',
    ],
    bullets: [
      'SOS alerts are stored and sent automatically when connectivity returns',
      'Previously calculated routes remain available on the map',
      'Fresh weather, satellite data and new community reports need connectivity',
    ],
    followups: ['How do I trigger an SOS?', 'When will my SOS be sent?'],
  },
  {
    id: 'domino',
    title: 'Why one failure spreads',
    keywords: ['domino', 'cascade', 'knock on', 'chain', 'why did this happen', 'spread'],
    hazard: 'general',
    phase: 'during',
    body: [
      'Disasters cascade. A bridge closing removes an evacuation corridor, which pushes traffic onto a lower-capacity road, which slows hospital access, which overloads the shelters that remain reachable.',
      'The Command Center domino chain lists each hop so you can break the chain at its weakest link.',
    ],
    bullets: [
      'Break the chain early — restore or protect the bottleneck link first',
      'Watch shelters that are absorbing demand from multiple zones',
      'Watch hospitals whose approach roads share a corridor with the evacuation routes',
    ],
    followups: ['What is the current domino chain?', 'Which road is the biggest bottleneck?'],
  },
  {
    id: 'fire_during',
    title: 'What to do during a fire',
    keywords: ['fire', 'burning', 'flames', 'blaze', 'wildfire', 'forest fire', 'house fire', 'fire outbreak', 'smoke'],
    hazard: 'fire',
    phase: 'during',
    hotline: '101',
    body: [
      'Get out first, then call for help — never the other way round. Fire doubles in size roughly every minute in dry fuel.',
      'Crawl low under smoke. Superheated smoke kills more people than flames, and the cleanest air is within 30 cm of the floor.',
    ],
    bullets: [
      'Call 101 (Fire & Rescue) or 112 immediately — say the location, what is burning and whether anyone is inside',
      'Close doors behind you as you leave to slow the spread, but never lock them if someone is still inside',
      'Feel doors with the back of your hand before opening — a hot door means fire behind it',
      'Never use a lift; use the stairs',
      'If your clothes catch fire: stop, drop and roll — do not run',
      'Once out, stay out. Do not re-enter for belongings',
      'For a wildfire, move perpendicular to the wind and downhill away from the fuel edge, not along the fire front',
    ],
    followups: ['What should I do for smoke inhalation?', 'How do I report a forest fire?'],
  },
  {
    id: 'fire_before',
    title: 'Preparing your home for fire risk',
    keywords: ['fire safety', 'prepare fire', 'defensible', 'extinguisher', 'fire drill', 'fuel load'],
    hazard: 'fire',
    phase: 'before',
    hotline: '101',
    body: ['Fire risk is highest in the dry pre-monsoon months. A few hours of preparation decides whether a fire stops at your boundary or takes the house.'],
    bullets: [
      'Keep a 3 m fuel-free perimeter — clear dry grass, leaves and brushwood',
      'Never stack firewood, LPG cylinders or paint against the house wall',
      'Store an ABC dry-powder extinguisher and check the gauge every six months',
      'Fit smoke alarms and test them monthly',
      'Know two exits from every room',
      'Agree a family meeting point outside the building',
      'Keep the road to your property clear so a fire tender can reach it',
    ],
    followups: ['What should I do during a fire?', 'What should I carry during evacuation?'],
  },
  {
    id: 'smoke_inhalation',
    title: 'Smoke inhalation — what to do',
    keywords: ['smoke inhalation', 'breathing smoke', 'carbon monoxide', 'choking', 'coughing smoke', 'blackout'],
    hazard: 'fire',
    phase: 'during',
    hotline: '108',
    body: ['Smoke inhalation is a medical emergency. Carbon monoxide is odourless and causes confusion before it causes collapse.'],
    bullets: [
      'Move the person to fresh air immediately and loosen tight clothing',
      'Call 108 for ambulance support — say "smoke inhalation" clearly',
      'If they stop breathing and you are trained, begin CPR immediately',
      'Do not give food or water to someone who is drowsy or unconscious',
      'Watch for delayed breathing difficulty over the next 24 hours — seek care even if they feel fine',
    ],
    followups: ['How do I do CPR?', 'What should I do during a fire?'],
  },
  {
    id: 'report_forest_fire',
    title: 'How to report a forest fire',
    keywords: ['report fire', 'forest fire report', 'spot fire', 'fire line', 'fire in forest', 'smoke in hills'],
    hazard: 'fire',
    phase: 'during',
    hotline: '101',
    body: ['Early reporting is the single strongest lever in wildfire response — a fire reported in the first 15 minutes is usually containable.'],
    bullets: [
      'Call 101 (Fire & Rescue) and 1078 (Disaster Management) — report the fire line separately from any evacuation need',
      'Give the nearest landmark or road name, plus the direction the wind is pushing the fire',
      'Report the approximate size: "football-field sized" or "one hillside" is enough to dispatch correctly',
      'Note whether there are houses, schools or a hospital within 500 m',
      'Send a photo through the Community Reports tab if you have signal',
      'Do not approach the fire line to film it — wind shifts are sudden',
    ],
    followups: ['What should I do during a fire?', 'How do I report a hazard on the map?'],
  },
  {
    id: 'earthquake_during',
    title: 'What to do during an earthquake',
    keywords: ['earthquake', 'tremor', 'quake', 'seismic', 'shaking', 'richter'],
    hazard: 'general',
    phase: 'during',
    hotline: '112',
    body: ['Drop, Cover and Hold On. Most injuries in an earthquake come from falling objects, not from the ground itself.'],
    bullets: [
      'Drop to hands and knees, take cover under a sturdy table, and hold on until the shaking stops',
      'Stay away from windows, mirrors, tall cupboards and hanging objects',
      'If outdoors, move to an open area away from buildings, poles and power lines',
      'If driving, pull over away from bridges, flyovers and trees and stay in the vehicle',
      'Expect aftershocks — do not re-enter damaged buildings',
      'Check for gas leaks and open flames before using anything electrical',
    ],
    followups: ['What should I do after an earthquake?', 'How do I report structural damage?'],
  },
  {
    id: 'earthquake_after',
    title: 'After an earthquake',
    keywords: ['after earthquake', 'aftershock', 'structural damage', 'cracks building', 'collapse'],
    hazard: 'general',
    phase: 'after',
    hotline: '112',
    body: ['Damaged buildings can fail hours later. Treat every cracked structure as unsafe until inspected.'],
    bullets: [
      'Evacuate calmly using the stairs — never a lift',
      'Watch for fallen power lines, broken gas lines and leaking water mains',
      'Shut off gas and mains power only if you can reach them safely',
      'Do not light matches or use lighters until a gas leak is ruled out',
      'Use SMS or data rather than voice calls to keep the network free for rescue',
      'Register at the nearest shelter so family can trace you',
    ],
    followups: ['What should I do during an earthquake?', 'How do I report structural damage?'],
  },
  {
    id: 'cyclone_during',
    title: 'What to do during a cyclone',
    keywords: ['cyclone', 'hurricane', 'typhoon', 'storm surge', 'landfall', 'high wind', 'gale'],
    hazard: 'general',
    phase: 'during',
    hotline: '1078',
    body: ['Observe the calm of the eye carefully — the storm resumes from the opposite direction and is often stronger on the second half.'],
    bullets: [
      'Stay indoors, away from windows; shelter in the smallest interior room',
      'If the wind suddenly stops, do not go out — the eye is passing and winds will return from the opposite direction',
      'Keep away from the coast and low-lying river mouths where storm surge runs highest',
      'Turn off electricity at the mains if water is entering the house',
      'Keep buckets of clean water before the supply is cut',
      'Follow the district control room on 1078 for the official all-clear',
    ],
    followups: ['Where is the nearest shelter?', 'What should I carry during evacuation?'],
  },
  {
    id: 'lightning',
    title: 'Lightning safety',
    keywords: ['lightning', 'thunder', 'struck', 'electric storm', 'thunderstorm'],
    hazard: 'general',
    phase: 'during',
    hotline: '108',
    body: ['If you can hear thunder, you are within striking range. There is no such thing as "it is still far" once thunder is audible.'],
    bullets: [
      'Get indoors or into a hard-topped vehicle and stay 30 minutes past the last thunder',
      'Avoid trees, poles, hilltops, open fields and metal fencing',
      'Stay away from water — swimming, bathing and taps during a storm',
      'Unplug electricals and avoid corded phones',
      'A lightning-strike victim carries no charge — it is safe to touch them and give first aid',
      'Call 108 and begin CPR if the person is not breathing',
    ],
    followups: ['How do I do CPR?', 'What should I do during a thunderstorm?'],
  },
  {
    id: 'heatwave',
    title: 'Heatwave safety',
    keywords: ['heat', 'heatwave', 'sunstroke', 'heatstroke', 'hot weather', 'dehydration', 'loo'],
    hazard: 'general',
    phase: 'during',
    hotline: '108',
    body: ['Heatstroke is a medical emergency — a body temperature above 40°C with confusion can be fatal within an hour.'],
    bullets: [
      'Drink water every 20 minutes even if you are not thirsty; add salt and sugar to replace electrolytes',
      'Avoid outdoor work between 12 pm and 4 pm',
      'Wear loose, light-coloured cotton clothing and cover your head',
      'For heat exhaustion: move to shade, cool the skin with wet cloth, fan the person and give ORS',
      'For heatstroke (hot, dry skin, confusion, no sweating): call 108 immediately and cool aggressively while waiting',
      'Never leave a child or pet in a parked vehicle',
      'Check on elderly neighbours and people living alone daily',
    ],
    followups: ['What are the signs of heatstroke?', 'How do I look after an elderly relative in the heat?'],
  },
  {
    id: 'water_safety',
    title: 'Water safety and drowning response',
    keywords: ['drowning', 'drown', 'swimming', 'river current', 'water rescue', 'swept away'],
    hazard: 'flood',
    phase: 'during',
    hotline: '108',
    body: ['Reach, throw, row — but only go if you are a trained swimmer with a flotation aid. Rescuers drowning is a leading cause of multiple deaths.'],
    bullets: [
      'Shout for help and call 108 / 112 immediately',
      'Reach with a pole, branch or rope from a stable position; lie down to lower your centre of gravity',
      'Throw anything that floats — a jerrycan, empty sealed can, cooler box, tyre',
      'Only enter the water if trained and with a flotation device',
      'After rescue, check breathing; begin CPR if the person is unresponsive and not breathing normally',
      'Take the person to hospital even if they seem fine — secondary drowning can follow',
    ],
    followups: ['How do I do CPR?', 'What should I do during a flood?'],
  },
  {
    id: 'cpr_firstaid',
    title: 'CPR and basic first aid',
    keywords: ['cpr', 'first aid', 'unconscious', 'not breathing', 'chest compressions', 'cardiac arrest', 'revive'],
    hazard: 'general',
    phase: 'during',
    hotline: '108',
    body: ['Check for danger, then check response and breathing. If they are unresponsive and not breathing normally, start compressions immediately.'],
    bullets: [
      'Place the heel of your hand on the centre of the chest, other hand on top, fingers interlocked',
      'Push hard and fast: about 5–6 cm deep, 100–120 compressions per minute',
      'Let the chest rise fully between compressions and do not stop to check repeatedly',
      'If trained and willing, give 2 rescue breaths after every 30 compressions',
      'Keep going until the person revives or a medical team takes over — AED if one is available',
      'For severe bleeding, press hard directly on the wound with a clean cloth and do not lift to check',
      'Call 108 on speaker so you can keep working while you coordinate',
    ],
    followups: ['What should I do during a fire?', 'What should I do for smoke inhalation?'],
  },
  {
    id: 'snakebite',
    title: 'Snakebite first response',
    keywords: ['snake', 'snakebite', 'scorpion', 'venom', 'bitten', 'antivenom'],
    hazard: 'landslide',
    phase: 'during',
    hotline: '108',
    body: ['Snakebite is most common when flood or landslide debris pushes snakes into homes. Reassure the person, immobilise the limb and get to a hospital with antivenom.'],
    bullets: [
      'Call 108 and say "snakebite" so the ambulance routes to a hospital with antivenom',
      'Keep the person still and calm — movement speeds venom circulation',
      'Keep the bitten limb below heart level and remove rings, bangles and tight clothing',
      'Do NOT cut, suck, apply a tight tourniquet or use traditional remedies',
      'Note the time of the bite and, if safe, the snake\u2019s colour and pattern — never try to catch it',
      'Watch for drooping eyelids, difficulty swallowing or breathing — these need urgent transport',
    ],
    followups: ['Which hospital is reachable right now?', 'What should I do after a flood?'],
  },
  {
    id: 'gas_leak',
    title: 'Gas leak or chemical release',
    keywords: ['gas leak', 'lpg', 'cylinder', 'smell gas', 'chemical', 'toxic', 'ammonia', 'chlorine'],
    hazard: 'fire',
    phase: 'during',
    hotline: '101',
    body: ['Do not switch anything on or off — a spark, a phone or a light switch can ignite the cloud.'],
    bullets: [
      'Do not use a light switch, doorbell, phone or vehicle ignition inside the area',
      'Open doors and windows if safe, then leave immediately and leave the door open behind you',
      'Turn the cylinder regulator off only if you can reach it without disturbing the source',
      'Move upwind and uphill of the release, and keep others back',
      'Call 101 / 112 from outside the building',
      'For industrial chemical release, follow the wind direction away from the plume and shut windows if you must shelter',
    ],
    followups: ['What should I do during a fire?', 'How do I report a hazard?'],
  },
  {
    id: 'power_outage',
    title: 'Power outage safety',
    keywords: ['power cut', 'blackout', 'electricity', 'no power', 'outage', 'transformer'],
    hazard: 'general',
    phase: 'during',
    hotline: '112',
    body: ['Most outage deaths come from unsafe backup power, not from the outage itself.'],
    bullets: [
      'Never run a generator indoors, in a garage or near a window — carbon monoxide kills silently',
      'Use torches, not candles; if you must use candles, keep them away from curtains and never leave them burning',
      'Treat every fallen wire as live and stay at least 10 m away',
      'Keep the fridge closed to preserve food; discard food that has been above 4°C for more than four hours',
      'If someone is receiving at-home oxygen or dialysis, call 108 immediately — do not wait for the supply to return',
      'Charge phones and power banks during the outage warning window',
    ],
    followups: ['What should I carry during evacuation?', 'What should I do during a cyclone?'],
  },
  {
    id: 'report_missing_person',
    title: 'How to report a missing person',
    keywords: ['missing person', 'lost someone', 'cannot find', 'missing report', 'absent', 'search party'],
    hazard: 'general',
    phase: 'during',
    hotline: '112',
    body: ['Report immediately — there is no waiting period. The first six hours matter more than any later search effort.'],
    bullets: [
      'Open Community Reports → Missing / Safe Person and file the report; it reaches the district control room',
      'Call 112 and quote the report so it is linked to the police missing-person record',
      'Include name, age band, what they were wearing, last known location, last seen time and your contact number',
      'Add a recent photo if you have one — it is stored privately and shared only with responders',
      'Tell search teams about medical needs: dementia, medication, disability or injury',
      'If they are found, update the status to Reported Safe immediately so search resources are freed',
    ],
    followups: ['How do I keep personal information private?', 'What if a child is missing?'],
  },
  {
    id: 'vulnerable_care',
    title: 'Caring for elderly, children and pets',
    keywords: ['elderly', 'infant', 'baby', 'child', 'disabled', 'wheelchair', 'pet', 'dog', 'cat', 'pregnant', 'medical needs'],
    hazard: 'general',
    phase: 'during',
    hotline: '108',
    body: ['People who cannot self-evacuate need to leave early, before congestion builds. Register them in your personal context so REACH frames advice around them.'],
    bullets: [
      'Pack two weeks of regular medication plus prescriptions, in a waterproof bag',
      'For infants: formula, sterilised water, nappies, warm bedding and a carrier you can wear',
      'For wheelchair or bed-bound family members: pre-arrange a vehicle, since most rescue boats cannot carry them',
      'For pets: carry food, a leash/harness, a carrier, vaccination records and a water bowl — most shelters take pets in a separate area',
      'For pregnant women: know the nearest hospital with a maternity unit and its access road condition',
      'Tell a neighbour and the comfort team where your household is, and put a card with medications in the person\u2019s pocket',
    ],
    followups: ['What should I carry during evacuation?', 'Which hospital is reachable right now?'],
  },
  {
    id: 'mental_health',
    title: 'Coping with stress during a disaster',
    keywords: ['stress', 'panic', 'anxiety', 'trauma', 'afraid', 'scared', 'mental health', 'sleep', 'grief'],
    hazard: 'general',
    phase: 'during',
    hotline: '112',
    body: ['Fear and panic are normal and expected reactions to a disaster. Managing them is part of survival, not a weakness.'],
    bullets: [
      'Breathe slowly: in for four counts, hold for four, out for six. Repeat ten times',
      'Stick to a routine — regular meals, sleep times and tasks give the brain a sense of control',
      'Limit continuous news and social-media doom-scrolling; check twice a day instead',
      'Keep children with a familiar adult and explain things simply and honestly',
      'Contact Tele-MANAS 14416 for free mental-health support in Indian languages',
      'Seek urgent help if anyone expresses intent to self-harm — do not leave them alone and call 112',
    ],
    followups: ['How do I look after children during a disaster?', 'What should I do after a flood?'],
  },
  {
    id: 'shelter_after',
    title: 'Living in a shelter',
    keywords: ['shelter life', 'camp rules', 'in shelter', 'dormitory', 'relief camp', 'register'],
    hazard: 'general',
    phase: 'after',
    hotline: '1078',
    body: ['Shelters work on registration, queuing and shared hygiene. Following three rules early prevents most disputes and outbreaks.'],
    bullets: [
      'Register on arrival — it is how your family and the authorities find you',
      'Keep the camp clean: use designated toilets and handwashing points every time',
      'Report rashes, fever or diarrhoea to the medical post immediately',
      'Keep your space tidy and valuables with you; report theft rather than retaliating',
      'Volunteer for a task — it improves morale and gets you earlier information',
      'Report capacity or facility problems to the shelter manager via Community Reports',
    ],
    followups: ['How do I report a shelter capacity change?', 'What should I do after a flood?'],
  },
];

/* ------------------------------------------------------------------ */
/* Retrieval                                                          */
/* ------------------------------------------------------------------ */

const STOP = new Set([
  'the', 'a', 'an', 'is', 'are', 'do', 'does', 'i', 'my', 'me', 'to', 'of', 'in', 'on', 'for', 'and',
  'what', 'where', 'which', 'how', 'should', 'if', 'it', 'be', 'can', 'will', 'there', 'this', 'that',
  'during', 'with', 'at', 'we', 'you', 'your', 'am',
]);

/**
 * Everyday phrasing → canonical emergency vocabulary. People type "I'm stuck in
 * water" or "blaze" rather than "flood" or "fire", and the assistant has to
 * meet them where they are.
 */
const SYNONYMS: Record<string, string[]> = {
  flood: ['flooding', 'flooded', 'inundation', 'inundated', 'waterlogging', 'waterlogged', 'deluge', 'submerged', 'submerge'],
  landslide: ['slide', 'slides', 'mudslide', 'landslip', 'rockfall', 'debris', 'slope', 'scarp'],
  fire: ['blaze', 'burning', 'burn', 'flames', 'wildfire', 'smoke', 'arson', 'combust'],
  earthquake: ['quake', 'tremor', 'seismic', 'shaking', 'richter'],
  cyclone: ['hurricane', 'typhoon', 'storm', 'surge', 'gale'],
  heatwave: ['heat', 'hot', 'sunstroke', 'heatstroke', 'scorching'],
  rescue: ['trapped', 'stuck', 'stranded', 'help', 'trapping'],
  shelter: ['refuge', 'camp', 'safe place', 'camps'],
  route: ['road', 'roads', 'drive', 'travel', 'corridor', 'directions'],
  injured: ['hurt', 'bleeding', 'wounded', 'injury', 'casualty'],
  missing: ['lost', 'disappeared', 'absent', 'unaccounted'],
  electricity: ['power', 'current', 'electric', 'blackout', 'outage'],
  evacuation: ['evacuate', 'leave', 'flee', 'escape'],
  ill: ['sick', 'breathing', 'unconscious', 'cardiac', 'heart', 'stroke'],
};

function expand(tokens: string[]): string[] {
  const out = new Set(tokens);
  for (const t of tokens) {
    const canonical = SYNONYMS[t];
    if (canonical) canonical.forEach((c) => out.add(c));
    for (const [key, list] of Object.entries(SYNONYMS)) {
      if (list.includes(t)) out.add(key);
    }
  }
  return [...out];
}

function tokenize(q: string): string[] {
  const base = q
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
  return expand(base);
}

/** Levenshtein distance, used to tolerate typos in short queries. */
function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 99;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length][b.length];
}

export function scoreEntry(entry: KbEntry, tokens: string[]): number {
  let score = 0;
  const joined = tokens.join(' ');
  const haystack = `${entry.title} ${entry.keywords.join(' ')} ${entry.body.join(' ')} ${entry.bullets.join(' ')}`.toLowerCase();

  for (const kw of entry.keywords) {
    if (kw.includes(' ')) {
      // Multi-word phrases are strong evidence when they appear verbatim.
      if (joined.includes(kw)) score += 7;
      continue;
    }
    for (const t of tokens) {
      if (t === kw) score += 5;
      else if (t.length > 4 && (kw.startsWith(t) || t.startsWith(kw))) score += 2.4;
      else if (t.length > 4 && kw.length > 4 && editDistance(t, kw) <= 1) score += 2;
    }
  }

  // Title words are the entry's headline intent — weight them higher.
  const titleWords = entry.title.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  for (const t of tokens) if (titleWords.includes(t)) score += 1.6;

  for (const t of tokens) if (t.length > 3 && haystack.includes(t)) score += 0.4;
  return score;
}

/** Maps a query to the dominant hazard so the KB can prefer matching topics. */
export function detectHazardTopic(query: string): KbEntry['hazard'] | null {
  const l = query.toLowerCase();
  if (/fire|blaze|burn|flame|smoke|wildfire|lpg|cylinder|gas leak/.test(l)) return 'fire';
  if (/flood|water|submerg|inundat|river|rain|swim|drown|dam|embankment/.test(l)) return 'flood';
  if (/landslide|slide|slope|mud|rockfall|hill|debris|scarp|snake/.test(l)) return 'landslide';
  return null;
}

/* ------------------------------------------------------------------ */
/* System-grounded answers (verified data, not general guidance)      */
/* ------------------------------------------------------------------ */

type SystemIntent =
  | 'nearest_shelter'
  | 'shelter_capacity'
  | 'road_status'
  | 'zone_risk'
  | 'what_next'
  | 'contacts'
  | 'my_zone'
  | 'fire_status'
  | 'weather'
  | null;

/**
 * "What should I do during a fire?" is a request for safety guidance, not for
 * the district's fire-weather status. The status intents must not swallow it.
 */
const GUIDANCE_PHRASING =
  /what should i do|what do i do|how do i|how should i|what to do|what can i do|what should i carry|what should i pack|tell me how|steps to|first aid|how to survive/;

function detectSystemIntent(q: string): SystemIntent {
  const l = q.toLowerCase();
  const guidance = GUIDANCE_PHRASING.test(l);

  if (/(emergency|helpline).*(number|contact)|numbers?|helpline|call who|112|108|1078|whom do i call/.test(l))
    return 'contacts';
  if (guidance) {
    // Guidance questions still legitimately want the road network.
    if (/road|route|avoid|blocked|closed|drive|travel|corridor/.test(l)) return 'road_status';
    return null;
  }
  if (/weather|forecast|rain expected|temperature|humidity|wind speed|will it rain/.test(l)) return 'weather';
  if (/fire risk|fire status|fire pressure|fire danger|where is the fire|is there a fire|any fire|forest fire (now|nearby|today)|fire near|wildfire risk/.test(l))
    return 'fire_status';
  if (/nearest|closest|which shelter|where.*shelter|available shelter|free capacity|spaces/.test(l)) {
    if (/capacity|space|free|full|available/.test(l)) return 'shelter_capacity';
    return 'nearest_shelter';
  }
  if (/road|route|avoid|blocked|closed|drive|travel|corridor/.test(l)) return 'road_status';
  if (/what should happen|priority|next step|what do we do|decision|action/.test(l)) return 'what_next';
  if (/my zone|my area|risk.*here|how risky|am i at risk|danger here/.test(l)) return 'my_zone';
  if (/risk|danger|dangerous|hazard|worst|safest zone/.test(l)) return 'zone_risk';
  return null;
}

function shelterLines(a: Analysis, limit = 3) {
  return [...a.shelters]
    .sort((x, y) => x.occupancyPct - y.occupancyPct || x.riskScore - y.riskScore)
    .slice(0, limit)
    .map(
      (s) =>
        `${s.name} — ${formatNumber(s.available)} of ${formatNumber(s.capacity)} spaces free (${Math.round(
          s.occupancyPct * 100,
        )}% full), risk ${Math.round(s.riskScore)}/100, ${s.reachableZoneIds.length} zone(s) routed here`,
    );
}

function roadLines(a: Analysis) {
  return a.graph.removed.map((r) => {
    const road = ROAD_BY_ID[r.roadId];
    const h = a.hazard.perRoad[r.roadId];
    return `${r.roadId} ${road?.name ?? ''} — ${r.reason} (hazard exposure ${Math.round((h?.risk ?? 0) * 100)}%)`;
  });
}

export function answerQuery(query: string, ctx: AssistantContext): AssistantReply {
  const { analysis: a, offline, profile, selectedZoneId } = ctx;
  const tokens = tokenize(query);
  const intent = detectSystemIntent(query);

  if (intent === 'contacts') {
    const seen = new Set<string>();
    const all = [...DEFAULT_CONTACTS.filter((c) => c.primary), ...NATIONAL_HOTLINES].filter((c) => {
      if (seen.has(c.number)) return false;
      seen.add(c.number);
      return true;
    });
    return {
      id: 'sys_contacts',
      kind: 'contact',
      badge: 'VERIFIED SYSTEM DATA · EMERGENCY NUMBERS · AVAILABLE OFFLINE',
      title: 'Emergency numbers — ready to dial',
      body: [
        'These numbers are stored on your device and work without internet.',
        'In immediate danger, call 112 first — it reaches police, fire and ambulance on one number.',
      ],
      bullets: all.map((c) => `${c.label}: ${c.number}${c.note ? ` — ${c.note}` : ''}`),
      sources: ['REACH emergency contact registry (offline cache)', 'National disaster helplines'],
      confidence: 1,
      hotline: hotlineByNumber('112'),
      followups: ['How do I trigger an SOS?', 'Which hospital is reachable right now?'],
    };
  }

  if (intent === 'weather') {
    return {
      id: 'sys_weather',
      kind: 'system',
      badge: 'VERIFIED SYSTEM DATA · LIVE WEATHER FEED',
      title: 'Live weather and forecast disturbances',
      body: [
        `Current conditions for ${ctx.locationName ?? 'the selected location'}: ${ctx.weatherSummary ?? 'weather feed unavailable'}.`,
        ctx.disturbanceSummary ??
          'Open the Live Map tab, which carries the full forecast, the 24-hour rainfall strip and the fire-danger index.',
      ],
      bullets: ctx.disturbanceBullets ?? [],
      sources: ['Open-Meteo forecast API (live)', 'REACH disturbance detector'],
      disclaimer: offline
        ? 'You are offline, so this is the last downloaded reading. Live weather resumes when connectivity returns.'
        : 'Live at the time of this reply. Forecast confidence falls beyond 48 hours.',
      confidence: ctx.weatherSummary ? 0.9 : 0.5,
      hotline: hotlineForSituation(ctx.disturbanceSummary ?? 'flood weather'),
      followups: ['Which zone is at highest risk?', 'What should I do if it floods?'],
    };
  }

  if (intent === 'fire_status') {
    const fireZones = a.zones.filter((z) => z.fire >= 0.4).sort((x, y) => y.fire - x.fire);
    const top = fireZones[0];
    return {
      id: 'sys_fire',
      kind: 'system',
      badge: 'VERIFIED SYSTEM DATA · WILDFIRE MODEL',
      title: top
        ? `Wildfire pressure: ${ZONE_BY_ID[top.zoneId]?.name ?? top.zoneId} at ${Math.round(top.fire * 100)}%`
        : 'Wildfire pressure is currently low across the district',
      body: [
        `District fire-weather index is ${Math.round(a.hazard.firePressure * 100)}/100, combining live temperature, humidity and wind with fuel load per zone.`,
        a.totals.fireZones
          ? `${a.totals.fireZones} zone(s) are above the wildfire alert threshold. Forest and scrub fires will spread fast in this window.`
          : 'No zone is above the wildfire alert threshold right now. Fire risk climbs on consecutive rain-free days.',
      ],
      bullets: fireZones.length
        ? fireZones
            .slice(0, 4)
            .map((z) => `${ZONE_BY_ID[z.zoneId]?.name}: fire ` + `${Math.round(z.fire * 100)}%, flood ${Math.round(z.flood * 100)}%, slope ${Math.round(z.landslide * 100)}%`)
        : ['Fire pressure below alert threshold in every zone'],
      sources: ['REACH wildfire model (Fosberg fire-weather index × fuel load)'],
      disclaimer: 'Fire risk is modelled from weather and fuel, not from live satellite hotspot detection.',
      confidence: 0.88,
      hotline: hotlineByNumber('101'),
      followups: ['What should I do during a fire?', 'How do I report a forest fire?'],
    };
  }

  if (intent === 'nearest_shelter' || intent === 'shelter_capacity') {
    const zoneId = selectedZoneId ?? a.zones[0]?.zoneId ?? null;
    const plan = zoneId ? a.plans[zoneId] : null;
    const zone = zoneId ? ZONE_BY_ID[zoneId] : null;
    const assigned = plan?.shelterId ? a.shelters.find((s) => s.id === plan.shelterId) : null;
    return {
      id: 'sys_shelter',
      kind: 'system',
      badge: 'VERIFIED SYSTEM DATA · SHELTER REGISTRY (CACHED)',
      title: zone ? `Shelter guidance for ${zone.name}` : 'Shelter availability across the district',
      body: [
        assigned
          ? `${assigned.name} is your assigned shelter — ${formatNumber(assigned.available)} spaces free. Follow the SafeRoute tab for the least-risk corridor.`
          : zone
            ? `No shelter is currently reachable by road from ${zone.name}. Treat this as an isolation case and request rescue support.`
            : 'Select a zone on the map for a personalised shelter recommendation.',
        plan?.overflow ? 'Note: your primary shelter is near capacity, so overflow allocation is already applied.' : '',
      ].filter(Boolean),
      bullets: shelterLines(a, 4),
      sources: ['REACH shelter registry + road graph (offline cache)'],
      disclaimer: offline
        ? 'Captured from the last synchronisation. Capacity may have changed since.'
        : 'Refreshed from the shelter coordination feed moments ago.',
      confidence: 0.92,
      hotline: hotlineByNumber('1078'),
      followups: ['Why is that shelter the safest option?', 'How do I report a capacity change?'],
    };
  }

  if (intent === 'road_status') {
    const lines = roadLines(a);
    return {
      id: 'sys_roads',
      kind: 'system',
      badge: 'VERIFIED SYSTEM DATA · ROAD NETWORK SCAN',
      title: lines.length ? `${lines.length} road(s) removed from the routing network` : 'All roads currently passable',
      body: [
        lines.length
          ? 'REACH scans every road in the district against flood depth and slope-failure proxies each time conditions change. The following corridors are out of service:'
          : 'No road has crossed the closure threshold yet. Hill corridors remain the first to fail — check again after rainfall peaks.',
        a.graph.removed.length >= 3
          ? 'Network fragmentation is significant. Check the domino chain for which areas are now cut off.'
          : '',
      ].filter(Boolean),
      bullets: lines.length ? lines : ['No closures recorded in the current state'],
      sources: ['REACH road graph + hazard field (offline capable)'],
      disclaimer: 'Route availability is recalculated automatically whenever a closure is reported.',
      confidence: 0.95,
      hotline: hotlineByNumber('1078'),
      followups: ['Which areas are now isolated?', 'What is the domino chain right now?'],
    };
  }

  if (intent === 'what_next') {
    return {
      id: 'sys_next',
      kind: 'system',
      badge: 'VERIFIED SYSTEM DATA · DECISION ENGINE',
      title: 'Prioritised action list',
      body: ['Derived from current risk, population exposure, route accessibility and shelter capacity.'],
      bullets: a.actions.slice(0, 6).map((act) => `${act.priority}. ${act.title} — owner: ${act.owner}`),
      sources: ['REACH decision engine'],
      disclaimer: 'Operational guidance for trained coordinators. Residents should follow the shelter and route shown in SafeRoute.',
      confidence: 0.9,
      hotline: hotlineByNumber('011-24363260'),
      followups: ['Why is the top action priority 1?', 'What is the shelter capacity gap?'],
    };
  }

  if (intent === 'my_zone' || intent === 'zone_risk') {
    const worst = a.zones[0];
    const zone = ZONE_BY_ID[worst.zoneId];
    return {
      id: 'sys_zone',
      kind: 'system',
      badge: 'VERIFIED SYSTEM DATA · MULTI-HAZARD RISK FIELD',
      title: `Highest risk: ${zone.name} (${Math.round(worst.risk)}/100)`,
      body: [
        `${zone.name} combines ${Math.round(worst.flood * 100)}% flood intensity, ${Math.round(
          worst.landslide * 100,
        )}% slope-failure probability and ${Math.round(worst.fire * 100)}% wildfire pressure, with ${formatNumber(
          worst.populationAtRisk,
        )} residents exposed.`,
        worst.isolated
          ? 'This zone is currently isolated — no road route to a shelter or hospital.'
          : `Nearest reachable shelter: ${worst.nearestShelterId ? a.shelters.find((s) => s.id === worst.nearestShelterId)?.name : 'none'}.`,
      ],
      bullets: a.zones
        .slice(0, 4)
        .map(
          (z) =>
            `${ZONE_BY_ID[z.zoneId]?.name}: risk ${Math.round(z.risk)}/100 (${z.level}), flood ${Math.round(
              z.flood * 100,
            )}%, slope ${Math.round(z.landslide * 100)}%, fire ${Math.round(z.fire * 100)}%`,
        ),
      sources: ['REACH multi-hazard risk model'],
      confidence: 0.9,
      hotline: hotlineByNumber('1078'),
      followups: ['Which zone should be evacuated first?', 'Where can those residents go?'],
    };
  }

  /* ---- fall through to the general knowledge base ---- */
  const topic = detectHazardTopic(query);
  const ranked = KNOWLEDGE_BASE.map((e) => ({
    e,
    // Prefer entries in the hazard the caller is clearly asking about.
    s: scoreEntry(e, tokens) + (topic && e.hazard === topic ? 3.2 : 0),
  })).sort((x, y) => y.s - x.s);
  const best = ranked[0];
  const strong = best && best.s >= 4;

  if (!strong) {
    const near = ranked.filter((r) => r.s > 1).slice(0, 3);
    return {
      id: 'kb_unknown',
      kind: 'unknown',
      badge: 'NO CONFIDENT MATCH · LOCAL KNOWLEDGE BASE',
      title: 'I do not have a confident answer for that',
      body: [
        'I answer from a fixed emergency knowledge base plus verified system data, so I will not guess at live information.',
        near.length
          ? `The closest topics I do have are: ${near.map((n) => n.e.title.toLowerCase()).join('; ')}. Ask about any of those and I will go deep.`
          : offline
            ? 'You are offline, so I cannot fetch current weather, satellite imagery or new community reports.'
            : 'Try rephrasing, or use one of the suggestions below.',
      ],
      bullets: [
        'Call 112 for any immediate danger — police, fire and ambulance on one number',
        'What should I do during a flood?',
        'Where is the nearest available shelter?',
        'Which roads should I avoid?',
        'What should I carry during evacuation?',
        'What should I do if someone is missing?',
      ],
      sources: ['REACH local knowledge base'],
      confidence: 0.2,
      hotline: hotlineByNumber('112'),
      followups: near.length ? near.map((n) => n.e.title) : ['What should I do during a flood?', 'What emergency numbers should I save?'],
    };
  }

  const second = ranked[1];
  const related = second && second.s > best.s * 0.55 ? [second.e] : [];

  return {
    id: best.e.id,
    kind: 'guidance',
    badge: 'GENERAL GUIDANCE · CONTROLLED EMERGENCY KNOWLEDGE BASE · WORKS OFFLINE',
    title: best.e.title,
    body: profile
      ? [
          ...best.e.body,
          `Personalised note — you told me: “${profile}”. Apply the guidance with that in mind and mention it to responders at the shelter.`,
        ]
      : best.e.body,
    bullets: best.e.bullets,
    sources: [`REACH knowledge base · ${best.e.hazard} / ${best.e.phase}`, ...related.map((r) => r.title)],
    disclaimer:
      'This is general preparedness guidance, not a live assessment of your location. For live conditions, check the Live Map or ask about a specific zone.',
    confidence: Math.min(0.95, 0.4 + best.s / 18),
    hotline: hotlineForSituation(`${best.e.title} ${best.e.keywords.join(' ')} ${best.e.hotline ?? ''}`),
    followups: best.e.followups,
  };
}

export const SUGGESTED_QUESTIONS = [
  'What should I do during a flood?',
  'What should I do during a fire?',
  'Where is the nearest available shelter?',
  'Which roads should I avoid?',
  'What should I carry during evacuation?',
  'What should I do if someone is missing?',
  'I am trapped — what do I do?',
  'How do I do CPR?',
  'What do I do in a heatwave?',
  'Is there a cyclone coming?',
  'Which zone is at highest risk?',
  'What is the domino chain right now?',
];

export function knowledgeStats() {
  return {
    entries: KNOWLEDGE_BASE.length,
    bullets: KNOWLEDGE_BASE.reduce((a, e) => a + e.bullets.length, 0),
    hazards: new Set(KNOWLEDGE_BASE.map((e) => e.hazard)).size,
  };
}

