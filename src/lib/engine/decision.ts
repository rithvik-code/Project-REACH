import { ROAD_BY_ID, ZONE_BY_ID } from '../data/region';
import type {
  DecisionAction,
  EvacuationPlan,
  HazardState,
  HospitalStatus,
  RiskLevel,
  ShelterStatus,
  ZoneRisk,
} from '../types';
import type { Graph } from './routing';
import { formatCompact, formatNumber, round } from '../geo';

export interface DecisionInput {
  hazard: HazardState;
  graph: Graph;
  zoneRisks: ZoneRisk[];
  shelters: ShelterStatus[];
  hospitals: HospitalStatus[];
  plans: Record<string, EvacuationPlan>;
  offline: boolean;
  closures: { roadId: string; reason: string; level: 'blocked' | 'caution' }[];
}

interface Scored {
  score: number;
  action: DecisionAction;
}

/**
 * Converts the full analysed state into a ranked action list. Every action
 * carries its own `because` breakdown across the four pillars the brief asks
 * for: risk, population exposure, route accessibility and shelter capacity.
 */
export function buildActions(input: DecisionInput): DecisionAction[] {
  const { hazard, graph, zoneRisks, shelters, hospitals, plans, offline, closures } = input;
  const out: Scored[] = [];
  const id = (s: string) => s;

  const realClosure = (roadId: string) => closures.find((c) => c.roadId === roadId);

  /* ---------- 1. Rescue: isolated + high exposure ---------- */
  for (const zr of zoneRisks) {
    const zone = ZONE_BY_ID[zr.zoneId];
    const plan = plans[zr.zoneId];
    if (!zone) continue;

    if (zr.isolated) {
      const routeLost = graph.removed.map((r) => r.roadId);
      out.push({
        score: 108 + zr.risk / 10,
        action: {
          id: id(`rescue_${zr.zoneId}`),
          priority: 0,
          title: `Deploy rescue resources to ${zone.name}`,
          directive: `No road route remains. Commit boat/swift-water teams, or request air evacuation via NDRF (011-24363260 / 9711077372) or Air Ambulance (9540161344) if casualties are reported.`,
          owner: 'District Rescue Coordinator',
          severity: 'critical',
          category: 'rescue',
          because: [
            { label: 'Accessibility', value: 'Zero road routes — zone is outside the core network' },
            { label: 'Risk', value: `${Math.round(zr.risk)}/100 (${zr.level})` },
            { label: 'Population exposed', value: `${formatNumber(zr.populationAtRisk)} residents` },
            { label: 'Needing assistance', value: `${formatNumber(zr.populationNeedingAssistance)} (cannot self-evacuate)` },
            { label: 'Roads lost', value: routeLost.length ? routeLost.join(', ') : 'none' },
          ],
          rationale: `${zone.name} is physically severed from the shelter and hospital network. Road-based evacuation is impossible, so the only viable option is external rescue capacity. Response time is the dominant factor in survival once a settlement is isolated.`,
        },
      });
    }

    /* ---------- 2. Evacuation ---------- */
    if (zr.level === 'critical' || zr.level === 'high') {
      const shelterName = plan?.shelterId
        ? shelters.find((s) => s.id === plan.shelterId)?.name ?? plan.shelterId
        : 'no reachable shelter';
      const accessPct = Math.round(zr.roadAccess * 100);
      out.push({
        score: zr.risk * 1.05 + zr.populationAtRisk / 700 + (zr.isolated ? 20 : 0),
        action: {
          id: id(`evac_${zr.zoneId}`),
          priority: 0,
          title: `Evacuate ${zone.name}`,
          directive: plan?.shelterId
            ? `Move residents along the least-risk corridor to ${shelterName}. Priority order: assisted-needs households first, then general population.`
            : `Begin staged evacuation toward the nearest reachable shelter. Route not yet assignable — verify shelter capacity before release.`,
          owner: 'Zone Incident Commander',
          severity: zr.level,
          category: 'evacuate',
          because: [
            { label: 'Composite risk', value: `${Math.round(zr.risk)}/100 — ${Math.round(zr.flood * 100)}% flood, ${Math.round(zr.landslide * 100)}% slope` },
            { label: 'Population exposed', value: `${formatNumber(zr.populationAtRisk)} of ${formatNumber(zone.population)}` },
            { label: 'Needing assistance', value: `${formatNumber(zr.populationNeedingAssistance)} residents` },
            { label: 'Route accessibility', value: `${accessPct}% of local exits usable` },
            { label: 'Shelter capacity', value: plan?.shelterId ? `${shelterName}${plan.overflow ? ' (overflow allocation)' : ''}` : 'no allocation' },
          ],
          rationale:
            zr.level === 'critical'
              ? `Hazard intensity in ${zone.name} has crossed the critical threshold. Evacuation windows close quickly once primary roads submerge, so this must begin immediately even while other tasks are running.`
              : `${zone.name} is trending toward critical. Early evacuation at high risk is safer and cheaper than rescue at critical risk.`,
        },
      });
    }

    /* ---------- 3. Shelter redirect ---------- */
    if (plan?.shelterId) {
      const s = shelters.find((x) => x.id === plan.shelterId);
      if (s) {
        out.push({
          score: 62 + (plan.overflow ? 16 : 0) + zr.risk / 8,
          action: {
            id: id(`redirect_${zr.zoneId}`),
            priority: 0,
            title: `Redirect ${zone.name} residents to ${s.name}`,
            directive: plan.overflow
              ? `Primary capacity is exhausted — send residents to ${s.name} but confirm intake first. Estimated overflow demand: ${formatNumber(
                  Math.max(0, zr.populationNeedingAssistance - s.available),
                )} people.`
              : `${s.name} has ${formatNumber(s.available)} spaces free (${Math.round(s.occupancyPct * 100)}% full). Hold ${formatNumber(
                  zr.populationNeedingAssistance,
                )} spaces for assisted-needs households.`,
            owner: 'Shelter Coordination Cell',
            severity: plan.overflow ? 'high' : 'elevated',
            category: 'shelter',
            because: [
              { label: 'Shelter capacity', value: `${formatNumber(s.occupied)}/${formatNumber(s.capacity)} used — ${formatNumber(s.available)} available` },
              { label: 'Distance', value: s.avgDistanceKm ? `${round(s.avgDistanceKm, 1)} km least-risk route` : 'unreachable' },
              { label: 'Shelter risk', value: `${Math.round(s.riskScore)}/100 (${s.risk})` },
              { label: 'Demand', value: `${formatNumber(zr.populationNeedingAssistance)} residents need assistance` },
              { label: 'Accessibility', value: `${s.accessibility} access` },
            ],
            rationale: plan.overflow
              ? `Allocation is capacity-constrained: the lowest-risk reachable shelter is already near-saturated, so some residents must travel further. Announcing the correct destination prevents secondary crowding at a full site.`
              : `${s.name} is the lowest-risk reachable shelter for this population once road hazard is scored, and it has headroom to absorb the demand.`,
          },
        });
      }
    }
  }

  /* ---------- 4. Avoid / manage road network ---------- */
  for (const r of graph.removed) {
    const road = ROAD_BY_ID[r.roadId];
    const alt = graph.adjacency[road?.from ?? ''] ?? [];
    const closure = realClosure(r.roadId);
    out.push({
      score: 88 + (closure ? 6 : 0),
      action: {
        id: id(`avoid_${r.roadId}`),
        priority: 0,
        title: `Avoid ${r.roadId} — ${road?.name ?? 'road'} out of service`,
        directive: closure
          ? `Closure recorded (${closure.level}). ${alt.length ? `Divert traffic to ${alt.map((a) => a.roadId).join(', ')}.` : 'No road alternative exists — set up a control point and consider boat/air movement.'}`
          : `${r.reason}. REACH has removed it from the routing network; all evacuation routes have been recalculated.`,
        owner: 'Traffic & Evacuation Control',
        severity: 'high',
        category: 'avoid',
        because: [
          { label: 'Road status', value: closure ? `${closure.level.toUpperCase()} — ${closure.reason}` : r.reason },            { label: 'Hazard exposure', value: `${Math.round((hazard.perRoad[r.roadId]?.risk ?? 0) * 100)}%` },
            { label: 'Flood depth proxy', value: `${Math.round((hazard.perRoad[r.roadId]?.flood ?? 0) * 100)}%` },
            { label: 'Slope failure proxy', value: `${Math.round((hazard.perRoad[r.roadId]?.landslide ?? 0) * 100)}%` },
            { label: 'Fire exposure', value: `${Math.round((hazard.perRoad[r.roadId]?.fire ?? 0) * 100)}%` },
            { label: 'Blocking hazard', value: hazard.perRoad[r.roadId]?.blockingHazard ?? 'reported closure' },
            { label: 'Alternatives', value: alt.length ? alt.map((a) => a.roadId).join(', ') : 'none' },
        ],
        rationale: `Keeping vehicles off a compromised carriageway prevents vehicles from becoming additional casualties and preserves the corridor for rescue access.`,
      },
    });
  }

  /* ---------- 4b. Wildfire ---------- */
  for (const zr of zoneRisks) {
    const zone = ZONE_BY_ID[zr.zoneId];
    if (!zone || zr.fire < 0.55) continue;
    const fireRoads = Object.entries(hazard.perRoad)
      .filter(([, h]) => h.fire >= 0.5)
      .map(([id]) => id);
    out.push({
      score: 96 + zr.fire * 24,
      action: {
        id: id(`fire_${zr.zoneId}`),
        priority: 0,
        title: `Wildfire threat — ${zone.name}`,
        directive: `Fire-weather conditions are critical (index ${Math.round(
          hazard.firePressure * 100,
        )}/100). Move ${formatNumber(
          zr.populationAtRisk,
        )} exposed residents away from the wildland edge, clear a defensible perimeter, and pre-position water tankers. Fire service: 101 · National emergency: 112.`,
        owner: 'Fire & Rescue Coordinator',
        severity: zr.fire >= 0.8 ? 'critical' : 'high',
        category: 'fire',
        because: [
          { label: 'Fire pressure', value: `${Math.round(hazard.firePressure * 100)}/100 (Fosberg fire-weather index)` },
          { label: 'Zone fuel risk', value: `${Math.round(zr.fire * 100)}/100 — ${zone.terrain} terrain` },
          { label: 'Population exposed', value: `${formatNumber(zr.populationAtRisk)} residents` },
          { label: 'Roads at fire risk', value: fireRoads.length ? fireRoads.slice(0, 5).join(', ') : 'none flagged yet' },
          { label: 'Suppression', value: 'Fire 101 · 112 · NDRF aerial support 011-24363260' },
        ],
        rationale: `Wildfire spreads faster than ground evacuation once wind picks up, so the priority is early movement of people away from the fuel edge and keeping escape corridors open. Dry fuels plus wind make suppression alone unreliable — evacuation has to lead.`,
      },
    });
  }

  /* ---------- 5. Capacity actions ---------- */
  for (const s of shelters) {
    if (s.occupancyPct >= 0.8 || s.status === 'full') {
      out.push({
        score: 58 + s.occupancyPct * 30,
        action: {
          id: id(`capacity_${s.id}`),
          priority: 0,
          title: `Increase capacity at ${s.name}`,
          directive: `Projected ${formatNumber(s.occupied)}/${formatNumber(s.capacity)} (${Math.round(
            s.occupancyPct * 100,
          )}%). Open secondary halls, add ${formatNumber(Math.max(50, Math.round(s.capacity * 0.4)))} spaces, and confirm water and sanitation provisioning.`,
          owner: 'Shelter Manager',
          severity: s.occupancyPct >= 0.95 ? 'critical' : 'high',
          category: 'capacity',
          because: [
            { label: 'Occupancy', value: `${Math.round(s.occupancyPct * 100)}% of ${formatNumber(s.capacity)}` },
            { label: 'Available', value: `${formatNumber(s.available)} spaces` },
            { label: 'Fill rate', value: `${round(s.fillingRate, 1)} people/hr` },
            { label: 'Shelter risk', value: `${Math.round(s.riskScore)}/100 (${s.risk})` },
            { label: 'Facilities', value: s.facilities.slice(0, 3).join(', ') || 'basic' },
          ],
          rationale: `This shelter is absorbing demand from multiple zones. Expanding on site is faster than re-routing people to a distant facility once roads degrade, and it keeps the least-risk corridors from being overloaded.`,
        },
      });
    }
  }

  /* ---------- 6. Medical ---------- */
  const offlineHospitals = hospitals.filter((h) => !h.reachable || h.status === 'offline');
  if (offlineHospitals.length) {
    const trauma = hospitals.filter((h) => h.trauma && h.reachable && h.status !== 'offline');
    out.push({
      score: 100,
      action: {
        id: id('medical_access'),
        priority: 0,
        title: `Restore or substitute medical access (${offlineHospitals.length} facilit${offlineHospitals.length > 1 ? 'ies' : 'y'} lost)`,
        directive: trauma.length
          ? `Divert casualties to ${trauma.map((h) => h.name).join(', ')}. Establish a forward triage post and request helicopter transfer for critical cases via 9540161344.`
          : `No trauma centre is road-reachable. Request NDRF aerial medical evacuation (011-24363260 / 9711077372) and set up a helipad at the nearest open shelter.`,
        owner: 'District Health Officer',
        severity: trauma.length ? 'high' : 'critical',
        category: 'medical',
        because: [
          { label: 'Facilities lost', value: offlineHospitals.map((h) => h.name).join(', ') },
          { label: 'Cause', value: offlineHospitals.map((h) => h.note).join('; ') },
          { label: 'Trauma capacity remaining', value: trauma.length ? `${trauma.reduce((a, h) => a + h.beds, 0)} beds` : 'none' },
          { label: 'Air evacuation', value: 'Air Ambulance 9540161344 · NDRF 9711077372' },
        ],
        rationale: `Medical access is the highest-consequence failure mode in an evacuation: delayed treatment drives mortality faster than the hazard itself.`,
      },
    });
  }

  /* ---------- 7. Communication ---------- */
  const criticalZones = zoneRisks.filter((z) => z.level === 'critical' || z.level === 'high');
  if (criticalZones.length) {
    out.push({
      score: 55 + criticalZones.length * 3,
      action: {
        id: id('communicate'),
        priority: 0,
        title: `Broadcast multi-channel alert for ${criticalZones.length} high-risk zone${criticalZones.length > 1 ? 's' : ''}`,
        directive: `Send cell broadcast + community siren + loudspeaker alert covering ${criticalZones
          .map((z) => ZONE_BY_ID[z.zoneId]?.name)
          .join(', ')}. Include the assigned shelter and the roads to avoid.`,
        owner: 'Public Information Officer',
        severity: 'elevated',
        category: 'communicate',
        because: [
          { label: 'Zones covered', value: `${criticalZones.length}` },
          { label: 'Population reached', value: `${formatCompact(zoneRisks.reduce((a, z) => a + z.populationAtRisk, 0))} residents` },
          { label: 'Channel status', value: offline ? 'OFFLINE — queue for when connectivity returns' : 'ONLINE — broadcast live' },
          { label: 'Content', value: 'Shelter destination + roads to avoid + SOS instructions' },
        ],
        rationale: `Evacuation compliance collapses when people do not know where to go. A precise alert with a named shelter and named closed roads removes the main cause of hesitation.`,
      },
    });
  }

  // Cap how many actions any single category can contribute, otherwise the
  // priority list fills up with near-identical road-avoidance entries and
  // crowds out medical and communication directives.
  const CATEGORY_CAP: Partial<Record<DecisionAction['category'], number>> = {
    avoid: 3,
    evacuate: 4,
    shelter: 2,
    capacity: 2,
    rescue: 2,
    fire: 2,
  };

  const used: Record<string, number> = {};
  const selected: DecisionAction[] = [];
  for (const s of out.sort((a, b) => b.score - a.score)) {
    const cap = CATEGORY_CAP[s.action.category] ?? 1;
    const count = used[s.action.category] ?? 0;
    if (count >= cap) continue;
    used[s.action.category] = count + 1;
    selected.push(s.action);
    if (selected.length >= 9) break;
  }

  return selected.map((a, i) => ({ ...a, priority: i + 1 }));
}

export function severityRank(level: RiskLevel): number {
  return { low: 0, moderate: 1, elevated: 2, high: 3, critical: 4 }[level];
}
