import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  Building2,
  CheckCircle2,
  CircleHelp,
  Clock,
  Eye,
  EyeOff,
  FileWarning,
  Filter,
  Hospital,
  Image as ImageIcon,
  Plus,
  Search,
  ShieldQuestion,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react';
import clsx from 'clsx';
import type { Analysis } from '../lib/engine/analysis';
import { useReach } from '../lib/store';
import { ROADS, SHELTERS, ZONE_BY_ID } from '../lib/data/region';
import { Banner, EmptyState, LevelPill, Modal, Panel, PanelHead, Segmented, Stat, TONE_HEX } from '../components/ui';
import { formatDateTime, relativeTime } from '../lib/geo';
import type { Broadcast, CommunityReport, MissingPerson } from '../lib/types';
import { Radio, Settings2 } from 'lucide-react';
import { isSyncConfigured, pullAll, pushWrites, saveConfig } from '../lib/engine/supabaseSync';

const REPORT_KINDS: { value: CommunityReport['kind']; label: string }[] = [
  { value: 'road_closure', label: 'Road closure' },
  { value: 'shelter_capacity', label: 'Shelter capacity change' },
  { value: 'shelter_closure', label: 'Shelter closed' },
  { value: 'new_shelter', label: 'New shelter opened' },
  { value: 'hospital_availability', label: 'Hospital availability' },
  { value: 'hazard', label: 'New hazard' },
];

const KIND_LABEL: Record<string, string> = {
  road_closure: 'Road closure',
  shelter_capacity: 'Shelter capacity',
  shelter_closure: 'Shelter closed',
  new_shelter: 'New shelter',
  hospital_availability: 'Hospital status',
  hazard: 'Hazard',
  missing_person: 'Missing person',
  safe_person: 'Safe person',
};

export function CommunityReports({ analysis }: { analysis: Analysis }) {
  const reports = useReach((s) => s.reports);
  const addReport = useReach((s) => s.addReport);
  const setReportStatus = useReach((s) => s.setReportStatus);
  const addClosure = useReach((s) => s.addClosure);
  const missingPersons = useReach((s) => s.missingPersons);
  const addMissingPerson = useReach((s) => s.addMissingPerson);
  const setMissingStatus = useReach((s) => s.setMissingStatus);
  const addMissingNote = useReach((s) => s.addMissingNote);
  const connectivity = useReach((s) => s.connectivity);
  const simulateOffline = useReach((s) => s.simulateOffline);
  const addReportObj = addReport;

  const [filter, setFilter] = useState<'all' | 'pending' | 'verified'>('all');
  const [kindFilter, setKindFilter] = useState<'all' | CommunityReport['kind']>('all');
  const [newOpen, setNewOpen] = useState(false);
  const [missingOpen, setMissingOpen] = useState(false);
  const [tab, setTab] = useState<'alerts' | 'missing'>('alerts');
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<MissingPerson | null>(null);

  /* ---- new report form ---- */
  const [kind, setKind] = useState<CommunityReport['kind']>('road_closure');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [author, setAuthor] = useState('');
  const [refRoad, setRefRoad] = useState('');
  const [refShelter, setRefShelter] = useState('');
  const [refZone, setRefZone] = useState('');

  /* ---- missing person form ---- */
  const [mpName, setMpName] = useState('');
  const [mpAge, setMpAge] = useState('18-40');
  const [mpDesc, setMpDesc] = useState('');
  const [mpLoc, setMpLoc] = useState('');
  const [mpTime, setMpTime] = useState('');
  const [mpContact, setMpContact] = useState('');
  const [mpVisibility, setMpVisibility] = useState<'responders' | 'public'>('responders');
  const [mpImage, setMpImage] = useState<string | undefined>(undefined);

  const offline = simulateOffline || connectivity !== 'online';

  const filtered = reports.filter(
    (r) =>
      (filter === 'all' || r.status === filter) &&
      (kindFilter === 'all' || r.kind === kindFilter) &&
      (!search || `${r.title} ${r.detail} ${r.author}`.toLowerCase().includes(search.toLowerCase())),
  );

  const stats = useMemo(
    () => ({
      pending: reports.filter((r) => r.status === 'pending').length,
      verified: reports.filter((r) => r.status === 'verified').length,
      missing: missingPersons.filter((m) => m.status === 'missing').length,
      safe: missingPersons.filter((m) => m.status !== 'missing').length,
    }),
    [reports, missingPersons],
  );

  const submitReport = () => {
    addReportObj({
      kind,
      author: author || 'Community member',
      title: title || KIND_LABEL[kind],
      detail: body,
      roadId: refRoad || undefined,
      shelterId: refShelter || undefined,
      zoneId: refZone || undefined,
      trust: 'community',
    });
    setNewOpen(false);
    setTitle('');
    setBody('');
    setRefRoad('');
    setRefShelter('');
    setRefZone('');
  };

  const submitMissing = () => {
    addMissingPerson({
      name: mpName || 'Unnamed',
      ageBand: mpAge,
      description: mpDesc,
      lastSeenLocation: mpLoc,
      lastSeenAt: mpTime ? new Date(mpTime).getTime() : Date.now(),
      contact: mpContact,
      contactVisibility: mpVisibility,
      imageDataUrl: mpImage,
    });
    setMissingOpen(false);
    setMpName('');
    setMpDesc('');
    setMpLoc('');
    setMpTime('');
    setMpContact('');
    setMpImage(undefined);
  };

  return (
    <div className="space-y-5">
      <Panel>
        <PanelHead
          title="Community alert system"
          subtitle="Verified updates and community reports — every entry carries a timestamp and a verification status"
          icon={<Users size={15} />}
          tone="info"
          right={
            <div className="flex flex-wrap gap-1.5">
              <button type="button" className="btn btn-primary !px-3 !py-1.5 text-[11.5px]" onClick={() => setNewOpen(true)}>
                <Plus size={12} /> Report an update
              </button>
              <button type="button" className="btn btn-danger !px-3 !py-1.5 text-[11.5px]" onClick={() => setMissingOpen(true)}>
                <UserX size={12} /> Report missing person
              </button>
            </div>
          }
        />
        <div className="grid gap-2.5 p-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Pending verification" value={stats.pending} sub="community submissions" tone={stats.pending ? 'elevated' : 'low'} icon={<ShieldQuestion size={13} />} />
          <Stat label="Verified updates" value={stats.verified} sub="trusted for operations" tone="low" icon={<BadgeCheck size={13} />} />
          <Stat label="Missing persons" value={stats.missing} sub="open cases on the board" tone={stats.missing ? 'critical' : 'low'} icon={<UserX size={13} />} />
          <Stat label="Reported safe" value={stats.safe} sub="resolved or marked safe" tone="low" icon={<UserCheck size={13} />} />
        </div>
      </Panel>

      <BroadcastsPanel />

      <SyncSettingsPanel />

      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'alerts', label: 'Alert feed', icon: <AlertTriangle size={12} /> },
            { value: 'missing', label: 'Missing / safe persons', icon: <Users size={12} /> },
          ]}
        />
        {tab === 'alerts' ? (
          <>
            <Segmented
              size="sm"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All' },
                { value: 'pending', label: 'Pending' },
                { value: 'verified', label: 'Verified' },
              ]}
            />
            <select
              className="field !w-auto !py-1.5 text-[11.5px]"
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value as typeof kindFilter)}
            >
              <option value="all">All types</option>
              {REPORT_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
            <div className="relative min-w-[200px] flex-1">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input
                className="field !pl-8"
                placeholder="Search reports…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </>
        ) : null}
        {offline ? (
          <span className="chip border-threat-elevated/40 bg-threat-elevated/10 text-threat-elevated">
            <Filter size={11} /> OFFLINE — reports saved locally, sync when signal returns
          </span>
        ) : null}
      </div>

      {tab === 'alerts' ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {filtered.length ? (
            filtered.map((r) => {
              const tone = r.status === 'verified' ? 'low' : r.status === 'pending' ? 'elevated' : r.status === 'rejected' ? 'critical' : 'info';
              return (
                <Panel key={r.id} className="overflow-hidden">
                  <div className="h-[2px] w-full" style={{ background: TONE_HEX[tone as 'low'] }} />
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className="rounded-md border px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider"
                            style={{
                              borderColor: `${TONE_HEX[tone as 'low']}55`,
                              color: TONE_HEX[tone as 'low'],
                              background: `${TONE_HEX[tone as 'low']}14`,
                            }}
                          >
                            {KIND_LABEL[r.kind]}
                          </span>
                          <LevelPill level={r.status === 'verified' ? 'low' : r.status === 'pending' ? 'elevated' : 'critical'}>
                            {r.status.toUpperCase()}
                          </LevelPill>
                          <span className="chip border-base-600/70 bg-base-800/60 text-ink-faint">
                            {r.trust === 'official' ? 'OFFICIAL SOURCE' : r.trust === 'verified' ? 'VERIFIED' : 'COMMUNITY'}
                          </span>
                        </div>
                        <h3 className="mt-2 text-[13px] font-semibold text-ink">{r.title}</h3>
                        <p className="mt-1 text-[11.5px] leading-relaxed text-ink-muted">{r.detail}</p>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[10.5px] text-ink-faint">
                      <span>{r.author}</span>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1">
                        <Clock size={10} /> {formatDateTime(r.createdAt)} ({relativeTime(r.createdAt)})
                      </span>
                      {r.roadId ? <span className="chip border-base-600/70 text-ink-muted">{r.roadId}</span> : null}
                      {r.shelterId ? (
                        <span className="chip border-base-600/70 text-ink-muted">
                          {SHELTERS.find((s) => s.id === r.shelterId)?.name}
                        </span>
                      ) : null}
                      {r.zoneId ? (
                        <span className="chip border-base-600/70 text-ink-muted">{ZONE_BY_ID[r.zoneId]?.name}</span>
                      ) : null}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5 border-t border-base-700/50 pt-3">
                      {r.status === 'pending' ? (
                        <>
                          <button
                            type="button"
                            className="btn btn-primary !px-3 !py-1.5 text-[11px]"
                            onClick={() => {
                              setReportStatus(r.id, 'verified');
                              if (r.kind === 'road_closure' && r.roadId) {
                                addClosure(r.roadId, r.title, 'blocked');
                              }
                            }}
                          >
                            <BadgeCheck size={12} /> Verify &amp; apply
                          </button>
                          <button
                            type="button"
                            className="btn !px-3 !py-1.5 text-[11px]"
                            onClick={() => setReportStatus(r.id, 'rejected')}
                          >
                            <CircleHelp size={12} /> Reject
                          </button>
                        </>
                      ) : null}
                      {r.status === 'verified' ? (
                        <button
                          type="button"
                          className="btn !px-3 !py-1.5 text-[11px]"
                          onClick={() => setReportStatus(r.id, 'resolved')}
                        >
                          <CheckCircle2 size={12} /> Mark resolved
                        </button>
                      ) : null}
                      {r.status === 'rejected' || r.status === 'resolved' ? (
                        <button
                          type="button"
                          className="btn !px-3 !py-1.5 text-[11px]"
                          onClick={() => setReportStatus(r.id, 'pending')}
                        >
                          Reopen
                        </button>
                      ) : null}
                    </div>
                  </div>
                </Panel>
              );
            })
          ) : (
            <div className="lg:col-span-2">
              <EmptyState title="No reports match this filter" hint="Try a different status or type, or file a new report." />
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <Banner tone="info" icon={<EyeOff size={14} />} title="Personal information is minimised by default">
            Contact details are marked <strong className="text-ink">responders only</strong> unless the reporter explicitly
            chooses otherwise. Public views show only the name, age band, description and last-known location.
          </Banner>

          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {missingPersons.map((m) => {
              const tone = m.status === 'missing' ? 'critical' : m.status === 'safe' ? 'elevated' : 'low';
              return (
                <Panel key={m.id} className="overflow-hidden">
                  <div className="h-[3px] w-full" style={{ background: TONE_HEX[tone as 'critical'] }} />
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        {m.imageDataUrl ? (
                          <img src={m.imageDataUrl} alt={m.name} className="h-12 w-12 rounded-lg object-cover" />
                        ) : (
                          <span
                            className="grid h-12 w-12 place-items-center rounded-lg border text-[15px] font-bold"
                            style={{ borderColor: `${TONE_HEX[tone as 'critical']}55`, color: TONE_HEX[tone as 'critical'], background: `${TONE_HEX[tone as 'critical']}14` }}
                          >
                            {m.name.slice(0, 1).toUpperCase()}
                          </span>
                        )}
                        <div>
                          <div className="text-[13.5px] font-semibold text-ink">{m.name}</div>
                          <div className="text-[10.5px] text-ink-faint">
                            {m.ageBand} · last seen {relativeTime(m.lastSeenAt)}
                          </div>
                        </div>
                      </div>
                      <LevelPill level={tone}>{m.status.toUpperCase()}</LevelPill>
                    </div>

                    <p className="mt-3 text-[11.5px] leading-relaxed text-ink-muted">{m.description}</p>

                    <div className="mt-3 space-y-1.5 text-[11px]">
                      <div className="flex items-start gap-2">
                        <span className="text-ink-faint">Last known location</span>
                        <span className="ml-auto text-right text-ink">{m.lastSeenLocation}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-ink-faint">Last seen</span>
                        <span className="ml-auto text-right text-ink">{formatDateTime(m.lastSeenAt)}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-ink-faint">Contact</span>
                        <span className="ml-auto inline-flex items-center gap-1 text-right text-ink">
                          {m.contactVisibility === 'responders' ? <EyeOff size={10} /> : <Eye size={10} />}
                          {m.contactVisibility === 'responders' ? 'Responders only' : m.contact}
                        </span>
                      </div>
                    </div>

                    {m.notes.length ? (
                      <div className="mt-3 rounded-lg border border-base-700/60 bg-base-900/50 p-2.5">
                        <div className="hud-text mb-1">Case log</div>
                        <ul className="space-y-1 text-[10.5px] text-ink-muted">
                          {m.notes.slice(-3).map((n, i) => (
                            <li key={i}>· {n}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    <div className="mt-3 flex flex-wrap gap-1.5 border-t border-base-700/50 pt-3">
                      <button type="button" className="btn !px-2.5 !py-1.5 text-[11px]" onClick={() => setMissingStatus(m.id, 'safe')}>
                        <UserCheck size={12} /> Reported safe
                      </button>
                      <button type="button" className="btn btn-primary !px-2.5 !py-1.5 text-[11px]" onClick={() => setMissingStatus(m.id, 'found')}>
                        <CheckCircle2 size={12} /> Found
                      </button>
                      <button type="button" className="btn !px-2.5 !py-1.5 text-[11px]" onClick={() => setDetail(m)}>
                        Manage
                      </button>
                    </div>
                  </div>
                </Panel>
              );
            })}
          </div>
        </div>
      )}

      {/* ---------- new report modal ---------- */}
      <Modal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        tone="info"
        title="Report a community update"
        subtitle="Community reports are marked PENDING until a coordinator verifies them"
        width="max-w-2xl"
        footer={
          <>
            <button type="button" className="btn" onClick={() => setNewOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={submitReport}>
              <Plus size={14} /> Submit report
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="hud-text mb-1.5 block">Report type</label>
              <select className="field" value={kind} onChange={(e) => setKind(e.target.value as CommunityReport['kind'])}>
                {REPORT_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="hud-text mb-1.5 block">Your name or role</label>
              <input className="field" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="e.g. Ward 4 volunteer" />
            </div>
          </div>

          <div>
            <label className="hud-text mb-1.5 block">Summary</label>
            <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="One line that responders can act on" />
          </div>

          <div>
            <label className="hud-text mb-1.5 block">Details</label>
            <textarea className="field min-h-[90px]" value={body} onChange={(e) => setBody(e.target.value)} placeholder="What did you see, where exactly, and when?" />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="hud-text mb-1.5 block">Road (optional)</label>
              <select className="field" value={refRoad} onChange={(e) => setRefRoad(e.target.value)}>
                <option value="">—</option>
                {ROADS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.id} {r.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="hud-text mb-1.5 block">Shelter (optional)</label>
              <select className="field" value={refShelter} onChange={(e) => setRefShelter(e.target.value)}>
                <option value="">—</option>
                {SHELTERS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="hud-text mb-1.5 block">Zone (optional)</label>
              <select className="field" value={refZone} onChange={(e) => setRefZone(e.target.value)}>
                <option value="">—</option>
                {analysis.zones.map((z) => (
                  <option key={z.zoneId} value={z.zoneId}>
                    {ZONE_BY_ID[z.zoneId]?.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <Banner tone={offline ? 'elevated' : 'info'} icon={<Building2 size={13} />}>
            {offline
              ? 'You are offline. This report is stored on the device and will be synchronised automatically when connectivity returns.'
              : 'This report will be submitted for verification immediately.'}
          </Banner>
        </div>
      </Modal>

      {/* ---------- missing person modal ---------- */}
      <Modal
        open={missingOpen}
        onClose={() => setMissingOpen(false)}
        tone="critical"
        title="Report a missing person"
        subtitle="File immediately — do not wait 24 hours during a disaster"
        width="max-w-2xl"
        footer={
          <>
            <button type="button" className="btn" onClick={() => setMissingOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn-danger" onClick={submitMissing}>
              <FileWarning size={14} /> File report
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="hud-text mb-1.5 block">Full name</label>
              <input className="field" value={mpName} onChange={(e) => setMpName(e.target.value)} />
            </div>
            <div>
              <label className="hud-text mb-1.5 block">Age band</label>
              <select className="field" value={mpAge} onChange={(e) => setMpAge(e.target.value)}>
                {['0-12', '13-17', '18-40', '41-59', '60+'].map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="hud-text mb-1.5 block">Description</label>
            <textarea
              className="field min-h-[80px]"
              value={mpDesc}
              onChange={(e) => setMpDesc(e.target.value)}
              placeholder="Clothing, distinguishing features, medical needs, mobility aids, languages spoken."
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="hud-text mb-1.5 block">Last known location</label>
              <input className="field" value={mpLoc} onChange={(e) => setMpLoc(e.target.value)} placeholder="Landmark, street or shelter" />
            </div>
            <div>
              <label className="hud-text mb-1.5 block">Time last seen</label>
              <input type="datetime-local" className="field" value={mpTime} onChange={(e) => setMpTime(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="hud-text mb-1.5 block">Contact number</label>
              <input className="field" value={mpContact} onChange={(e) => setMpContact(e.target.value)} placeholder="+91 …" />
            </div>
            <div>
              <label className="hud-text mb-1.5 block">Who can see this contact?</label>
              <Segmented
                value={mpVisibility}
                onChange={setMpVisibility}
                options={[
                  { value: 'responders', label: 'Responders only' },
                  { value: 'public', label: 'Public' },
                ]}
              />
            </div>
          </div>

          <div>
            <label className="hud-text mb-1.5 block">Photo (optional)</label>
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-base-600/80 bg-base-900/50 px-3 py-3 text-[11.5px] text-ink-muted transition hover:border-base-600">
              <ImageIcon size={14} />
              {mpImage ? 'Photo attached — click to replace' : 'Attach a recent photograph'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => setMpImage(String(reader.result));
                  reader.readAsDataURL(file);
                }}
              />
            </label>
            {mpImage ? <img src={mpImage} alt="Preview" className="mt-2 h-24 rounded-lg object-cover" /> : null}
          </div>

          <Banner tone="critical" icon={<Clock size={13} />} title="Also inform authorities">
            Report to the police control room <strong className="text-ink">100</strong> or the district disaster control room{' '}
            <strong className="text-ink">1078</strong>. REACH circulates the record on the emergency board, but official
            search operations need a police record.
          </Banner>
        </div>
      </Modal>

      {/* ---------- case management modal ---------- */}
      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        tone="elevated"
        title={detail ? `Case: ${detail.name}` : 'Case'}
        subtitle="Update status, add notes and control what is publicly visible"
        footer={
          <button type="button" className="btn" onClick={() => setDetail(null)}>
            Close
          </button>
        }
      >
        {detail ? (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <button type="button" className="btn" onClick={() => setMissingStatus(detail.id, 'missing')}>
                <UserX size={13} /> Missing
              </button>
              <button type="button" className="btn" onClick={() => setMissingStatus(detail.id, 'safe')}>
                <UserCheck size={13} /> Reported safe
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setMissingStatus(detail.id, 'found')}>
                <CheckCircle2 size={13} /> Found
              </button>
            </div>
            <div>
              <label className="hud-text mb-1.5 block">Add a case note</label>
              <NoteAdder onAdd={(note) => addMissingNote(detail.id, note)} />
            </div>
            <div className="rounded-xl border border-base-700/60 bg-base-900/50 p-3">
              <div className="hud-text mb-2">Full case log</div>
              <ul className="space-y-1 text-[11px] text-ink-muted">
                {detail.notes.map((n, i) => (
                  <li key={i}>· {n}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-base-700/60 bg-base-900/50 p-3 text-[11px] text-ink-muted">
              Searches: {analysis.actions.slice(0, 2).map((a) => a.title).join(' · ')}
            </div>
            <Banner tone="info" icon={<Hospital size={13} />}>
              If the person needs medicine, oxygen or dialysis, say so in a note — it changes the priority of the rescue
              allocation.
            </Banner>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function NoteAdder({ onAdd }: { onAdd: (note: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <div className="flex gap-2">
      <input className="field flex-1" value={value} onChange={(e) => setValue(e.target.value)} placeholder="e.g. Sighting near Northgate bypass" />
      <button
        type="button"
        className={clsx('btn', !value && 'opacity-50')}
        onClick={() => {
          if (!value.trim()) return;
          onAdd(value.trim());
          setValue('');
        }}
      >
        Add
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Broadcasts: management → citizen live news feed                      */
/* ------------------------------------------------------------------ */

function BroadcastsPanel() {
  const broadcasts = useReach((s) => s.broadcasts);
  const addBroadcast = useReach((s) => s.addBroadcast);
  const portal = useReach((s) => s.portal);
  const coordinatorUnlocked = useReach((s) => s.coordinatorUnlocked);
  const syncStatus = useReach((s) => s.syncStatus);
  const [open, setOpen] = useState(false);
  const [severity, setSeverity] = useState<'info' | 'warning' | 'critical'>('warning');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [area, setArea] = useState('');

  const canPost = portal === 'management' || coordinatorUnlocked;

  const post = () => {
    if (!title.trim()) return;
    addBroadcast({
      author: 'Local coordinator',
      severity,
      title: title.trim(),
      body: body.trim(),
      area: area.trim() || undefined,
    });
    setTitle('');
    setBody('');
    setArea('');
    setOpen(false);
  };

  const toneOf = (s: Broadcast['severity']) =>
    s === 'critical' ? TONE_HEX.critical : s === 'warning' ? TONE_HEX.elevated : TONE_HEX.info;

  return (
    <Panel>
      <PanelHead
        title="Live news & official broadcasts"
        subtitle={
          isSyncConfigured()
            ? syncStatus === 'connected'
              ? 'Shared live across all devices through Supabase realtime'
              : 'Shared backend configured — connecting…'
            : 'Local to this device — connect Supabase below to share across devices'
        }
        icon={<Radio size={15} />}
        tone="info"
        right={
          canPost ? (
            <button type="button" className="btn btn-primary !px-3 !py-1.5 text-[11.5px]" onClick={() => setOpen(true)}>
              <Radio size={12} /> Post broadcast
            </button>
          ) : null
        }
      />
      <div className="space-y-2 p-4">
        {broadcasts.length ? (
          broadcasts.slice(0, 8).map((b) => (
            <div key={b.id} className="rounded-xl border border-base-700/60 bg-base-850/60 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="chip text-[10px]"
                  style={{ color: toneOf(b.severity), borderColor: `${toneOf(b.severity)}55`, background: `${toneOf(b.severity)}14` }}
                >
                  {b.severity.toUpperCase()}
                </span>
                <span className="text-[12.5px] font-semibold text-ink">{b.title}</span>
                <span className="ml-auto text-[10.5px] text-ink-faint">
                  {b.author} · {relativeTime(b.at)} {b.synced ? '' : '· queued'}
                </span>
              </div>
              {b.body ? <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">{b.body}</p> : null}
              {b.area ? <p className="mt-1 text-[10.5px] text-ink-faint">Area: {b.area}</p> : null}
            </div>
          ))
        ) : (
          <p className="text-[12px] text-ink-faint">No broadcasts yet. Coordinators' official updates will appear here as a live news feed.</p>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Post an official broadcast" subtitle="Citizens see this instantly as a news item" tone="critical" width="max-w-lg">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {(['info', 'warning', 'critical'] as const).map((s) => (
              <button key={s} type="button" className={clsx('btn !px-3 !py-1.5 text-[11.5px]', severity === s && 'btn-primary')} onClick={() => setSeverity(s)}>
                {s.toUpperCase()}
              </button>
            ))}
          </div>
          <input className="field" placeholder="Headline, e.g. Boats staged at Old Town ghat" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea className="field min-h-[90px]" placeholder="What people should do, where to go, what to avoid…" value={body} onChange={(e) => setBody(e.target.value)} />
          <input className="field" placeholder="Area (optional), e.g. Old Town / Riverbend" value={area} onChange={(e) => setArea(e.target.value)} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={post} disabled={!title.trim()}>
              <Radio size={14} /> Publish
            </button>
          </div>
        </div>
      </Modal>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Supabase shared-sync settings                                        */
/* ------------------------------------------------------------------ */

export function SyncSettingsPanel() {
  const supabase = useReach((s) => s.supabase);
  const setSupabaseConfig = useReach((s) => s.setSupabaseConfig);
  const syncStatus = useReach((s) => s.syncStatus);
  const connectivity = useReach((s) => s.connectivity);
  const simulateOffline = useReach((s) => s.simulateOffline);
  const reports = useReach((s) => s.reports);
  const missingPersons = useReach((s) => s.missingPersons);
  const broadcasts = useReach((s) => s.broadcasts);
  const [url, setUrl] = useState(supabase?.url ?? '');
  const [key, setKey] = useState(supabase?.anonKey ?? '');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const online = connectivity === 'online' && !simulateOffline;

  const connect = () => {
    if (!url.trim() || !key.trim()) return;
    const cfg = { url: url.trim(), anonKey: key.trim() };
    saveConfig(cfg);
    setSupabaseConfig(cfg);
    setMsg('Connected. Reports, missing persons and broadcasts now sync across devices in realtime.');
  };

  const disconnect = () => {
    saveConfig(null);
    setSupabaseConfig(null);
    setMsg('Disconnected. REACH keeps working offline-first on this device.');
  };

  const flushNow = async () => {
    setBusy(true);
    setMsg('');
    const res = await pushWrites({ reports, missingPersons, broadcasts });
    setBusy(false);
    setMsg(res.ok ? 'Pushed local records to the shared backend.' : `Push failed: ${res.error ?? 'unknown error'}`);
  };

  const pullNow = async () => {
    setBusy(true);
    setMsg('');
    try {
      const res = await pullAll();
      setMsg(`Remote mirror holds ${res.reports.length} report(s), ${res.missingPersons.length} missing-person record(s), ${res.broadcasts.length} broadcast(s).`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Pull failed');
    }
    setBusy(false);
  };

  return (
    <Panel>
      <PanelHead
        title="Shared sync (Supabase)"
        subtitle="Optional — links the citizen and management portals across devices"
        icon={<Settings2 size={15} />}
        tone="info"
        right={
          <span
            className="chip"
            style={{
              color: isSyncConfigured() ? (syncStatus === 'error' ? TONE_HEX.elevated : TONE_HEX.low) : TONE_HEX.neutral,
              borderColor: `${isSyncConfigured() ? (syncStatus === 'error' ? TONE_HEX.elevated : TONE_HEX.low) : TONE_HEX.neutral}55`,
            }}
          >
            {isSyncConfigured() ? (syncStatus === 'connected' ? 'LIVE SYNC' : syncStatus === 'error' ? 'ERROR' : 'CONFIGURED') : 'OFF'}
          </span>
        }
      />
      <div className="space-y-3 p-4">
        {isSyncConfigured() ? (
          <>
            <p className="text-[11.5px] leading-relaxed text-ink-muted">
              Connected to <span className="font-mono text-ink">{supabase?.url}</span>. New reports, missing-person updates and broadcasts from any
              device appear here instantly; your writes push automatically when online.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn !py-1.5 text-[11.5px]" disabled={busy || !online} onClick={() => void flushNow()}>
                Push local records now
              </button>
              <button type="button" className="btn !py-1.5 text-[11.5px]" disabled={busy || !online} onClick={() => void pullNow()}>
                Check remote mirror
              </button>
              <button type="button" className="btn !py-1.5 text-[11.5px]" onClick={disconnect}>
                Disconnect
              </button>
            </div>
          </>
        ) : (
          <>
            <input className="field" placeholder="Project URL, e.g. https://abcd.supabase.co" value={url} onChange={(e) => setUrl(e.target.value)} />
            <input className="field" type="password" placeholder="anon public key (never the service_role key)" value={key} onChange={(e) => setKey(e.target.value)} />
            <button type="button" className="btn btn-primary" onClick={connect} disabled={!url.trim() || !key.trim()}>
              Connect shared backend
            </button>
            <p className="text-[10.5px] leading-relaxed text-ink-faint">
              Create a free project at supabase.com, run <span className="font-mono">supabase/schema.sql</span> in its SQL editor, then paste the
              Project URL and anon key here. Full steps live in <span className="font-mono">supabase/README.md</span>. Without this, REACH stays
              fully functional offline-first on this device.
            </p>
          </>
        )}
        {msg ? <p className="text-[11px] text-ink-muted">{msg}</p> : null}
      </div>
    </Panel>
  );
}
