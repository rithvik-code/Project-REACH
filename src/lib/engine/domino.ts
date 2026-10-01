import { NODE_BY_ID, ROAD_BY_ID, ZONE_BY_ID } from '../data/region';
import type {
  DominoChain,
  DominoStep,
  HazardState,
  Hospital,
  RiskLevel,
  Shelter,
  Zone,
} from '../types';
import { coreComponent, reachableNodes, type Graph } from './routing';
import { round } from '../geo';

export interface DominoInput {
  hazard: HazardState;
  graph: Graph;
  zones: Zone[];
  shelters: Shelter[];
  hospitals: Hospital[];
  /** zoneId -> anchor node id */
  anchorOf: Record<string, string>;
  /** shelterId -> projected occupancy (after scenario overrides) */
  occupancyOf: Record<string, number>;
  /** zoneId -> assigned shelter id */
  assignment: Record<string, string | null>;
}

function worst(a: RiskLevel, b: RiskLevel): RiskLevel {
  const rank: Record<RiskLevel, number> = { low: 0, moderate: 1, elevated: 2, high: 3, critical: 4 };
  return rank[a] >= rank[b] ? a : b;
}

/**
 * Cascade analysis. Wave 1 is the direct hazard, wave 2 is loss of access,
 * wave 3 is capacity/service overload. Each step names the mechanism so the
 * operator can see WHY a distant failure is happening.
 */
export function analyseDomino(input: DominoInput): DominoChain {
  const { hazard, graph, zones, shelters, hospitals, anchorOf, occupancyOf, assignment } = input;
  const steps: DominoStep[] = [];
  const core = coreComponent(graph);

  /* ---------- Wave 1: direct hazard impact ---------- */
  const impassable = graph.removed;
  if (impassable.length) {
    steps.push({
      wave: 1,
      title: `${impassable.length} road${impassable.length > 1 ? 's' : ''} removed from the routing network`,
      detail: impassable
        .map((r) => `${r.roadId} (${ROAD_BY_ID[r.roadId]?.name ?? ''}) — ${r.reason}`)
        .join('\n'),
      severity: impassable.length >= 3 ? 'critical' : impassable.length >= 2 ? 'high' : 'elevated',
      affected: impassable.map((r) => r.roadId),
      kind: 'hazard',
    });
  }

  const inundated = zones.filter((z) => (hazard.perZone[z.id]?.flood ?? 0) >= 0.68);
  if (inundated.length) {
    steps.push({
      wave: 1,
      title: `Inundation in ${inundated.length} zone${inundated.length > 1 ? 's' : ''}`,
      detail: inundated
        .map((z) => {
          const f = hazard.perZone[z.id].flood;
          return `${z.name} — flood intensity ${Math.round(f * 100)}%, ~${Math.round(
            z.population * f,
          ).toLocaleString('en-IN')} residents exposed`;
        })
        .join('\n'),
      severity: inundated.some((z) => hazard.perZone[z.id].flood >= 0.85) ? 'critical' : 'high',
      affected: inundated.map((z) => z.name),
      kind: 'hazard',
    });
  }

  const sliding = zones.filter((z) => (hazard.perZone[z.id]?.landslide ?? 0) >= 0.68);
  if (sliding.length) {
    steps.push({
      wave: 1,
      title: `Slope instability threatening ${sliding.length} zone${sliding.length > 1 ? 's' : ''}`,
      detail: sliding
        .map((z) => `${z.name} — slope failure probability ${Math.round(hazard.perZone[z.id].landslide * 100)}%`)
        .join('\n'),
      severity: 'high',
      affected: sliding.map((z) => z.name),
      kind: 'hazard',
    });
  }

  /* ---------- Wave 2: access loss ---------- */
  const isolatedZoneIds: string[] = [];
  for (const z of zones) {
    const anchor = anchorOf[z.id];
    if (!anchor) continue;
    if (core.has(anchor)) {
      const reach = reachableNodes(graph, anchor);
      const anyShelter = shelters.some((s) => reach.has(s.nodeId));
      if (!anyShelter) isolatedZoneIds.push(z.id);
    } else {
      isolatedZoneIds.push(z.id);
    }
  }

  if (isolatedZoneIds.length) {
    steps.push({
      wave: 2,
      title: `${isolatedZoneIds.length} area${isolatedZoneIds.length > 1 ? 's' : ''} cut off from the core network`,
      detail: isolatedZoneIds
        .map((id) => {
          const z = ZONE_BY_ID[id];
          const anchor = anchorOf[id];
          return `${z.name} — last connected via ${anchor ? (NODE_BY_ID[anchor]?.name ?? anchor) : 'unknown'}; no shelter reachable by road`;
        })
        .join('\n'),
      severity: isolatedZoneIds.length >= 2 ? 'critical' : 'high',
      affected: isolatedZoneIds.map((id) => ZONE_BY_ID[id].name),
      kind: 'access',
    });
  }

  const unreachableShelterIds = shelters
    .filter((s) => {
      const reach = reachableNodes(graph, s.nodeId);
      return !reach.has('n_market') && !core.has(s.nodeId);
    })
    .map((s) => s.id);

  if (unreachableShelterIds.length) {
    steps.push({
      wave: 2,
      title: `${unreachableShelterIds.length} shelter${unreachableShelterIds.length > 1 ? 's' : ''} no longer reachable from the hub`,
      detail: unreachableShelterIds
        .map((id) => {
          const s = shelters.find((x) => x.id === id);
          return `${s?.name ?? id} — approach road impassable; capacity is stranded`;
        })
        .join('\n'),
      severity: 'high',
      affected: unreachableShelterIds,
      kind: 'access',
    });
  }

  const unreachableHospitalIds = hospitals
    .filter((h) => !core.has(h.nodeId) && !reachableNodes(graph, h.nodeId).has('n_market'))
    .map((h) => h.id);

  if (unreachableHospitalIds.length) {
    steps.push({
      wave: 2,
      title: `Medical access lost to ${unreachableHospitalIds.length} facilit${unreachableHospitalIds.length > 1 ? 'ies' : 'y'}`,
      detail: unreachableHospitalIds
        .map((id) => {
          const h = hospitals.find((x) => x.id === id);
          return `${h?.name ?? id} — road access severed. Casualties must be diverted or airlifted.`;
        })
        .join('\n'),
      severity: 'critical',
      affected: unreachableHospitalIds,
      kind: 'service',
    });
  }

  /* ---------- Wave 3: capacity + service overload ---------- */
  const overloaded = shelters
    .map((s) => ({ s, occ: occupancyOf[s.id] ?? s.occupied, pct: (occupancyOf[s.id] ?? s.occupied) / s.capacity }))
    .filter((x) => x.pct >= 0.85);

  if (overloaded.length) {
    steps.push({
      wave: 3,
      title: `${overloaded.length} shelter${overloaded.length > 1 ? 's' : ''} at or near capacity`,
      detail: overloaded
        .map(({ s, occ, pct }) => {
          const fallback = shelters
            .filter((o) => o.id !== s.id && (occupancyOf[o.id] ?? o.occupied) < o.capacity * 0.8)
            .sort(
              (a, b) =>
                (occupancyOf[a.id] ?? a.occupied) / a.capacity - (occupancyOf[b.id] ?? b.occupied) / b.capacity,
            )[0];
          return `${s.name} — ${occ}/${s.capacity} (${Math.round(pct * 100)}%)${
            fallback ? ` → overflow routed to ${fallback.name}` : ' → no overflow capacity in region'
          }`;
        })
        .join('\n'),
      severity: 'high',
      affected: overloaded.map((o) => o.s.name),
      kind: 'capacity',
    });
  }

  if (unreachableHospitalIds.length) {
    const remainingTrauma = hospitals.filter(
      (h) => h.trauma && !unreachableHospitalIds.includes(h.id) && h.status !== 'offline',
    );
    steps.push({
      wave: 3,
      title: 'Referral load transferring to remaining trauma centres',
      detail:
        remainingTrauma.length > 0
          ? `${remainingTrauma.map((h) => h.name).join(', ')} must absorb casualties from the severed facilities. Expect surge beyond ${Math.round(
              remainingTrauma.reduce((a, h) => a + h.beds, 0) * 0.4,
            )} patients within 6 hours.`
          : 'No trauma-capable facility remains road-reachable in the district — request NDRF air evacuation (011-24363260 / 9711077372).',
      severity: remainingTrauma.length === 0 ? 'critical' : 'elevated',
      affected: remainingTrauma.map((h) => h.name),
      kind: 'cascade',
    });
  }

  /* ---------- Detour cost cascade on surviving corridors ---------- */
  const detourSample = [...graph.removed]
    .sort((a, b) => (ROAD_BY_ID[b.roadId]?.lengthKm ?? 0) - (ROAD_BY_ID[a.roadId]?.lengthKm ?? 0))
    .slice(0, 4);
  for (const r of detourSample) {
    const road = ROAD_BY_ID[r.roadId];
    if (!road) continue;
    const alt = graph.adjacency[road.from]?.filter((e) => e.roadId !== road.id) ?? [];
    const hasAlternative = alt.length > 0 && reachableNodes(graph, road.from).has(road.to);
    steps.push({
      wave: 3,
      title: hasAlternative
        ? `${r.roadId} closure pushes traffic onto ${alt.map((a) => a.roadId).join(', ')}`
        : `${r.roadId} closure severs a corridor with no road alternative`,
      detail: hasAlternative
        ? `Detour adds approximately ${round(road.lengthKm * 1.6, 1)} km and concentrates vehicles on lower-capacity roads — expect congestion and slower evacuation.`
        : `No through-route remains between ${NODE_BY_ID[road.from]?.name ?? road.from} and ${
            NODE_BY_ID[road.to]?.name ?? road.to
          }. Use the SafeRoute tab to check air/boat options.`,
      severity: hasAlternative ? 'moderate' : 'critical',
      affected: [r.roadId],
      kind: 'cascade',
    });
  }

  /* ---------- Shelter assignment stress ---------- */
  const stranded = zones.filter((z) => assignment[z.id] === null && z.population > 0);
  if (stranded.length) {
    steps.push({
      wave: 3,
      title: `${stranded.length} zone${stranded.length > 1 ? 's' : ''} cannot be assigned any reachable shelter`,
      detail: stranded.map((z) => `${z.name} — all shelters either unreachable or full`).join('\n'),
      severity: 'critical',
      affected: stranded.map((z) => z.name),
      kind: 'capacity',
    });
  }

  steps.sort((a, b) => a.wave - b.wave);

  let criticality = 0;
  for (const s of steps) {
    criticality += s.severity === 'critical' ? 10 : s.severity === 'high' ? 6 : s.severity === 'elevated' ? 3 : 1;
  }
  criticality = Math.min(100, criticality * 2.2);

  const bottleneckRoadIds = [...new Set(graph.removed.map((r) => r.roadId))];

  return {
    trigger:
      graph.removed.length > 0
        ? `Trigger: ${graph.removed.length} network exit${graph.removed.length > 1 ? 's' : ''} + hazard load at ${hazard.hourOffset >= 0 ? `T+${hazard.hourOffset}h` : `T−${Math.abs(hazard.hourOffset)}h`}`
        : `Trigger: hazard load at ${hazard.hourOffset >= 0 ? `T+${hazard.hourOffset}h` : `T−${Math.abs(hazard.hourOffset)}h`}`,
    steps,
    isolatedZoneIds,
    unreachableShelterIds,
    unreachableHospitalIds,
    bottleneckRoadIds,
    criticalityScore: round(criticality, 0),
  };
}

export { worst };
