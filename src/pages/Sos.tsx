import { useState } from 'react';
import {
  AlertOctagon,
  BellRing,
  CheckCircle2,
  Clock,
  CloudOff,
  Crosshair,
  MapPin,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  Siren,
  Trash2,
  Wifi,
  X,
} from 'lucide-react';
import clsx from 'clsx';
import type { Analysis } from '../lib/engine/analysis';
import { useReach } from '../lib/store';
import { CATEGORY_LABEL } from '../lib/data/emergencyContacts';
import { Banner, LevelPill, Modal, Panel, PanelHead, Stat, TONE_HEX } from '../components/ui';
import { formatDateTime, relativeTime, uid } from '../lib/geo';
import type { EmergencyContact } from '../lib/types';

const NEEDS = [
  'Rescue / evacuation',
  'Medical help',
  'Trapped — need cutting equipment',
  'No drinking water',
  'No food',
  'Elderly or disabled person with me',
  'Infant or child with me',
  'Accessible transport needed',
  'Medical oxygen / dialysis',
];

export function Sos({ analysis }: { analysis: Analysis }) {
  const connectivity = useReach((s) => s.connectivity);
  const simulateOffline = useReach((s) => s.simulateOffline);
  const raiseSos = useReach((s) => s.raiseSos);
  const cancelSos = useReach((s) => s.cancelSos);
  const flushSosQueue = useReach((s) => s.flushSosQueue);
  const sosAlerts = useReach((s) => s.sosAlerts);
  const setConnectivity = useReach((s) => s.setConnectivity);
  const contacts = useReach((s) => s.contacts);
  const upsertContact = useReach((s) => s.upsertContact);
  const removeContact = useReach((s) => s.removeContact);
  const resetContacts = useReach((s) => s.resetContacts);
  const setFocus = useReach((s) => s.setFocus);
  const setNav = useReach((s) => s.setNav);

  const offline = simulateOffline || connectivity !== 'online';
  const [confirming, setConfirming] = useState(false);
  const [name, setName] = useState('');
  const [people, setPeople] = useState(1);
  const [message, setMessage] = useState('');
  const [needs, setNeeds] = useState<string[]>(['Rescue / evacuation']);
  const [severity, setSeverity] = useState<'critical' | 'urgent' | 'stable'>('critical');
  const [coords, setCoords] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [editing, setEditing] = useState<EmergencyContact | null>(null);

  const queue = sosAlerts.filter((a) => !a.synced);
  const active = sosAlerts.find((a) => a.status !== 'cancelled');

  const detectLocation = () => {
    setLocating(true);
    if (!navigator.geolocation) {
      // fall back to the district centre so an SOS is never blocked by permissions
      setCoords({ lat: 30.152, lng: 78.3, accuracy: 2000 });
      setLocating(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
        setLocating(false);
      },
      () => {
        setCoords({ lat: 30.152, lng: 78.3, accuracy: 3000 });
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const submit = () => {
    const loc = coords ?? { lat: 30.152, lng: 78.3, accuracy: 5000 };
    const id = raiseSos({
      lat: loc.lat,
      lng: loc.lng,
      accuracyM: Math.round(loc.accuracy),
      name: name || 'Unnamed',
      peopleCount: people,
      status: 'submitted',
      message: message || 'Emergency assistance required.',
      needs,
      severity,
    });
    setConfirming(false);
    setCoords(loc);
    setFocus(loc.lat, loc.lng, 15);
    return id;
  };

  const groups = Array.from(new Set(contacts.map((c) => c.category)));

  return (
    <div className="space-y-5">
      {/* ---------- SOS panel ---------- */}
      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <Panel className="relative overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: 'radial-gradient(circle at 50% 0%, rgba(255,59,71,0.14), transparent 65%)' }}
          />
          <div className="relative flex flex-col items-center gap-4 p-6">
            <div className="text-center">
              <h1 className="text-lg font-bold tracking-wide text-ink">Emergency SOS</h1>
              <p className="mx-auto mt-1 max-w-md text-[12.5px] leading-relaxed text-ink-muted">
                Send your location and status to the district control room. If there is no connectivity, your alert is
                stored securely on this device and transmitted automatically the moment a signal returns.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                if (!coords) detectLocation();
                setConfirming(true);
              }}
              className="group relative grid h-44 w-44 place-items-center rounded-full border-2 border-threat-critical/60 transition active:scale-95"
              style={{ background: 'radial-gradient(circle, rgba(255,59,71,0.32), rgba(255,59,71,0.06) 62%, transparent)' }}
            >
              <span className="absolute inset-0 rounded-full border border-threat-critical/40 reach-pulse" />
              <span className="absolute inset-4 rounded-full border border-threat-critical/30 reach-pulse" style={{ animationDelay: '0.6s' }} />
              <span className="flex flex-col items-center gap-1 text-threat-critical">
                <Siren size={38} />
                <span className="text-[19px] font-black tracking-[0.2em]">SOS</span>
                <span className="text-[10px] uppercase tracking-widest">tap to alert</span>
              </span>
            </button>

            <div className="w-full max-w-md rounded-xl border border-base-700/70 bg-base-900/60 px-3 py-2 text-[11px] text-ink-muted">
              Responders are currently operating under{' '}
              <span className="text-ink">{analysis.totals.blockedRoads} closed road(s)</span> and{' '}
              <span className="text-ink">{analysis.totals.isolatedZones} isolated zone(s)</span>. Include the nearest
              landmark in your message so rescue is not routed down a closed corridor.
            </div>

            <div className="flex w-full max-w-md items-center justify-between gap-2 rounded-xl border border-base-700/70 bg-base-900/70 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <MapPin size={15} className="text-threat-info" />
                <div>
                  <div className="hud-text">Your location</div>
                  <div className="font-mono text-[11.5px] text-ink">
                    {coords ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : 'not captured yet'}
                  </div>
                  {coords ? (
                    <div className="text-[10px] text-ink-faint">accuracy ±{Math.round(coords.accuracy)} m</div>
                  ) : null}
                </div>
              </div>
              <button type="button" className="btn !px-2.5 !py-1.5 text-[11px]" onClick={detectLocation}>
                <Crosshair size={12} className={locating ? 'animate-spin' : undefined} />
                {coords ? 'Refresh' : 'Detect'}
              </button>
            </div>

            {active ? (
              <div className="w-full max-w-md rounded-xl border border-threat-critical/40 bg-threat-critical/10 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 text-[12.5px] font-semibold text-threat-critical">
                      <BellRing size={14} /> SOS {active.synced ? 'transmitted' : 'queued offline'}
                    </div>
                    <div className="mt-1 text-[11px] text-ink-muted">
                      {active.peopleCount} people · {active.severity} · raised {relativeTime(active.createdAt)}
                    </div>
                    <div className="mt-1 font-mono text-[10.5px] text-ink-faint">
                      {active.lat.toFixed(5)}, {active.lng.toFixed(5)}
                    </div>
                  </div>
                  <button type="button" className="btn !px-2 !py-1.5 text-[11px]" onClick={() => cancelSos(active.id)}>
                    <X size={12} /> Cancel
                  </button>
                </div>
              </div>
            ) : null}

            <div className="flex w-full max-w-md flex-wrap justify-center gap-2">
              <a href="tel:112" className="btn btn-danger !px-4 !py-2.5 text-[12.5px] font-bold">
                <Phone size={15} /> Call 112 — National Emergency
              </a>
              <a href="tel:108" className="btn !px-4 !py-2.5 text-[12.5px]">
                <Phone size={15} className="text-threat-critical" /> 108 Ambulance
              </a>
              <a href="tel:1078" className="btn !px-4 !py-2.5 text-[12.5px]">
                <Phone size={15} className="text-threat-critical" /> 1078 Control Room
              </a>
            </div>
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel>
            <PanelHead
              title="Connectivity & queue"
              subtitle="Offline-first SOS storage and automatic retransmission"
              icon={offline ? <CloudOff size={15} /> : <Wifi size={15} />}
              tone={offline ? 'high' : 'low'}
              right={
                <button
                  type="button"
                  className="btn !px-2.5 !py-1.5 text-[11px]"
                  onClick={() => {
                    if (offline) {
                      setConnectivity('online');
                      setTimeout(() => flushSosQueue(), 400);
                    } else {
                      setConnectivity('syncing');
                      setTimeout(() => setConnectivity('online'), 900);
                      flushSosQueue();
                    }
                  }}
                >
                  <RefreshCw size={12} /> {offline ? 'Simulate signal return' : 'Force sync now'}
                </button>
              }
            />
            <div className="grid grid-cols-2 gap-2.5 p-4 sm:grid-cols-3">
              <Stat
                label="Queued"
                value={queue.length}
                sub="stored on device"
                tone={queue.length ? 'elevated' : 'low'}
                icon={<CloudOff size={13} />}
              />
              <Stat
                label="Transmitted"
                value={sosAlerts.filter((a) => a.synced).length}
                sub="delivered to control room"
                tone="low"
                icon={<CheckCircle2 size={13} />}
              />
              <Stat
                label="Attempts"
                value={sosAlerts.reduce((a, x) => a + x.attempts, 0)}
                sub="automatic retries"
                tone="info"
                icon={<Send size={13} />}
              />
            </div>
            <div className="space-y-2 px-4 pb-4">
              {sosAlerts.length ? (
                sosAlerts.slice(0, 6).map((a) => (
                  <div key={a.id} className="flex items-center gap-2.5 rounded-xl border border-base-700/60 bg-base-900/50 p-2.5">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: a.synced ? TONE_HEX.low : TONE_HEX.elevated }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[12px] text-ink">{a.name}</span>
                        <LevelPill level={a.severity}>{a.severity.toUpperCase()}</LevelPill>
                      </div>
                      <div className="text-[10.5px] text-ink-faint">
                        {a.peopleCount} people · {formatDateTime(a.createdAt)} ·{' '}
                        {a.synced ? 'delivered' : `queued (${a.attempts} attempt${a.attempts === 1 ? '' : 's'})`}
                      </div>
                      {a.needs.length ? <div className="text-[10px] text-ink-faint">Needs: {a.needs.join(', ')}</div> : null}
                    </div>
                    <button
                      type="button"
                      className="btn !px-2 !py-1"
                      onClick={() => {
                        setFocus(a.lat, a.lng, 15);
                        setNav('map');
                      }}
                    >
                      <MapPin size={12} />
                    </button>
                  </div>
                ))
              ) : (
                <Banner tone="low" title="No alerts raised">
                  Your SOS queue is empty. In a real emergency, tap the SOS dial — it works even with no signal.
                </Banner>
              )}
              <button
                type="button"
                className="btn w-full"
                disabled={!offline && !queue.length}
                onClick={() => flushSosQueue()}
              >
                <RotateCcw size={13} /> Retry queued alerts ({queue.length})
              </button>
            </div>
          </Panel>

          <Panel>
            <PanelHead
              title="What gets transmitted"
              subtitle="Minimal, purposeful data — nothing more than responders need"
              icon={<AlertOctagon size={15} />}
              tone="info"
            />
            <div className="space-y-1.5 p-4 text-[11.5px] text-ink-muted">
              {[
                'Your GPS coordinates and accuracy radius',
                'Number of people with you and any mobility needs',
                'A short free-text description you write',
                'Severity (critical / urgent / stable)',
                'Timestamp, and delivery status of every retry attempt',
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

      {/* ---------- emergency numbers ---------- */}
      <Panel>
        <PanelHead
          title="Emergency number cards"
          subtitle="Configurable contacts — national helplines including air ambulance and NDRF are listed first"
          icon={<Phone size={15} />}
          tone="critical"
          right={
            <div className="flex gap-1.5">
              <button
                type="button"
                className="btn !px-2.5 !py-1.5 text-[11px]"
                onClick={() =>
                  setEditing({
                    id: uid('c'),
                    label: 'New contact',
                    number: '000',
                    category: 'rescue',
                    note: '',
                  })
                }
              >
                <Plus size={12} /> Add contact
              </button>
              <button type="button" className="btn !px-2.5 !py-1.5 text-[11px]" onClick={resetContacts}>
                <RotateCcw size={12} /> Restore defaults
              </button>
            </div>
          }
        />
        <div className="space-y-4 p-4">
          <Banner tone="critical" icon={<Siren size={14} />} title="112 is the single emergency number">
            It reaches police, fire and medical help and works from a locked phone. Use 108 for an ambulance, 1078 for the
            district disaster control room, 011-24363260 / 9711077372 for NDRF, and 9540161344 for air medical evacuation.
          </Banner>
          {groups.map((g) => (
            <div key={g}>
              <div className="hud-text mb-2">{CATEGORY_LABEL[g]}</div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {contacts
                  .filter((c) => c.category === g)
                  .map((c) => (
                    <div
                      key={c.id}
                      className={clsx(
                        'group rounded-xl border p-3 transition',
                        c.primary ? 'border-threat-critical/40 bg-threat-critical/10' : 'border-base-700/70 bg-base-850/60 hover:border-base-600',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-[12px] font-medium text-ink">{c.label}</div>
                          {c.note ? <div className="mt-0.5 text-[10.5px] leading-snug text-ink-faint">{c.note}</div> : null}
                        </div>
                        <div className="flex shrink-0 gap-1 opacity-0 transition group-hover:opacity-100">
                          <button type="button" className="btn !px-1.5 !py-1" onClick={() => setEditing(c)}>
                            <Pencil size={11} />
                          </button>
                          <button
                            type="button"
                            className="btn !px-1.5 !py-1"
                            onClick={() => removeContact(c.id)}
                            disabled={c.category === 'national' || c.category === 'disaster'}
                            title={c.category === 'national' || c.category === 'disaster' ? 'Protected national helpline' : 'Remove'}
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                      <a
                        href={`tel:${c.number.replace(/\s/g, '')}`}
                        className="mt-2 flex items-center gap-2 rounded-lg border border-base-700/60 bg-base-900/60 px-2.5 py-2 transition hover:border-threat-info/50"
                      >
                        <Phone size={13} style={{ color: c.primary ? TONE_HEX.critical : TONE_HEX.info }} />
                        <span className="font-mono text-[15px] font-semibold text-ink">{c.number}</span>
                        <span className="ml-auto text-[10px] uppercase tracking-wider text-ink-faint">call</span>
                      </a>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      {/* ---------- confirm modal ---------- */}
      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        tone="critical"
        width="max-w-xl"
        title="Confirm SOS alert"
        subtitle="This will be sent to the district control room, or queued if you are offline"
        footer={
          <>
            <button type="button" className="btn" onClick={() => setConfirming(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn-danger !px-5" onClick={() => submit()}>
              <Siren size={15} /> Send SOS now
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="hud-text mb-1.5 block">Your name (optional)</label>
              <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="How should rescuers address you?" />
            </div>
            <div>
              <label className="hud-text mb-1.5 block">People with you</label>
              <input
                type="number"
                min={1}
                className="field"
                value={people}
                onChange={(e) => setPeople(Math.max(1, Number(e.target.value)))}
              />
            </div>
          </div>

          <div>
            <label className="hud-text mb-1.5 block">Severity</label>
            <div className="flex gap-2">
              {(['critical', 'urgent', 'stable'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSeverity(s)}
                  className={clsx(
                    'flex-1 rounded-xl border px-3 py-2 text-[12px] capitalize transition',
                    severity === s
                      ? s === 'critical'
                        ? 'border-threat-critical/60 bg-threat-critical/15 text-threat-critical'
                        : s === 'urgent'
                          ? 'border-threat-elevated/60 bg-threat-elevated/15 text-threat-elevated'
                          : 'border-threat-low/60 bg-threat-low/15 text-threat-low'
                      : 'border-base-600/70 text-ink-muted hover:text-ink',
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="hud-text mb-1.5 block">What do you need?</label>
            <div className="flex flex-wrap gap-1.5">
              {NEEDS.map((n) => {
                const on = needs.includes(n);
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setNeeds(on ? needs.filter((x) => x !== n) : [...needs, n])}
                    className={clsx(
                      'rounded-full border px-2.5 py-1 text-[11px] transition',
                      on ? 'border-threat-info/50 bg-threat-info/15 text-threat-info' : 'border-base-600/70 text-ink-muted hover:text-ink',
                    )}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="hud-text mb-1.5 block">Message to responders</label>
            <textarea
              className="field min-h-[80px]"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g. Two adults and one child on the first floor, water at ground level, no power. Nearest landmark is the Old Town Ghat."
            />
          </div>

          <div className="rounded-xl border border-base-700/60 bg-base-900/60 p-3">
            <div className="flex items-center gap-2">
              <Clock size={13} className="text-ink-faint" />
              <span className="text-[11.5px] text-ink-muted">
                {coords
                  ? `Location ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)} (±${Math.round(coords.accuracy)} m)`
                  : 'Location not captured — the district centre will be used as a fallback.'}
              </span>
            </div>
            <div className="mt-1.5 text-[11px]" style={{ color: offline ? TONE_HEX.elevated : TONE_HEX.low }}>
              {offline
                ? 'You are OFFLINE — this alert will be queued on the device and sent automatically when signal returns.'
                : 'You are ONLINE — this alert will be transmitted immediately.'}
            </div>
          </div>
        </div>
      </Modal>

      {/* ---------- contact editor ---------- */}
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        tone="info"
        title="Edit emergency contact"
        width="max-w-lg"
        footer={
          <>
            <button type="button" className="btn" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                if (editing) upsertContact(editing);
                setEditing(null);
              }}
            >
              <CheckCircle2 size={14} /> Save contact
            </button>
          </>
        }
      >
        {editing ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="hud-text mb-1.5 block">Label</label>
              <input className="field" value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })} />
            </div>
            <div>
              <label className="hud-text mb-1.5 block">Number</label>
              <input className="field" value={editing.number} onChange={(e) => setEditing({ ...editing, number: e.target.value })} />
            </div>
            <div>
              <label className="hud-text mb-1.5 block">Category</label>
              <select
                className="field"
                value={editing.category}
                onChange={(e) => setEditing({ ...editing, category: e.target.value as EmergencyContact['category'] })}
              >
                {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="hud-text mb-1.5 block">Note</label>
              <input className="field" value={editing.note ?? ''} onChange={(e) => setEditing({ ...editing, note: e.target.value })} />
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
