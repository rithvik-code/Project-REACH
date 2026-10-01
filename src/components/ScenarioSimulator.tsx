import { useState } from 'react';
import {
  Building2,
  Droplets,
  Hospital,
  Minus,
  Mountain,
  Plus,
  RotateCcw,
  Route as RouteIcon,
  Sparkles,
  Undo2,
} from 'lucide-react';
import clsx from 'clsx';
import { SCENARIO_PRESETS } from '../lib/engine/hazard';
import { useReach } from '../lib/store';
import { HOSPITALS, ROADS, SHELTERS } from '../lib/data/region';
import { Segmented, Panel, PanelHead, TONE_HEX, Banner } from './ui';
import { formatNumber, round } from '../lib/geo';
import type { Analysis } from '../lib/engine/analysis';

function Slider({
  label,
  value,
  min,
  max,
  step,
  unit,
  tone,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  tone: string;
  onChange: (v: number) => void;
  hint?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-[12px] text-ink-muted">{label}</span>
        <span className="font-mono text-[12px]" style={{ color: tone }}>
          {round(value, 2)}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1.5 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-base-700"
        style={{ accentColor: tone }}
      />
      {hint ? <p className="mt-1 text-[10.5px] leading-snug text-ink-faint">{hint}</p> : null}
    </div>
  );
}

export function ScenarioSimulator({ analysis, compact = false }: { analysis: Analysis; compact?: boolean }) {
  const scenario = useReach((s) => s.scenario);
  const setScenario = useReach((s) => s.setScenario);
  const resetScenario = useReach((s) => s.resetScenario);
  const capacityPatch = useReach((s) => s.capacityPatch);
  const setCapacity = useReach((s) => s.setCapacity);
  const occupancyPatch = useReach((s) => s.occupancyPatch);
  const adjustOccupancy = useReach((s) => s.adjustOccupancy);
  const hospitalStatusPatch = useReach((s) => s.hospitalStatusPatch);
  const setHospitalStatus = useReach((s) => s.setHospitalStatus);
  const closures = useReach((s) => s.closures);
  const addClosure = useReach((s) => s.addClosure);
  const removeClosure = useReach((s) => s.removeClosure);
  const [tab, setTab] = useState<'weather' | 'network' | 'capacity'>('weather');

  const activePreset = SCENARIO_PRESETS.find(
    (p) =>
      p.apply.rainfallMultiplier === scenario.rainfallMultiplier &&
      (p.apply.riverSurgeM ?? 0) === scenario.riverSurgeM &&
      (p.apply.landslideSensitivity ?? 1) === scenario.landslideSensitivity,
  );

  return (
    <Panel className="overflow-hidden">
      <PanelHead
        title="Scenario simulator"
        subtitle="Change the world, then watch risk → routes → evacuation → shelter allocation recalculate"
        icon={<Sparkles size={15} />}
        tone="accent"
        right={
          <button type="button" className="btn !px-2.5 !py-1.5 text-[11px]" onClick={resetScenario}>
            <RotateCcw size={13} /> Reset
          </button>
        }
      />
      <div className="space-y-4 p-4">
        <div className="flex flex-wrap gap-1.5">
          {SCENARIO_PRESETS.map((p) => {
            const active = activePreset?.id === p.id;
            return (
              <button
                key={p.id}
                type="button"
                title={p.blurb}
                onClick={() =>
                  setScenario({
                    ...p.apply,
                    rainfallMultiplier: p.apply.rainfallMultiplier ?? scenario.rainfallMultiplier,
                    riverSurgeM: p.apply.riverSurgeM ?? 0,
                    landslideSensitivity: p.apply.landslideSensitivity ?? 1,
                  })
                }
                className={clsx(
                  'rounded-full border px-3 py-1.5 text-[11.5px] transition',
                  active
                    ? 'border-threat-accent/60 bg-threat-accent/15 text-threat-accent'
                    : 'border-base-600/70 text-ink-muted hover:border-base-600 hover:text-ink',
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        <Segmented
          size="sm"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'weather', label: 'Weather & hazard', icon: <Droplets size={12} /> },
            { value: 'network', label: 'Road network', icon: <RouteIcon size={12} /> },
            { value: 'capacity', label: 'Shelters & hospitals', icon: <Building2 size={12} /> },
          ]}
        />

        {tab === 'weather' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Slider
              label="Rainfall intensity multiplier"
              value={scenario.rainfallMultiplier}
              min={0.1}
              max={3}
              step={0.05}
              unit="×"
              tone={TONE_HEX.info}
              onChange={(v) => setScenario({ rainfallMultiplier: v })}
              hint="Scales the hourly rainfall profile. Affects both flood depth and slope-failure probability."
            />
            <Slider
              label="River stage surge"
              value={scenario.riverSurgeM}
              min={0}
              max={6}
              step={0.25}
              unit=" m"
              tone={TONE_HEX.critical}
              onChange={(v) => setScenario({ riverSurgeM: v })}
              hint="Embankment failure or upstream release. Riverine zones and bridges fail first."
            />
            <Slider
              label="Landslide sensitivity"
              value={scenario.landslideSensitivity}
              min={0.4}
              max={1.8}
              step={0.05}
              unit="×"
              tone={TONE_HEX.high}
              onChange={(v) => setScenario({ landslideSensitivity: v })}
              hint="Soil saturation, deforestation or slope cutting increase this factor."
            />
            <div className="rounded-xl border border-base-700/60 bg-base-900/60 p-3">
              <div className="hud-text mb-2">Resulting state</div>
              <div className="space-y-1 font-mono text-[11.5px] text-ink-muted">
                <div className="flex justify-between">
                  <span>Flood pressure</span>
                  <span style={{ color: TONE_HEX.info }}>{Math.round(analysis.hazard.floodPressure * 100)}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Slope pressure</span>
                  <span style={{ color: TONE_HEX.high }}>{Math.round(analysis.hazard.landslidePressure * 100)}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Cumulative rain</span>
                  <span>{Math.round(analysis.hazard.cumulativeRainMm)} mm</span>
                </div>
                <div className="flex justify-between">
                  <span>Roads removed</span>
                  <span style={{ color: TONE_HEX.critical }}>{analysis.graph.removed.length}</span>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {tab === 'network' ? (
          <div className="space-y-2">
            <Banner tone="info" icon={<RouteIcon size={14} />}>
              Marking a road blocked removes it from the routing network immediately. Open areas, shelter assignments
              and the priority action list all recalculate.
            </Banner>
            <div className={clsx('grid gap-1.5', !compact && 'sm:grid-cols-2')}>
              {ROADS.map((r) => {
                const closure = closures.find((c) => c.roadId === r.id);
                const auto = analysis.hazard.perRoad[r.id];
                const autoClosed = auto && !auto.passable && !closure;
                return (
                  <div
                    key={r.id}
                    className="flex items-center gap-2 rounded-xl border border-base-700/60 bg-base-900/50 px-2.5 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[11.5px] text-ink">
                        <span className="font-mono text-ink-muted">{r.id}</span> {r.name}
                      </div>
                      <div className="text-[10px] text-ink-faint">
                        {autoClosed ? (
                          <span style={{ color: TONE_HEX.critical }}>auto-closed by hazard</span>
                        ) : closure ? (
                          <span style={{ color: closure.level === 'blocked' ? TONE_HEX.critical : TONE_HEX.elevated }}>
                            {closure.level} — {closure.reason}
                          </span>
                        ) : (
                          `hazard ${Math.round((auto?.risk ?? 0) * 100)}% · ${r.lengthKm} km`
                        )}
                      </div>
                    </div>
                    <Segmented
                      size="sm"
                      value={closure?.level ?? (autoClosed ? 'auto' : 'open')}
                      onChange={(v) => {
                        if (v === 'open') removeClosure(r.id);
                        else if (v === 'blocked') addClosure(r.id, 'Reported blocked by operator', 'blocked');
                        else if (v === 'caution') addClosure(r.id, 'Caution — partial obstruction', 'caution');
                      }}
                      options={[
                        { value: 'open', label: 'Open' },
                        { value: 'caution', label: 'Caution' },
                        { value: 'blocked', label: 'Blocked' },
                      ]}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {tab === 'capacity' ? (
          <div className="space-y-4">
            <div>
              <div className="hud-text mb-2">Shelter capacity &amp; occupancy</div>
              <div className={clsx('grid gap-1.5', !compact && 'sm:grid-cols-2')}>
                {analysis.shelters.map((s) => (
                  <div key={s.id} className="rounded-xl border border-base-700/60 bg-base-900/50 px-3 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-[12px] text-ink">{s.name}</div>
                        <div className="mt-0.5 font-mono text-[11px] text-ink-muted">
                          {formatNumber(s.occupied)} / {formatNumber(s.capacity)} ·{' '}
                          <span style={{ color: s.available > 0 ? TONE_HEX.low : TONE_HEX.critical }}>
                            {formatNumber(s.available)} free
                          </span>
                        </div>
                      </div>
                      <span className="shrink-0 font-mono text-[11px]" style={{ color: TONE_HEX.info }}>
                        {Math.round(s.occupancyPct * 100)}%
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5">
                      <span className="hud-text">Cap</span>
                      <button
                        type="button"
                        className="btn !px-1.5 !py-1"
                        onClick={() => setCapacity(s.id, s.capacity - 100)}
                        aria-label="Decrease capacity"
                      >
                        <Minus size={12} />
                      </button>
                      <span className="min-w-[44px] text-center font-mono text-[12px] text-ink">
                        {capacityPatch[s.id] ?? SHELTERS.find((x) => x.id === s.id)?.capacity ?? s.capacity}
                      </span>
                      <button
                        type="button"
                        className="btn !px-1.5 !py-1"
                        onClick={() => setCapacity(s.id, s.capacity + 100)}
                        aria-label="Increase capacity"
                      >
                        <Plus size={12} />
                      </button>
                      <span className="ml-2 hud-text">Occ</span>
                      <button
                        type="button"
                        className="btn !px-1.5 !py-1"
                        onClick={() => adjustOccupancy(s.id, -50)}
                        aria-label="Decrease occupancy"
                      >
                        <Minus size={12} />
                      </button>
                      <span className="min-w-[44px] text-center font-mono text-[12px] text-ink">
                        {occupancyPatch[s.id] ?? 0}
                      </span>
                      <button
                        type="button"
                        className="btn !px-1.5 !py-1"
                        onClick={() => adjustOccupancy(s.id, 50)}
                        aria-label="Increase occupancy"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="hud-text mb-2 flex items-center gap-1.5">
                <Hospital size={12} /> Hospital availability
              </div>
              <div className="grid gap-1.5 sm:grid-cols-3">
                {HOSPITALS.map((h) => {
                  const status = hospitalStatusPatch[h.id] ?? h.status;
                  return (
                    <div key={h.id} className="rounded-xl border border-base-700/60 bg-base-900/50 px-3 py-2.5">
                      <div className="truncate text-[12px] text-ink">{h.name}</div>
                      <div className="mt-0.5 text-[10px] text-ink-faint">
                        {h.beds} beds {h.trauma ? '· trauma' : ''} {h.helipad ? '· helipad' : ''}
                      </div>
                      <Segmented
                        className="mt-2"
                        size="sm"
                        value={status}
                        onChange={(v) => setHospitalStatus(h.id, v)}
                        options={[
                          { value: 'operational', label: 'OK' },
                          { value: 'strained', label: 'Strained' },
                          { value: 'offline', label: 'Offline' },
                        ]}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 border-t border-base-700/60 pt-3">
          <span className="hud-text">Active perturbations</span>
          <span className="chip border-base-600/70 bg-base-800/60 text-ink-muted">
            {scenario.rainfallMultiplier !== 1 ? `rain ×${round(scenario.rainfallMultiplier, 2)}` : 'baseline rainfall'}
          </span>
          {scenario.riverSurgeM > 0 ? (
            <span className="chip border-threat-critical/40 bg-threat-critical/10 text-threat-critical">
              <Mountain size={11} /> surge +{scenario.riverSurgeM} m
            </span>
          ) : null}
          {closures.length ? (
            <span className="chip border-threat-elevated/40 bg-threat-elevated/10 text-threat-elevated">
              {closures.length} manual closure(s)
            </span>
          ) : null}
          {Object.keys(capacityPatch).length ? (
            <span className="chip border-threat-info/40 bg-threat-info/10 text-threat-info">
              {Object.keys(capacityPatch).length} capacity override(s)
            </span>
          ) : null}
          {Object.values(hospitalStatusPatch).filter((v) => v === 'offline').length ? (
            <span className="chip border-threat-critical/40 bg-threat-critical/10 text-threat-critical">
              hospital offline
            </span>
          ) : null}
          <button type="button" className="btn btn-ghost ml-auto !px-2.5 !py-1.5 text-[11px]" onClick={resetScenario}>
            <Undo2 size={13} /> Clear all perturbations
          </button>
        </div>
      </div>
    </Panel>
  );
}
