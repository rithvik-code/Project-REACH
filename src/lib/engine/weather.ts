import type { Disturbance, HourSample, LiveLocation, RiskLevel, WeatherSnapshot } from '../types';
import { clamp } from '../geo';

/* ------------------------------------------------------------------ */
/* Live weather pull — Open-Meteo (no API key, CORS-enabled)          */
/* ------------------------------------------------------------------ */

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const CACHE_PREFIX = 'reach-weather-';
/** Re-pull every 12 minutes when online. */
export const WEATHER_TTL_MS = 12 * 60 * 1000;

interface OpenMeteoResponse {
  timezone: string;
  current?: Record<string, number>;
  hourly?: Record<string, number[] | string[]>;
  daily?: Record<string, number[] | string[]>;
}

export function wmoCondition(code: number): string {
  if (code === 0) return 'Clear sky';
  if (code <= 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code === 45 || code === 48) return 'Fog';
  if (code >= 51 && code <= 57) return 'Drizzle';
  if (code >= 61 && code <= 65) return 'Rain';
  if (code === 66 || code === 67) return 'Freezing rain';
  if (code >= 71 && code <= 77) return 'Snow';
  if (code >= 80 && code <= 82) return 'Rain showers';
  if (code === 85 || code === 86) return 'Snow showers';
  if (code >= 95) return 'Thunderstorm';
  return 'Mixed conditions';
}

/**
 * Fosberg Fire Weather Index, normalised to 0..1.
 * Fuels are modelled from relative humidity and temperature (fine fuel moisture),
 * then scaled by wind — the standard pre-monsoon fire-danger shape for India.
 */
export function fireWeatherIndex(tempC: number, humidity: number, windKmh: number): number {
  const tempF = (tempC * 9) / 5 + 32;
  const rh = clamp(humidity, 1, 100);
  let m: number;
  if (rh < 10) m = 0.03229 + 0.281073 * rh - 0.000578 * rh * tempF;
  else if (rh < 50) m = 2.22749 + 0.160107 * rh - 0.014784 * tempF;
  else m = 21.0606 + 0.005565 * rh * rh - 0.00035 * rh * tempF - 0.483199 * rh;
  const mr = clamp(m / 30, 0, 1);
  const eta = clamp(1 - 2 * mr + 1.5 * mr * mr - 0.5 * mr * mr * mr, 0, 1);
  const mph = clamp(windKmh, 0, 120) * 0.621371;
  const ffwi = (eta * Math.sqrt(1 + mph * mph)) / 0.3002;
  return clamp(ffwi / 100, 0, 1);
}

export function fireClass(index: number): WeatherSnapshot['fireClass'] {
  if (index >= 0.85) return 'extreme';
  if (index >= 0.65) return 'very_high';
  if (index >= 0.45) return 'high';
  if (index >= 0.25) return 'moderate';
  return 'low';
}

/* ------------------------------------------------------------------ */
/* Disturbance forecast                                               */
/* ------------------------------------------------------------------ */

interface RawHour {
  time: string;
  temperatureC: number;
  precipMm: number;
  precipProbability: number;
  windKmh: number;
  gustKmh: number;
  humidity: number;
  weatherCode: number;
  fireDanger: number;
}

interface Rule {
  kind: Disturbance['kind'];
  label: string;
  unit: string;
  value: (h: RawHour) => number;
  threshold: number;
  detail: (peak: RawHour, n: number) => string;
  severity: (peak: RawHour) => RiskLevel;
}

const RULES: Rule[] = [
  {
    kind: 'very_heavy_rain',
    label: 'Very heavy rainfall — flash-flood risk',
    unit: 'mm/h',
    value: (h) => h.precipMm,
    threshold: 15,
    detail: (p, n) =>
      `Rainfall forecast to reach ${p.precipMm.toFixed(0)} mm/h for about ${n} hour(s). Catchments and drains will not cope — flash flooding and road submergence are likely.`,
    severity: () => 'critical',
  },
  {
    kind: 'heavy_rain',
    label: 'Heavy rainfall window',
    unit: 'mm/h',
    value: (h) => h.precipMm,
    threshold: 7.5,
    detail: (p, n) =>
      `Rainfall of about ${p.precipMm.toFixed(0)} mm/h sustained for ${n} hour(s). Low-lying zone flooding and minor landslides become probable.`,
    severity: (p) => (p.precipMm >= 11 ? 'high' : 'elevated'),
  },
  {
    kind: 'thunderstorm',
    label: 'Thunderstorm / squall line',
    unit: 'km/h gusts',
    value: (h) => (h.weatherCode >= 95 ? Math.max(h.gustKmh, 45) : 0),
    threshold: 45,
    detail: (p) => `Thunderstorm activity with gusts around ${p.gustKmh.toFixed(0)} km/h. Secure loose structures and expect power cuts.`,
    severity: (p) => (p.gustKmh >= 70 ? 'high' : 'elevated'),
  },
  {
    kind: 'high_wind',
    label: 'High wind warning',
    unit: 'km/h gusts',
    value: (h) => h.gustKmh,
    threshold: 60,
    detail: (p) => `Wind gusts forecast near ${p.gustKmh.toFixed(0)} km/h. Expect falling trees, damaged roofs and blocked roads.`,
    severity: (p) => (p.gustKmh >= 85 ? 'critical' : 'high'),
  },
  {
    kind: 'heatwave',
    label: 'Heatwave conditions',
    unit: '°C',
    value: (h) => h.temperatureC,
    threshold: 40,
    detail: (p, n) => `Temperature near ${p.temperatureC.toFixed(0)}°C for ${n} hour(s). Heat-stroke risk, especially for outdoor workers and the elderly.`,
    severity: (p) => (p.temperatureC >= 45 ? 'critical' : 'high'),
  },
  {
    kind: 'fire_weather',
    label: 'Critical fire weather',
    unit: 'index',
    value: (h) => h.fireDanger,
    threshold: 0.7,
    detail: (p) => `Fire-weather index near ${(p.fireDanger * 100).toFixed(0)}/100 — low humidity, high temperature and wind. Forest and scrub fires will spread fast.`,
    severity: (p) => (p.fireDanger >= 0.85 ? 'critical' : 'high'),
  },
];

interface Run {
  start: number;
  end: number;
  peak: RawHour;
}

export function detectDisturbances(hours: RawHour[]): Disturbance[] {
  const out: Disturbance[] = [];
  for (const rule of RULES) {
    // Collect every window that crosses the rule threshold, then keep the
    // strongest one. An array avoids relying on a closure to carry the winner.
    const runs: Run[] = [];
    let runStart = -1;
    let runPeak: RawHour | null = null;

    const closeRun = (end: number) => {
      if (runStart >= 0 && runPeak) runs.push({ start: runStart, end, peak: runPeak });
      runStart = -1;
      runPeak = null;
    };

    for (let i = 0; i < hours.length; i += 1) {
      const h = hours[i];
      const v = rule.value(h);
      if (v >= rule.threshold) {
        if (runStart < 0) {
          runStart = i;
          runPeak = h;
        } else if (runPeak && v > rule.value(runPeak)) {
          runPeak = h;
        }
      } else {
        closeRun(i);
      }
    }
    closeRun(hours.length);

    const pick = runs.reduce<Run | null>(
      (acc, r) => (!acc || rule.value(r.peak) >= rule.value(acc.peak) ? r : acc),
      null,
    );
    if (pick) {
      const n = Math.max(1, pick.end - pick.start);
      out.push({
        id: `${rule.kind}_${pick.start}`,
        kind: rule.kind,
        label: rule.label,
        detail: rule.detail(pick.peak, n),
        severity: rule.severity(pick.peak),
        startsAt: hours[pick.start].time,
        endsAt: hours[Math.min(pick.end, hours.length - 1)].time,
        peakAt: pick.peak.time,
        peakValue: rule.value(pick.peak),
        unit: rule.unit,
        leadHours: pick.start,
      });
    }
  }

  // A 72-hour dry window is only interesting when it is genuinely dry everywhere.
  const wetEnough = hours.some((h) => h.precipMm >= 1);
  if (!wetEnough && hours.length) {
    out.push({
      id: 'dry_spell',
      kind: 'dry_spell',
      label: 'No rain expected in the forecast window',
      detail: 'Dry fuels will keep curing. Fire risk climbs each rain-free day and water sources may run low.',
      severity: 'moderate',
      startsAt: hours[0].time,
      endsAt: hours[hours.length - 1].time,
      peakAt: hours[0].time,
      peakValue: 0,
      unit: 'mm',
      leadHours: 0,
    });
  }

  return out.sort((a, b) => a.leadHours - b.leadHours || severityRank(b.severity) - severityRank(a.severity));
}

function severityRank(l: RiskLevel): number {
  return { low: 0, moderate: 1, elevated: 2, high: 3, critical: 4 }[l];
}

/* ------------------------------------------------------------------ */
/* Fetch + cache                                                      */
/* ------------------------------------------------------------------ */

export async function fetchWeather(loc: LiveLocation, signal?: AbortSignal): Promise<WeatherSnapshot> {
  const params = new URLSearchParams({
    latitude: String(loc.lat),
    longitude: String(loc.lng),
    current: 'temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,surface_pressure,is_day',
    hourly: 'temperature_2m,precipitation,precipitation_probability,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,weather_code',
    daily: 'precipitation_sum,temperature_2m_max,temperature_2m_min,wind_gusts_10m_max',
    timezone: 'Asia/Kolkata',
    forecast_days: '4',
    wind_speed_unit: 'kmh',
  });
  const res = await fetch(`${FORECAST_URL}?${params.toString()}`, { signal });
  if (!res.ok) throw new Error(`weather request failed (${res.status})`);
  const data = (await res.json()) as OpenMeteoResponse;
  const snap = normalise(data, loc, 'open-meteo');
  writeCache(snap);
  return snap;
}

function normalise(data: OpenMeteoResponse, loc: LiveLocation, source: WeatherSnapshot['source']): WeatherSnapshot {
  const cur = data.current ?? {};
  const hr = data.hourly ?? {};
  const times = (hr.time as string[]) ?? [];
  const temp = (hr.temperature_2m as number[]) ?? [];
  const precip = (hr.precipitation as number[]) ?? [];
  const prob = (hr.precipitation_probability as number[]) ?? [];
  const hum = (hr.relative_humidity_2m as number[]) ?? [];
  const wind = (hr.wind_speed_10m as number[]) ?? [];
  const gust = (hr.wind_gusts_10m as number[]) ?? [];
  const code = (hr.weather_code as number[]) ?? [];

  // Align the hourly series so hour 0 is the current hour.
  const nowIso = new Date().toISOString().slice(0, 13);
  let start = times.findIndex((t) => t.slice(0, 13) >= nowIso);
  if (start < 0) start = 0;

  const raw: RawHour[] = [];
  for (let i = start; i < Math.min(times.length, start + 72); i += 1) {
    const r = {
      time: times[i],
      temperatureC: temp[i] ?? 0,
      precipMm: precip[i] ?? 0,
      precipProbability: prob[i] ?? 0,
      windKmh: wind[i] ?? 0,
      gustKmh: gust[i] ?? 0,
      humidity: hum[i] ?? 60,
      weatherCode: code[i] ?? 0,
      fireDanger: 0,
    };
    r.fireDanger = fireWeatherIndex(r.temperatureC, r.humidity, r.gustKmh || r.windKmh);
    raw.push(r);
  }

  // Recent + forecast rainfall damps fire danger.
  const wet72 = raw.slice(0, 72).reduce((a, h) => a + h.precipMm, 0);
  const rainRate = Math.max(cur.precipitation ?? 0, raw[0]?.precipMm ?? 0);
  const damp = clamp(1 - Math.min(1, wet72 / 60) * 0.75, 0.15, 1);

  const hourly: HourSample[] = raw.slice(0, 24).map((h) => ({
    time: h.time,
    temperatureC: h.temperatureC,
    precipMm: h.precipMm,
    precipProbability: h.precipProbability,
    windKmh: h.windKmh,
    humidity: h.humidity,
    fireDanger: clamp(h.fireDanger * damp, 0, 1),
  }));

  const fireDanger = clamp((raw[0]?.fireDanger ?? 0) * damp, 0, 1);

  const dailyRaw = data.daily ?? {};
  const dTimes = (dailyRaw.time as string[]) ?? [];
  const daily = dTimes.map((date, i) => ({
    date,
    precipMm: ((dailyRaw.precipitation_sum as number[]) ?? [])[i] ?? 0,
    tMax: ((dailyRaw.temperature_2m_max as number[]) ?? [])[i] ?? 0,
    tMin: ((dailyRaw.temperature_2m_min as number[]) ?? [])[i] ?? 0,
    gustKmh: ((dailyRaw.wind_gusts_10m_max as number[]) ?? [])[i] ?? 0,
  }));

  return {
    locationId: loc.id,
    fetchedAt: Date.now(),
    timezone: data.timezone ?? 'Asia/Kolkata',
    current: {
      temperatureC: cur.temperature_2m ?? raw[0]?.temperatureC ?? 0,
      humidity: cur.relative_humidity_2m ?? raw[0]?.humidity ?? 0,
      precipMm: cur.precipitation ?? 0,
      windKmh: cur.wind_speed_10m ?? 0,
      windGustKmh: cur.wind_gusts_10m ?? 0,
      weatherCode: cur.weather_code ?? 0,
      condition: wmoCondition(cur.weather_code ?? 0),
      pressureHpa: cur.surface_pressure ?? 1010,
      isDay: (cur.is_day ?? 1) === 1,
    },
    hourly,
    daily,
    rainRateMmHr: rainRate,
    saturation: clamp(wet72 / 240, 0, 1),
    fireDanger,
    fireClass: fireClass(fireDanger),
    disturbances: detectDisturbances(raw),
    source,
    stale: source !== 'open-meteo',
  };
}

/**
 * Modelled fallback used when there is no connectivity and no cache. It is
 * derived from the location's own hazard profile so the UI degrades honestly
 * rather than showing fabricated live readings.
 */
export function offlineWeather(loc: LiveLocation): WeatherSnapshot {
  const monsoon = loc.profile.includes('flood') || loc.profile.includes('landslide');
  const baseTemp = loc.lat > 26 ? 33 : loc.lat > 20 ? 31 : 29;
  const humidity = monsoon ? 82 : 46;
  const wind = monsoon ? 18 : 26;
  const fire = fireWeatherIndex(baseTemp, humidity, wind);
  const hourly: HourSample[] = Array.from({ length: 24 }, (_, i) => {
    const hour = (new Date().getHours() + i) % 24;
    const temp = baseTemp + Math.sin(((hour - 6) / 24) * Math.PI * 2) * 5;
    const precip = monsoon ? Math.max(0, 4 * Math.sin((i / 24) * Math.PI)) : 0;
    return {
      time: new Date(Date.now() + i * 3600_000).toISOString(),
      temperatureC: temp,
      precipMm: precip,
      precipProbability: monsoon ? 60 : 5,
      windKmh: wind,
      humidity,
      fireDanger: clamp(fireWeatherIndex(temp, humidity, wind), 0, 1),
    };
  });
  return {
    locationId: loc.id,
    fetchedAt: Date.now(),
    timezone: 'Asia/Kolkata',
    current: {
      temperatureC: baseTemp,
      humidity,
      precipMm: monsoon ? 2.4 : 0,
      windKmh: wind,
      windGustKmh: wind * 1.5,
      weatherCode: monsoon ? 61 : 1,
      condition: monsoon ? 'Rain (modelled)' : 'Partly cloudy (modelled)',
      pressureHpa: 1006,
      isDay: true,
    },
    hourly,
    daily: [],
    rainRateMmHr: monsoon ? 2.4 : 0,
    saturation: monsoon ? 0.35 : 0.05,
    fireDanger: fire,
    fireClass: fireClass(fire),
    disturbances: [],
    source: 'offline-model',
    stale: true,
  };
}

/* ------------------------------------------------------------------ */
/* Cache (offline-first)                                              */
/* ------------------------------------------------------------------ */

export function readCachedWeather(locationId: string): WeatherSnapshot | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + locationId);
    if (!raw) return null;
    const snap = JSON.parse(raw) as WeatherSnapshot;
    return { ...snap, source: 'cached', stale: true };
  } catch {
    return null;
  }
}

function writeCache(snap: WeatherSnapshot) {
  try {
    localStorage.setItem(CACHE_PREFIX + snap.locationId, JSON.stringify(snap));
  } catch {
    /* storage full or blocked — caching is best-effort */
  }
}
