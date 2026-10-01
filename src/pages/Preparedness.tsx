import { useMemo, useState } from 'react';
import {
  BookOpenCheck,
  Check,
  ClipboardList,
  CloudRain,
  Download,
  Flame,
  Mountain,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import clsx from 'clsx';
import type { Analysis } from '../lib/engine/analysis';
import { CHECKLISTS, HAZARD_LABEL, PHASE_LABEL } from '../lib/data/preparedness';
import { useReach } from '../lib/store';
import { Bar, Banner, Panel, PanelHead, Segmented, Stat, TONE_HEX } from '../components/ui';
import { ZONE_BY_ID } from '../lib/data/region';
import type { HazardKind } from '../lib/types';

const PHASE_TONE = { before: 'info', during: 'critical', after: 'low' } as const;

export function Preparedness({ analysis }: { analysis: Analysis }) {
  const progress = useReach((s) => s.checklistProgress);
  const toggleTask = useReach((s) => s.toggleTask);
  const resetChecklist = useReach((s) => s.resetChecklist);
  const selectedZoneId = useReach((s) => s.selectedZoneId);
  const setNav = useReach((s) => s.setNav);
  const offline = useReach((s) => s.simulateOffline || s.connectivity !== 'online');

  const [hazard, setHazard] = useState<HazardKind | 'general'>('flood');
  const [phase, setPhase] = useState<'before' | 'during' | 'after'>('before');

  const active = CHECKLISTS.find((c) => c.hazard === hazard && c.phase === phase) ?? CHECKLISTS[0];

  const zone = selectedZoneId ? ZONE_BY_ID[selectedZoneId] : null;
  const zoneRisk = selectedZoneId ? analysis.zones.find((z) => z.zoneId === selectedZoneId) : null;

  const completion = useMemo(() => {
    const total = CHECKLISTS.reduce((a, c) => a + c.tasks.length, 0);
    const done = CHECKLISTS.reduce((a, c) => a + c.tasks.filter((t) => progress[t.id]).length, 0);
    return { total, done, pct: total ? done / total : 0 };
  }, [progress]);

  const activeDone = active.tasks.filter((t) => progress[t.id]).length;

  return (
    <div className="space-y-5">
      <Panel>
        <PanelHead
          title="Precaution &amp; preparedness center"
          subtitle="Personalised checklists for before, during and after each hazard — all available offline"
          icon={<ShieldCheck size={15} />}
          tone="low"
          right={
            <span
              className="chip"
              style={{
                color: offline ? TONE_HEX.elevated : TONE_HEX.low,
                borderColor: offline ? `${TONE_HEX.elevated}55` : `${TONE_HEX.low}55`,
                background: offline ? `${TONE_HEX.elevated}18` : `${TONE_HEX.low}18`,
              }}
            >
              <Download size={11} /> {offline ? 'STORED ON DEVICE' : 'SYNCED'}
            </span>
          }
        />
        <div className="grid gap-2.5 p-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="Overall readiness"
            value={`${Math.round(completion.pct * 100)}%`}
            sub={`${completion.done} of ${completion.total} tasks complete`}
            tone={completion.pct > 0.66 ? 'low' : completion.pct > 0.33 ? 'elevated' : 'high'}
            icon={<ClipboardList size={13} />}
          />
          <Stat
            label={`${PHASE_LABEL[phase]} ${HAZARD_LABEL[hazard]}`}
            value={`${activeDone}/${active.tasks.length}`}
            sub="current checklist progress"
            tone="info"
            icon={<BookOpenCheck size={13} />}
          />
          <Stat
            label="Your zone"
            value={zone?.name ?? 'Not selected'}
            sub={
              zoneRisk
                ? `risk ${Math.round(zoneRisk.risk)}/100 — ${zoneRisk.level}`
                : 'select a zone on the map'
            }
            tone={(zoneRisk?.level as 'low') ?? 'neutral'}
            icon={<Users size={13} />}
          />
          <Stat
            label="Recommended now"
            value={
              analysis.hazard.firePressure > analysis.hazard.floodPressure &&
              analysis.hazard.firePressure > analysis.hazard.landslidePressure
                ? 'Fire prep'
                : analysis.hazard.floodPressure > analysis.hazard.landslidePressure
                  ? 'Flood prep'
                  : 'Landslide prep'
            }
            sub="based on the dominant hazard pressure"
            tone="accent"
            icon={<Sparkles size={13} />}
          />
        </div>
        <div className="border-t border-base-700/60 px-4 py-3">
          <div className="flex items-center justify-between text-[11.5px]">
            <span className="text-ink-muted">Checklist completion across all hazards and phases</span>
            <span className="font-mono text-ink">{Math.round(completion.pct * 100)}%</span>
          </div>
          <Bar className="mt-2" value={completion.pct} tone={completion.pct > 0.66 ? 'low' : 'elevated'} height={7} />
        </div>
      </Panel>

      {zoneRisk && (zoneRisk.level === 'high' || zoneRisk.level === 'critical') ? (
        <Banner
          tone={zoneRisk.level === 'critical' ? 'critical' : 'high'}
          icon={<CloudRain size={14} />}
          title={`${zone?.name} is at ${zoneRisk.level} risk right now`}
        >
          {zoneRisk.flood > zoneRisk.landslide
            ? 'Flood conditions dominate. Prioritise the During-Flood checklist and confirm your shelter destination.'
            : 'Slope failure conditions dominate. Prioritise the During-Landslide checklist and keep clear of cut slopes and hill roads.'}
          <button type="button" className="ml-2 underline decoration-dotted hover:text-ink" onClick={() => setNav('saferoute')}>
            Check your least-risk route
          </button>
        </Banner>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          value={hazard}
          onChange={setHazard}
          options={[
            { value: 'flood', label: 'Flood', icon: <CloudRain size={12} /> },
            { value: 'landslide', label: 'Landslide', icon: <Mountain size={12} /> },
            { value: 'fire', label: 'Fire', icon: <Flame size={12} /> },
            { value: 'general', label: 'All hazards', icon: <ShieldCheck size={12} /> },
          ]}
        />
        <Segmented
          value={phase}
          onChange={setPhase}
          options={[
            { value: 'before', label: 'Before' },
            { value: 'during', label: 'During' },
            { value: 'after', label: 'After' },
          ]}
        />
        <button
          type="button"
          className="btn !px-3 !py-1.5 text-[11.5px]"
          onClick={() => resetChecklist(active.tasks.map((t) => t.id))}
        >
          <RotateCcw size={12} /> Reset this checklist
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel>
          <PanelHead
            title={active.title}
            subtitle={`${activeDone} of ${active.tasks.length} complete · tap any item to mark it done`}
            icon={<ClipboardList size={15} />}
            tone={PHASE_TONE[active.phase]}
            right={
              <span
                className="font-mono text-[13px]"
                style={{ color: PHASE_TONE[active.phase] === 'critical' ? TONE_HEX.critical : TONE_HEX.info }}
              >
                {Math.round((activeDone / active.tasks.length) * 100)}%
              </span>
            }
          />
          <div className="p-4">
            <Bar
              className="mb-4"
              value={activeDone / active.tasks.length}
              tone={PHASE_TONE[active.phase] === 'critical' ? 'critical' : PHASE_TONE[active.phase] === 'low' ? 'low' : 'info'}
              height={6}
            />
            <div className="space-y-2">
              {active.tasks.map((t) => {
                const done = !!progress[t.id];
                const tone = PHASE_TONE[active.phase];
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleTask(t.id)}
                    className={clsx(
                      'flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition',
                      done
                        ? 'border-threat-low/40 bg-threat-low/10'
                        : 'border-base-700/60 bg-base-900/40 hover:border-base-600 hover:bg-base-800/60',
                    )}
                  >
                    <span
                      className={clsx(
                        'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border transition',
                        done ? 'border-threat-low/60 bg-threat-low/25' : 'border-base-600',
                      )}
                    >
                      {done ? <Check size={12} style={{ color: TONE_HEX.low }} /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={clsx(
                          'block text-[12.5px] leading-relaxed',
                          done ? 'text-ink-muted line-through decoration-threat-low/40' : 'text-ink',
                        )}
                      >
                        {t.text}
                      </span>
                      {t.hint ? <span className="mt-0.5 block text-[10.5px] text-ink-faint">{t.hint}</span> : null}
                    </span>
                    <span
                      className="mt-0.5 shrink-0 text-[9.5px] uppercase tracking-wider"
                      style={{ color: tone === 'critical' ? TONE_HEX.critical : tone === 'low' ? TONE_HEX.low : TONE_HEX.info }}
                    >
                      {PHASE_LABEL[active.phase]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel>
            <PanelHead
              title="All checklists"
              subtitle="Jump to any hazard and phase"
              icon={<BookOpenCheck size={15} />}
              tone="info"
            />
            <div className="space-y-1.5 p-4">
              {CHECKLISTS.map((c) => {
                const done = c.tasks.filter((t) => progress[t.id]).length;
                const pct = done / c.tasks.length;
                const isActive = c.id === active.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setHazard(c.hazard);
                      setPhase(c.phase);
                    }}
                    className={clsx(
                      'w-full rounded-xl border px-3 py-2.5 text-left transition',
                      isActive ? 'border-threat-info/40 bg-threat-info/10' : 'border-base-700/60 bg-base-900/40 hover:border-base-600',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block truncate text-[12px] text-ink">{c.title}</span>
                        <span className="block text-[10px] text-ink-faint">
                          {HAZARD_LABEL[c.hazard]} · {PHASE_LABEL[c.phase]} · {done}/{c.tasks.length}
                        </span>
                      </span>
                      <span
                        className="shrink-0 font-mono text-[11px]"
                        style={{ color: pct === 1 ? TONE_HEX.low : pct > 0 ? TONE_HEX.elevated : TONE_HEX.neutral }}
                      >
                        {Math.round(pct * 100)}%
                      </span>
                    </div>
                    <Bar
                      className="mt-2"
                      value={pct}
                      tone={pct === 1 ? 'low' : pct > 0 ? 'elevated' : 'neutral'}
                      height={4}
                    />
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel>
            <PanelHead
              title="Go-bag essentials"
              subtitle="Pack this before the event, not during it"
              icon={<ShieldCheck size={15} />}
              tone="moderate"
            />
            <div className="space-y-1.5 p-4 text-[11.5px] text-ink-muted">
              {[
                'Drinking water — 4 litres per person per day, 3 days',
                'Dry food that needs no cooking',
                'Torch, spare batteries, power bank, whistle',
                '7 days of prescription medicines with copies',
                'ID documents in a waterproof pouch, plus cash',
                'First-aid kit, ORS sachets, sanitary items',
                'Warm layer, rain protection, sturdy footwear',
                'Phone numbers written on paper as a backup',
              ].map((t) => (
                <div key={t} className="flex gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full" style={{ background: TONE_HEX.moderate }} />
                  {t}
                </div>
              ))}
            </div>
          </Panel>

          <Panel>
            <PanelHead title="Family plan" subtitle="Agree this before the network fails" icon={<Users size={15} />} tone="info" />
            <div className="space-y-1.5 p-4 text-[11.5px] text-ink-muted">
              {[
                'Choose a meeting point inside the district and one outside it',
                'Nominate an out-of-district contact who relays messages',
                'Decide who assists elderly, disabled or infant members',
                'Confirm who collects children from school',
                'Assign someone to handle pets and livestock',
                'Save 112, 108, 1078 and air rescue numbers on every phone',
              ].map((t) => (
                <div key={t} className="flex gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full" style={{ background: TONE_HEX.info }} />
                  {t}
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
