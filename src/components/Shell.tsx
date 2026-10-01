import { useState } from 'react';
import clsx from 'clsx';
import {
  AlertTriangle,
  Bot,
  Building2,
  Clock,
  LayoutDashboard,
  Map as MapIcon,
  Menu,
  Navigation,
  Phone,
  Radio,
  RefreshCw,
  ShieldCheck,
  Siren,
  Thermometer,
  Users,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { useReach, type NavKey } from '../lib/store';
import { CATEGORY_LABEL } from '../lib/data/emergencyContacts';
import { LOCATION_BY_ID } from '../lib/data/india';
import { relativeTime } from '../lib/geo';
import { Banner, Modal, TONE_HEX } from './ui';
import type { Analysis } from '../lib/engine/analysis';

export const NAV_ITEMS: {
  key: NavKey;
  label: string;
  icon: typeof MapIcon;
  blurb: string;
  group: string;
}[] = [
  { key: 'home', label: 'Start here', icon: ShieldCheck, blurb: 'Pick what you need', group: '' },
  { key: 'command', label: 'Command Center', icon: LayoutDashboard, blurb: 'The whole picture', group: 'Respond' },
  { key: 'map', label: 'Live Map', icon: MapIcon, blurb: 'Hazards & directions', group: 'Respond' },
  { key: 'saferoute', label: 'SafeRoute', icon: Navigation, blurb: 'Least-risk route', group: 'Act' },
  { key: 'timeline', label: 'Timeline', icon: Clock, blurb: 'Time machine', group: 'Act' },
  { key: 'shelters', label: 'Shelters', icon: Building2, blurb: 'Space & access', group: 'Act' },
  { key: 'sos', label: 'SOS & contacts', icon: Siren, blurb: 'Get help now', group: 'Act' },
  { key: 'community', label: 'Community reports', icon: Users, blurb: 'Alerts & missing people', group: 'Support' },
  { key: 'assistant', label: 'REACH Assistant', icon: Bot, blurb: 'Ask anything', group: 'Support' },
  { key: 'preparedness', label: 'Preparedness', icon: ShieldCheck, blurb: 'Before / during / after', group: 'Support' },
];

/* ------------------------------------------------------------------ */
/* Connectivity                                                       */
/* ------------------------------------------------------------------ */

export function ConnectivityPill({ compact = false }: { compact?: boolean }) {
  const connectivity = useReach((s) => s.connectivity);
  const simulateOffline = useReach((s) => s.simulateOffline);
  const setSimulateOffline = useReach((s) => s.setSimulateOffline);
  const lastSyncAt = useReach((s) => s.lastSyncAt);
  const sosQueue = useReach((s) => s.sosAlerts.filter((a) => !a.synced).length);

  const effective = simulateOffline ? 'offline' : connectivity;
  const tone = effective === 'online' ? 'low' : effective === 'syncing' ? 'elevated' : 'high';
  const hex = TONE_HEX[tone as 'low' | 'elevated' | 'high'];
  const Icon = effective === 'online' ? Wifi : effective === 'syncing' ? RefreshCw : WifiOff;

  return (
    <button
      type="button"
      onClick={() => setSimulateOffline(!simulateOffline)}
      title={
        simulateOffline
          ? 'Offline disaster mode is ON (simulated) — click to restore connectivity'
          : 'Click to simulate losing connectivity and test offline disaster mode'
      }
      className={clsx('chip transition hover:brightness-110', effective === 'syncing' && 'animate-pulse', compact && '!px-2 !py-1')}
      style={{ color: hex, borderColor: `${hex}55`, background: `${hex}15` }}
    >
      <Icon size={12} className={effective === 'syncing' ? 'animate-spin' : undefined} />
      <span className="font-medium">{effective.toUpperCase()}</span>
      {!compact && lastSyncAt ? <span className="text-ink-faint">· {relativeTime(lastSyncAt)}</span> : null}
      {sosQueue > 0 ? (
        <span className="ml-0.5 rounded-full bg-threat-critical/25 px-1.5 text-[10px] text-threat-critical">
          {sosQueue}
        </span>
      ) : null}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Sidebar                                                            */
/* ------------------------------------------------------------------ */

export function Sidebar({ analysis }: { analysis: Analysis }) {
  const nav = useReach((s) => s.nav);
  const setNav = useReach((s) => s.setNav);
  const sidebarOpen = useReach((s) => s.sidebarOpen);
  const setSidebarOpen = useReach((s) => s.setSidebarOpen);
  const readiness = analysis.totals.readiness;

  return (
    <>
      {sidebarOpen ? (
        <div className="fixed inset-0 z-[600] bg-black/60 lg:hidden" onClick={() => setSidebarOpen(false)} />
      ) : null}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-[700] flex w-[248px] flex-col border-r border-base-800 bg-base-900 transition-transform duration-300 lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center gap-2.5 px-4 py-4">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-threat-info/15 text-threat-info">
            <Radio size={17} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold tracking-[0.16em] text-ink">REACH</div>
            <p className="truncate text-[10px] text-ink-faint">Disaster Response · India</p>
          </div>
          <button
            type="button"
            className="btn btn-ghost !px-2 !py-1.5 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation"
          >
            <X size={16} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 pb-3">
          {NAV_ITEMS.map((item, i) => {
            const active = nav === item.key;
            const Icon = item.icon;
            const newGroup = item.group && item.group !== NAV_ITEMS[i - 1]?.group;
            return (
              <div key={item.key}>
                {newGroup ? <div className="px-3 pb-1 pt-4 text-[10px] font-medium text-ink-faint">{item.group}</div> : null}
                <button
                  type="button"
                  onClick={() => setNav(item.key)}
                  className={clsx(
                    'group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition',
                    active ? 'bg-threat-info/12 text-threat-info' : 'text-ink-muted hover:bg-base-850 hover:text-ink',
                  )}
                >
                  <Icon size={17} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{item.label}</span>
                  {active ? <span className="h-1.5 w-1.5 rounded-full bg-threat-info" /> : null}
                </button>
              </div>
            );
          })}
        </nav>

        <div className="border-t border-base-800 px-4 py-3">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-ink-faint">System readiness</span>
            <span
              className="font-mono"
              style={{ color: readiness >= 70 ? TONE_HEX.low : readiness >= 45 ? TONE_HEX.elevated : TONE_HEX.critical }}
            >
              {readiness}%
            </span>
          </div>
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/6">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${readiness}%`,
                background: readiness >= 70 ? TONE_HEX.low : readiness >= 45 ? TONE_HEX.elevated : TONE_HEX.critical,
              }}
            />
          </div>
          <div className="mt-2.5">
            <ConnectivityPill />
          </div>
        </div>
      </aside>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Emergency numbers                                                  */
/* ------------------------------------------------------------------ */

function EmergencyNumbersModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const contacts = useReach((s) => s.contacts);
  const groups = Array.from(new Set(contacts.map((c) => c.category)));

  return (
    <Modal
      open={open}
      onClose={onClose}
      tone="critical"
      title="Emergency numbers"
      subtitle="Saved on this device — dial any of these with no internet"
      width="max-w-3xl"
      footer={
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="space-y-4">
        <Banner tone="critical" icon={<AlertTriangle size={15} />} title="If life is in immediate danger, call 112 first">
          Say your location, how many people, and whether anyone is injured. If a road is blocked, tell the operator so
          rescue is not sent down a closed corridor.
        </Banner>
        {groups.map((g) => (
          <div key={g}>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
              {CATEGORY_LABEL[g]}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {contacts
                .filter((c) => c.category === g)
                .map((c) => (
                  <a
                    key={c.id}
                    href={`tel:${c.number.replace(/\s/g, '')}`}
                    className={clsx(
                      'group flex items-center gap-3 rounded-xl border px-3.5 py-3 transition',
                      c.primary
                        ? 'border-threat-critical/40 bg-threat-critical/8 hover:border-threat-critical/70'
                        : 'border-base-800 bg-base-850 hover:border-base-700',
                    )}
                  >
                    <span
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-lg"
                      style={{
                        color: c.primary ? TONE_HEX.critical : TONE_HEX.info,
                        background: c.primary ? `${TONE_HEX.critical}18` : `${TONE_HEX.info}18`,
                      }}
                    >
                      <Phone size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-medium text-ink">{c.label}</span>
                      <span
                        className="block font-mono text-[15px] font-semibold"
                        style={{ color: c.primary ? TONE_HEX.critical : TONE_HEX.info }}
                      >
                        {c.number}
                      </span>
                      {c.note ? (
                        <span className="mt-0.5 block text-[10.5px] leading-snug text-ink-faint">{c.note}</span>
                      ) : null}
                    </span>
                  </a>
                ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Top bar                                                            */
/* ------------------------------------------------------------------ */

export function TopBar({ analysis }: { analysis: Analysis }) {
  const setSidebarOpen = useReach((s) => s.setSidebarOpen);
  const emergencyMode = useReach((s) => s.emergencyMode);
  const toggleEmergencyMode = useReach((s) => s.toggleEmergencyMode);
  const setNav = useReach((s) => s.setNav);
  const nav = useReach((s) => s.nav);
  const hourOffset = useReach((s) => s.hourOffset);
  const weather = useReach((s) => s.weather);
  const locationId = useReach((s) => s.liveLocationId);
  const [numbersOpen, setNumbersOpen] = useState(false);

  const current = NAV_ITEMS.find((n) => n.key === nav);
  const loc = LOCATION_BY_ID[locationId];

  return (
    <>
      <header className="sticky top-0 z-[500] border-b border-base-800 bg-base-900/90 backdrop-blur">
        <div className="flex items-center gap-2 px-3 py-2.5 sm:px-4">
          <button
            type="button"
            className="btn btn-ghost !px-2 !py-1.5 lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation"
          >
            <Menu size={18} />
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-[15px] font-semibold text-ink">{current?.label ?? 'REACH'}</h1>
              {analysis.totals.isolatedZones > 0 ? (
                <span className="chip shrink-0 border-threat-critical/50 bg-threat-critical/15 text-threat-critical">
                  {analysis.totals.isolatedZones} isolated
                </span>
              ) : null}
            </div>
            <p className="hidden truncate text-[11px] text-ink-faint sm:block">
              {current?.blurb ?? ''}
              {hourOffset !== 0 ? ` · viewing T${hourOffset > 0 ? '+' : '−'}${Math.abs(hourOffset)}h` : ''}
            </p>
          </div>

          {/* live weather quick chip */}
          <button
            type="button"
            onClick={() => setNav('map')}
            className="hidden items-center gap-2 rounded-xl border border-base-800 bg-base-850 px-2.5 py-1.5 text-left transition hover:border-base-700 sm:flex"
            title="Open the live weather watch"
          >
            <Thermometer size={14} className="text-threat-info" />
            <span className="min-w-0">
              <span className="block truncate text-[11.5px] font-medium text-ink">
                {loc?.name ?? 'Location'}
                {weather ? ` · ${Math.round(weather.current.temperatureC)}°C` : ''}
              </span>
              <span className="block truncate text-[10px] text-ink-faint">
                {weather
                  ? `${weather.current.condition} · fire ${Math.round(weather.fireDanger * 100)}/100`
                  : 'loading live weather…'}
              </span>
            </span>
          </button>

          <div className="flex shrink-0 items-center gap-1.5">
            <ConnectivityPill compact />
            <button type="button" className="btn !px-2.5 !py-1.5" onClick={() => setNumbersOpen(true)} title="Emergency helplines">
              <Phone size={15} className="text-threat-critical" />
              <span className="hidden sm:inline">Helplines</span>
            </button>
            <button
              type="button"
              onClick={() => {
                toggleEmergencyMode();
                setNav('map');
              }}
              className={clsx('btn !px-2.5 !py-1.5', emergencyMode && 'btn-danger')}
              title="Toggle Emergency Response Mode"
            >
              <Siren size={15} className={emergencyMode ? 'animate-pulse' : undefined} />
              <span className="hidden md:inline">{emergencyMode ? 'Emergency ON' : 'Emergency mode'}</span>
            </button>
          </div>
        </div>
      </header>
      <EmergencyNumbersModal open={numbersOpen} onClose={() => setNumbersOpen(false)} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Emergency dock                                                     */
/* ------------------------------------------------------------------ */

export function EmergencyDock() {
  const setNav = useReach((s) => s.setNav);
  const sosAlerts = useReach((s) => s.sosAlerts);
  const [open, setOpen] = useState(false);
  const active = sosAlerts.find((a) => a.status !== 'cancelled');

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[450] flex justify-center px-3 pb-3 lg:pl-[256px]">
        <div className="pointer-events-auto relative flex w-full max-w-2xl items-center gap-1.5 rounded-2xl border border-base-800 bg-base-900/95 p-1.5 shadow-panel backdrop-blur">
          <button
            type="button"
            onClick={() => setNav('sos')}
            className="btn btn-danger !flex-1 !justify-center !py-2.5 font-bold sm:!flex-none sm:!px-6"
          >
            <Siren size={16} className="animate-pulse" />
            SOS
          </button>
          <button type="button" onClick={() => setOpen(true)} className="btn !flex-1 !justify-center !py-2.5 sm:!flex-none sm:!px-4">
            <Phone size={15} className="text-threat-critical" />
            <span className="truncate">
              <span className="hidden sm:inline">Helplines · </span>112
            </span>
          </button>
          <button
            type="button"
            onClick={() => setNav('saferoute')}
            className="btn hidden !justify-center !py-2.5 sm:!inline-flex sm:!px-4"
          >
            <Navigation size={15} />
            Safe route
          </button>
          <button
            type="button"
            onClick={() => setNav('assistant')}
            className="btn hidden !justify-center !py-2.5 lg:!inline-flex lg:!px-4"
          >
            <Bot size={15} />
            Ask REACH
          </button>
          {active ? (
            <span className="absolute -top-9 left-1/2 -translate-x-1/2 rounded-full border border-threat-critical/50 bg-threat-critical/20 px-3 py-1 text-[11px] text-threat-critical backdrop-blur">
              Active SOS · {active.synced ? 'transmitted' : 'queued offline'} · {active.peopleCount} people
            </span>
          ) : null}
        </div>
      </div>
      <EmergencyNumbersModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
