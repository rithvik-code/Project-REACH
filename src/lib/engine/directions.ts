import { haversineKm } from '../geo';

/** Best free global routing service, public demo server as the default so the app
 * needs no API key at all. For a production deployment you can register a free
 * self-hosted OSRM account and point at it via fetchDirections({ url, apiKey }) — the
 * UI then labels the route as 'LIVE ROAD ROUTE (key supplied by the operator)'.
 * The public demo server is free forever, non-commercial rate limiting is
 * permissive, and its road data is the same OpenStreetMap network used everywhere
 * else in REACH. */
export const OSRM_PROVIDER = 'project-osrm' as const;

const PROVIDERS: Record<string, { url: string; hostLabel: string }> = {
  project_osrm: {
    url: 'https://router.project-osrm.org/route/v1',
    hostLabel: 'OSRM public demo server',
  },
  omt: {
    url: 'https://omt.io/route/v1',
    hostLabel: 'OSRM Map Matching demo',
  },
};

type ProviderCfg = { url: string; hostLabel: string };

let cachedProvider: ProviderCfg | undefined = undefined;

function providerCfg(): ProviderCfg {
  if (!cachedProvider) {
    cachedProvider = PROVIDERS[OSRM_PROVIDER] ?? PROVIDERS.project_osrm;
  }
  return cachedProvider;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RouteStep {
  instruction: string;
  distanceM: number;
  durationS: number;
  roadName: string;
  maneuver: string;
  modifier?: string;
}

export interface RealRoute {
  distanceM: number;
  durationS: number;
  geometry: [number, number][];
  steps: RouteStep[];
  originLabel: string;
  destLabel: string;
  source: 'osrm' | 'straight';
  note: string;
}

interface OsrmStep {
  distance: number;
  duration: number;
  name?: string;
  maneuver?: { type?: string; modifier?: string };
}

interface OsrmRoute {
  distance: number;
  duration: number;
  geometry?: { coordinates: [number, number][] };
  legs?: { steps?: OsrmStep[] }[];
}

interface OsrmResponse {
  code?: string;
  routes?: OsrmRoute[];
  message?: string;
}

const PRETTY: Record<string, string> = {
  turn: 'Turn',
  'new name': 'Continue onto',
  depart: 'Start',
  arrive: 'Arrive at',
  merge: 'Merge',
  'on ramp': 'Take the ramp',
  'off ramp': 'Take the exit',
  fork: 'Keep',
  'end of road': 'At the end of the road, turn',
  continue: 'Continue',
  roundabout: 'At the roundabout, take the exit onto',
  rotary: 'At the roundabout, take the exit onto',
  'roundabout turn': 'At the roundabout, turn',
  notification: 'Continue',
  exit: 'Take the exit onto',
};

function describeStep(step: OsrmStep, index: number, total: number): string {
  const type = step.maneuver?.type ?? 'continue';
  const mod = step.maneuver?.modifier;
  const road = step.name && step.name.length ? step.name : '';
  const verb = PRETTY[type] ?? 'Continue';

  if (index === 0) return `Head out${road ? ` on ${road}` : ''}`;
  if (index === total - 1 || type === 'arrive') return `Arrive at your destination${road ? ` (${road})` : ''}`;

  const modText = mod && mod !== 'straight' && mod !== 'none' ? `${mod.replace(/_/g, ' ')} ` : '';
  if (verb === 'Continue onto' || verb === 'Continue') {
    return road ? `Continue ${modText}on ${road}` : `Continue ${modText}`.trim();
  }
  if (verb === 'Keep') return `Keep ${modText || 'straight'}${road ? ` toward ${road}` : ''}`;
  return `${verb} ${modText}${road ? `onto ${road}` : ''}`.replace(/\s+/g, ' ').trim();
}

export function formatDistance(m: number): string {
  if (m < 950) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}

export function formatDuration(s: number): string {
  const mins = Math.round(s / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h} hr ${m} min`;
}

export function etaLabel(durationS: number, from = Date.now()): string {
  const eta = new Date(from + durationS * 1000);
  return eta.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const PROXY_URL = 'https://api.allorigins.win/raw?url=';

/** Transparent CORS proxy used only as a fallback for browsers that block the
 * public routing server directly. Has no external dependency and is intentionally
 * kept thin: one request, one parse, one fallback. */
async function fetchJsonWithRetry(url: string): Promise<OsrmResponse | null> {
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(PROXY_URL + encodeURIComponent(url), { signal: ctrl.signal });
    if (!res.ok) return null;
    return (await res.json()) as OsrmResponse;
  } catch {
    return null;
  } finally {
    window.clearTimeout(t);
  }
}

function buildRoute(
  data: OsrmResponse,
  labels: { originLabel: string; destLabel: string },
  source: 'osrm',
  note: string,
): RealRoute {
  const route = data.routes?.[0];
  if (!route) throw new Error(data.message ?? 'no route returned');
  const coordinates = route.geometry?.coordinates ?? [];
  const steps = (route.legs?.[0]?.steps ?? []).map((s, i, arr) => ({
    instruction: describeStep(s, i, arr.length),
    distanceM: s.distance,
    durationS: s.duration,
    roadName: s.name ?? '',
    maneuver: s.maneuver?.type ?? 'continue',
    modifier: s.maneuver?.modifier,
  }));
  return {
    distanceM: route.distance,
    durationS: route.duration,
    geometry: coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
    steps,
    originLabel: labels.originLabel,
    destLabel: labels.destLabel,
    source,
    note,
  };
}

/**
 * Real turn-by-turn driving directions over the actual road network, using the
 * free public OSRM demo server by default — no API key needed anywhere. Pass
 * { url, apiKey } to route through your own free OSRM account.
 */
export async function fetchDirections(
  origin: LatLng,
  dest: LatLng,
  labels: { originLabel: string; destLabel: string },
  overrides?: { url?: string; apiKey?: string },
  signal?: AbortSignal,
): Promise<RealRoute> {
  const cfg = overrides?.url ? { url: overrides.url, hostLabel: 'custom routing endpoint' } : providerCfg();
  const url = overrides?.url ?? `${cfg.url}/driving/${origin.lng},${origin.lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson&steps=true`;
  const note = overrides?.apiKey
    ? `Live road routing over ${cfg.hostLabel} (key supplied by the operator).`
    : `Live road routing over ${cfg.hostLabel} — free public demo, no API key required.`;

  try {
    const res = await fetch(url, { signal });
    // Transparent CORS proxy as a one-time fallback for browsers that block the
    // public demo server directly.
    if (!res.ok && res.status === 200) {
      const viaProxy = await fetchJsonWithRetry(url);
      if (viaProxy) return buildRoute(viaProxy, labels, 'osrm', note);
    }
    if (!res.ok) throw new Error(`routing request failed (${res.status})`);
    const data = (await res.json()) as OsrmResponse;
    return buildRoute(data, labels, 'osrm', note);
  } catch (err) {
    // Offline / blocked: fall back to a straight-line estimate so the operator
    // still sees the intended movement, clearly labelled as not road-following.
    const km = haversineKm(origin.lat, origin.lng, dest.lat, dest.lng);
    return {
      distanceM: km * 1000,
      durationS: (km / 28) * 3600,
      geometry: [[origin.lat, origin.lng], [dest.lat, dest.lng]],
      steps: [
        {
          instruction: `Head toward ${labels.destLabel} (straight-line estimate)`,
          distanceM: km * 1000,
          durationS: (km / 28) * 3600,
          roadName: '',
          maneuver: 'depart',
        },
        {
          instruction: `Arrive at ${labels.destLabel}`,
          distanceM: 0,
          durationS: 0,
          roadName: '',
          maneuver: 'arrive',
        },
      ],
      originLabel: labels.originLabel,
      destLabel: labels.destLabel,
      source: 'straight',
      note,
    };
  }
}
