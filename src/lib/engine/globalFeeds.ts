/**
 * Global disaster feed engine.
 *
 * Aggregates three keyless, real-time, global sources and normalises them
 * into one GlobalEvent shape for the world map:
 *   - USGS      — earthquakes (GeoJSON summary feed)
 *   - GDACS     — floods, cyclones, wildfires, volcanoes, droughts (GeoJSON)
 *   - ReliefWeb — disaster records (JSON, appname param)
 *
 * Also implements the proximity engine (0-2 / 2-5 / 5-10 km classification
 * rings) and the flood-direction estimator (elevation gradient around a flood
 * event tells us which way the water will run).
 *
 * All fetches are timeout-guarded and fall back to the last good snapshot,
 * cached in localStorage, so the world map still shows something offline.
 */

import type {
  FloodFlow,
  GlobalEvent,
  GlobalEventKind,
  GlobalEventSource,
  ProximityAssessment,
  ProximityRing,
} from '../types';
import { haversineKm } from '../geo';

const USGS_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson';
// The GDACS JSON API answers browsers with `Access-Control-Allow-Origin: *`;
// the legacy RSS endpoint does not, so it must not be used from the client.
const GDACS_URL = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH';
// ReliefWeb v2 requires an approved appname (https://apidoc.reliefweb.int); until
// one is registered this source degrades gracefully and the UI shows it as failed.
const RELIEFWEB_URL = 'https://api.reliefweb.int/v2/disasters?appname=reach-disaster-response&limit=40&sort[]=date:desc';

const FETCH_TIMEOUT_MS = 15000;

/** One guarded attempt. */
async function fetchJsonOnce(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`feed ${res.status}`);
    return await res.json();
  } finally {
    window.clearTimeout(t);
  }
}

/** Guarded fetch with a single retry — disaster feeds run on flaky links. */
async function fetchJson(url: string): Promise<unknown> {
  try {
    return await fetchJsonOnce(url);
  } catch (first) {
    await new Promise((r) => window.setTimeout(r, 900));
    return fetchJsonOnce(url);
  }
}

/* ------------------------------------------------------------------ */
/* Source normalisers                                                  */
/* ------------------------------------------------------------------ */

function classifyKind(text: string): GlobalEventKind {
  const l = text.toLowerCase();
  if (/earthquake|seismic|quake/.test(l)) return 'earthquake';
  if (/flood|inundation|heavy rain|monsoon/.test(l)) return 'flood';
  if (/cyclone|hurricane|typhoon|storm|depression/.test(l)) return 'cyclone';
  if (/wildfire|forest fire|fire|burn/.test(l)) return 'wildfire';
  if (/volcano|eruption|volcanic/.test(l)) return 'volcano';
  if (/drought/.test(l)) return 'drought';
  return 'other';
}

function severityColorBelt(alert: string): number {
  const a = alert.toLowerCase();
  if (a.includes('red')) return 90;
  if (a.includes('orange')) return 70;
  if (a.includes('green')) return 40;
  return 30;
}

/** USGS all-day GeoJSON → GlobalEvent[] */
export function normalizeUsgs(data: unknown, fetchedAt = Date.now()): GlobalEvent[] {
  const d = data as {
    features?: {
      id?: string;
      properties?: {
        mag?: number | null;
        place?: string;
        time?: number;
        url?: string;
        title?: string;
        tsunami?: number;
      };
      geometry?: { coordinates?: [number, number, number] };
    }[];
  };
  const out: GlobalEvent[] = [];
  for (const f of d.features ?? []) {
    const c = f.geometry?.coordinates;
    if (!c || c.length < 2) continue;
    const [lng, lat, depth] = c;
    const mag = f.properties?.mag ?? null;
    const title = f.properties?.title ?? 'Earthquake';
    const kind = classifyKind(title);
    const severity =
      mag == null
        ? 20
        : Math.max(0, Math.min(100, (mag - 2) * 18 + (f.properties?.tsunami ? 15 : 0)));
    out.push({
      id: `usgs:${f.id ?? `${lat},${lng},${f.properties?.time}`}`,
      source: 'usgs',
      kind: kind === 'other' ? 'earthquake' : kind,
      title,
      place: f.properties?.place ?? 'Unknown location',
      lat,
      lng,
      at: f.properties?.time ?? fetchedAt,
      fetchedAt,
      severity,
      severityLabel: mag == null ? 'unrated' : `M ${mag.toFixed(1)}`,
      url: f.properties?.url ?? undefined,
      detail: depth != null ? `Depth ${Math.round(depth)} km` : undefined,
    });
  }
  return out;
}

/** GDACS event-type codes → canonical kinds. */
const GDACS_CODES: Record<string, GlobalEventKind> = {
  FL: 'flood',
  TC: 'cyclone',
  EQ: 'earthquake',
  VO: 'volcano',
  WF: 'wildfire',
  DR: 'drought',
};

/** GDACS GeoJSON (map feed) → GlobalEvent[] */
export function normalizeGdacs(data: unknown, fetchedAt = Date.now()): GlobalEvent[] {
  const d = data as {
    features?: {
      id?: string;
      properties?: Record<string, unknown>;
      geometry?: { coordinates?: [number, number] };
    }[];
  };
  const out: GlobalEvent[] = [];
  for (const f of d.features ?? []) {
    const c = f.geometry?.coordinates;
    if (!c || c.length < 2) continue;
    const [lng, lat] = c;
    const p = f.properties ?? {};
    const typeCode = String(p.eventtype ?? '').toUpperCase();
    const title = String(p.eventname ?? p.name ?? p.eventtype ?? 'GDACS event');
    const alert = String(p.alertlevel ?? p.AlertLevel ?? '');
    const iso3 = String(p.isocountry ?? p.country ?? '');
    out.push({
      id: `gdacs:${f.id ?? `${p.eventid ?? title}-${lat.toFixed(2)},${lng.toFixed(2)}`}`,
      source: 'gdacs',
      kind: GDACS_CODES[typeCode] ?? classifyKind(`${typeCode} ${title}`),
      title,
      place: iso3 || String(p.country ?? 'Unknown'),
      lat,
      lng,
      at: typeof p.fromdate === 'number' ? p.fromdate : typeof p.todate === 'number' ? p.todate : fetchedAt,
      fetchedAt,
      severity: severityColorBelt(alert),
      severityLabel: alert ? `${alert.toUpperCase()} alert` : 'alert n/a',
      url: typeof p.url === 'string' ? p.url : typeof p.report === 'string' ? p.report : undefined,
      detail: [p.eventtype, p.severitytext].filter(Boolean).map(String).join(' · ') || undefined,
    });
  }
  return out;
}

/** ReliefWeb disasters API → GlobalEvent[] (best-effort geolocation) */
export function normalizeReliefweb(data: unknown, fetchedAt = Date.now()): GlobalEvent[] {
  const d = data as {
    data?: {
      id: string;
      fields?: {
        name?: string;
        date?: { event?: string };
        country?: { name?: string; location?: string }[];
        type?: string[] | string;
        url?: string;
        description?: string;
      };
    }[];
  };
  const out: GlobalEvent[] = [];
  for (const row of d.data ?? []) {
    const f = row.fields ?? {};
    const title = f.name ?? 'Disaster';
    const country = f.country?.[0]?.name ?? undefined;
    const kind = classifyKind(`${Array.isArray(f.type) ? f.type.join(' ') : f.type ?? ''} ${title}`);
    // ReliefWeb list profile here has no free-form coordinates; anchor events
    // at the country centroid lookup when possible, else skip map placement.
    out.push({
      id: `reliefweb:${row.id}`,
      source: 'reliefweb',
      kind,
      title,
      place: country ?? 'Multi-country',
      lat: 0,
      lng: 0,
      at: f.date?.event ? Date.parse(f.date.event) || fetchedAt : fetchedAt,
      fetchedAt,
      severity: 35,
      severityLabel: 'record',
      url: f.url,
      detail: (Array.isArray(f.type) ? f.type[0] : f.type) ?? undefined,
      country,
      // location lookup is deferred to the map layer via COUNTRY_CENTROIDS
    });
  }
  return out;
}

/** Country name → rough centroid for anchoring ReliefWeb records. */
export const COUNTRY_CENTROIDS: Record<string, { lat: number; lng: number }> = {
  India: { lat: 21, lng: 78 },
  Nepal: { lat: 28.2, lng: 84 },
  Bangladesh: { lat: 23.7, lng: 90.4 },
  Pakistan: { lat: 30.4, lng: 69.4 },
  Indonesia: { lat: -2.5, lng: 118 },
  Philippines: { lat: 12.9, lng: 121.8 },
  'United States of America': { lat: 39.8, lng: -98.6 },
  'United States': { lat: 39.8, lng: -98.6 },
  Brazil: { lat: -10, lng: -52 },
  Nigeria: { lat: 9.1, lng: 8.7 },
  China: { lat: 35, lng: 104 },
  Japan: { lat: 36.2, lng: 138.3 },
  Myanmar: { lat: 21.9, lng: 95.9 },
  Afghanistan: { lat: 33.9, lng: 67.7 },
  'Sri Lanka': { lat: 7.9, lng: 80.8 },
  Thailand: { lat: 15, lng: 101 },
  'Viet Nam': { lat: 16, lng: 107.8 },
  Vietnam: { lat: 16, lng: 107.8 },
  Somalia: { lat: 5.2, lng: 46.2 },
  Ethiopia: { lat: 9.1, lng: 40.5 },
  Kenya: { lat: 0.2, lng: 37.9 },
  Sudan: { lat: 15.5, lng: 30.2 },
  'South Sudan': { lat: 7.3, lng: 30.3 },
  Yemen: { lat: 15.6, lng: 48 },
  Mexico: { lat: 23.6, lng: -102.5 },
  Haiti: { lat: 19, lng: -72.3 },
};

/** Geolocate ReliefWeb records against the centroid table where possible. */
export function geolocateReliefweb(events: GlobalEvent[]): GlobalEvent[] {
  return events.map((e) => {
    if (e.source !== 'reliefweb' || (e.lat === 0 && e.lng === 0)) {
      const c = e.country ? COUNTRY_CENTROIDS[e.country] : undefined;
      if (c) return { ...e, lat: c.lat, lng: c.lng };
      return e;
    }
    return e;
  });
}

export interface GlobalFeedResult {
  events: GlobalEvent[];
  sources: Partial<Record<GlobalEventSource, 'ok' | 'error'>>;
  fetchedAt: number;
}

/** Pulls all feeds concurrently; each source fails independently. */
export async function fetchGlobalFeeds(): Promise<GlobalFeedResult> {
  const fetchedAt = Date.now();
  const events: GlobalEvent[] = [];
  const sources: GlobalFeedResult['sources'] = {};

  const jobs: { src: GlobalEventSource; url: string; parse: (d: unknown) => GlobalEvent[] }[] = [
    { src: 'usgs', url: USGS_URL, parse: (d) => normalizeUsgs(d, fetchedAt) },
    { src: 'gdacs', url: GDACS_URL, parse: (d) => normalizeGdacs(d, fetchedAt) },
    { src: 'reliefweb', url: RELIEFWEB_URL, parse: (d) => geolocateReliefweb(normalizeReliefweb(d, fetchedAt)) },
  ];

  await Promise.all(
    jobs.map(async (j) => {
      try {
        const data = await fetchJson(j.url);
        events.push(...j.parse(data));
        sources[j.src] = 'ok';
      } catch {
        sources[j.src] = 'error';
      }
    }),
  );

  return { events, sources, fetchedAt };
}

/* ------------------------------------------------------------------ */
/* Cache (last good snapshot for offline use)                          */
/* ------------------------------------------------------------------ */

const CACHE_KEY = 'reach-global-feeds-v1';

export function cacheFeeds(result: GlobalFeedResult) {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(result));
  } catch {
    /* quota — ignore */
  }
}

export function readCachedFeeds(): GlobalFeedResult | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GlobalFeedResult;
    if (!Array.isArray(parsed.events)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Proximity engine — the 0 / 2 / 5 / 10 km classification rings       */
/* ------------------------------------------------------------------ */

export const RINGS = { severe: 2, high: 5, watch: 10 } as const;

export function ringFor(distanceKm: number): ProximityRing {
  if (distanceKm <= RINGS.severe) return 'severe';
  if (distanceKm <= RINGS.high) return 'high';
  if (distanceKm <= RINGS.watch) return 'watch';
  return 'far';
}

export const RING_LABEL: Record<ProximityRing, string> = {
  severe: 'SEVERE — inside 2 km',
  high: 'HIGH — inside 5 km',
  watch: 'WATCH — inside 10 km',
  far: 'Outside 10 km watch ring',
};

const COMPASS_16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

export function bearingToCompass(deg: number): string {
  const idx = Math.round(((deg % 360) + 360) % 360 / 22.5) % 16;
  return COMPASS_16[idx];
}

export function bearingDeg(from: { lat: number; lng: number }, to: { lat: number; lng: number }): number {
  const φ1 = (from.lat * Math.PI) / 180;
  const φ2 = (to.lat * Math.PI) / 180;
  const Δλ = ((to.lng - from.lng) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Classifies every event against home within the 10 km decision radius. */
export function assessProximity(events: GlobalEvent[], home: { lat: number; lng: number }): ProximityAssessment[] {
  return events
    .map((event) => {
      const distanceKm = haversineKm(home.lat, home.lng, event.lat, event.lng);
      return {
        event,
        distanceKm,
        ring: ringFor(distanceKm),
        bearingDeg: bearingDeg(home, event),
        compass: bearingToCompass(bearingDeg(home, event)),
      } satisfies ProximityAssessment;
    })
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

/** Events that should alarm the user, worst ring first. */
export function eventsWithinWatch(assessments: ProximityAssessment[]): ProximityAssessment[] {
  return assessments.filter((a) => a.ring !== 'far');
}

/* ------------------------------------------------------------------ */
/* Flood direction estimator                                           */
/* ------------------------------------------------------------------ */

const OPEN_METEO_ELEVATION = 'https://api.open-meteo.com/v1/elevation';

interface ElevationGrid {
  origin: { lat: number; lng: number };
  stepKm: number;
  n: number;
  values: number[]; // row-major, lat-descending
}

async function sampleElevationGrid(center: { lat: number; lng: number }): Promise<ElevationGrid | null> {
  const n = 5; // 5x5 grid
  const stepKm = 1.2;
  const dLat = stepKm / 111;
  const dLng = stepKm / (111 * Math.cos((center.lat * Math.PI) / 180) || 1);
  const lats: number[] = [];
  const lngs: number[] = [];
  for (let i = 0; i < n; i += 1) {
    lats.push(center.lat + (i - (n - 1) / 2) * dLat * 2);
    lngs.push(center.lng + (i - (n - 1) / 2) * dLng * 2);
  }
  // Open-Meteo allows comma-separated latitude/longitude lists.
  const url = `${OPEN_METEO_ELEVATION}?latitude=${lats.map((v) => v.toFixed(4)).join(',')}&longitude=${lngs
    .map((v) => v.toFixed(4))
    .join(',')}`;
  try {
    const ctrl = new AbortController();
    const t = window.setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, { signal: ctrl.signal });
    window.clearTimeout(t);
    if (!res.ok) return null;
    const data = (await res.json()) as { elevation?: number[] }[];
    const values = data.map((d) => d.elevation?.[0] ?? 0);
    if (values.length !== n * n) return null;
    return { origin: { lat: lats[0], lng: lngs[0] }, stepKm, n, values };
  } catch {
    return null;
  }
}

/**
 * Estimates which way floodwater will drain from `center` by fitting the
 * elevation gradient over a small grid. Returns a bearing (toward downhill)
 * with a confidence based on the total drop.
 */
export async function estimateFloodFlow(
  center: { lat: number; lng: number },
): Promise<FloodFlow | null> {
  const grid = await sampleElevationGrid(center);
  if (!grid) return null;
  const { n, values } = grid;
  const at = (ix: number, iy: number) => values[iy * n + ix];
  const mid = (n - 1) / 2;
  const dzDx = (at(n - 1, mid) - at(0, mid)) / (2 * (n - 1) * grid.stepKm * 1.9);
  const dzDy = (at(mid, n - 1) - at(mid, 0)) / (2 * (n - 1) * grid.stepKm * 1.9);
  const downhillDeg = (Math.atan2(-dzDy, -dzDx) * 180) / Math.PI; // screen x = east, y = south
  const bearing = ((90 - downhillDeg + 360) % 360);
  const dropM = Math.abs(at(0, mid) - at(n - 1, mid)) + Math.abs(at(mid, 0) - at(mid, n - 1));
  const confidence = dropM > 60 ? 'high' : dropM > 18 ? 'medium' : 'low';
  return {
    bearingDeg: bearing,
    compass: bearingToCompass(bearing),
    dropM,
    sampledKm: (n - 1) * grid.stepKm * 1.9,
    confidence,
  };
}

/* ------------------------------------------------------------------ */
/* Grouping for the news feed                                          */
/* ------------------------------------------------------------------ */

export interface EventGroup {
  kind: GlobalEventKind;
  events: GlobalEvent[];
}

export function groupByKind(events: GlobalEvent[]): EventGroup[] {
  const map = new Map<GlobalEventKind, GlobalEvent[]>();
  for (const e of events) {
    const list = map.get(e.kind) ?? [];
    list.push(e);
    map.set(e.kind, list);
  }
  return [...map.entries()]
    .map(([kind, evs]) => ({ kind, events: evs.sort((a, b) => b.at - a.at) }))
    .sort((a, b) => b.events.length - a.events.length);
}

/** Most alarming events first for the live news strip. */
export function rankForNews(events: GlobalEvent[], limit = 12): GlobalEvent[] {
  return [...events]
    .sort((a, b) => b.severity - a.severity || b.at - a.at)
    .slice(0, limit);
}

export const EVENT_KIND_META: Record<GlobalEventKind, { label: string; color: string }> = {
  earthquake: { label: 'Earthquake', color: '#a855f7' },
  flood: { label: 'Flood', color: '#0ea5e9' },
  cyclone: { label: 'Cyclone', color: '#f59e0b' },
  wildfire: { label: 'Wildfire', color: '#ef4444' },
  volcano: { label: 'Volcano', color: '#f97316' },
  drought: { label: 'Drought', color: '#eab308' },
  other: { label: 'Other', color: '#7c8aa5' },
};

export const SOURCE_LABEL: Record<GlobalEventSource, string> = {
  usgs: 'USGS',
  gdacs: 'GDACS',
  reliefweb: 'ReliefWeb',
};
