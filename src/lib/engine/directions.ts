import { haversineKm } from '../geo';

/**
 * Real turn-by-turn driving directions over the actual road network, using the
 * public OSRM server (no API key). Geometry, distance, duration and step
 * instructions all come back from the routing engine, so the route follows real
 * streets rather than a straight line between two points.
 */

const OSRM_URL = 'https://router.project-osrm.org/route/v1';

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
  /** how this route was produced */
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

export async function fetchDirections(
  origin: LatLng,
  dest: LatLng,
  labels: { originLabel: string; destLabel: string },
  signal?: AbortSignal,
): Promise<RealRoute> {
  const coords = `${origin.lng},${origin.lat};${dest.lng},${dest.lat}`;
  const url = `${OSRM_URL}/driving/${coords}?overview=full&geometries=geojson&steps=true`;

  try {
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`routing request failed (${res.status})`);
    const data = (await res.json()) as OsrmResponse;
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
      source: 'osrm',
      note: 'Live road routing over the OpenStreetMap network (OSRM). Follows actual streets and current turn restrictions.',
    };
  } catch (err) {
    // Offline / blocked: fall back to a direct line so the operator still sees
    // the intended movement, clearly labelled as not road-following.
    const km = haversineKm(origin.lat, origin.lng, dest.lat, dest.lng);
    return {
      distanceM: km * 1000,
      durationS: (km / 28) * 3600,
      geometry: [
        [origin.lat, origin.lng],
        [dest.lat, dest.lng],
      ],
      steps: [
        {
          instruction: `Head toward ${labels.destLabel} (straight-line estimate)`,
          distanceM: km * 1000,
          durationS: (km / 28) * 3600,
          roadName: '',
          maneuver: 'depart',
        },
        { instruction: `Arrive at ${labels.destLabel}`, distanceM: 0, durationS: 0, roadName: '', maneuver: 'arrive' },
      ],
      originLabel: labels.originLabel,
      destLabel: labels.destLabel,
      source: 'straight',
      note:
        'Road routing is unavailable right now (offline, or the routing service is unreachable). Showing a straight-line estimate only — verify the corridor before moving.',
    };
  }
}
