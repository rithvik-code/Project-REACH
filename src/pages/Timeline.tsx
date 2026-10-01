import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarClock,
  CloudRain,
  FastForward,
  Info,
  Mountain,
  Pause,
  Play,
  Rewind,
  SkipBack,
  SkipForward,
  Waves,
} from 'lucide-react';
import type { Analysis } from '../lib/engine/analysis';
import { buildHazardState, TIME_MAX, TIME_MIN } from '../lib/engine/hazard';
import { useReach } from '../lib/store';
import { MapView } from '../components/MapView';
import { ScenarioSimulator } from '../components/ScenarioSimulator';
import { Banner, Bar, LevelPill, Panel, PanelHead, Stat, TONE_HEX } from '../components/ui';
import { ZONE_BY_ID } from '../lib/data/region';
import { formatNumber, hourLabel, riskColor, riskFromScore } from '../lib/geo';
import clsx from 'clsx';

function Sparkline({
  series,
  color,
  label,
  max = 1,
  nowIndex,
}: {
  series: number[];
  color: string;
  label: string;
  max?: number;
  nowIndex: number;
}) {
  const w = 100;
  const h = 34;
  const points = series
    .map((v, i) => {
      const x = (i / Math.max(1, series.length - 1)) * w;
      const y = h - (Math.min(v, max) / max) * h;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
  const nowX = (nowIndex / Math.max(1, series.length - 1)) * w;
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="hud-text">{label}</span>
        <span className="font-mono text-[11px]" style={{ color }}>
          {Math.round((series[nowIndex] ?? 0) * 100)}%
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="mt-1 h-14 w-full overflow-visible">
        <defs>
          <linearGradient id={`grad_${label.replace(/\W/g, '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={`0,${h} ${points} ${w},${h}`} fill={`url(#grad_${label.replace(/\W/g, '')})`} />
        <polyline points={points} fill="none" stroke={color} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
        <line x1={nowX} y1="0" x2={nowX} y2={h} stroke="#e7ecf5" strokeWidth="0.7" strokeDasharray="2 2" opacity="0.6" />
        <circle
          cx={nowX}
          cy={h - (Math.min(series[nowIndex] ?? 0, max) / max) * h}
          r="2"
          fill={color}
          stroke="#05070c"
          strokeWidth="0.8"
        />
      </svg>
    </div>
  );
}

export function Timeline({ analysis }: { analysis: Analysis }) {
  const hourOffset = useReach((s) => s.hourOffset);
  const setHourOffset = useReach((s) => s.setHourOffset);
  const scenario = useReach((s) => s.scenario);
  const closures = useReach((s) => s.closures);
  const selectedZoneId = useReach((s) => s.selectedZoneId) ?? 'z_riverbend';
  const setSelectedZoneId = useReach((s) => s.setSelectedZoneId);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!playing) {
      if (timer.current) window.clearInterval(timer.current);
      return;
    }
    timer.current = window.setInterval(() => {
      const cur = useReach.getState().hourOffset;
      setHourOffset(cur >= TIME_MAX ? TIME_MIN : cur + 1);
    }, 900);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [playing, setHourOffset]);

  const hours = useMemo(() => {
    const out: number[] = [];
    for (let h = TIME_MIN; h <= TIME_MAX; h += 1) out.push(h);
    return out;
  }, []);

  const projection = useMemo(() => {
    return hours.map((h) => {
      const state = buildHazardState(h, scenario, closures);
      const z = state.perZone[selectedZoneId] ?? { flood: 0, landslide: 0 };
      const composite = 0.62 * Math.max(z.flood, z.landslide) + 0.38 * ((z.flood + z.landslide) / 2);
      return {
        hour: h,
        flood: z.flood,
        landslide: z.landslide,
        rainfall: state.rainfallRateMmHr / 40,
        roadsOut: Object.values(state.perRoad).filter((r) => !r.passable).length,
        composite,
      };
    });
  }, [hours, scenario, closures, selectedZoneId]);

  const nowIndex = hours.indexOf(hourOffset);
  const now = projection[nowIndex] ?? projection[0];
  const zone = ZONE_BY_ID[selectedZoneId];

  const delta = useMemo(() => {
    const idx0 = hours.indexOf(0);
    const a = projection[idx0];
    const b = projection[nowIndex];
    if (!a || !b) return null;
    return { flood: b.flood - a.flood, landslide: b.landslide - a.landslide, roads: b.roadsOut - a.roadsOut };
  }, [projection, hours, nowIndex]);

  const peak = useMemo(
    () => projection.reduce((best, p) => (p.composite > best.composite ? p : best), projection[0]),
    [projection],
  );

  const roadsOutNow = analysis.graph.removed.length;

  return (
    <div className="space-y-5">
      <Panel className="overflow-hidden">
        <PanelHead
          title="Disaster Time Machine"
          subtitle="12 hours of history, 24 hours of scenario simulation — hourly resolution"
          icon={<CalendarClock size={15} />}
          tone={analysis.hazard.isSimulated ? 'high' : analysis.hazard.hourOffset < 0 ? 'info' : 'low'}
          right={
            <LevelPill level={riskFromScore(now.composite * 100)}>
              {analysis.hazard.isSimulated ? 'SIMULATED FUTURE' : analysis.hazard.hourOffset < 0 ? 'HISTORICAL REPLAY' : 'LIVE NOW'}
            </LevelPill>
          }
        />

        <div className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={clsx('btn !px-3 !py-2', playing && 'btn-danger')}
              onClick={() => setPlaying(!playing)}
            >
              {playing ? <Pause size={14} /> : <Play size={14} />}
              {playing ? 'Pause' : 'Play timeline'}
            </button>
            <button type="button" className="btn !px-3 !py-2" onClick={() => setHourOffset(Math.max(TIME_MIN, hourOffset - 1))}>
              <Rewind size={14} />
            </button>
            <button type="button" className="btn !px-3 !py-2" onClick={() => setHourOffset(TIME_MIN)}>
              <SkipBack size={14} /> 12h ago
            </button>
            <button type="button" className="btn !px-3 !py-2" onClick={() => setHourOffset(0)}>
              Now
            </button>
            <button type="button" className="btn !px-3 !py-2" onClick={() => setHourOffset(TIME_MAX)}>
              <SkipForward size={14} /> +24h
            </button>
            <button type="button" className="btn !px-3 !py-2" onClick={() => setHourOffset(Math.min(TIME_MAX, hourOffset + 1))}>
              <FastForward size={14} />
            </button>
            <div className="ml-auto flex items-center gap-3">
              <div className="text-right">
                <div className="hud-text">Time offset</div>
                <div className="font-mono text-[18px] text-ink">{hourLabel(hourOffset)}</div>
              </div>
              <div className="text-right">
                <div className="hud-text">Local time</div>
                <div className="font-mono text-[13px] text-ink-muted">
                  {new Date(Date.now() + hourOffset * 3600_000).toLocaleString([], {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between text-[10.5px] text-ink-faint">
              <span>13 hours of history</span>
              <span className="text-ink-muted">now</span>
              <span>24 simulated hours ahead</span>
            </div>
            <input
              type="range"
              min={TIME_MIN}
              max={TIME_MAX}
              step={1}
              value={hourOffset}
              onChange={(e) => setHourOffset(Number(e.target.value))}
              className="mt-2 h-2 w-full cursor-pointer appearance-none rounded-full"
              style={{
                background: `linear-gradient(90deg, #1b2233 0%, #1b2233 ${((0 - TIME_MIN) / (TIME_MAX - TIME_MIN)) * 100}%, #3a2430 ${((0 - TIME_MIN) / (TIME_MAX - TIME_MIN)) * 100}%, #5b2230 100%)`,
                accentColor: hourOffset > 0 ? TONE_HEX.high : TONE_HEX.info,
              }}
            />
            <div className="mt-2 flex justify-between">
              {[-12, -8, -4, 0, 4, 8, 12, 16, 20, 24].map((h) => (
                <span
                  key={h}
                  className={clsx(
                    'font-mono text-[10px]',
                    h === hourOffset ? 'text-ink' : h === 0 ? 'text-ink-muted' : 'text-ink-faint',
                  )}
                >
                  {h === 0 ? 'NOW' : h > 0 ? `+${h}` : h}
                </span>
              ))}
            </div>
          </div>

          {analysis.hazard.isSimulated ? (
            <Banner tone="high" className="mt-4" icon={<Info size={14} />} title="This is a simulation, not a forecast">
              Future states are scenario projections generated from the current rainfall profile and your perturbations.
              They are labelled SIMULATED everywhere they appear and must not be presented to the public as a prediction.
            </Banner>
          ) : null}
          {hourOffset < 0 ? (
            <Banner tone="info" className="mt-4" icon={<Rewind size={14} />} title="Historical replay">
              Showing reconstructed conditions from the hazard record. Useful for post-event review and for judging how
              fast the situation developed.
            </Banner>
          ) : null}
        </div>
      </Panel>

      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Rainfall intensity"
          value={`${analysis.hazard.rainfallRateMmHr.toFixed(1)}`}
          sub="mm per hour"
          tone="info"
          icon={<CloudRain size={14} />}
        />
        <Stat
          label="Cumulative rainfall"
          value={Math.round(analysis.hazard.cumulativeRainMm)}
          sub={`antecedent 62 mm + ${Math.round(analysis.hazard.cumulativeRainMm - 62)} mm`}
          tone="info"
        />
        <Stat
          label="Flood pressure"
          value={`${Math.round(analysis.hazard.floodPressure * 100)}%`}
          sub={delta ? `${delta.flood >= 0 ? '+' : ''}${Math.round(delta.flood * 100)} pts vs now` : ''}
          tone={analysis.hazard.floodPressure > 0.7 ? 'critical' : analysis.hazard.floodPressure > 0.45 ? 'high' : 'elevated'}
          icon={<Waves size={14} />}
        />
        <Stat
          label="Slope pressure"
          value={`${Math.round(analysis.hazard.landslidePressure * 100)}%`}
          sub={delta ? `${delta.landslide >= 0 ? '+' : ''}${Math.round(delta.landslide * 100)} pts vs now` : ''}
          tone={analysis.hazard.landslidePressure > 0.7 ? 'critical' : analysis.hazard.landslidePressure > 0.45 ? 'high' : 'moderate'}
          icon={<Mountain size={14} />}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Panel className="overflow-hidden">
          <PanelHead
            title="State at this hour"
            subtitle={`${zone?.name}'s hazard envelope and the road network it implies`}
            icon={<Waves size={15} />}
            tone={analysis.hazard.isSimulated ? 'high' : 'info'}
          />
          <div className="p-3">
            <MapView analysis={analysis} height="h-[52vh] min-h-[360px]" />
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel>
            <PanelHead
              title="Trajectory"
              subtitle="Flood, slope-failure and road losses across the timeline"
              icon={<CalendarClock size={15} />}
              tone="elevated"
            />
            <div className="space-y-4 p-4">
              <div>
                <label className="hud-text mb-1.5 block">Zone</label>
                <select className="field" value={selectedZoneId} onChange={(e) => setSelectedZoneId(e.target.value)}>
                  {analysis.zones.map((z) => (
                    <option key={z.zoneId} value={z.zoneId}>
                      {ZONE_BY_ID[z.zoneId]?.name}
                    </option>
                  ))}
                </select>
              </div>
              <Sparkline series={projection.map((p) => p.flood)} color={TONE_HEX.info} label="Flood intensity" nowIndex={nowIndex} />
              <Sparkline series={projection.map((p) => p.landslide)} color={TONE_HEX.high} label="Slope-failure probability" nowIndex={nowIndex} />
              <Sparkline
                series={projection.map((p) => Math.min(1, p.roadsOut / 10))}
                color={TONE_HEX.critical}
                label="Roads out of service"
                nowIndex={nowIndex}
              />
              <Sparkline series={projection.map((p) => Math.min(1, p.rainfall))} color="#38bdf8" label="Rainfall rate" nowIndex={nowIndex} />

              <div className="rounded-xl border border-base-700/60 bg-base-900/50 p-3">
                <div className="hud-text mb-2">Peak in this timeline</div>
                <div className="flex items-center justify-between text-[12px]">
                  <span className="text-ink-muted">Highest composite risk</span>
                  <span className="font-mono" style={{ color: riskColor(riskFromScore(peak.composite * 100)) }}>
                    {Math.round(peak.composite * 100)}/100 at {hourLabel(peak.hour)}
                  </span>
                </div>
                <Bar className="mt-2" value={peak.composite} tone={riskFromScore(peak.composite * 100) as 'critical'} height={6} />
                <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
                  Use this to decide when evacuation must be complete. Evacuating before the peak avoids the window where
                  roads start failing.
                </p>
              </div>

              <div className="rounded-xl border border-base-700/60 bg-base-900/50 p-3">
                <div className="hud-text mb-2">Right now ({hourLabel(hourOffset)})</div>
                <div className="space-y-1.5 text-[11.5px]">
                  <div className="flex justify-between">
                    <span className="text-ink-muted">Roads removed at this hour</span>
                    <span className="font-mono" style={{ color: roadsOutNow ? TONE_HEX.critical : TONE_HEX.low }}>
                      {roadsOutNow}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-muted">Isolated zones</span>
                    <span className="font-mono" style={{ color: analysis.totals.isolatedZones ? TONE_HEX.critical : TONE_HEX.low }}>
                      {analysis.totals.isolatedZones}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-muted">Population at risk</span>
                    <span className="font-mono text-ink">{formatNumber(analysis.totals.populationAtRisk)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-muted">Shelter spaces free</span>
                    <span className="font-mono text-ink">{formatNumber(analysis.totals.shelterCapacityAvailable)}</span>
                  </div>
                </div>
              </div>
            </div>
          </Panel>

          <ScenarioSimulator analysis={analysis} compact />
        </div>
      </div>
    </div>
  );
}
