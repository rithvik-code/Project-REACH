import { NODE_BY_ID, ROADS, ZONES } from '../data/region';
import type { HazardState, RoadClosure, Scenario, Zone } from '../types';
import { clamp } from '../geo';

/** Time machine window: 12 hours of history, 24 hours of simulation. */
export const TIME_MIN = -12;
export const TIME_MAX = 24;

/** Soil moisture already in the catchment before this event began. */
export const ANTECEDENT_MM = 24;
/** Catchment rainfall total (mm) that saturates the system to maximum pressure. */
const SATURATION_MM = 560;
/** Recent rainfall (mm, 6 h window) treated as full landslide intensity. */
const INTENSITY_MM = 150;

export const DEFAULT_SCENARIO: Scenario = {
  id: 'live',
  name: 'Live conditions',
  rainfallMultiplier: 1,
  riverSurgeM: 0,
  landslideSensitivity: 1,
  fireSensitivity: 1,
  blockedRoadIds: [],
  shelterCapacityOverrides: {},
  shelterOccupancyOverrides: {},
  hospitalsOffline: [],
};

/** Live weather inputs used to bias the modelled hazard field toward observed reality. */
export interface LiveWeatherInput {
  rainRateMmHr: number;
  saturation: number;
  fireDanger: number;
  tempC: number;
  humidity: number;
  windKmh: number;
}

export interface ScenarioPreset {
  id: string;
  label: string;
  blurb: string;
  apply: Partial<Scenario>;
}

export const SCENARIO_PRESETS: ScenarioPreset[] = [
  {
    id: 'p_monsoon',
    label: 'Monsoon burst',
    blurb: 'Rainfall intensity doubles — flash flooding on riverine zones.',
    apply: { rainfallMultiplier: 1.9, landslideSensitivity: 1.15 },
  },
  {
    id: 'p_surge',
    label: 'River surge / embankment failure',
    blurb: 'River stage rises 3 m. Bridges and causeways flood first.',
    apply: { riverSurgeM: 3, rainfallMultiplier: 1.35 },
  },
  {
    id: 'p_cloudburst',
    label: 'Cloudburst',
    blurb: 'Extreme short-duration rainfall — landslide belt becomes critical.',
    apply: { rainfallMultiplier: 2.6, landslideSensitivity: 1.4, riverSurgeM: 1.5 },
  },
  {
    id: 'p_dry',
    label: 'Receding / dry window',
    blurb: 'Rainfall eases. Use this to plan recovery and re-opening of roads.',
    apply: { rainfallMultiplier: 0.25, landslideSensitivity: 0.8, fireSensitivity: 1.5 },
  },
  {
    id: 'p_fire',
    label: 'Forest fire outbreak',
    blurb: 'Dry, hot and windy. Wildfire spreads across the forest belt and blocks hill roads.',
    apply: { rainfallMultiplier: 0.2, landslideSensitivity: 0.7, fireSensitivity: 2.1 },
  },
];

/* ------------------------------------------------------------------ */
/* Rainfall / time model                                              */
/* ------------------------------------------------------------------ */

/** Instantaneous rainfall in mm/hr at a given hour offset. */
export function rainRate(t: number, scenario: Scenario): number {
  const peak = 6;
  const bell = 20 * Math.exp(-((t - peak) ** 2) / (2 * 7 ** 2));
  return (bell + 2.5) * scenario.rainfallMultiplier;
}

export function cumulativeRain(t: number, scenario: Scenario): number {
  let sum = 0;
  for (let h = TIME_MIN; h < t; h += 0.5) {
    sum += rainRate(h, scenario) * 0.5;
  }
  return sum;
}

function recentRain(t: number, scenario: Scenario, windowHr = 6): number {
  let sum = 0;
  for (let h = t - windowHr; h < t; h += 0.5) {
    sum += rainRate(Math.max(h, TIME_MIN), scenario) * 0.5;
  }
  return sum;
}

function floodPressure(t: number, scenario: Scenario): number {
  return clamp((ANTECEDENT_MM + cumulativeRain(t, scenario)) / SATURATION_MM, 0, 1);
}

function landslidePressure(t: number, scenario: Scenario): number {
  const intensity = clamp(recentRain(t, scenario, 6) / INTENSITY_MM, 0, 1);
  const cum = clamp((ANTECEDENT_MM + cumulativeRain(t, scenario)) / SATURATION_MM, 0, 1);
  return clamp(0.45 * intensity + 0.55 * cum, 0, 1);
}

/**
 * Wildfire pressure. Rain suppresses it hard — a saturated catchment cannot
 * carry a running fire — so fire responds to the 24 h rain total first and to
 * observed fire-weather (Fosberg index) second.
 */
function firePressure(t: number, scenario: Scenario, weather?: LiveWeatherInput): number {
  const recent24 = recentRain(t, scenario, 24);
  const dryness = clamp(1 - recent24 / 35, 0, 1);
  const sensed = weather ? clamp(0.68 * weather.fireDanger + 0.32 * dryness, 0, 1) : dryness;
  return clamp(sensed * scenario.fireSensitivity, 0, 1);
}

/* ------------------------------------------------------------------ */
/* Zone + road hazard fields                                          */
/* ------------------------------------------------------------------ */

export function zoneFlood(zone: Zone, p: number, scenario: Scenario): number {
  const surgeBoost =
    scenario.riverSurgeM * (zone.terrain === 'riverine' ? 0.11 : zone.terrain === 'plain' ? 0.035 : 0.012);
  return clamp(zone.baseFlood * (0.3 + 0.88 * p) + surgeBoost, 0, 1);
}

/**
 * Slope failure is strongly non-linear: unsaturated slopes hold, then release
 * quickly once the soil is near saturation. The exponent models that knee.
 */
export function zoneLandslide(zone: Zone, lp: number, scenario: Scenario): number {
  const slopePenalty = zone.terrain === 'hill' || zone.terrain === 'ridge' ? 1.12 : 0.85;
  const response = 0.15 + 0.85 * Math.pow(clamp(lp, 0, 1), 1.6);
  return clamp(zone.baseLandslide * response * scenario.landslideSensitivity * slopePenalty, 0, 1);
}

const FLOOD_IMPASSABLE = 0.74;
const LANDSLIDE_IMPASSABLE = 0.72;
const FIRE_IMPASSABLE = 0.82;

/** Default fuel load by terrain when a zone does not declare its own. */
export function defaultFuel(terrain: Zone['terrain']): number {
  switch (terrain) {
    case 'forest':
      return 0.9;
    case 'ridge':
      return 0.68;
    case 'hill':
      return 0.6;
    case 'industrial':
      return 0.24;
    default:
      return 0.2;
  }
}

export function zoneFire(zone: Zone, p: number, windKmh: number): number {
  const fuel = zone.baseFire ?? defaultFuel(zone.terrain);
  const windBoost = 1 + 0.3 * clamp(windKmh / 45, 0, 1);
  return clamp(fuel * (0.22 + 0.92 * p) * windBoost, 0, 1);
}

/**
 * Live weather nudges the modelled field so "now" reflects what the sky is
 * actually doing: observed rainfall scales the rain rate, and observed
 * fire-weather scales wildfire pressure.
 */
function rainBias(weather?: LiveWeatherInput): number {
  if (!weather) return 1;
  // 2 mm/h -> ~0.8x, 8 mm/h -> ~1.6x, >= 20 mm/h -> 3x
  return clamp(0.2 + weather.rainRateMmHr / 5, 0.2, 3);
}

export function buildHazardState(
  hourOffset: number,
  scenario: Scenario,
  closures: RoadClosure[] = [],
  weather?: LiveWeatherInput,
): HazardState {
  const t = clamp(hourOffset, TIME_MIN, TIME_MAX);
  const eff: Scenario = weather
    ? { ...scenario, rainfallMultiplier: scenario.rainfallMultiplier * rainBias(weather) }
    : scenario;
  const fp = floodPressure(t, eff);
  const lp = landslidePressure(t, eff);
  const fireP = firePressure(t, eff, weather);
  const windKmh = weather?.windKmh ?? 14;

  const perZone: HazardState['perZone'] = {};
  for (const z of ZONES) {
    perZone[z.id] = {
      flood: zoneFlood(z, fp, eff),
      landslide: zoneLandslide(z, lp, eff),
      fire: zoneFire(z, fireP, windKmh),
    };
  }

  const perRoad: HazardState['perRoad'] = {};
  for (const r of ROADS) {
    const a = NODE_BY_ID[r.from];
    const b = NODE_BY_ID[r.to];
    // A carriageway is compromised by its MOST exposed end, not the average.
    const floodAtEnds = Math.max(
      a?.zoneId ? (perZone[a.zoneId]?.flood ?? 0.35) : 0.3,
      b?.zoneId ? (perZone[b.zoneId]?.flood ?? 0.35) : 0.3,
    );
    const slideAtEnds = Math.max(
      a?.zoneId ? (perZone[a.zoneId]?.landslide ?? 0.3) : 0.25,
      b?.zoneId ? (perZone[b.zoneId]?.landslide ?? 0.3) : 0.25,
    );
    const fireAtEnds = Math.max(
      a?.zoneId ? (perZone[a.zoneId]?.fire ?? 0.1) : 0.1,
      b?.zoneId ? (perZone[b.zoneId]?.fire ?? 0.1) : 0.1,
    );

    // Exposure factors act as a partial multiplier so high-exposure structures
    // (bridges, causeways) fail earlier without making every road impassable.
    const flood = clamp(floodAtEnds * (0.5 + 0.5 * r.floodExposure), 0, 1);
    const landslide = clamp(slideAtEnds * (0.55 + 0.45 * r.landslideExposure), 0, 1);
    const fireExposure = r.fireExposure ?? 0.25;
    const fire = clamp(fireAtEnds * (0.5 + 0.5 * fireExposure), 0, 1);

    const closure = closures.find((c) => c.roadId === r.id);
    const cautionBonus = closure?.level === 'caution' ? 0.18 : 0;
    const structural = r.kind === 'bridge' ? 0.05 : r.kind === 'causeway' ? 0.06 : r.kind === 'hill' ? 0.03 : 0;

    // Fire only contributes once it is genuinely running, so the calibrated
    // flood/landslide behaviour of the monsoon scenario is preserved.
    const fireTerm = Math.max(0, fire - 0.5) * 0.5;
    const smokeOrFireBlock = fire >= FIRE_IMPASSABLE && fireExposure >= 0.6;

    const risk = clamp(0.58 * flood + 0.42 * landslide + fireTerm + cautionBonus + structural, 0, 1);
    const hardBlocked = closure?.level === 'blocked';
    const floodBlock = flood >= FLOOD_IMPASSABLE;
    const slideBlock = landslide >= LANDSLIDE_IMPASSABLE;

    perRoad[r.id] = {
      flood,
      landslide,
      fire,
      risk,
      passable: !hardBlocked && !floodBlock && !slideBlock && !smokeOrFireBlock,
      blockingHazard: floodBlock ? 'flood' : slideBlock ? 'landslide' : smokeOrFireBlock ? 'fire' : undefined,
      closure,
    };
  }

  return {
    hourOffset: t,
    rainfallRateMmHr: rainRate(t, eff),
    cumulativeRainMm: ANTECEDENT_MM + cumulativeRain(t, eff),
    antecedentMm: ANTECEDENT_MM,
    floodPressure: fp,
    landslidePressure: lp,
    firePressure: fireP,
    isSimulated: t > 0,
    perZone,
    perRoad,
  };
}

/** Convenience: hazard key that changes whenever the visible world changes. */
export function hazardKey(h: HazardState, scenario: Scenario, closures: RoadClosure[]): string {
  return [
    h.hourOffset,
    scenario.rainfallMultiplier,
    scenario.riverSurgeM,
    scenario.landslideSensitivity,
    scenario.fireSensitivity,
    scenario.hospitalsOffline.join(','),
    closures.map((c) => `${c.roadId}:${c.level}`).join(','),
    Object.entries(scenario.shelterCapacityOverrides)
      .map(([k, v]) => `${k}=${v}`)
      .join(','),
  ].join('|');
}
