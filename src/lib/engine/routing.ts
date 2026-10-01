import { NODE_BY_ID, NODES, ROADS } from '../data/region';
import type { HazardState, RouteLeg, RouteResult, Road } from '../types';

export interface Edge {
  roadId: string;
  road: Road;
  to: string;
  lengthKm: number;
  risk: number;
  /** travel cost under the least-risk metric */
  riskCost: number;
  /** travel cost under the naive shortest metric */
  distanceCost: number;
}

export interface Graph {
  adjacency: Record<string, Edge[]>;
  /** roads that were removed from the routing network entirely */
  removed: { roadId: string; reason: string }[];
  byId: Record<string, Edge>;
}

export const RISK_WEIGHT = 7.2;

/** Cost of traversing a road: length inflated by hazard exposure. */
export function edgeCost(lengthKm: number, risk: number): number {
  return lengthKm * (0.55 + RISK_WEIGHT * risk);
}

/**
 * Build the routing network for a hazard state. Roads that are impassable or
 * explicitly blocked are removed, which is what makes RECALCULATION possible.
 */
export function buildGraph(hazard: HazardState): Graph {
  const adjacency: Record<string, Edge[]> = {};
  const byId: Record<string, Edge> = {};
  const removed: { roadId: string; reason: string }[] = [];
  for (const n of NODES) adjacency[n.id] = [];

  for (const road of ROADS) {
    const h = hazard.perRoad[road.id];
    if (!h) continue;
    if (!h.passable) {
      removed.push({
        roadId: road.id,
        reason: h.closure
          ? h.closure.reason
          : h.flood >= 0.68
            ? 'Submerged — flood depth above safe crossing threshold'
            : 'Slope failure — debris on carriageway',
      });
      continue;
    }
    const fwd: Edge = {
      roadId: road.id,
      road,
      to: road.to,
      lengthKm: road.lengthKm,
      risk: h.risk,
      riskCost: edgeCost(road.lengthKm, h.risk),
      distanceCost: road.lengthKm,
    };
    const back: Edge = { ...fwd, to: road.from };
    adjacency[road.from]?.push(fwd);
    adjacency[road.to]?.push(back);
    byId[road.id] = fwd;
  }
  return { adjacency, removed, byId };
}

export interface PathResult {
  found: boolean;
  nodeIds: string[];
  legs: { roadId: string; from: string; to: string; lengthKm: number; risk: number }[];
  cost: number;
  distanceKm: number;
  riskSum: number;
  peakRisk: number;
}

interface DijkstraOptions {
  /** 'risk' minimises hazard exposure, 'distance' minimises raw length */
  metric: 'risk' | 'distance';
}

/**
 * Dijkstra over the road graph. With metric 'risk' the returned path is the
 * LEAST-RISK route; with 'distance' it is the naive shortest path used for
 * comparison in the "Why this route?" panel.
 */
export function shortestPath(
  graph: Graph,
  start: string,
  isGoal: (nodeId: string) => boolean,
  options: DijkstraOptions = { metric: 'risk' },
): PathResult {
  const dist: Record<string, number> = {};
  const prev: Record<string, { from: string; edge: Edge }> = {};
  const visited = new Set<string>();
  for (const n of NODES) dist[n.id] = Infinity;
  if (!(start in dist)) {
    return { found: false, nodeIds: [], legs: [], cost: Infinity, distanceKm: 0, riskSum: 0, peakRisk: 0 };
  }
  dist[start] = 0;

  while (true) {
    let current: string | null = null;
    let best = Infinity;
    for (const id of Object.keys(dist)) {
      if (!visited.has(id) && dist[id] < best) {
        best = dist[id];
        current = id;
      }
    }
    if (current === null) break;
    visited.add(current);
    if (isGoal(current)) {
      return materialise(graph, prev, current, dist[current]);
    }
    for (const edge of graph.adjacency[current] ?? []) {
      const w = options.metric === 'risk' ? edge.riskCost : edge.distanceCost;
      const nd = dist[current] + w;
      if (nd < dist[edge.to] - 1e-9) {
        dist[edge.to] = nd;
        prev[edge.to] = { from: current, edge };
      }
    }
  }
  return { found: false, nodeIds: [], legs: [], cost: Infinity, distanceKm: 0, riskSum: 0, peakRisk: 0 };
}

function materialise(
  graph: Graph,
  prev: Record<string, { from: string; edge: Edge }>,
  end: string,
  cost: number,
): PathResult {
  const nodeIds = [end];
  const legs: PathResult['legs'] = [];
  let cursor = end;
  while (prev[cursor]) {
    const { from, edge } = prev[cursor];
    legs.unshift({
      roadId: edge.roadId,
      from,
      to: cursor,
      lengthKm: edge.lengthKm,
      risk: edge.risk,
    });
    nodeIds.unshift(from);
    cursor = from;
  }
  const distanceKm = legs.reduce((a, l) => a + l.lengthKm, 0);
  const riskSum = legs.reduce((a, l) => a + l.risk * l.lengthKm, 0);
  const peakRisk = legs.reduce((a, l) => Math.max(a, l.risk), 0);
  void graph;
  return { found: true, nodeIds, legs, cost, distanceKm, riskSum, peakRisk };
}

/** Convert a raw path into the presentation-ready RouteResult. */
export function describeRoute(
  path: PathResult,
  graph: Graph,
  destinationName: string,
  destinationId: string,
  hazard: HazardState,
  shortest: PathResult,
): RouteResult {
  const avoided: { label: string; reason: string }[] = [];
  const warnings: string[] = [];
  const usedRoads = new Set(path.legs.map((l) => l.roadId));

  for (const leg of path.legs) {
    if (leg.risk >= 0.6) {
      warnings.push(
        `${leg.roadId} — ${leg.risk >= 0.78 ? 'severe' : 'significant'} hazard exposure (${Math.round(leg.risk * 100)}%). Consider escorts or delay.`,
      );
    }
  }

  for (const removed of graph.removed) {
    if (!usedRoads.has(removed.roadId)) {
      avoided.push({
        label: `${removed.roadId} exited from network`,
        reason: removed.reason,
      });
    }
  }

  for (const leg of shortest.legs) {
    const h = hazard.perRoad[leg.roadId];
    if (!h || usedRoads.has(leg.roadId)) continue;
    avoided.push({
      label: `${leg.roadId} on the shortest path — bypassed`,
      reason: `Hazard exposure ${Math.round(h.risk * 100)}% (${Math.round(h.flood * 100)}% flood, ${Math.round(
        h.landslide * 100,
      )}% slope failure). REACH routed around it.`,
    });
  }

  return {
    reachable: path.found,
    path: path.legs.map<RouteLeg>((l) => ({
      roadId: l.roadId,
      fromNode: l.from,
      toNode: l.to,
      fromName: NODE_BY_ID[l.from]?.name ?? l.from,
      toName: NODE_BY_ID[l.to]?.name ?? l.to,
      lengthKm: l.lengthKm,
      risk: l.risk,
      passable: true,
    })),
    distanceKm: path.distanceKm,
    riskScore: path.distanceKm > 0 ? (path.riskSum / path.distanceKm) * 100 : 0,
    peakRisk: path.peakRisk * 100,
    avoided,
    warnings,
    destinationName,
    destinationId,
    shortestDistanceKm: shortest.found ? shortest.distanceKm : 0,
    shortestRiskScore: shortest.distanceKm > 0 ? (shortest.riskSum / shortest.distanceKm) * 100 : 0,
    riskReductionPct:
      shortest.found && shortest.riskSum > 0 && path.found
        ? Math.max(0, Math.round((1 - path.riskSum / shortest.riskSum) * 100))
        : 0,
    extraDistanceKm: shortest.found ? path.distanceKm - shortest.distanceKm : 0,
  };
}

/** Node ids reachable from a start node given removed edges. */
export function reachableNodes(graph: Graph, start: string): Set<string> {
  const seen = new Set<string>([start]);
  const stack = [start];
  while (stack.length) {
    const cur = stack.pop() as string;
    for (const edge of graph.adjacency[cur] ?? []) {
      if (!seen.has(edge.to)) {
        seen.add(edge.to);
        stack.push(edge.to);
      }
    }
  }
  return seen;
}

/** Connected components of the routing network. */
export function connectedComponents(graph: Graph): string[][] {
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const n of NODES) {
    if (seen.has(n.id)) continue;
    const comp = Array.from(reachableNodes(graph, n.id));
    comp.forEach((c) => seen.add(c));
    out.push(comp);
  }
  return out;
}

/** The component that contains the district hub — everything else is cut off. */
export function coreComponent(graph: Graph, hub = 'n_market'): Set<string> {
  const comps = connectedComponents(graph);
  const core = comps.find((c) => c.includes(hub));
  if (core) return new Set(core);
  comps.sort((a, b) => b.length - a.length);
  return new Set(comps[0] ?? []);
}

/** Which single road removals would most fragment the network (bottleneck scan). */
export function bottleneckRoads(hazard: HazardState, limit = 4): string[] {
  const base = buildGraph(hazard);
  const baseReach = reachableNodes(base, 'n_market');
  const scored: { roadId: string; loss: number }[] = [];

  for (const road of ROADS) {
    if (!base.byId[road.id]) continue;
    const adjacency: Graph['adjacency'] = {};
    for (const [k, v] of Object.entries(base.adjacency)) {
      adjacency[k] = v.filter((e) => e.roadId !== road.id);
    }
    const reach = reachableNodes({ adjacency, removed: [], byId: {} }, 'n_market');
    let loss = 0;
    for (const n of baseReach) if (!reach.has(n)) loss += 1;
    if (loss > 0) scored.push({ roadId: road.id, loss });
  }

  scored.sort((a, b) => b.loss - a.loss);
  void hazard;
  return scored.slice(0, limit).map((s) => s.roadId);
}
