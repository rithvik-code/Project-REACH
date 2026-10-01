import { useState } from 'react';
import {
  Activity,
  AlertOctagon,
  ArrowRight,
  Building2,
  ChevronDown,
  Cross,
  Flame,
  GitBranch,
  HeartPulse,
  Info,
  ListOrdered,
  Radio,
  Route as RouteIcon,
  TriangleAlert,
  Users,
} from 'lucide-react';
import clsx from 'clsx';
import type { Analysis } from '../lib/engine/analysis';
import { useReach } from '../lib/store';
import { HOSPITAL_BY_ID, ZONE_BY_ID } from '../lib/data/region';
import { Bar, Banner, LevelPill, Panel, PanelHead, Stat, TONE_HEX } from '../components/ui';
import { formatCompact, formatNumber, riskColor } from '../lib/geo';
import { ScenarioSimulator } from '../components/ScenarioSimulator';
import { WeatherPanel } from '../components/WeatherPanel';

const LOOP = ['Detect', 'Analyze', 'Simulate', 'Communicate', 'Evacuate', 'Adapt', 'Recover'];

export function CommandCenter({ analysis }: { analysis: Analysis }) {
  const setNav = useReach((s) => s.setNav);
  const setFocus = useReach((s) => s.setFocus);
  const setSelectedZoneId = useReach((s) => s.setSelectedZoneId);
  const [openAction, setOpenAction] = useState<string | null>(analysis.actions[0]?.id ?? null);
  const [expandedWave, setExpandedWave] = useState<number | null>(1);

  const loopStage = analysis.graph.removed.length
    ? 4
    : analysis.hazard.isSimulated
      ? 2
      : analysis.totals.populationAtRisk > 0
        ? 1
        : 0;

  const waves = [1, 2, 3];

  return (
    <div className="space-y-5">
      <Panel className="relative overflow-hidden">
        <div className="grid-lines pointer-events-none absolute inset-0 opacity-40" />
        <div className="relative flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <div className="hud-text">Emergency operations · Varun Valley District</div>
            <h1 className="mt-1.5 text-xl font-bold text-ink">Command Center</h1>
            <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-ink-muted">
              Every layer of the system — hazard field, road network, shelter capacity, hospital access and community
              input — resolved into a ranked list of things to do next.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <LevelPill level={analysis.zones[0]?.level ?? 'low'}>
              {analysis.zones[0]?.level === 'critical' ? 'CRITICAL EVENT' : 'ELEVATED WATCH'}
            </LevelPill>
            <span className="chip border-base-600/70 bg-base-800/60 text-ink-muted">
              <Radio size={11} /> {analysis.hazard.isSimulated ? 'SIMULATED FUTURE' : 'LIVE'}
            </span>
          </div>
        </div>

        {/* continuous loop */}
        <div className="relative flex flex-wrap items-center gap-1 border-t border-base-700/60 px-5 py-3">
          {LOOP.map((stage, i) => {
            const active = i === loopStage;
            return (
              <div key={stage} className="flex items-center gap-1">
                <span
                  className={clsx(
                    'rounded-full border px-2.5 py-1 text-[10.5px] font-medium tracking-wide transition',
                    active
                      ? 'border-threat-info/60 bg-threat-info/15 text-threat-info'
                      : i < loopStage
                        ? 'border-base-600/60 text-ink-muted'
                        : 'border-base-700/60 text-ink-faint',
                  )}
                >
                  {stage}
                </span>
                {i < LOOP.length - 1 ? <ArrowRight size={11} className="text-ink-faint" /> : null}
              </div>
            );
          })}
          <span className="ml-auto hud-text">Continuous response loop</span>
        </div>
      </Panel>

      {/* ---------- key metrics ---------- */}
      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        <Stat
          label="Population at risk"
          value={formatCompact(analysis.totals.populationAtRisk)}
          sub={`${formatCompact(analysis.totals.totalPopulation)} district total`}
          tone="high"
          icon={<Users size={14} />}
        />
        <Stat
          label="Needs assistance"
          value={formatCompact(analysis.totals.populationNeedingAssistance)}
          sub="cannot self-evacuate"
          tone="elevated"
          icon={<HeartPulse size={14} />}
        />
        <Stat
          label="Zones isolated"
          value={analysis.totals.isolatedZones}
          sub="no road route to shelter or hospital"
          tone={analysis.totals.isolatedZones ? 'critical' : 'low'}
          icon={<AlertOctagon size={14} />}
        />
        <Stat
          label="Shelter gap"
          value={formatNumber(analysis.totals.shelterGap)}
          sub={
            analysis.totals.shelterGap > 0
              ? `shortfall vs ${formatNumber(analysis.totals.shelterDemand)} demand`
              : `surplus of ${formatNumber(-analysis.totals.shelterGap)}`
          }
          tone={analysis.totals.shelterGap > 0 ? 'critical' : 'low'}
          icon={<Building2 size={14} />}
        />
        <Stat
          label="Domino criticality"
          value={`${Math.round(analysis.domino.criticalityScore)}`}
          sub={`${analysis.domino.steps.length} cascading effects`}
          tone={analysis.domino.criticalityScore >= 45 ? 'critical' : analysis.domino.criticalityScore >= 20 ? 'high' : 'moderate'}
          icon={<GitBranch size={14} />}
        />
        <Stat
          label="Wildfire pressure"
          value={`${Math.round(analysis.hazard.firePressure * 100)}`}
          sub={
            analysis.totals.fireZones
              ? `${analysis.totals.fireZones} zone(s) above fire alert threshold`
              : 'below the fire alert threshold'
          }
          tone={analysis.hazard.firePressure >= 0.7 ? 'critical' : analysis.hazard.firePressure >= 0.45 ? 'high' : 'low'}
          icon={<Flame size={14} />}
        />
      </div>

      {/* ---------- live weather watch ---------- */}
      <WeatherPanel />

      <div className="grid gap-4 xl:grid-cols-[1.25fr_1fr]">
        {/* ---------- priority actions ---------- */}
        <Panel>
          <PanelHead
            title="Priority actions"
            subtitle="Ranked by risk, population exposure, route accessibility and shelter capacity"
            icon={<ListOrdered size={15} />}
            tone="critical"
          />
          <div className="space-y-2 p-4">
            {analysis.actions.map((action) => {
              const open = openAction === action.id;
              const hex = riskColor(action.severity);
              return (
                <div
                  key={action.id}
                  className="overflow-hidden rounded-xl border transition"
                  style={{ borderColor: open ? `${hex}66` : '#1b2233', background: open ? `${hex}0d` : 'rgba(11,15,24,0.5)' }}
                >
                  <button
                    type="button"
                    onClick={() => setOpenAction(open ? null : action.id)}
                    className="flex w-full items-start gap-3 px-3.5 py-3 text-left"
                  >
                    <span
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-lg font-mono text-[13px] font-bold"
                      style={{ background: `${hex}22`, color: hex, border: `1px solid ${hex}55` }}
                    >
                      {action.priority}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-[13.5px] font-semibold text-ink">{action.title}</span>
                        <span
                          className="rounded-full border px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider"
                          style={{ borderColor: `${hex}55`, color: hex }}
                        >
                          {action.category}
                        </span>
                      </span>
                      <span className="mt-1 block text-[11.5px] leading-relaxed text-ink-muted">{action.directive}</span>
                    </span>
                    <ChevronDown
                      size={16}
                      className={clsx('mt-1 shrink-0 text-ink-faint transition', open && 'rotate-180')}
                    />
                  </button>
                  {open ? (
                    <div className="border-t border-base-700/60 px-3.5 py-3">
                      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: hex }}>
                        <Info size={12} /> WHY THIS IS PRIORITY {action.priority}
                      </div>
                      <p className="mb-3 text-[11.5px] leading-relaxed text-ink-muted">{action.rationale}</p>
                      <div className="grid gap-1.5 sm:grid-cols-2">
                        {action.because.map((b) => (
                          <div
                            key={b.label}
                            className="flex items-start justify-between gap-2 rounded-lg border border-base-700/50 bg-base-900/50 px-2.5 py-1.5"
                          >
                            <span className="text-[10.5px] uppercase tracking-wider text-ink-faint">{b.label}</span>
                            <span className="text-right text-[11px] text-ink">{b.value}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2.5 flex items-center justify-between text-[11px]">
                        <span className="text-ink-faint">
                          Owner: <span className="text-ink-muted">{action.owner}</span>
                        </span>
                        <button
                          type="button"
                          className="btn btn-ghost !px-2 !py-1 text-[11px]"
                          onClick={() => setNav(action.category === 'avoid' ? 'saferoute' : action.category === 'shelter' || action.category === 'capacity' ? 'shelters' : action.category === 'communicate' ? 'community' : 'map')}
                        >
                          Open related view <ArrowRight size={12} />
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
            {!analysis.actions.length ? (
              <Banner tone="low" icon={<Activity size={14} />} title="No action required">
                All zones are below the response threshold. Use this window to pre-position resources and verify
                shelter readiness.
              </Banner>
            ) : null}
          </div>
        </Panel>

        {/* ---------- domino chain ---------- */}
        <Panel>
          <PanelHead
            title="Domino chain"
            subtitle={analysis.domino.trigger}
            icon={<GitBranch size={15} />}
            tone="high"
            right={
              <span
                className="font-mono text-[13px]"
                style={{
                  color:
                    analysis.domino.criticalityScore >= 45
                      ? TONE_HEX.critical
                      : analysis.domino.criticalityScore >= 20
                        ? TONE_HEX.high
                        : TONE_HEX.low,
                }}
              >
                {Math.round(analysis.domino.criticalityScore)}/100
              </span>
            }
          />
          <div className="space-y-3 p-4">
            <p className="text-[11.5px] leading-relaxed text-ink-muted">
              REACH traces how one failure propagates into the next, so the chain can be cut at its weakest link
              instead of chased after every hop.
            </p>
            {waves.map((wave) => {
              const steps = analysis.domino.steps.filter((s) => s.wave === wave);
              if (!steps.length) return null;
              const open = expandedWave === wave;
              const waveLabel = wave === 1 ? 'Direct hazard impact' : wave === 2 ? 'Loss of access' : 'Capacity & service overload';
              return (
                <div key={wave} className="rounded-xl border border-base-700/60 bg-base-900/50">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left"
                    onClick={() => setExpandedWave(open ? null : wave)}
                  >
                    <span
                      className="grid h-6 w-6 place-items-center rounded-md font-mono text-[11px] font-bold"
                      style={{
                        background: wave === 1 ? `${TONE_HEX.high}22` : wave === 2 ? `${TONE_HEX.critical}22` : `${TONE_HEX.elevated}22`,
                        color: wave === 1 ? TONE_HEX.high : wave === 2 ? TONE_HEX.critical : TONE_HEX.elevated,
                      }}
                    >
                      W{wave}
                    </span>
                    <span className="flex-1">
                      <span className="block text-[12.5px] font-semibold text-ink">{waveLabel}</span>
                      <span className="block text-[10.5px] text-ink-faint">{steps.length} effect(s)</span>
                    </span>
                    <ChevronDown size={15} className={clsx('text-ink-faint transition', open && 'rotate-180')} />
                  </button>
                  {open ? (
                    <div className="space-y-2 border-t border-base-700/60 px-3.5 py-3">
                      {steps.map((s, i) => {
                        const hex = riskColor(s.severity);
                        return (
                          <div key={i} className="rounded-lg border-l-2 pl-3" style={{ borderColor: hex }}>
                            <div className="flex items-start gap-2">
                              <span className="mt-0.5" style={{ color: hex }}>
                                {s.kind === 'cascade' ? <GitBranch size={13} /> : s.kind === 'service' ? <Cross size={13} /> : <TriangleAlert size={13} />}
                              </span>
                              <div className="min-w-0">
                                <div className="text-[12px] font-medium text-ink">{s.title}</div>
                                <pre className="mt-1 whitespace-pre-wrap font-sans text-[11px] leading-relaxed text-ink-muted">
                                  {s.detail}
                                </pre>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
            {!analysis.domino.steps.length ? (
              <Banner tone="low" title="No cascade detected">
                Hazard load is below the level at which secondary failures begin.
              </Banner>
            ) : null}

            <div className="grid grid-cols-2 gap-2 border-t border-base-700/60 pt-3 text-[11px]">
              <div className="rounded-lg border border-base-700/60 bg-base-900/50 p-2.5">
                <div className="hud-text mb-1">Isolated zones</div>
                <div className="text-ink">
                  {analysis.domino.isolatedZoneIds.length
                    ? analysis.domino.isolatedZoneIds.map((id) => ZONE_BY_ID[id]?.name).join(', ')
                    : 'none'}
                </div>
              </div>
              <div className="rounded-lg border border-base-700/60 bg-base-900/50 p-2.5">
                <div className="hud-text mb-1">Shelters cut off</div>
                <div className="text-ink">
                  {analysis.domino.unreachableShelterIds.length
                    ? analysis.domino.unreachableShelterIds.join(', ')
                    : 'none'}
                </div>
              </div>
              <div className="rounded-lg border border-base-700/60 bg-base-900/50 p-2.5">
                <div className="hud-text mb-1">Hospitals lost</div>
                <div className="text-ink">
                  {analysis.domino.unreachableHospitalIds.length
                    ? analysis.domino.unreachableHospitalIds.map((id) => HOSPITAL_BY_ID[id]?.name).join(', ')
                    : 'none'}
                </div>
              </div>
              <div className="rounded-lg border border-base-700/60 bg-base-900/50 p-2.5">
                <div className="hud-text mb-1">Roads removed</div>
                <div className="text-ink">
                  {analysis.graph.removed.length
                    ? analysis.graph.removed.map((r) => r.roadId).join(', ')
                    : 'none'}
                </div>
              </div>
            </div>
          </div>
        </Panel>
      </div>

      {/* ---------- zone risk board ---------- */}
      <Panel>
        <PanelHead
          title="Zone risk board"
          subtitle="Multi-hazard composite: flood, slope failure, vulnerability, accessibility"
          icon={<Activity size={15} />}
          tone="info"
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[840px] border-collapse text-left">
            <thead>
              <tr className="border-b border-base-700/60">
                {['Zone', 'Risk', 'Flood', 'Slope', 'Exposed', 'Assistance', 'Access', 'Shelter', 'Hospital'].map((h) => (
                  <th key={h} className="px-4 py-2.5 hud-text">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {analysis.zones.map((z) => {
                const zone = ZONE_BY_ID[z.zoneId];
                const hex = riskColor(z.level);
                const plan = analysis.plans[z.zoneId];
                return (
                  <tr
                    key={z.zoneId}
                    onClick={() => {
                      setSelectedZoneId(z.zoneId);
                      if (zone) setFocus(zone.lat, zone.lng, 14);
                      setNav('map');
                    }}
                    className="cursor-pointer border-b border-base-700/30 transition hover:bg-base-800/40"
                  >
                    <td className="px-4 py-2.5">
                      <div className="text-[12.5px] font-medium text-ink">{zone?.name}</div>
                      <div className="text-[10.5px] text-ink-faint">
                        {zone?.kind} · {zone?.elevationM} m · {formatNumber(zone?.population ?? 0)} residents
                        {z.isolated ? ' · ISOLATED' : ''}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[13px]" style={{ color: hex }}>
                          {Math.round(z.risk)}
                        </span>
                        <span className="w-16">
                          <Bar value={z.risk / 100} tone={z.level as 'critical'} height={4} />
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 w-20">
                      <Bar value={z.flood} tone="info" height={4} />
                      <span className="mt-1 block font-mono text-[10px] text-ink-faint">{Math.round(z.flood * 100)}%</span>
                    </td>
                    <td className="px-4 py-2.5 w-20">
                      <Bar value={z.landslide} tone="high" height={4} />
                      <span className="mt-1 block font-mono text-[10px] text-ink-faint">{Math.round(z.landslide * 100)}%</span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[12px] text-ink">{formatCompact(z.populationAtRisk)}</td>
                    <td className="px-4 py-2.5 font-mono text-[12px] text-ink">
                      {formatCompact(z.populationNeedingAssistance)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className="font-mono text-[12px]"
                        style={{ color: z.roadAccess > 0.6 ? TONE_HEX.low : z.roadAccess > 0.25 ? TONE_HEX.elevated : TONE_HEX.critical }}
                      >
                        {Math.round(z.roadAccess * 100)}%
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[11.5px] text-ink-muted">
                      {plan?.shelterId
                        ? `${analysis.shelters.find((s) => s.id === plan.shelterId)?.name ?? ''}${plan.overflow ? ' (overflow)' : ''}`
                        : '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className="text-[11px]"
                        style={{ color: z.hospitalReachable ? TONE_HEX.low : TONE_HEX.critical }}
                      >
                        {z.hospitalReachable ? 'Reachable' : 'No access'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <ScenarioSimulator analysis={analysis} />

      {/* ---------- resource status ---------- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHead
            title="Shelter status"
            subtitle="Capacity, risk and which zones are routed here"
            icon={<Building2 size={15} />}
            tone="low"
          />
          <div className="space-y-2 p-4">
            {analysis.shelters.map((s) => {
              const hex = s.available <= 0 ? TONE_HEX.critical : s.occupancyPct > 0.85 ? TONE_HEX.high : TONE_HEX.low;
              return (
                <div key={s.id} className="rounded-xl border border-base-700/60 bg-base-900/50 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-[12.5px] font-medium text-ink">{s.name}</div>
                      <div className="text-[10.5px] text-ink-faint">
                        {s.accessibility} access · risk {Math.round(s.riskScore)}/100 · {s.reachableZoneIds.length} zone(s)
                      </div>
                    </div>
                    <span className="shrink-0 font-mono text-[12px]" style={{ color: hex }}>
                      {formatNumber(s.available)} free
                    </span>
                  </div>
                  <Bar className="mt-2" value={s.occupancyPct} tone={s.occupancyPct > 0.9 ? 'critical' : s.occupancyPct > 0.7 ? 'elevated' : 'low'} height={5} />
                  <div className="mt-1 flex justify-between font-mono text-[10px] text-ink-faint">
                    <span>
                      {formatNumber(s.occupied)} / {formatNumber(s.capacity)}
                    </span>
                    <span>+{Math.round(s.fillingRate)} ppl/hr</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel>
            <PanelHead
              title="Hospital access"
              subtitle="Road-reachability from the district hub"
              icon={<Cross size={15} />}
              tone="critical"
            />
            <div className="space-y-2 p-4">
              {analysis.hospitals.map((h) => (
                <div key={h.id} className="flex items-start justify-between gap-3 rounded-xl border border-base-700/60 bg-base-900/50 p-3">
                  <div className="min-w-0">
                    <div className="truncate text-[12.5px] font-medium text-ink">{h.name}</div>
                    <div className="text-[10.5px] text-ink-faint">
                      {h.beds} beds {h.trauma ? '· trauma centre' : ''} {h.helipad ? '· helipad' : ''}
                    </div>
                    <div className="mt-1 text-[11px]" style={{ color: h.reachable ? TONE_HEX.low : TONE_HEX.critical }}>
                      {h.note}
                    </div>
                  </div>
                  <LevelPill level={h.reachable ? (h.status === 'strained' ? 'elevated' : 'low') : 'critical'}>
                    {h.reachable ? h.status : 'NO ACCESS'}
                  </LevelPill>
                </div>
              ))}
            </div>
          </Panel>

          <Panel>
            <PanelHead
              title="Network integrity"
              subtitle="Roads removed from the routing network"
              icon={<RouteIcon size={15} />}
              tone="elevated"
            />
            <div className="space-y-2 p-4">
              {analysis.graph.removed.length ? (
                analysis.graph.removed.map((r) => (
                  <div key={r.roadId} className="flex items-start gap-2.5 rounded-xl border border-threat-critical/30 bg-threat-critical/10 p-2.5">
                    <AlertOctagon size={14} className="mt-0.5 shrink-0 text-threat-critical" />
                    <div>
                      <div className="font-mono text-[12px] text-ink">{r.roadId}</div>
                      <div className="text-[11px] text-ink-muted">{r.reason}</div>
                    </div>
                  </div>
                ))
              ) : (
                <Banner tone="low" title="All corridors passable">
                  No road has crossed the flood-depth or slope-failure threshold yet.
                </Banner>
              )}
              <button type="button" className="btn w-full" onClick={() => setNav('saferoute')}>
                Open SafeRoute &amp; mark roads blocked <ArrowRight size={13} />
              </button>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
