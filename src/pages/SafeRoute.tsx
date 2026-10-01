import { useMemo, useState } from 'react';
import {
  AlertOctagon,
  ArrowRight,
  Ban,
  Building2,
  CheckCircle2,
  CircleSlash,
  Compass,
  Cross,
  Info,
  Navigation,
  RefreshCw,
  Route as RouteIcon,
  ShieldCheck,
  TriangleAlert,
  Undo2,
} from 'lucide-react';
import clsx from 'clsx';
import type { Analysis } from '../lib/engine/analysis';
import { anchorOf, computeRoute } from '../lib/engine/analysis';
import { useReach } from '../lib/store';
import { HOSPITALS, ROADS, SHELTERS, ZONE_BY_ID } from '../lib/data/region';
import { MapView } from '../components/MapView';
import { Bar, Banner, LevelPill, Panel, PanelHead, Segmented, Stat, TONE_HEX } from '../components/ui';
import { formatKm, formatNumber, riskColor } from '../lib/geo';

export function SafeRoute({ analysis }: { analysis: Analysis }) {
  const originZoneId = useReach((s) => s.routeOriginZoneId ?? 'z_riverbend');
  const setOriginZoneId = useReach((s) => s.setRouteOriginZoneId);
  const closures = useReach((s) => s.closures);
  const addClosure = useReach((s) => s.addClosure);
  const removeClosure = useReach((s) => s.removeClosure);
  const clearClosures = useReach((s) => s.clearClosures);
  const setFocus = useReach((s) => s.setFocus);
  const setNav = useReach((s) => s.setNav);

  const [destKind, setDestKind] = useState<'shelter' | 'hospital'>('shelter');
  const [destId, setDestId] = useState<string>('auto');
  const [blocking, setBlocking] = useState<string | null>(null);
  const [blockReason, setBlockReason] = useState('');

  const zone = ZONE_BY_ID[originZoneId];
  const origin = zone ? anchorOf(zone) : 'n_market';

  const destination = useMemo(() => {
    if (destKind === 'hospital') {
      const h = destId === 'auto' ? HOSPITALS[0] : HOSPITALS.find((x) => x.id === destId) ?? HOSPITALS[0];
      return { node: h.nodeId, name: h.name, id: h.id };
    }
    if (destId === 'auto') {
      const plan = analysis.plans[originZoneId];
      const s = plan?.shelterId ? SHELTERS.find((x) => x.id === plan.shelterId) : null;
      const fallback = s ?? SHELTERS[0];
      return { node: fallback.nodeId, name: fallback.name, id: fallback.id };
    }
    const s = SHELTERS.find((x) => x.id === destId) ?? SHELTERS[0];
    return { node: s.nodeId, name: s.name, id: s.id };
  }, [destKind, destId, analysis.plans, originZoneId]);

  const route = useMemo(
    () => computeRoute(analysis.graph, analysis.hazard, origin, destination.node, destination.name, destination.id),
    [analysis.graph, analysis.hazard, origin, destination],
  );

  const plan = analysis.plans[originZoneId];
  const blockedByHazard = analysis.graph.removed.filter((r) => !closures.some((c) => c.roadId === r.roadId));
  const manualClosures = closures;

  const impact = useMemo(() => {
    if (!manualClosures.length) return null;
    const affectedZones = analysis.zones.filter((z) => z.isolated || z.roadAccess < 0.5);
    const affectedShelters = analysis.shelters.filter((s) => s.reachableZoneIds.length === 0);
    return { affectedZones, affectedShelters };
  }, [manualClosures, analysis]);

  return (
    <div className="space-y-5">
      {/* ---------- controls ---------- */}
      <Panel>
        <PanelHead
          title="SafeRoute — least-risk evacuation"
          subtitle="REACH minimises hazard exposure, not distance. Mark a road blocked and the network recalculates instantly."
          icon={<Navigation size={15} />}
          tone="low"
          right={
            <div className="flex items-center gap-2">
              {closures.length ? (
                <button type="button" className="btn !px-2.5 !py-1.5 text-[11px]" onClick={clearClosures}>
                  <Undo2 size={12} /> Clear {closures.length} closure(s)
                </button>
              ) : null}
            </div>
          }
        />
        <div className="grid gap-3 p-4 lg:grid-cols-3">
          <div>
            <label className="hud-text mb-1.5 block">Evacuating from</label>
            <select
              className="field"
              value={originZoneId}
              onChange={(e) => {
                setOriginZoneId(e.target.value);
                const z = ZONE_BY_ID[e.target.value];
                if (z) setFocus(z.lat, z.lng, 14);
              }}
            >
              {analysis.zones.map((z) => (
                <option key={z.zoneId} value={z.zoneId}>
                  {ZONE_BY_ID[z.zoneId]?.name} — risk {Math.round(z.risk)}/100
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-[11px] text-ink-faint">
              Origin node: {origin} · {zone?.population ? `${formatNumber(zone.population)} residents` : ''}
            </p>
          </div>
          <div>
            <label className="hud-text mb-1.5 block">Destination type</label>
            <Segmented
              value={destKind}
              onChange={(v) => {
                setDestKind(v);
                setDestId('auto');
              }}
              options={[
                { value: 'shelter', label: 'Shelter', icon: <Building2 size={12} /> },
                { value: 'hospital', label: 'Hospital', icon: <Cross size={12} /> },
              ]}
            />
            <p className="mt-1.5 text-[11px] text-ink-faint">
              Switch to hospital to test whether medical access survives the current closures.
            </p>
          </div>
          <div>
            <label className="hud-text mb-1.5 block">Destination</label>
            <select className="field" value={destId} onChange={(e) => setDestId(e.target.value)}>
              <option value="auto">
                Auto — system recommendation{plan?.shelterId ? ` (${analysis.shelters.find((s) => s.id === plan.shelterId)?.name})` : ''}
              </option>
              {destKind === 'shelter'
                ? analysis.shelters.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} — {formatNumber(s.available)} free
                    </option>
                  ))
                : analysis.hospitals.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name} — {h.reachable ? h.status : 'NO ACCESS'}
                    </option>
                  ))}
            </select>
            <p className="mt-1.5 text-[11px] text-ink-faint">
              {destKind === 'hospital'
                ? 'Hospitals are not evacuation destinations unless treating casualties.'
                : 'Capacity is enforced during allocation; overflow is flagged explicitly.'}
            </p>
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <Panel className="overflow-hidden">
            <PanelHead
              title="Route view"
              subtitle={`${zone?.name ?? origin} → ${destination.name}`}
              icon={<RouteIcon size={15} />}
              tone={route?.reachable ? 'low' : 'critical'}
            />
            <div className="p-3">
              <MapView analysis={analysis} height="h-[54vh] min-h-[380px]" />
            </div>
          </Panel>

          {/* ---------- road scan ---------- */}
          <Panel>
            <PanelHead
              title="Road network scan"
              subtitle="Continuous scan of every carriageway against flood depth and slope-failure thresholds"
              icon={<Compass size={15} />}
              tone="info"
              right={
                <span className="chip border-base-600/70 bg-base-800/60 text-ink-muted">
                  {analysis.graph.removed.length} auto · {closures.length} manual
                </span>
              }
            />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left">
                <thead>
                  <tr className="border-b border-base-700/60">
                    {['Road', 'Corridor', 'Flood', 'Slope', 'Exposure', 'Status', 'Action'].map((h) => (
                      <th key={h} className="px-4 py-2.5 hud-text">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ROADS.map((r) => {
                    const h = analysis.hazard.perRoad[r.id];
                    const closure = closures.find((c) => c.roadId === r.id);
                    const passable = h?.passable ?? true;
                    const status = closure
                      ? closure.level === 'blocked'
                        ? 'MANUAL BLOCK'
                        : 'CAUTION'
                      : passable
                        ? 'PASSABLE'
                        : 'AUTO-CLOSED';
                    const hex = closure?.level === 'blocked' || !passable ? TONE_HEX.critical : closure ? TONE_HEX.elevated : TONE_HEX.low;
                    return (
                      <tr
                        key={r.id}
                        className={clsx(
                          'border-b border-base-700/30 transition',
                          !passable && 'bg-threat-critical/5',
                        )}
                      >
                        <td className="px-4 py-2 font-mono text-[12px] text-ink">{r.id}</td>
                        <td className="px-4 py-2 text-[12px] text-ink-muted">{r.name}</td>
                        <td className="w-16 px-4 py-2">
                          <Bar value={h?.flood ?? 0} tone="info" height={4} />
                        </td>
                        <td className="w-16 px-4 py-2">
                          <Bar value={h?.landslide ?? 0} tone="high" height={4} />
                        </td>
                        <td className="px-4 py-2 font-mono text-[12px]" style={{ color: riskColor((h?.risk ?? 0) > 0.66 ? 'critical' : (h?.risk ?? 0) > 0.45 ? 'elevated' : 'low') }}>
                          {Math.round((h?.risk ?? 0) * 100)}%
                        </td>
                        <td className="px-4 py-2">
                          <span className="text-[11px] font-medium" style={{ color: hex }}>
                            {status}
                          </span>
                          {closure ? (
                            <div className="text-[10px] text-ink-faint">{closure.reason}</div>
                          ) : null}
                        </td>
                        <td className="px-4 py-2">
                          {closure ? (
                            <button
                              type="button"
                              className="btn !px-2 !py-1 text-[11px]"
                              onClick={() => removeClosure(r.id)}
                            >
                              <Undo2 size={11} /> Reopen
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn !px-2 !py-1 text-[11px]"
                              onClick={() => {
                                setBlocking(r.id);
                                setBlockReason('');
                              }}
                            >
                              <Ban size={11} /> Mark blocked
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {blocking ? (
              <div className="border-t border-base-700/60 bg-base-900/60 p-4">
                <div className="hud-text mb-2">Block {blocking} — this removes it from the routing network</div>
                <div className="flex flex-wrap gap-2">
                  <input
                    className="field flex-1 min-w-[220px]"
                    placeholder="Reason (e.g. bridge deck submerged, landslide debris)"
                    value={blockReason}
                    onChange={(e) => setBlockReason(e.target.value)}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => {
                      addClosure(blocking, blockReason || 'Reported blocked by operator', 'blocked');
                      setBlocking(null);
                    }}
                  >
                    <Ban size={13} /> Confirm block
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      addClosure(blocking, blockReason || 'Partial obstruction — passable with caution', 'caution');
                      setBlocking(null);
                    }}
                  >
                    <TriangleAlert size={13} /> Mark caution
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => setBlocking(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
          </Panel>
        </div>

        {/* ---------- right column ---------- */}
        <div className="space-y-4">
          <Panel className="overflow-hidden">
            <div className="h-[3px] w-full" style={{ background: route?.reachable ? TONE_HEX.low : TONE_HEX.critical }} />
            <PanelHead
              title="Why this route?"
              subtitle="Hazards avoided and trade-offs accepted"
              icon={<ShieldCheck size={15} />}
              tone={route?.reachable ? 'low' : 'critical'}
            />
            <div className="space-y-3 p-4">
              {route?.reachable ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <Stat
                      label="Route distance"
                      value={formatKm(route.distanceKm)}
                      sub={`shortest path is ${formatKm(route.shortestDistanceKm)}`}
                      tone="info"
                    />
                    <Stat
                      label="Risk reduction"
                      value={`${route.riskReductionPct}%`}
                      sub={`${route.extraDistanceKm > 0 ? `+${formatKm(route.extraDistanceKm)} detour` : 'no detour needed'}`}
                      tone={route.riskReductionPct > 0 ? 'low' : 'moderate'}
                    />
                    <Stat
                      label="Avg hazard exposure"
                      value={`${Math.round(route.riskScore)}%`}
                      sub={`shortest path: ${Math.round(route.shortestRiskScore)}%`}
                      tone={route.riskScore < 30 ? 'low' : route.riskScore < 55 ? 'elevated' : 'high'}
                    />
                    <Stat
                      label="Peak exposure"
                      value={`${Math.round(route.peakRisk)}%`}
                      sub={`${route.path.length} road segments`}
                      tone={route.peakRisk < 40 ? 'low' : route.peakRisk < 65 ? 'elevated' : 'high'}
                    />
                  </div>

                  <div>
                    <div className="hud-text mb-2">Corridor taken</div>
                    <div className="space-y-1.5">
                      {route.path.map((leg, i) => (
                        <div key={`${leg.roadId}-${i}`} className="rounded-xl border border-base-700/60 bg-base-900/50 px-2.5 py-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] text-ink-muted">{leg.roadId}</span>
                            <span className="flex-1 truncate text-[12px] text-ink">
                              {leg.fromName} → {leg.toName}
                            </span>
                            <span
                              className="shrink-0 font-mono text-[11px]"
                              style={{
                                color: leg.risk < 0.3 ? TONE_HEX.low : leg.risk < 0.55 ? TONE_HEX.elevated : TONE_HEX.critical,
                              }}
                            >
                              {Math.round(leg.risk * 100)}%
                            </span>
                          </div>
                          <Bar
                            className="mt-1.5"
                            value={leg.risk}
                            tone={leg.risk < 0.3 ? 'low' : leg.risk < 0.55 ? 'elevated' : 'critical'}
                            height={3}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {route.avoided.length ? (
                    <div>
                      <div className="hud-text mb-2">Hazards avoided</div>
                      <div className="space-y-1.5">
                        {route.avoided.map((a, i) => (
                          <div key={i} className="rounded-lg border border-threat-low/30 bg-threat-low/10 px-2.5 py-2">
                            <div className="flex items-start gap-2">
                              <CheckCircle2 size={13} className="mt-0.5 shrink-0" style={{ color: TONE_HEX.low }} />
                              <div>
                                <div className="text-[11.5px] text-ink">{a.label}</div>
                                <div className="text-[10.5px] leading-snug text-ink-faint">{a.reason}</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {route.warnings.length ? (
                    <div>
                      <div className="hud-text mb-2">Warnings on this route</div>
                      <div className="space-y-1.5">
                        {route.warnings.map((w, i) => (
                          <div key={i} className="flex items-start gap-2 rounded-lg border border-threat-elevated/30 bg-threat-elevated/10 px-2.5 py-2">
                            <TriangleAlert size={13} className="mt-0.5 shrink-0" style={{ color: TONE_HEX.elevated }} />
                            <span className="text-[11px] leading-snug text-ink-muted">{w}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <Banner tone="info" icon={<Info size={13} />} title="How this is computed">
                    Every road is scored from flood depth and slope-failure probability, then multiplied into the travel
                    cost ({'`'}length × (0.55 + 7.2 × risk){'`'}). Dijkstra then finds the cheapest path — so a longer road
                    with lower exposure wins over a short submerged one.
                  </Banner>
                </>
              ) : (
                <Banner tone="critical" icon={<CircleSlash size={14} />} title="No route exists">
                  {destination.name} cannot be reached from {zone?.name} under current conditions. All corridors are
                  either submerged, blocked or removed. Use rescue deployment or air evacuation.
                </Banner>
              )}
            </div>
          </Panel>

          {/* ---------- recalculation impact ---------- */}
          <Panel>
            <PanelHead
              title="Recalculation impact"
              subtitle="What changed when the network was edited"
              icon={<RefreshCw size={15} />}
              tone="elevated"
            />
            <div className="space-y-3 p-4">
              <div>
                <div className="hud-text mb-2">
                  Auto-removed by hazard ({blockedByHazard.length})
                </div>
                {blockedByHazard.length ? (
                  blockedByHazard.map((r) => (
                    <div key={r.roadId} className="mb-1.5 flex items-start gap-2 rounded-lg border border-threat-critical/30 bg-threat-critical/10 px-2.5 py-2">
                      <AlertOctagon size={13} className="mt-0.5 shrink-0" style={{ color: TONE_HEX.critical }} />
                      <div>
                        <div className="font-mono text-[11.5px] text-ink">{r.roadId}</div>
                        <div className="text-[10.5px] text-ink-muted">{r.reason}</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-[11.5px] text-ink-faint">No road has crossed the automatic closure threshold.</p>
                )}
              </div>

              <div>
                <div className="hud-text mb-2">Manually reported closures ({closures.length})</div>
                {closures.length ? (
                  closures.map((c) => (
                    <div key={c.roadId} className="mb-1.5 flex items-start justify-between gap-2 rounded-lg border border-threat-elevated/30 bg-threat-elevated/10 px-2.5 py-2">
                      <div>
                        <div className="font-mono text-[11.5px] text-ink">{c.roadId}</div>
                        <div className="text-[10.5px] text-ink-muted">{c.reason}</div>
                      </div>
                      <button type="button" className="btn !px-1.5 !py-1" onClick={() => removeClosure(c.roadId)}>
                        <Undo2 size={11} />
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="text-[11.5px] text-ink-faint">
                    No manual closures. Use the scan table above to mark a road blocked — every route and shelter
                    assignment will be recalculated immediately.
                  </p>
                )}
              </div>

              {impact ? (
                <div className="rounded-xl border border-threat-critical/30 bg-threat-critical/10 p-3">
                  <div className="hud-text mb-2" style={{ color: TONE_HEX.critical }}>
                    Result of the closures
                  </div>
                  <div className="space-y-1 text-[11.5px] text-ink-muted">
                    <div>
                      <span className="text-ink">{analysis.totals.isolatedZones}</span> zone(s) isolated or degraded
                      {impact.affectedZones.length ? `: ${impact.affectedZones.map((z) => ZONE_BY_ID[z.zoneId]?.name).join(', ')}` : ''}
                    </div>
                    <div>
                      <span className="text-ink">{analysis.domino.unreachableShelterIds.length}</span> shelter(s) cut off
                      {analysis.domino.unreachableShelterIds.length
                        ? `: ${analysis.domino.unreachableShelterIds
                            .map((id) => analysis.shelters.find((s) => s.id === id)?.name ?? id)
                            .join(', ')}`
                        : ''}
                    </div>
                    <div>
                      <span className="text-ink">{analysis.domino.unreachableHospitalIds.length}</span> hospital(s) losing
                      road access
                    </div>
                  </div>
                </div>
              ) : null}

              {plan ? (
                <div className="rounded-xl border border-base-700/60 bg-base-900/50 p-3">
                  <div className="hud-text mb-2">Current evacuation allocation for {zone?.name}</div>
                  <div className="flex items-center justify-between gap-2 text-[12px]">
                    <span className="text-ink-muted">Assigned shelter</span>
                    <span className="text-ink">
                      {plan.shelterId ? analysis.shelters.find((s) => s.id === plan.shelterId)?.name : 'none reachable'}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-ink-faint">{plan.reason}</p>
                  {plan.overflow ? (
                    <LevelPill level="high" className="mt-2">
                      OVERFLOW ALLOCATION
                    </LevelPill>
                  ) : null}
                </div>
              ) : null}

              <button type="button" className="btn w-full" onClick={() => setNav('community')}>
                Report a road closure to the community board <ArrowRight size={13} />
              </button>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
