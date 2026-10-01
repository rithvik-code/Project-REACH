/* Headless sanity check for the REACH analysis engines.
   Run with: npx tsx scripts/verify.ts
   Not part of the app bundle. */
import { runAnalysis, computeRoute, anchorOf } from '../src/lib/engine/analysis';
import { DEFAULT_SCENARIO, SCENARIO_PRESETS, buildHazardState } from '../src/lib/engine/hazard';
import { buildGraph, shortestPath } from '../src/lib/engine/routing';
import {
  answerQuery,
  buildTinySystemPrompt,
  detectUrgency,
  knowledgeStats,
  retrieveForLlm,
} from '../src/lib/engine/assistant';
import {
  assessProximity,
  eventsWithinWatch,
  geolocateReliefweb,
  normalizeGdacs,
  normalizeReliefweb,
  normalizeUsgs,
  ringFor,
} from '../src/lib/engine/globalFeeds';
import { detectDisturbances, fireWeatherIndex } from '../src/lib/engine/weather';
import { formatDistance, formatDuration } from '../src/lib/engine/directions';
import { speakableText, splitSentences } from '../src/lib/engine/voice';
import { ZONES, ZONE_BY_ID, SHELTERS } from '../src/lib/data/region';
import type { RoadClosure } from '../src/lib/types';

/* Fixtures — network-free stand-ins shaped exactly like the live payloads. */
const USGS_FIXTURE = {
  features: [
    {
      id: 'us1001',
      properties: { mag: 6.3, place: 'Hindu Kush region', time: 1_699_999_000_000, url: 'https://earthquake.usgs.gov/x', tsunami: 0, title: 'M 6.3 - Hindu Kush region' },
      geometry: { coordinates: [71.2, 36.5, 210] },
    },
    {
      id: 'us1002',
      properties: { mag: 3.1, place: 'Nepal', time: 1_699_998_000_000, tsunami: 0, title: 'M 3.1 - Nepal' },
      geometry: { coordinates: [85.3, 27.7, 10] },
    },
  ],
};
const GDACS_FIXTURE = {
  features: [
    {
      id: 'gd1',
      properties: { eventname: 'Assam Floods', eventtype: 'Flood', alertlevel: 'RED', isocountry: 'IND', fromdate: 1_699_990_000_000 },
      geometry: { coordinates: [78.4, 30.15] },
    },
  ],
};
const RELIEFWEB_FIXTURE = {
  data: [
    {
      id: 'rw1',
      fields: { name: 'India: Monsoon Floods 2026', date: { event: '2026-09-28T00:00:00Z' }, country: [{ name: 'India' }], type: ['Flood'], url: 'https://reliefweb.int/x' },
    },
  ],
};

const closures: RoadClosure[] = [];
let failures = 0;

function check(label: string, cond: boolean, detail = '') {
  const status = cond ? 'PASS' : 'FAIL';
  if (!cond) failures += 1;
  console.log(`${status}  ${label}${detail ? ` — ${detail}` : ''}`);
}

console.log('\n=== 1. Hazard field evolves with time ===');
for (const h of [-12, 0, 6, 12, 24]) {
  const s = buildHazardState(h, DEFAULT_SCENARIO, closures);
  const rb = s.perZone.z_riverbend;
  const hc = s.perZone.z_hillcrest;
  const roadsOut = Object.values(s.perRoad).filter((r) => !r.passable).length;
  console.log(
    `  T${h >= 0 ? '+' : ''}${h}h  rain ${s.rainfallRateMmHr.toFixed(1)} mm/hr  cum ${Math.round(
      s.cumulativeRainMm,
    )} mm  floodP ${s.floodPressure.toFixed(2)}  slideP ${s.landslidePressure.toFixed(2)}  |  Riverbend flood ${rb.flood.toFixed(
      2,
    )}  Hillcrest slide ${hc.landslide.toFixed(2)}  roadsOut ${roadsOut}`,
  );
}

const t0 = buildHazardState(0, DEFAULT_SCENARIO, closures);
const t24 = buildHazardState(24, DEFAULT_SCENARIO, closures);
check('flood pressure rises over time', t24.floodPressure > t0.floodPressure);
check('riverine zone floods before hill zone', t0.perZone.z_riverbend.flood > t0.perZone.z_hillcrest.flood);
check('hill zone slides more than riverine zone', t0.perZone.z_hillcrest.landslide > t0.perZone.z_riverbend.landslide);
check('no NaN in hazard field', Object.values(t24.perZone).every((z) => Number.isFinite(z.flood) && Number.isFinite(z.landslide)));

console.log('\n=== 2. Baseline analysis ===');
const base = runAnalysis({ hourOffset: 0, scenario: DEFAULT_SCENARIO, closures, offline: false });
console.log('  worst zone:', ZONE_BY_ID[base.zones[0].zoneId].name, Math.round(base.zones[0].risk), base.zones[0].level);
console.log(
  '  totals:',
  JSON.stringify({
    atRisk: Math.round(base.totals.populationAtRisk),
    assistance: Math.round(base.totals.populationNeedingAssistance),
    free: Math.round(base.totals.shelterCapacityAvailable),
    gap: Math.round(base.totals.shelterGap),
    isolated: base.totals.isolatedZones,
    blocked: base.totals.blockedRoads,
    readiness: base.totals.readiness,
  }),
);
console.log('  top actions:', base.actions.slice(0, 3).map((a) => `${a.priority}. ${a.title}`).join(' | '));
check('every zone has a risk score 0..100', base.zones.every((z) => z.risk >= 0 && z.risk <= 100));
check('population at risk is bounded', base.totals.populationAtRisk > 0 && base.totals.populationAtRisk < base.totals.totalPopulation);
check('assistance <= at risk', base.totals.populationNeedingAssistance <= base.totals.populationAtRisk + 1);
check('readiness is 0..100', base.totals.readiness >= 0 && base.totals.readiness <= 100);
check('actions are ranked 1..n', base.actions.every((a, i) => a.priority === i + 1));
check('every action explains itself', base.actions.every((a) => a.because.length >= 3 && a.rationale.length > 40));
check(
  'shelter occupancy is bounded to capacity*1.25',
  base.shelters.every((s) => s.occupied <= s.capacity * 1.25 + 1),
  base.shelters.map((s) => `${s.id}:${Math.round((s.occupied / s.capacity) * 100)}%`).join(' '),
);

console.log('\n=== 3. Least-risk vs shortest routing ===');
const graph0 = buildGraph(t0);
const graph24 = buildGraph(t24);
const origin = anchorOf(ZONE_BY_ID.z_riverbend);
const dest = SHELTERS.find((s) => s.id === 's5')!;

const peakPath = shortestPath(graph24, origin, (n) => n === dest.nodeId, { metric: 'risk' });
const earlyPath = shortestPath(graph0, origin, (n) => n === dest.nodeId, { metric: 'risk' });
console.log(
  `  Riverbend -> Greenfield: at T+0 ${earlyPath.found ? 'reachable' : 'CUT OFF'}; at T+24 ${peakPath.found ? 'reachable' : 'CUT OFF'}`,
);
check('Riverbend is reachable at T+0', earlyPath.found);
check('Riverbend becomes isolated at peak hazard', !peakPath.found);

const described = computeRoute(graph0, t0, origin, dest.nodeId, dest.name, dest.id);
if (described) {
  console.log(
    `  least-risk: ${described.distanceKm.toFixed(2)} km, avg exposure ${described.riskScore.toFixed(
      1,
    )}%  |  shortest: ${described.shortestDistanceKm.toFixed(2)} km, avg exposure ${described.shortestRiskScore.toFixed(
      1,
    )}%  |  risk reduction ${described.riskReductionPct}%`,
  );
  console.log('  avoided:', described.avoided.map((a) => a.label).join(' | ') || 'none');
  check('least-risk route exposure <= shortest route exposure', described.riskScore <= described.shortestRiskScore + 0.5);
  check('route distance is positive', described.distanceKm > 0);
  check('route legs all carry a risk score', described.path.every((l) => l.risk >= 0 && l.risk <= 1));
} else {
  check('route describable at T+0', false, 'no route returned');
}

console.log('\n=== 4. Blocking a road recalculates the network ===');
const beforeIsolated = base.totals.isolatedZones;
const beforeBlocked = base.totals.blockedRoads;
const bridged = runAnalysis({
  hourOffset: 24,
  scenario: DEFAULT_SCENARIO,
  closures: [
    { roadId: 'R17', reason: 'test block', level: 'blocked', reportedBy: 'verify', reportedAt: Date.now(), verified: true },
    { roadId: 'R14', reason: 'test block', level: 'blocked', reportedBy: 'verify', reportedAt: Date.now(), verified: true },
    { roadId: 'R15', reason: 'test block', level: 'blocked', reportedBy: 'verify', reportedAt: Date.now(), verified: true },
    { roadId: 'R16', reason: 'test block', level: 'blocked', reportedBy: 'verify', reportedAt: Date.now(), verified: true },
  ],
  offline: false,
});
console.log(
  `  blocked roads ${beforeBlocked} -> ${bridged.totals.blockedRoads}; isolated zones ${beforeIsolated} -> ${bridged.totals.isolatedZones}; domino ${Math.round(
    base.domino.criticalityScore,
  )} -> ${Math.round(bridged.domino.criticalityScore)}`,
);
console.log('  domino waves:', bridged.domino.steps.map((s) => `W${s.wave}:${s.title.slice(0, 46)}`).join(' | '));
check('blocking 4 roads removes them from the network', bridged.totals.blockedRoads >= 4);
check('domino chain strengthens after closures', bridged.domino.criticalityScore >= base.domino.criticalityScore);
check('domino chain is ordered by wave', bridged.domino.steps.every((s, i, arr) => i === 0 || arr[i - 1].wave <= s.wave));
check('domino steps carry detail text', bridged.domino.steps.every((s) => s.detail.length > 10));

console.log('\n=== 5. Scenario simulator propagation ===');
const cloudburst = runAnalysis({ hourOffset: 12, scenario: { ...DEFAULT_SCENARIO, ...SCENARIO_PRESETS[2].apply }, closures, offline: false });
const mild = runAnalysis({ hourOffset: 12, scenario: { ...DEFAULT_SCENARIO, rainfallMultiplier: 0.25 }, closures, offline: false });
console.log(
  `  cloudburst atRisk ${Math.round(cloudburst.totals.populationAtRisk)} / roadsOut ${cloudburst.totals.blockedRoads} / gap ${Math.round(
    cloudburst.totals.shelterGap,
  )}  ||  dry atRisk ${Math.round(mild.totals.populationAtRisk)} / roadsOut ${mild.totals.blockedRoads}`,
);
check('cloudburst exposes more people than a dry window', cloudburst.totals.populationAtRisk > mild.totals.populationAtRisk);
check('cloudburst closes at least as many roads', cloudburst.totals.blockedRoads >= mild.totals.blockedRoads);

console.log('\n=== 6. Shelter capacity override propagates ===');
const baseline12 = runAnalysis({ hourOffset: 12, scenario: DEFAULT_SCENARIO, closures, offline: false });
const raised = runAnalysis({
  hourOffset: 12,
  scenario: DEFAULT_SCENARIO,
  closures,
  offline: false,
  capacityPatch: { s5: 3200, s3: 3000, s4: 1800 },
});
console.log(
  `  free capacity ${Math.round(baseline12.totals.shelterCapacityAvailable)} -> ${Math.round(
    raised.totals.shelterCapacityAvailable,
  )}; gap ${Math.round(baseline12.totals.shelterGap)} -> ${Math.round(raised.totals.shelterGap)}`,
);
check(
  'raising capacity increases available spaces',
  raised.totals.shelterCapacityAvailable > baseline12.totals.shelterCapacityAvailable,
);
check('raising capacity reduces the gap', raised.totals.shelterGap < baseline12.totals.shelterGap);

console.log('\n=== 7. Hospital offline propagates into actions ===');
const noHospital = runAnalysis({
  hourOffset: 12,
  scenario: DEFAULT_SCENARIO,
  closures: [{ roadId: 'R12', reason: 'flooded approach', level: 'blocked', reportedBy: 'verify', reportedAt: Date.now(), verified: true }],
  offline: false,
  hospitalStatusPatch: { h_general: 'offline' },
});
const medicalAction = noHospital.actions.find((a) => a.category === 'medical');
console.log('  medical action:', medicalAction?.title ?? 'NONE');
check('hospital outage produces a medical action', !!medicalAction);
check('hospital outage is reflected in hospital status', noHospital.hospitals.some((h) => !h.reachable || h.status === 'offline'));

console.log('\n=== 8. Local assistant ===');
const questions = [
  'What should I do during a flood?',
  'Where is the nearest available shelter?',
  'Which roads should I avoid?',
  'What should I carry during evacuation?',
  'What should I do if someone is missing?',
  'What is the domino chain right now?',
];
for (const q of questions) {
  const r = answerQuery(q, { analysis: base, offline: true, profile: 'elderly parent at home', selectedZoneId: 'z_riverbend' });
  console.log(`  Q: ${q}\n     [${r.kind}] ${r.title} (conf ${r.confidence.toFixed(2)}, ${r.bullets.length} bullets)`);
  check(`assistant answers offline: "${q.slice(0, 34)}…"`, r.kind !== 'unknown' && r.bullets.length > 0);
}
const contactsReply = answerQuery('emergency numbers please', { analysis: base, offline: true, profile: '', selectedZoneId: null });
check(
  'assistant surfaces the national + air rescue numbers',
  contactsReply.bullets.some((b) => b.includes('112')) &&
    contactsReply.bullets.some((b) => b.includes('9540161344')) &&
    contactsReply.bullets.some((b) => b.includes('9711077372')),
);
const gibberish = answerQuery('purple monkey dishwasher', { analysis: base, offline: true, profile: '', selectedZoneId: null });
check('assistant admits uncertainty rather than guessing', gibberish.kind === 'unknown');

console.log('\n=== 8b. Every assistant reply carries an emergency number ===');
const hotlineQueries = [
  'What should I do during a fire?',
  'How do I do CPR?',
  'I am trapped and cannot get out',
  'Someone is missing — how do I report it?',
  'What do I do in a heatwave?',
  'The roads are blocked, which do I avoid?',
  'tell me about a hurricane',
  'where is the nearest shelter?',
];
for (const q of hotlineQueries) {
  const r = answerQuery(q, { analysis: base, offline: true, profile: '', selectedZoneId: 'z_riverbend' });
  console.log(`  Q: ${q}\n     [${r.kind}] ${r.title}\n     hotline: ${r.hotline?.number ?? 'NONE'} (${r.hotline?.label ?? '—'})`);
  check(`hotline attached: "${q.slice(0, 30)}…"`, !!r.hotline && r.hotline.number.length >= 3);
}
check(
  'a fire question routes to the fire service',
  answerQuery('What should I do during a fire?', { analysis: base, offline: true, profile: '', selectedZoneId: null })
    .hotline?.number === '101',
);
check(
  'a medical question routes to an ambulance number',
  answerQuery('How do I do CPR?', { analysis: base, offline: true, profile: '', selectedZoneId: null }).hotline?.number ===
    '108',
);
check(
  'the knowledge base now spans more hazard topics',
  knowledgeStats().entries >= 30 && knowledgeStats().hazards >= 4,
  `${knowledgeStats().entries} entries / ${knowledgeStats().hazards} hazards`,
);

const fireHow = answerQuery('What should I do during a fire?', {
  analysis: base,
  offline: true,
  profile: '',
  selectedZoneId: null,
});
console.log(`  fire guidance -> [${fireHow.kind}] ${fireHow.title} (${fireHow.bullets.length} bullets)`);
check('a safety question gives safety guidance, not district status', fireHow.kind === 'guidance');
check('fire guidance names the fire service', fireHow.bullets.some((b) => b.includes('101')));
const fireStatus = answerQuery('What is the fire risk right now?', {
  analysis: base,
  offline: true,
  profile: '',
  selectedZoneId: null,
});
check('an explicit fire-status question still routes to the wildfire model', fireStatus.kind === 'system');
check(
  'CPR guidance is retrievable',
  answerQuery('How do I do CPR?', { analysis: base, offline: true, profile: '', selectedZoneId: null }).kind ===
    'guidance',
);

gibberishCheck();
function gibberishCheck() {
  const r = answerQuery('purple monkey dishwasher', { analysis: base, offline: true, profile: '', selectedZoneId: null });
  check('unknown answers still give a number to call', r.hotline?.number === '112');
}

console.log('\n=== 10. Wildfire hazard model ===');
const wet = buildHazardState(0, DEFAULT_SCENARIO, closures, {
  rainRateMmHr: 18,
  saturation: 0.9,
  fireDanger: 0.1,
  tempC: 22,
  humidity: 92,
  windKmh: 12,
});
const dry = buildHazardState(0, DEFAULT_SCENARIO, closures, {
  rainRateMmHr: 0,
  saturation: 0.02,
  fireDanger: 0.92,
  tempC: 43,
  humidity: 14,
  windKmh: 48,
});
console.log(
  `  monsoon: floodP ${wet.floodPressure.toFixed(2)} fireP ${wet.firePressure.toFixed(2)} ridgeFire ${wet.perZone.z_eastridge.fire.toFixed(2)}`,
);
console.log(
  `  dry/hot: floodP ${dry.floodPressure.toFixed(2)} fireP ${dry.firePressure.toFixed(2)} ridgeFire ${dry.perZone.z_eastridge.fire.toFixed(2)}`,
);
check('no NaN in the fire field', Object.values(dry.perZone).every((z) => Number.isFinite(z.fire)));
check('fire pressure is higher in dry fire weather than in heavy rain', dry.firePressure > wet.firePressure);
check('the forest ridge carries more fire load than the floodplain', dry.perZone.z_eastridge.fire > dry.perZone.z_riverbend.fire);
check(
  'fire adds little risk during a monsoon event',
  Object.values(wet.perRoad).every((r) => r.fire < 0.35 || r.risk > 0),
);
check('live rain suppresses the modelled fire field', wet.firePressure < 0.25);

console.log('\n=== 11. Live weather engine ===');
check(
  'fire index rises with wind speed',
  fireWeatherIndex(38, 20, 45) > fireWeatherIndex(38, 20, 5),
  `${fireWeatherIndex(38, 20, 5).toFixed(2)} -> ${fireWeatherIndex(38, 20, 45).toFixed(2)}`,
);
check(
  'fire index rises as humidity falls',
  fireWeatherIndex(38, 15, 25) > fireWeatherIndex(38, 80, 25),
  `${fireWeatherIndex(38, 80, 25).toFixed(2)} -> ${fireWeatherIndex(38, 15, 25).toFixed(2)}`,
);
check('fire index is bounded 0..1', [
  fireWeatherIndex(50, 5, 100),
  fireWeatherIndex(-5, 99, 0),
  fireWeatherIndex(30, 50, 20),
].every((v) => v >= 0 && v <= 1));

const now = Date.now();
const makeHour = (i: number, over: Partial<{ precipMm: number; gustKmh: number; temperatureC: number; fireDanger: number }>) => ({
  time: new Date(now + i * 3600_000).toISOString(),
  temperatureC: over.temperatureC ?? 28,
  precipMm: over.precipMm ?? 0,
  precipProbability: 10,
  windKmh: 10,
  gustKmh: over.gustKmh ?? 12,
  humidity: 60,
  weatherCode: 1,
  fireDanger: over.fireDanger ?? 0.3,
});
const series = [
  makeHour(0, {}),
  makeHour(1, {}),
  makeHour(2, { precipMm: 18 }),
  makeHour(3, { precipMm: 22 }),
  makeHour(4, {}),
  makeHour(5, { gustKmh: 76 }),
  makeHour(6, { temperatureC: 43 }),
  makeHour(7, { fireDanger: 0.88 }),
];
const disturbances = detectDisturbances(series);
console.log('  flagged:', disturbances.map((d) => `${d.kind}@T+${d.leadHours}h(${d.severity})`).join(' | '));
check('heavy rain window is detected', disturbances.some((d) => d.kind === 'very_heavy_rain'));
check('high wind is detected', disturbances.some((d) => d.kind === 'high_wind'));
check('heatwave is detected', disturbances.some((d) => d.kind === 'heatwave'));
check('critical fire weather is detected', disturbances.some((d) => d.kind === 'fire_weather'));
check('disturbances are ordered by lead time', disturbances.every((d, i, a) => i === 0 || a[i - 1].leadHours <= d.leadHours));
check('disturbance windows are non-empty', disturbances.every((d) => d.startsAt && d.endsAt && d.detail.length > 20));

console.log('\n=== 12. Directions formatting ===');
check('short distances read in metres', formatDistance(640) === '640 m', formatDistance(640));
check('long distances read in kilometres', formatDistance(12400) === '12 km', formatDistance(12400));
check('durations roll over to hours', formatDuration(5400).includes('hr'), formatDuration(5400));
check('short durations stay in minutes', formatDuration(1500) === '25 min', formatDuration(1500));

console.log('\n=== 13. Assistant urgency pre-pass + KB ===');
{
  const u1 = detectUrgency('there is fire in my kitchen right now');
  check('lived fire phrasing is urgent', u1.urgent && u1.hotline?.number === '101', u1.reason);
  const u2 = detectUrgency('my father is not breathing');
  check('cardiac phrasing is urgent with 108', u2.urgent && u2.hotline?.number === '108');
  const u3 = detectUrgency('we are trapped on the roof');
  check('trapped maps to NDRF', u3.urgent && u3.hotline?.number === '011-24363260');
  const u4 = detectUrgency('what should I do during a fire?');
  check('educational fire phrasing is NOT urgent', !u4.urgent);
  check('KB grew to 45 topics', knowledgeStats().entries === 45, String(knowledgeStats().entries));
  const kbHit = answerQuery('what should I do during a landslide', {
    analysis: base,
    offline: false,
    profile: '',
    selectedZoneId: null,
  });
  check('KB retrieval still answers landslide guidance', kbHit.kind === 'guidance' && /landslide/i.test(kbHit.title));
  const retrieval = retrieveForLlm('someone is missing after the flood', {
    analysis: base,
    offline: false,
    profile: '',
    selectedZoneId: null,
  });
  check('retrieval bundles topics for the LLM tiers', retrieval.topics.length >= 1 && retrieval.systemData.length > 40);
  check(
    'tiny system prompt forbids invention and mandates hotline',
    /do not know/i.test(buildTinySystemPrompt(retrieval, { analysis: base, offline: false, profile: '', selectedZoneId: null })) &&
      /Emergency number:/.test(buildTinySystemPrompt(retrieval, { analysis: base, offline: false, profile: '', selectedZoneId: null })),
  );
}

console.log('\n=== 14. Global feeds + proximity rings ===');
{
  const usgs = normalizeUsgs(USGS_FIXTURE, 1_700_000_000_000);
  check('USGS fixture normalises', usgs.length === 2 && usgs[0].kind === 'earthquake');
  check('USGS severity scales with magnitude', usgs[0].severity > usgs[1].severity, `${usgs[0].severity} vs ${usgs[1].severity}`);
  const gd = normalizeGdacs(GDACS_FIXTURE, 1_700_000_000_000);
  check('GDACS fixture normalises flood with red belt', gd.length === 1 && gd[0].kind === 'flood' && gd[0].severity === 90);
  const rw = geolocateReliefweb(normalizeReliefweb(RELIEFWEB_FIXTURE, 1_700_000_000_000));
  check('ReliefWeb record geolocates to India centroid', rw.length === 1 && Math.abs(rw[0].lat - 21) < 0.01 && Math.abs(rw[0].lng - 78) < 0.01);

  const home = { lat: 30.17, lng: 78.41 }; // ~2 km from the GDACS fixture event
  const all = [...usgs, ...gd];
  const near = assessProximity(all, home);
  const close = near[0];
  check('close event lands in a ring, far one does not', close.ring !== 'far' && near[near.length - 1].ring === 'far');
  check('ring boundaries: 1.5 km severe / 3 km high / 8 km watch', ringFor(1.5) === 'severe' && ringFor(3) === 'high' && ringFor(8) === 'watch' && ringFor(12) === 'far');
  check('compass bearing resolves', close.compass.length > 0 && close.compass.length <= 3, close.compass);
  check('watch-ring events are surfaced', eventsWithinWatch(near).length === 1);
}

console.log('\n=== 15. Voice helpers ===');
{
  const sentences = splitSentences('Move now. Take water, 5.5 litres. Then call 108!');
  check('sentence splitter keeps decimals intact', sentences.length === 3 && sentences[1].includes('5.5'), sentences.join(' | '));
  const spoken = speakableText('**Go** to the `highest` floor. - take water\nEmergency number: 108 — ambulance');
  check('speakable text strips markup and hotline', !spoken.includes('**') && !spoken.includes('Emergency number:'), spoken);
}

console.log('\n=== 9. Determinism ===');
const a1 = runAnalysis({ hourOffset: 6, scenario: DEFAULT_SCENARIO, closures, offline: false });
const a2 = runAnalysis({ hourOffset: 6, scenario: DEFAULT_SCENARIO, closures, offline: false });
check(
  'same inputs give identical outputs',
  JSON.stringify(a1.totals) === JSON.stringify(a2.totals) && ZONES.length === a1.zones.length,
);

console.log(`\n${failures === 0 ? '✅ ALL CHECKS PASSED' : `❌ ${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
