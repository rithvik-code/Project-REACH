import { HOSPITALS, NODES, SHELTERS, ZONES } from '../data/region';
import type {
  EvacuationPlan,
  HazardState,
  HospitalStatus,
  RoadClosure,
  RouteResult,
  Scenario,
  ShelterStatus,
  Zone,
  ZoneRisk,
} from '../types';
import { clamp, haversineKm, riskFromScore, round } from '../geo';
import { buildHazardState, type LiveWeatherInput } from './hazard';
import {
  buildGraph,
  describeRoute,
  reachableNodes,
  shortestPath,
  type Graph,
} from './routing';
import { analyseDomino } from './domino';
import { buildActions } from './decision';

export interface AnalysisParams {
  hourOffset: number;
  scenario: Scenario;
  closures: RoadClosure[];
  offline: boolean;
  capacityPatch?: Record<string, number>;
  occupancyPatch?: Record<string, number>;
  hospitalStatusPatch?: Record<string, 'operational' | 'strained' | 'offline'>;
  /** live weather from Open-Meteo, used to bias the hazard field */
  weather?: LiveWeatherInput | null;
}

export interface Analysis {
  hazard: HazardState;
  graph: Graph;
  zones: ZoneRisk[];
  shelters: ShelterStatus[];
  hospitals: HospitalStatus[];
  plans: Record<string, EvacuationPlan>;
  domino: ReturnType<typeof analyseDomino>;
  actions: ReturnType<typeof buildActions>;
  totals: {
    populationAtRisk: number;
    populationNeedingAssistance: number;
    populationSafe: number;
    totalPopulation: number;
    shelterCapacityAvailable: number;
    shelterDemand: number;
    shelterGap: number;
    isolatedZones: number;
    blockedRoads: number;
    fireZones: number;
    readiness: number;
  };
}

const ROUTING_HUB = 'n_market';

/**
 * Share of residents needing assistance who actually require official shelter.
 * The rest shelter in place above flood level, or with family outside the zone.
 */
const SHELTER_DEMAND_SHARE = 0.7;

export function nearestNodeTo(lat: number, lng: number): string {
  let best = NODES[0].id;
  let bestD = Infinity;
  for (const n of NODES) {
    const d = haversineKm(lat, lng, n.lat, n.lng);
    if (d < bestD) {
      bestD = d;
      best = n.id;
    }
  }
  return best;
}

export function anchorOf(zone: Zone): string {
  return nearestNodeTo(zone.lat, zone.lng);
}

export function runAnalysis(params: AnalysisParams): Analysis {
  const { hourOffset, scenario, closures, offline } = params;
  const capacityPatch = params.capacityPatch ?? {};
  const occupancyPatch = params.occupancyPatch ?? {};
  const hospitalStatusPatch = params.hospitalStatusPatch ?? {};
  const weather = params.weather ?? undefined;

  const hazard = buildHazardState(hourOffset, scenario, closures, weather);
  const graph = buildGraph(hazard);

  /* ---------------- shelters ---------------- */
  const shelterStatuses: ShelterStatus[] = SHELTERS.map((s) => {
    const capacity = Math.max(50, Math.round(capacityPatch[s.id] ?? scenario.shelterCapacityOverrides[s.id] ?? s.capacity));
    const occupied = Math.max(
      0,
      Math.round(s.occupied + (occupancyPatch[s.id] ?? scenario.shelterOccupancyOverrides[s.id] ?? 0)),
    );
    const zoneH = hazard.perZone[s.zoneId] ?? { flood: 0.2, landslide: 0.15 };
    const riskScore = clamp(0.55 * zoneH.flood + 0.45 * zoneH.landslide, 0, 1) * 100;
    return {
      id: s.id,
      name: s.name,
      capacity,
      occupied,
      available: Math.max(0, capacity - occupied),
      occupancyPct: occupied / capacity,
      riskScore: round(riskScore, 0),
      risk: riskFromScore(riskScore),
      zoneId: s.zoneId,
      facilities: s.facilities,
      accessibility: s.accessibility,
      status: occupied >= capacity ? 'full' : s.status,
      manager: s.manager,
      contact: s.contact,
      lat: s.lat,
      lng: s.lng,
      reachableZoneIds: [],
      avgDistanceKm: null,
      fillingRate: 12 + (s.id.charCodeAt(1) % 5) * 6 + hazard.floodPressure * 40,
    };
  });

  /* ---------------- hospitals ---------------- */
  const hospitalStatuses: HospitalStatus[] = HOSPITALS.map((h) => {
    const patched = hospitalStatusPatch[h.id] ?? (scenario.hospitalsOffline.includes(h.id) ? 'offline' : h.status);
    const reach = reachableNodes(graph, h.nodeId);
    const reachable = patched !== 'offline' && reach.has(ROUTING_HUB);
    return {
      id: h.id,
      name: h.name,
      reachable,
      status: patched,
      beds: h.beds,
      trauma: h.trauma,
      helipad: h.helipad,
      zoneId: h.zoneId,
      lat: h.lat,
      lng: h.lng,
      note: !reachable
        ? patched === 'offline'
          ? 'Facility marked unavailable in the active scenario'
          : 'Approach road severed — no road access to the district hub'
        : patched === 'strained'
          ? 'Operating above normal capacity'
          : 'Full road access',
    };
  });

  /* ---------------- per zone accessibility + risk ---------------- */
  const anchors: Record<string, string> = {};
  for (const z of ZONES) anchors[z.id] = anchorOf(z);

  const baseZones: ZoneRisk[] = ZONES.map((z) => {
    const h = hazard.perZone[z.id] ?? { flood: 0, landslide: 0, fire: 0 };
    const anchor = anchors[z.id];

    const reach = reachableNodes(graph, anchor);
    const localEdges = graph.adjacency[anchor] ?? [];
    const roadAccess = localEdges.length === 0 ? 0 : clamp(localEdges.length / 4, 0, 1);

    const reachableShelters = shelterStatuses.filter((s) => reach.has(SHELTERS.find((x) => x.id === s.id)?.nodeId ?? ''));
    const shelterReachable = reachableShelters.length > 0;
    const reachableHospitals = hospitalStatuses.filter((h2) => h2.reachable && reach.has(HOSPITALS.find((x) => x.id === h2.id)?.nodeId ?? ''));
    const hospitalReachable = reachableHospitals.length > 0;

    const nearestShelter = nearestByDistance(z, reachableShelters.map((s) => ({ id: s.id, lat: s.lat, lng: s.lng })));
    const nearestHospital = nearestByDistance(z, reachableHospitals.map((s) => ({ id: s.id, lat: s.lat, lng: s.lng })));

    const hazardScore = clamp(
      0.62 * Math.max(h.flood, h.landslide) +
        0.38 * ((h.flood + h.landslide) / 2) +
        Math.max(0, h.fire - 0.55) * 0.5,
      0,
      1,
    );
    const isolated = !reach.has(ROUTING_HUB) && !shelterReachable && !hospitalReachable;
    const accessPenalty = isolated ? 0.26 : (1 - roadAccess) * 0.16;
    const risk = clamp(hazardScore * (0.7 + 0.44 * z.vulnerability) + accessPenalty, 0, 1);
    const riskScore = risk * 100;

    const populationAtRisk = z.population * clamp(hazardScore * 1.05, 0, 1);
    const populationNeedingAssistance = populationAtRisk * (1 - z.selfEvacuation);

    return {
      zoneId: z.id,
      flood: h.flood,
      landslide: h.landslide,
      fire: h.fire,
      hazard: hazardScore,
      exposure: z.population * z.vulnerability,
      risk: riskScore,
      level: riskFromScore(riskScore),
      populationAtRisk,
      populationNeedingAssistance,
      nearestShelterId: nearestShelter?.id ?? null,
      nearestShelterKm: nearestShelter?.km ?? null,
      nearestHospitalId: nearestHospital?.id ?? null,
      hospitalReachable,
      shelterReachable,
      roadAccess,
      isolated,
    };
  });

  /* ---------------- evacuation assignment ---------------- */
  const plans: Record<string, EvacuationPlan> = {};
  const occupancy = Object.fromEntries(shelterStatuses.map((s) => [s.id, s.occupied])) as Record<string, number>;

  const order = [...baseZones].sort(
    (a, b) =>
      b.risk * 1 + b.populationNeedingAssistance / 500 - (a.risk * 1 + a.populationNeedingAssistance / 500),
  );

  for (const zr of order) {
    const anchor = anchors[zr.zoneId];
    const candidates: { shelterId: string; cost: number; route: RouteResult; distance: number }[] = [];

    for (const s of shelterStatuses) {
      const raw = SHELTERS.find((x) => x.id === s.id);
      if (!raw) continue;
      const p = shortestPath(graph, anchor, (n) => n === raw.nodeId, { metric: 'risk' });
      if (!p.found) continue;
      const naive = shortestPath(graph, anchor, (n) => n === raw.nodeId, { metric: 'distance' });
      const route = describeRoute(p, graph, s.name, s.id, hazard, naive);
      candidates.push({ shelterId: s.id, cost: p.cost, route, distance: p.distanceKm });
    }

    candidates.sort((a, b) => a.cost - b.cost);

    const demand = zr.populationNeedingAssistance * SHELTER_DEMAND_SHARE;

    let chosen = candidates.find(
      (c) => occupancy[c.shelterId] < (shelterStatuses.find((s) => s.id === c.shelterId)?.capacity ?? 0),
    );
    let overflow = false;
    if (!chosen && candidates.length) {
      // Nothing has headroom — spread overflow onto the least-loaded reachable site
      // rather than dumping the whole population onto the first candidate.
      chosen = [...candidates].sort((x, y) => {
        const sx = shelterStatuses.find((s) => s.id === x.shelterId);
        const sy = shelterStatuses.find((s) => s.id === y.shelterId);
        const rx = sx ? (occupancy[sx.id] ?? 0) / Math.max(1, sx.capacity) : 1;
        const ry = sy ? (occupancy[sy.id] ?? 0) / Math.max(1, sy.capacity) : 1;
        return rx - ry;
      })[0];
      overflow = true;
    }

    if (chosen) {
      const cap = (shelterStatuses.find((s) => s.id === chosen?.shelterId)?.capacity ?? 0) * 1.25;
      occupancy[chosen.shelterId] = Math.min(occupancy[chosen.shelterId] + demand, cap);
      const s = shelterStatuses.find((x) => x.id === chosen?.shelterId);
      if (s) {
        s.reachableZoneIds.push(zr.zoneId);
        s.avgDistanceKm = s.avgDistanceKm === null ? chosen.distance : (s.avgDistanceKm + chosen.distance) / 2;
      }
      plans[zr.zoneId] = {
        zoneId: zr.zoneId,
        shelterId: chosen.shelterId,
        route: chosen.route,
        overflow,
        stranded: false,
        reason: overflow
          ? `Least-risk reachable shelter is over its projected capacity; overflow allocation applied.`
          : `Lowest hazard-weighted travel cost of ${candidates.length} reachable shelter routes.`,
      };
    } else {
      plans[zr.zoneId] = {
        zoneId: zr.zoneId,
        shelterId: null,
        route: null,
        overflow: false,
        stranded: true,
        reason: 'No shelter is reachable by road under current conditions.',
      };
    }
  }

  // re-sync shelters after assignment
  for (const s of shelterStatuses) {
    s.occupied = Math.round(occupancy[s.id]);
    s.available = Math.max(0, s.capacity - s.occupied);
    s.occupancyPct = s.occupied / s.capacity;
    s.status = s.occupied >= s.capacity ? 'full' : s.status === 'full' ? 'open' : s.status;
  }

  /* ---------------- domino + decisions ---------------- */
  const domino = analyseDomino({
    hazard,
    graph,
    zones: ZONES,
    shelters: SHELTERS,
    hospitals: HOSPITALS,
    anchorOf: anchors,
    occupancyOf: occupancy,
    assignment: Object.fromEntries(Object.entries(plans).map(([k, v]) => [k, v.shelterId])),
  });

  const actions = buildActions({
    hazard,
    graph,
    zoneRisks: baseZones,
    shelters: shelterStatuses,
    hospitals: hospitalStatuses,
    plans,
    offline,
    closures: closures.map((c) => ({ roadId: c.roadId, reason: c.reason, level: c.level })),
  });

  /* ---------------- totals ---------------- */
  const totalPopulation = ZONES.reduce((a, z) => a + z.population, 0);
  const populationAtRisk = baseZones.reduce((a, z) => a + z.populationAtRisk, 0);
  const populationNeedingAssistance = baseZones.reduce((a, z) => a + z.populationNeedingAssistance, 0);
  const shelterCapacityAvailable = shelterStatuses.reduce((a, s) => a + s.available, 0);
  const shelterDemand = populationNeedingAssistance * SHELTER_DEMAND_SHARE;
  const shelterGap = shelterDemand - shelterCapacityAvailable;
  const isolatedZones = baseZones.filter((z) => z.isolated).length;
  const fireZones = baseZones.filter((z) => z.fire >= 0.6).length;

  const networkIntegrity = clamp(1 - graph.removed.length / 10, 0, 1);
  const hospitalAccess = clamp(
    hospitalStatuses.filter((h) => h.reachable).length / Math.max(1, hospitalStatuses.length),
    0,
    1,
  );
  const capacityCoverage = clamp(shelterCapacityAvailable / Math.max(1, shelterDemand), 0, 1.2);
  const readiness = Math.round(
    100 * clamp(0.34 * networkIntegrity + 0.28 * hospitalAccess + 0.38 * Math.min(1, capacityCoverage), 0, 1),
  );

  return {
    hazard,
    graph,
    zones: baseZones.sort((a, b) => b.risk - a.risk),
    shelters: shelterStatuses,
    hospitals: hospitalStatuses,
    plans,
    domino,
    actions,
    totals: {
      populationAtRisk,
      populationNeedingAssistance,
      populationSafe: totalPopulation - populationAtRisk,
      totalPopulation,
      shelterCapacityAvailable,
      shelterDemand,
      shelterGap,
      isolatedZones,
      blockedRoads: graph.removed.length,
      fireZones,
      readiness,
    },
  };
}

function nearestByDistance(
  origin: { lat: number; lng: number },
  targets: { id: string; lat: number; lng: number }[],
): { id: string; km: number } | null {
  let best: { id: string; km: number } | null = null;
  for (const t of targets) {
    const km = haversineKm(origin.lat, origin.lng, t.lat, t.lng);
    if (!best || km < best.km) best = { id: t.id, km };
  }
  return best;
}

/** Route between two arbitrary nodes, with least-risk vs shortest comparison. */
export function computeRoute(
  graph: Graph,
  hazard: HazardState,
  fromNode: string,
  toNode: string,
  destinationName: string,
  destinationId: string,
): RouteResult | null {
  const risk = shortestPath(graph, fromNode, (n) => n === toNode, { metric: 'risk' });
  if (!risk.found) return null;
  const naive = shortestPath(graph, fromNode, (n) => n === toNode, { metric: 'distance' });
  return describeRoute(risk, graph, destinationName, destinationId, hazard, naive);
}
