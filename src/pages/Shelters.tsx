import { useMemo, useState } from 'react';
import {
  Accessibility,
  BadgeCheck,
  Building2,
  Check,
  Cross,
  Minus,
  Phone,
  Plus,
  Send,
  Users,
  Wrench,
} from 'lucide-react';
import clsx from 'clsx';
import type { Analysis } from '../lib/engine/analysis';
import { useReach } from '../lib/store';
import { HOSPITALS, SHELTERS, ZONE_BY_ID } from '../lib/data/region';
import { Bar, Banner, LevelPill, Modal, Panel, PanelHead, Segmented, Stat, TONE_HEX } from '../components/ui';
import { formatKm, formatNumber, haversineKm, relativeTime } from '../lib/geo';

export function Shelters({ analysis }: { analysis: Analysis }) {
  const selectedZoneId = useReach((s) => s.selectedZoneId) ?? 'z_riverbend';
  const setSelectedShelterId = useReach((s) => s.setSelectedShelterId);
  const selectedShelterId = useReach((s) => s.selectedShelterId);
  const setCapacity = useReach((s) => s.setCapacity);
  const adjustOccupancy = useReach((s) => s.adjustOccupancy);
  const addReport = useReach((s) => s.addReport);
  const reports = useReach((s) => s.reports);
  const setHospitalStatus = useReach((s) => s.setHospitalStatus);
  const hospitalStatusPatch = useReach((s) => s.hospitalStatusPatch);
  const setFocus = useReach((s) => s.setFocus);
  const setNav = useReach((s) => s.setNav);

  const originZone = ZONE_BY_ID[selectedZoneId];

  const [managerOpen, setManagerOpen] = useState<string | null>(null);
  const [newCapacity, setNewCapacity] = useState(0);
  const [managerName, setManagerName] = useState('');
  const [suggestOpen, setSuggestOpen] = useState<string | null>(null);
  const [suggestValue, setSuggestValue] = useState(0);
  const [suggestNote, setSuggestNote] = useState('');

  const rows = useMemo(
    () =>
      analysis.shelters
        .map((s) => ({
          ...s,
          distanceKm: originZone ? haversineKm(originZone.lat, originZone.lng, s.lat, s.lng) : null,
        }))
        .sort((a, b) => b.available - a.available),
    [analysis.shelters, originZone],
  );

  const pendingShelterReports = reports.filter(
    (r) => r.kind === 'shelter_capacity' && r.status === 'pending',
  );

  const capacityChanges = analysis.shelters.filter((s) => {
    const original = SHELTERS.find((x) => x.id === s.id)?.capacity ?? s.capacity;
    return original !== s.capacity;
  });

  const detail = selectedShelterId ? rows.find((s) => s.id === selectedShelterId) : null;

  return (
    <div className="space-y-5">
      <Panel>
        <PanelHead
          title="Intelligent shelter system"
          subtitle="Capacity, distance, accessibility, risk and facilities — recalculated against the live road network"
          icon={<Building2 size={15} />}
          tone="low"
          right={
            <div className="flex items-center gap-2">
              <span className="hud-text">Distance from</span>
              <select
                className="field !w-auto !py-1.5 text-[11.5px]"
                value={selectedZoneId}
                onChange={(e) => {
                  useReach.getState().setSelectedZoneId(e.target.value);
                }}
              >
                {analysis.zones.map((z) => (
                  <option key={z.zoneId} value={z.zoneId}>
                    {ZONE_BY_ID[z.zoneId]?.name}
                  </option>
                ))}
              </select>
            </div>
          }
        />
        <div className="grid gap-2.5 p-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="Total capacity"
            value={formatNumber(analysis.shelters.reduce((a, s) => a + s.capacity, 0))}
            sub={`${analysis.shelters.length} sites`}
            tone="info"
          />
          <Stat
            label="Occupied"
            value={formatNumber(analysis.shelters.reduce((a, s) => a + s.occupied, 0))}
            sub={`${Math.round(
              (analysis.shelters.reduce((a, s) => a + s.occupied, 0) /
                Math.max(1, analysis.shelters.reduce((a, s) => a + s.capacity, 0))) *
                100,
            )}% utilisation`}
            tone="elevated"
          />
          <Stat
            label="Available spaces"
            value={formatNumber(analysis.totals.shelterCapacityAvailable)}
            sub={`demand ${formatNumber(analysis.totals.shelterDemand)}`}
            tone={analysis.totals.shelterCapacityAvailable > analysis.totals.shelterDemand ? 'low' : 'critical'}
          />
          <Stat
            label="Capacity changes applied"
            value={capacityChanges.length}
            sub={`${pendingShelterReports.length} community suggestion(s) pending`}
            tone={capacityChanges.length ? 'accent' : 'neutral'}
          />
        </div>
      </Panel>

      {analysis.totals.shelterGap > 0 ? (
        <Banner tone="critical" title={`Capacity shortfall of ${formatNumber(analysis.totals.shelterGap)} spaces`}>
          Demand from residents needing assistance exceeds available capacity. Open additional sites, raise capacity at
          existing shelters, or plan movement out of the district. Every capacity update recalculates the evacuation
          assignment immediately.
        </Banner>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {rows.map((s) => {
          const tone = s.available <= 0 ? 'critical' : s.occupancyPct > 0.85 ? 'high' : s.occupancyPct > 0.6 ? 'elevated' : 'low';
          const hex = TONE_HEX[tone];
          const original = SHELTERS.find((x) => x.id === s.id)?.capacity ?? s.capacity;
          const changed = original !== s.capacity;
          return (
            <Panel key={s.id} className="overflow-hidden">
              <div className="h-[3px] w-full" style={{ background: hex }} />
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-[14px] font-semibold text-ink">{s.name}</h3>
                    <p className="mt-0.5 text-[10.5px] text-ink-faint">
                      {ZONE_BY_ID[s.zoneId]?.name} · {s.distanceKm != null ? formatKm(s.distanceKm) : '—'} from{' '}
                      {originZone?.name}
                    </p>
                  </div>
                  <LevelPill level={tone}>{s.available <= 0 ? 'FULL' : `${formatNumber(s.available)} FREE`}</LevelPill>
                </div>

                <div className="mt-3">
                  <div className="flex items-end justify-between">
                    <div>
                      <div className="hud-text">Occupancy</div>
                      <div className="font-mono text-[17px] text-ink">
                        {formatNumber(s.occupied)}
                        <span className="text-[13px] text-ink-faint"> / {formatNumber(s.capacity)}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="hud-text">Fill rate</div>
                      <div className="font-mono text-[13px]" style={{ color: TONE_HEX.info }}>
                        +{Math.round(s.fillingRate)}/hr
                      </div>
                    </div>
                  </div>
                  <Bar className="mt-2" value={s.occupancyPct} tone={tone} height={7} />
                  {changed ? (
                    <div className="mt-2 flex items-center gap-1.5 text-[10.5px]" style={{ color: TONE_HEX.accent }}>
                      <BadgeCheck size={11} /> Capacity updated {original} → {s.capacity}
                    </div>
                  ) : null}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-1.5 text-[10.5px]">
                  <div className="rounded-lg border border-base-700/60 bg-base-900/50 px-2 py-1.5">
                    <div className="text-ink-faint">Risk level</div>
                    <div className="mt-0.5 font-mono" style={{ color: TONE_HEX[s.risk as 'low'] }}>
                      {Math.round(s.riskScore)}/100
                    </div>
                  </div>
                  <div className="rounded-lg border border-base-700/60 bg-base-900/50 px-2 py-1.5">
                    <div className="text-ink-faint">Accessibility</div>
                    <div className="mt-0.5 flex items-center gap-1 text-ink">
                      <Accessibility size={10} />
                      {s.accessibility}
                    </div>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="hud-text mb-1.5">Facilities</div>
                  <div className="flex flex-wrap gap-1">
                    {s.facilities.map((f) => (
                      <span key={f} className="rounded-md border border-base-600/70 bg-base-800/60 px-1.5 py-0.5 text-[10px] text-ink-muted">
                        {f}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-3">
                  <div className="hud-text mb-1.5">Zones routed here ({s.reachableZoneIds.length})</div>
                  <div className="flex flex-wrap gap-1">
                    {s.reachableZoneIds.length ? (
                      s.reachableZoneIds.map((z) => (
                        <span key={z} className="rounded-md border border-threat-info/30 bg-threat-info/10 px-1.5 py-0.5 text-[10px] text-threat-info">
                          {ZONE_BY_ID[z]?.name}
                        </span>
                      ))
                    ) : (
                      <span className="text-[10.5px] text-ink-faint">No zones currently assigned</span>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-1.5 border-t border-base-700/50 pt-3 text-[10.5px] text-ink-faint">
                  <Users size={11} /> {s.manager}
                  <a href={`tel:${s.contact.replace(/\s/g, '')}`} className="ml-auto inline-flex items-center gap-1 text-ink-muted hover:text-ink">
                    <Phone size={10} /> {s.contact}
                  </a>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    className="btn flex-1 !py-2 text-[11px]"
                    onClick={() => {
                      setSelectedShelterId(s.id);
                      setFocus(s.lat, s.lng, 15);
                      setNav('map');
                    }}
                  >
                    Locate
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary flex-1 !py-2 text-[11px]"
                    onClick={() => {
                      setManagerOpen(s.id);
                      setNewCapacity(s.capacity);
                      setManagerName(s.manager);
                    }}
                  >
                    <Wrench size={12} /> Update
                  </button>
                  <button
                    type="button"
                    className="btn flex-1 !py-2 text-[11px]"
                    onClick={() => {
                      setSuggestOpen(s.id);
                      setSuggestValue(s.capacity);
                      setSuggestNote('');
                    }}
                  >
                    <Send size={12} /> Suggest
                  </button>
                </div>

                <div className="mt-2 flex gap-1.5">
                  <button
                    type="button"
                    className="btn flex-1 !py-1.5 text-[10.5px]"
                    onClick={() => adjustOccupancy(s.id, -25)}
                  >
                    <Minus size={11} /> 25 checked out
                  </button>
                  <button
                    type="button"
                    className="btn flex-1 !py-1.5 text-[10.5px]"
                    onClick={() => adjustOccupancy(s.id, 25)}
                  >
                    <Plus size={11} /> 25 checked in
                  </button>
                </div>
              </div>
            </Panel>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHead
            title="Hospital availability"
            subtitle="Reported and verified status — feeds the decision engine's medical actions"
            icon={<Cross size={15} />}
            tone="critical"
          />
          <div className="space-y-2 p-4">
            {analysis.hospitals.map((h) => {
              const original = HOSPITALS.find((x) => x.id === h.id);
              return (
                <div key={h.id} className="rounded-xl border border-base-700/60 bg-base-900/50 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[12.5px] font-medium text-ink">{h.name}</div>
                      <div className="text-[10.5px] text-ink-faint">
                        {h.beds} beds {h.trauma ? '· trauma centre' : ''} {h.helipad ? '· helipad' : ''}
                      </div>
                      <div className="mt-1 text-[11px]" style={{ color: h.reachable ? TONE_HEX.low : TONE_HEX.critical }}>
                        {h.note}
                      </div>
                    </div>
                    <Segmented
                      size="sm"
                      value={hospitalStatusPatch[h.id] ?? original?.status ?? 'operational'}
                      onChange={(v) => setHospitalStatus(h.id, v)}
                      options={[
                        { value: 'operational', label: 'OK' },
                        { value: 'strained', label: 'Strained' },
                        { value: 'offline', label: 'Offline' },
                      ]}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel>
          <PanelHead
            title="Shelter change feed"
            subtitle="Verified updates and community suggestions awaiting verification"
            icon={<BadgeCheck size={15} />}
            tone="accent"
          />
          <div className="space-y-2 p-4">
            {capacityChanges.length ? (
              capacityChanges.map((s) => (
                <div key={s.id} className="rounded-xl border border-threat-accent/30 bg-threat-accent/10 p-3">
                  <div className="flex items-start gap-2">
                    <BadgeCheck size={14} className="mt-0.5 shrink-0" style={{ color: TONE_HEX.accent }} />
                    <div>
                      <div className="text-[12px] text-ink">
                        Shelter {s.id.toUpperCase()} capacity {SHELTERS.find((x) => x.id === s.id)?.capacity} →{' '}
                        {formatNumber(s.capacity)}
                      </div>
                      <div className="text-[10.5px] text-ink-faint">
                        Applied by authorized manager · evacuation recommendations recalculated
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-[11.5px] text-ink-faint">No capacity overrides applied in this session.</p>
            )}

            {pendingShelterReports.length ? (
              pendingShelterReports.map((r) => (
                <div key={r.id} className="rounded-xl border border-threat-elevated/30 bg-threat-elevated/10 p-3">
                  <div className="flex items-start gap-2">
                    <Send size={14} className="mt-0.5 shrink-0" style={{ color: TONE_HEX.elevated }} />
                    <div className="min-w-0">
                      <div className="text-[12px] text-ink">{r.title}</div>
                      <div className="text-[10.5px] text-ink-muted">{r.detail}</div>
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-ink-faint">
                        <span>{r.author}</span>
                        <span>· {relativeTime(r.createdAt)}</span>
                        <span className="chip border-threat-elevated/40 text-threat-elevated">PENDING VERIFICATION</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-[11.5px] text-ink-faint">No community capacity suggestions pending.</p>
            )}
          </div>
        </Panel>
      </div>

      {detail ? (
        <Panel>
          <PanelHead
            title={`${detail.name} — allocation detail`}
            subtitle="Which zones route here, at what distance and with what risk"
            icon={<Building2 size={15} />}
            tone="info"
          />
          <div className="grid gap-2.5 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {detail.reachableZoneIds.length ? (
              detail.reachableZoneIds.map((zid) => {
                const z = ZONE_BY_ID[zid];
                const zr = analysis.zones.find((x) => x.zoneId === zid);
                const plan = analysis.plans[zid];
                return (
                  <div key={zid} className="rounded-xl border border-base-700/60 bg-base-900/50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[12px] text-ink">{z?.name}</span>
                      <span className="font-mono text-[11px]" style={{ color: TONE_HEX.info }}>
                        {z ? formatKm(haversineKm(z.lat, z.lng, detail.lat, detail.lng)) : '—'}
                      </span>
                    </div>
                    <div className="mt-1.5 text-[10.5px] text-ink-faint">
                      {formatNumber(zr?.populationNeedingAssistance ?? 0)} resident(s) need assistance
                    </div>
                    {plan?.route?.reachable ? (
                      <div className="mt-1.5 text-[10.5px] text-ink-muted">
                        Least-risk route: {formatKm(plan.route.distanceKm)} · exposure{' '}
                        {Math.round(plan.route.riskScore)}%
                        {plan.overflow ? <span className="ml-1 text-threat-high">· overflow</span> : null}
                      </div>
                    ) : null}
                  </div>
                );
              })
            ) : (
              <p className="text-[11.5px] text-ink-faint">No zones are currently routed to this shelter.</p>
            )}
          </div>
        </Panel>
      ) : null}

      {/* ---------- manager update modal ---------- */}
      <Modal
        open={!!managerOpen}
        onClose={() => setManagerOpen(null)}
        tone="accent"
        title="Authorized capacity update"
        subtitle="Shelter managers can raise or lower capacity; the system recalculates allocation instantly"
        footer={
          <>
            <button type="button" className="btn" onClick={() => setManagerOpen(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                if (managerOpen) setCapacity(managerOpen, newCapacity);
                setManagerOpen(null);
              }}
            >
              <Check size={14} /> Apply capacity update
            </button>
          </>
        }
      >
        {managerOpen ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-base-700/60 bg-base-900/60 p-3">
              <div className="hud-text mb-1">Shelter</div>
              <div className="text-[13px] text-ink">{analysis.shelters.find((s) => s.id === managerOpen)?.name}</div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="hud-text mb-1.5 block">Manager / authority</label>
                <input className="field" value={managerName} onChange={(e) => setManagerName(e.target.value)} />
              </div>
              <div>
                <label className="hud-text mb-1.5 block">New capacity (people)</label>
                <input
                  type="number"
                  className="field"
                  value={newCapacity}
                  min={50}
                  step={50}
                  onChange={(e) => setNewCapacity(Number(e.target.value))}
                />
              </div>
            </div>
            <Banner tone="info" icon={<Wrench size={13} />}>
              Changing capacity re-runs shelter allocation, the priority action list and the domino chain. The change is
              pinned above as a verified capacity override with its previous value recorded.
            </Banner>
          </div>
        ) : null}
      </Modal>

      {/* ---------- community suggestion modal ---------- */}
      <Modal
        open={!!suggestOpen}
        onClose={() => setSuggestOpen(null)}
        tone="elevated"
        title="Suggest / report a shelter capacity change"
        subtitle="Community reports are marked pending until a coordinator verifies them"
        footer={
          <>
            <button type="button" className="btn" onClick={() => setSuggestOpen(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                const s = analysis.shelters.find((x) => x.id === suggestOpen);
                if (s) {
                  addReport({
                    kind: 'shelter_capacity',
                    author: 'Community member',
                    title: `${s.name} capacity reported as ${formatNumber(suggestValue)}`,
                    detail: suggestNote || 'Community suggestion — awaiting coordinator verification.',
                    shelterId: s.id,
                    trust: 'community',
                  });
                }
                setSuggestOpen(null);
              }}
            >
              <Send size={14} /> Submit for verification
            </button>
          </>
        }
      >
        {suggestOpen ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-base-700/60 bg-base-900/60 p-3">
              <div className="hud-text mb-1">Shelter</div>
              <div className="text-[13px] text-ink">
                {analysis.shelters.find((s) => s.id === suggestOpen)?.name} — current capacity{' '}
                {formatNumber(analysis.shelters.find((s) => s.id === suggestOpen)?.capacity ?? 0)}
              </div>
            </div>
            <div>
              <label className="hud-text mb-1.5 block">Suggested capacity (people)</label>
              <input
                type="number"
                className="field"
                value={suggestValue}
                min={0}
                step={50}
                onChange={(e) => setSuggestValue(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="hud-text mb-1.5 block">What did you observe?</label>
              <textarea
                className="field min-h-[90px]"
                placeholder="e.g. Two extra halls opened, water tanks refilled, ~150 more people can be accommodated."
                value={suggestNote}
                onChange={(e) => setSuggestNote(e.target.value)}
              />
            </div>
            <div className={clsx('rounded-xl border border-threat-elevated/30 bg-threat-elevated/10 p-3 text-[11.5px] text-ink-muted')}>
              Suggested values are <strong className="text-threat-elevated">not applied automatically</strong>. They appear
              as PENDING VERIFICATION on the community board and in this feed until a coordinator confirms them.
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
