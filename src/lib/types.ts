export type HazardKind = 'flood' | 'landslide' | 'fire';

export type RiskLevel = 'critical' | 'high' | 'elevated' | 'moderate' | 'low';

export type Terrain = 'riverine' | 'hill' | 'ridge' | 'plain' | 'industrial' | 'forest';

/** A public safety hotline, surfaced at the end of every assistant reply. */
export interface Hotline {
  label: string;
  number: string;
  note?: string;
  category: EmergencyContact['category'];
}

export type BasemapKind = 'streets' | 'satellite' | 'terrain' | 'dark';

export type PreviewDevice = 'desktop' | 'phone-portrait' | 'phone-landscape';

export interface LiveLocation {
  id: string;
  name: string;
  state: string;
  lat: number;
  lng: number;
  /** dominant hazards for the area, used to bias the risk model */
  profile: HazardKind[];
  note: string;
}

/** A forecast weather disturbance derived from the live hourly forecast. */
export interface Disturbance {
  id: string;
  kind: 'heavy_rain' | 'very_heavy_rain' | 'thunderstorm' | 'high_wind' | 'heatwave' | 'fire_weather' | 'dry_spell';
  label: string;
  detail: string;
  severity: RiskLevel;
  /** ISO timestamp of the predicted onset */
  startsAt: string;
  endsAt: string;
  peakAt: string;
  peakValue: number;
  unit: string;
  leadHours: number;
}

export interface HourSample {
  time: string;
  temperatureC: number;
  precipMm: number;
  precipProbability: number;
  windKmh: number;
  humidity: number;
  fireDanger: number;
}

/** Live weather pull for the selected Indian location. */
export interface WeatherSnapshot {
  locationId: string;
  fetchedAt: number;
  timezone: string;
  current: {
    temperatureC: number;
    humidity: number;
    precipMm: number;
    windKmh: number;
    windGustKmh: number;
    weatherCode: number;
    condition: string;
    pressureHpa: number;
    isDay: boolean;
  };
  /** next 24 hours, hour 0 = now */
  hourly: HourSample[];
  /** 3-day totals */
  daily: { date: string; precipMm: number; tMax: number; tMin: number; gustKmh: number }[];
  /** rainfall rate in mm/hr used to bias the hazard model (0 = dry) */
  rainRateMmHr: number;
  /** 0..1 catchment saturation proxy from recent + forecast rain */
  saturation: number;
  /** 0..1 fire-weather danger (Fosberg-style) */
  fireDanger: number;
  fireClass: 'low' | 'moderate' | 'high' | 'very_high' | 'extreme';
  disturbances: Disturbance[];
  source: 'open-meteo' | 'cached' | 'offline-model';
  stale: boolean;
}

export interface Zone {
  id: string;
  name: string;
  kind: 'urban' | 'settlement' | 'industrial' | 'rural';
  lat: number;
  lng: number;
  radiusKm: number;
  population: number;
  elevationM: number;
  terrain: Terrain;
  /** 0..1 — structural + social fragility of the built environment */
  vulnerability: number;
  /** 0..1 baseline flood susceptibility */
  baseFlood: number;
  /** 0..1 baseline landslide susceptibility */
  baseLandslide: number;
  /** 0..1 baseline wildfire susceptibility (defaults by terrain when omitted) */
  baseFire?: number;
  /** Population share that can self-evacuate without assistance (0..1) */
  selfEvacuation: number;
}

export interface RouteNode {
  id: string;
  name: string;
  lat: number;
  lng: number;
  elevM: number;
  zoneId?: string;
}

export type RoadKind = 'highway' | 'arterial' | 'local' | 'hill' | 'bridge' | 'causeway';

export interface Road {
  id: string;
  name: string;
  from: string;
  to: string;
  lengthKm: number;
  lanes: number;
  kind: RoadKind;
  /** multiplier applied to endpoint hazard to get this road's exposure */
  floodExposure: number;
  landslideExposure: number;
  /** 0..1 exposure to wildfire / smoke-driven closure (defaults to 0.25) */
  fireExposure?: number;
}

export interface Shelter {
  id: string;
  name: string;
  lat: number;
  lng: number;
  zoneId: string;
  nodeId: string;
  capacity: number;
  occupied: number;
  elevationM: number;
  facilities: string[];
  accessibility: 'full' | 'limited' | 'difficult';
  manager: string;
  contact: string;
  status: 'open' | 'standby' | 'full' | 'closed';
}

export interface Hospital {
  id: string;
  name: string;
  lat: number;
  lng: number;
  zoneId: string;
  nodeId: string;
  beds: number;
  trauma: boolean;
  helipad: boolean;
  emergency: boolean;
  status: 'operational' | 'strained' | 'offline';
}

export interface HazardPoint {
  id: string;
  kind: HazardKind;
  lat: number;
  lng: number;
  label: string;
  severity: number;
}

/** A user- or system-reported road obstruction. */
export interface RoadClosure {
  roadId: string;
  reason: string;
  reportedBy: string;
  reportedAt: number;
  verified: boolean;
  /** 'blocked' removes it from routing, 'caution' keeps it usable but penalised */
  level: 'blocked' | 'caution';
}

export interface Scenario {
  id: string;
  name: string;
  rainfallMultiplier: number;
  riverSurgeM: number;
  landslideSensitivity: number;
  /** multiplier on wildfire pressure */
  fireSensitivity: number;
  blockedRoadIds: string[];
  /** shelterId -> absolute capacity override */
  shelterCapacityOverrides: Record<string, number>;
  /** shelterId -> occupancy delta */
  shelterOccupancyOverrides: Record<string, number>;
  hospitalsOffline: string[];
}

export interface HazardState {
  /** hours relative to "now": negative past, positive simulated future */
  hourOffset: number;
  rainfallRateMmHr: number;
  cumulativeRainMm: number;
  antecedentMm: number;
  floodPressure: number;
  landslidePressure: number;
  firePressure: number;
  isSimulated: boolean;
  perZone: Record<string, { flood: number; landslide: number; fire: number }>;
  perRoad: Record<
    string,
    {
      flood: number;
      landslide: number;
      fire: number;
      risk: number;
      passable: boolean;
      blockingHazard?: HazardKind;
      closure?: RoadClosure;
    }
  >;
}

export interface ZoneRisk {
  zoneId: string;
  flood: number;
  landslide: number;
  fire: number;
  hazard: number;
  exposure: number;
  risk: number;
  level: RiskLevel;
  populationAtRisk: number;
  populationNeedingAssistance: number;
  nearestShelterId: string | null;
  nearestShelterKm: number | null;
  nearestHospitalId: string | null;
  hospitalReachable: boolean;
  shelterReachable: boolean;
  roadAccess: number;
  isolated: boolean;
}

export interface RouteLeg {
  roadId: string;
  fromNode: string;
  toNode: string;
  fromName: string;
  toName: string;
  lengthKm: number;
  risk: number;
  passable: boolean;
}

export interface RouteResult {
  reachable: boolean;
  path: RouteLeg[];
  distanceKm: number;
  riskScore: number;
  peakRisk: number;
  avoided: { label: string; reason: string }[];
  warnings: string[];
  destinationName: string;
  destinationId: string;
  /** comparison vs the naive shortest path */
  shortestDistanceKm: number;
  shortestRiskScore: number;
  riskReductionPct: number;
  extraDistanceKm: number;
}

export interface DominoStep {
  wave: number;
  title: string;
  detail: string;
  severity: RiskLevel;
  affected: string[];
  kind: 'hazard' | 'access' | 'capacity' | 'service' | 'cascade';
}

export interface DominoChain {
  trigger: string;
  steps: DominoStep[];
  isolatedZoneIds: string[];
  unreachableShelterIds: string[];
  unreachableHospitalIds: string[];
  bottleneckRoadIds: string[];
  criticalityScore: number;
}

export interface DecisionAction {
  id: string;
  priority: number;
  title: string;
  directive: string;
  owner: string;
  severity: RiskLevel;
  because: { label: string; value: string }[];
  rationale: string;
  category: 'evacuate' | 'avoid' | 'shelter' | 'rescue' | 'capacity' | 'medical' | 'communicate' | 'fire';
}

export interface EmergencyContact {
  id: string;
  label: string;
  number: string;
  category:
    | 'national'
    | 'medical'
    | 'disaster'
    | 'police'
    | 'fire'
    | 'hospital'
    | 'rescue'
    | 'air';
  note?: string;
  primary?: boolean;
}

export interface SosAlert {
  id: string;
  createdAt: number;
  lat: number;
  lng: number;
  accuracyM: number;
  name: string;
  peopleCount: number;
  status: string;
  message: string;
  needs: string[];
  severity: 'critical' | 'urgent' | 'stable';
  synced: boolean;
  attempts: number;
}

export interface CommunityReport {
  id: string;
  kind:
    | 'road_closure'
    | 'shelter_capacity'
    | 'shelter_closure'
    | 'new_shelter'
    | 'hospital_availability'
    | 'hazard'
    | 'missing_person'
    | 'safe_person';
  createdAt: number;
  author: string;
  title: string;
  detail: string;
  zoneId?: string;
  roadId?: string;
  shelterId?: string;
  status: 'pending' | 'verified' | 'rejected' | 'resolved';
  trust: 'community' | 'verified' | 'official';
  voice?: { lat: number; lng: number };
}

export interface MissingPerson {
  id: string;
  createdAt: number;
  updatedAt: number;
  name: string;
  ageBand: string;
  description: string;
  lastSeenLocation: string;
  lastSeenAt: number;
  contact: string;
  contactVisibility: 'responders' | 'public';
  imageDataUrl?: string;
  status: 'missing' | 'safe' | 'found';
  notes: string[];
}

export interface ShelterStatus {
  id: string;
  name: string;
  capacity: number;
  /** projected occupancy under the active scenario */
  occupied: number;
  available: number;
  occupancyPct: number;
  riskScore: number;
  risk: RiskLevel;
  zoneId: string;
  facilities: string[];
  accessibility: Shelter['accessibility'];
  status: Shelter['status'];
  manager: string;
  contact: string;
  lat: number;
  lng: number;
  /** zones that can reach this shelter by road right now */
  reachableZoneIds: string[];
  avgDistanceKm: number | null;
  fillingRate: number;
}

export interface HospitalStatus {
  id: string;
  name: string;
  reachable: boolean;
  status: Hospital['status'];
  beds: number;
  trauma: boolean;
  helipad: boolean;
  zoneId: string;
  lat: number;
  lng: number;
  note: string;
}

export interface EvacuationPlan {
  zoneId: string;
  shelterId: string | null;
  route: RouteResult | null;
  overflow: boolean;
  stranded: boolean;
  reason: string;
}

export interface ChecklistTask {
  id: string;
  text: string;
  hint?: string;
}

export interface Checklist {
  id: string;
  hazard: HazardKind | 'general';
  phase: 'before' | 'during' | 'after';
  title: string;
  tasks: ChecklistTask[];
}

/* ------------------------------------------------------------------ */
/* Tiny offline LLM (WebLLM / WebGPU)                                  */
/* ------------------------------------------------------------------ */

export type TinyModelId = 'qwen-0.5b' | 'llama-1b';

export interface TinyModelInfo {
  id: TinyModelId;
  label: string;
  /** WebLLM prebuilt model id */
  modelId: string;
  sizeMb: number;
  note: string;
}

/* ------------------------------------------------------------------ */
/* Voice conversation                                                  */
/* ------------------------------------------------------------------ */

export type VoicePhase = 'idle' | 'listening' | 'thinking' | 'speaking';
export type VoiceEngineKind = 'webspeech' | 'whisper' | 'none';

/* ------------------------------------------------------------------ */
/* Global disaster feeds (USGS / GDACS / ReliefWeb)                    */
/* ------------------------------------------------------------------ */

export type GlobalEventSource = 'usgs' | 'gdacs' | 'reliefweb';
export type GlobalEventKind = 'earthquake' | 'flood' | 'cyclone' | 'wildfire' | 'volcano' | 'drought' | 'other';

export interface GlobalEvent {
  id: string;
  source: GlobalEventSource;
  kind: GlobalEventKind;
  title: string;
  place: string;
  lat: number;
  lng: number;
  /** epoch ms of the event itself */
  at: number;
  /** epoch ms when we ingested it */
  fetchedAt: number;
  /** 0..100 normalised severity for colouring and ranking */
  severity: number;
  /** source-native rating kept verbatim ("M 6.3", "ORANGE alert") */
  severityLabel: string;
  url?: string;
  detail?: string;
  country?: string;
}

export type ProximityRing = 'severe' | 'high' | 'watch' | 'far';

export interface ProximityAssessment {
  event: GlobalEvent;
  distanceKm: number;
  ring: ProximityRing;
  /** bearing from home toward the event, 0 = north */
  bearingDeg: number;
  compass: string;
}

export interface FloodFlow {
  bearingDeg: number;
  compass: string;
  /** total elevation drop over the sampled window */
  dropM: number;
  sampledKm: number;
  confidence: 'low' | 'medium' | 'high';
}

/* ------------------------------------------------------------------ */
/* Broadcasts (management portal → citizen portal)                     */
/* ------------------------------------------------------------------ */

export interface Broadcast {
  id: string;
  at: number;
  author: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  body: string;
  area?: string;
  synced: boolean;
}

/* ------------------------------------------------------------------ */
/* Portals + Supabase                                                  */
/* ------------------------------------------------------------------ */

export type PortalKind = 'citizen' | 'management';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}
