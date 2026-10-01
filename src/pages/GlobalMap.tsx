import { Circle, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { useEffect, useMemo, useState } from 'react';
import {
  EVENT_KIND_META,
  RING_LABEL,
  SOURCE_LABEL,
  assessProximity,
  estimateFloodFlow,
  groupByKind,
  rankForNews,
  ringFor,
} from '../lib/engine/globalFeeds';
import type { GlobalEvent, ProximityAssessment } from '../lib/types';
import { useReach } from '../lib/store';
import { haversineKm } from '../lib/geo';
import { BadgeCheck, Droplets, Home, MapPin, Radio, ShieldAlert, Siren, TriangleAlert } from 'lucide-react';
import clsx from 'clsx';
import { Panel, PanelHead, TONE_HEX } from '../components/ui';

const ringColor: Record<string, string> = {
  severe: '#ff3b47',
  high: '#ff7a29',
  watch: '#ffb020',
  far: '#7c8aa5',
};

function eventIcon(kind: keyof typeof EVENT_KIND_META, severity: number, selected: boolean) {
  const meta = EVENT_KIND_META[kind];
  const size = 22 + Math.round((severity / 100) * 10);
  return L.divIcon({
    className: 'reach-marker',
    html: `<div style="width:${size}px;height:${size}px;display:grid;place-items:center;border-radius:50%;
      background:${meta.color}${selected ? 'F2' : 'D9'};border:${selected ? 3 : 1.5}px solid #fff;
      box-shadow:0 0 ${8 + severity / 10}px ${meta.color};font-size:11px;color:#0b0e14;font-weight:800">
      ${kind === 'earthquake' ? '◎' : kind === 'flood' ? '≈' : kind === 'cyclone' ? '🌀' : kind === 'wildfire' ? '🔥' : kind === 'volcano' ? '▲' : '•'}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function HomePicker() {
  const setHomePin = useReach((s) => s.setHomePin);
  const picking = useReach((s) => s.pickingHome);
  const setPickingHome = useReach((s) => s.setPickingHome);
  const map = useMap();
  useEffect(() => {
    map.getContainer().style.cursor = picking ? 'crosshair' : '';
  }, [picking, map]);
  useMapEvents({
    click(e) {
      if (!picking) return;
      setHomePin({ lat: e.latlng.lat, lng: e.latlng.lng, label: `${e.latlng.lat.toFixed(3)}°, ${e.latlng.lng.toFixed(3)}°` });
      setPickingHome(false);
    },
  });
  return null;
}

/** Draws the 2/5/10 km decision rings and the flood-flow arrow around home. */
function Rings({ home, floodBearing }: { home: { lat: number; lng: number }; floodBearing: number | null }) {
  return (
    <>
      {([2, 5, 10] as const).map((km) => (
        <Circle
          key={km}
          center={[home.lat, home.lng]}
          radius={km * 1000}
          pathOptions={{
            color: ringColor[km === 2 ? 'severe' : km === 5 ? 'high' : 'watch'],
            weight: 1.5,
            opacity: 0.8,
            fillOpacity: 0.04,
            dashArray: km === 10 ? '6 6' : undefined,
          }}
        />
      ))}
      {floodBearing != null ? <FlowArrow home={home} bearingDeg={floodBearing} /> : null}
    </>
  );
}

function FlowArrow({ home, bearingDeg: deg }: { home: { lat: number; lng: number }; bearingDeg: number }) {
  // 8 km arrow from home toward the downhill bearing
  const rad = (deg * Math.PI) / 180;
  const dLat = (8 * Math.cos(rad)) / 111;
  const dLng = (8 * Math.sin(rad)) / (111 * Math.cos((home.lat * Math.PI) / 180) || 1);
  return (
    <Polyline
      positions={[
        [home.lat, home.lng],
        [home.lat + dLat, home.lng + dLng],
      ]}
      pathOptions={{ color: '#38bdf8', weight: 3.5, opacity: 0.95, dashArray: '2 8' }}
    >
      <Tooltip permanent direction="right" className="flow-tooltip">
        water flows this way
      </Tooltip>
    </Polyline>
  );
}

function EventMarker({ a, selected, onSelect }: { a: ProximityAssessment; selected: boolean; onSelect: () => void }) {
  const e = a.event;
  const meta = EVENT_KIND_META[e.kind];
  return (
    <Marker position={[e.lat, e.lng]} icon={eventIcon(e.kind, e.severity, selected)} eventHandlers={{ click: onSelect }}>
      <Tooltip>
        <b>{e.title}</b>
        <br />
        {meta.label} · {SOURCE_LABEL[e.source]} · {e.severityLabel}
        <br />
        {e.place} · {new Date(e.at).toLocaleString()}
        {a.ring !== 'far' ? (
          <>
            <br />
            <b style={{ color: ringColor[a.ring] }}>{RING_LABEL[a.ring]} from your home</b>
          </>
        ) : null}
        {e.detail ? (
          <>
            <br />
            {e.detail}
          </>
        ) : null}
      </Tooltip>
    </Marker>
  );
}

export function GlobalMap() {
  const events = useReach((s) => s.globalEvents);
  const sources = useReach((s) => s.globalSources);
  const fetchedAt = useReach((s) => s.globalFetchedAt);
  const homePin = useReach((s) => s.homePin);
  const setHomePin = useReach((s) => s.setHomePin);
  const pickingHome = useReach((s) => s.pickingHome);
  const setPickingHome = useReach((s) => s.setPickingHome);
  const sitreps = useReach((s) => s.sitreps);
  const addSitrep = useReach((s) => s.addSitrep);
  const coordinatorUnlocked = useReach((s) => s.coordinatorUnlocked);
  const setCoordinatorUnlocked = useReach((s) => s.setCoordinatorUnlocked);
  const setNav = useReach((s) => s.setNav);
  const connectivity = useReach((s) => s.connectivity);
  const simulateOffline = useReach((s) => s.simulateOffline);
  const online = connectivity === 'online' && !simulateOffline;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [floodFlow, setFloodFlow] = useState<{ eventId: string; bearing: number; compass: string; confidence: string } | null>(null);
  const [flowBusy, setFlowBusy] = useState(false);

  const selected = events.find((e) => e.id === selectedId) ?? null;
  const assessments = useMemo(
    () => (homePin ? assessProximity(events, homePin) : []),
    [events, homePin],
  );
  const nearby = assessments.filter((a) => a.ring !== 'far');
  const nearest = nearby[0] ?? null;

  const pickFloodFlow = async (e: GlobalEvent) => {
    setFlowBusy(true);
    const flow = await estimateFloodFlow({ lat: e.lat, lng: e.lng });
    setFlowBusy(false);
    if (flow) {
      setFloodFlow({ eventId: e.id, bearing: flow.bearingDeg, compass: flow.compass, confidence: flow.confidence });
      setHomePin({ lat: e.lat, lng: e.lng, label: `Flood origin · ${e.place}` });
    }
  };

  const geolocateHome = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setHomePin({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: 'My location (GPS)' }),
      () => setPickingHome(true),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const grouped = useMemo(() => groupByKind(events), [events]);

  return (
    <div className="space-y-4">
      {/* ---------- proximity banner ---------- */}
      {homePin && nearest ? (
        <div
          className="flex flex-wrap items-center gap-3 rounded-2xl border p-4"
          style={{ borderColor: `${ringColor[nearest.ring]}66`, background: `${ringColor[nearest.ring]}14` }}
        >
          <span style={{ color: ringColor[nearest.ring] }}>
            <ShieldAlert size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold" style={{ color: ringColor[nearest.ring] }}>
              {RING_LABEL[nearest.ring]} — {nearest.event.kind.toUpperCase()} {nearest.compass} of you at{' '}
              {nearest.distanceKm < 10 ? `${nearest.distanceKm.toFixed(1)} km` : `${Math.round(nearest.distanceKm)} km`}
            </div>
            <div className="truncate text-[12px] text-ink-muted">{nearest.event.title}</div>
          </div>
          <button type="button" className="btn btn-danger !py-2" onClick={() => setNav('sos')}>
            <Siren size={15} /> SOS now
          </button>
          <button
            type="button"
            className="btn !py-2"
            onClick={() => {
              addSitrep({ kind: 'hazard', text: `Situation report near ${nearest.event.place}: ${nearest.event.title}`, lat: homePin.lat, lng: homePin.lng, eventId: nearest.event.id });
              setNav('community');
            }}
          >
            <Radio size={15} /> I'm in this area — report
          </button>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
        {/* ---------- map ---------- */}
        <div className="relative h-[540px] overflow-hidden rounded-2xl border border-base-700/70 bg-base-950">
          <MapContainer center={[20, 40]} zoom={2} minZoom={2} maxZoom={10} className="h-full w-full" worldCopyJump>
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution="&copy; OpenStreetMap contributors &copy; CARTO"
              subdomains="abcd"
              maxZoom={10}
            />
            <HomePicker />
            {homePin ? (
              <>
                <Marker
                  position={[homePin.lat, homePin.lng]}
                  icon={L.divIcon({
                    className: 'reach-marker',
                    html: `<div style="width:26px;height:26px;display:grid;place-items:center;border-radius:8px;background:#16a34a;color:#fff;border:2px solid #fff;box-shadow:0 1px 8px rgba(0,0,0,.5)"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M3 10.5 12 3l9 7.5V21H3z"/></svg></div>`,
                    iconSize: [26, 26],
                    iconAnchor: [13, 13],
                  })}
                >
                  <Tooltip permanent direction="top">Home — {homePin.label}</Tooltip>
                </Marker>
                <Rings home={homePin} floodBearing={floodFlow?.bearing ?? null} />
              </>
            ) : null}
            {assessments.map((a) => (
              <EventMarker
                key={a.event.id}
                a={a}
                selected={a.event.id === selectedId}
                onSelect={() => setSelectedId(a.event.id)}
              />
            ))}
          </MapContainer>

          {/* map overlay controls */}
          <div className="absolute left-3 top-3 z-[500] flex flex-wrap gap-2">
            <button type="button" className={clsx('btn !py-1.5 text-[11px]', pickingHome && 'btn-primary')} onClick={() => setPickingHome(!pickingHome)}>
              <Home size={13} /> {pickingHome ? 'Tap the map…' : 'Set home on map'}
            </button>
            <button type="button" className="btn !py-1.5 text-[11px]" onClick={geolocateHome}>
              <MapPin size={13} /> Use GPS
            </button>
          </div>
          <div className="pointer-events-none absolute bottom-3 right-3 z-[500] rounded-lg border border-base-700/80 bg-base-900/90 px-2.5 py-1.5 text-[10px] text-ink-faint backdrop-blur">
            rings 2 / 5 / 10 km · {online ? 'live feeds' : 'cached feeds'} · {events.length} events
          </div>
        </div>

        {/* ---------- side panels ---------- */}
        <div className="space-y-4">
          {selected ? (
            <Panel>
              <PanelHead
                title={selected.title}
                subtitle={`${EVENT_KIND_META[selected.kind].label} · ${SOURCE_LABEL[selected.source]} · ${selected.severityLabel}`}
                icon={<TriangleAlert size={15} />}
                tone={selected.severity >= 70 ? 'critical' : selected.severity >= 45 ? 'elevated' : 'info'}
              />
              <div className="space-y-2.5 p-4 text-[12px] leading-relaxed text-ink-muted">
                <div>
                  {selected.place} · {new Date(selected.at).toLocaleString()}
                </div>
                {selected.detail ? <div>{selected.detail}</div> : null}
                {homePin ? (
                  <div className="flex items-center gap-2">
                    <span className="font-mono" style={{ color: ringColor[ringFor(haversineKm(homePin.lat, homePin.lng, selected.lat, selected.lng))] }}>
                      {RING_LABEL[ringFor(haversineKm(homePin.lat, homePin.lng, selected.lat, selected.lng))]}
                    </span>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2 pt-1">
                  {selected.kind === 'flood' ? (
                    <button type="button" className="btn !py-1.5 text-[11px]" disabled={flowBusy} onClick={() => void pickFloodFlow(selected)}>
                      <Droplets size={13} /> {flowBusy ? 'Sampling elevation…' : 'Estimate flood direction'}
                    </button>
                  ) : null}
                  {selected.url ? (
                    <a className="btn !py-1.5 text-[11px]" href={selected.url} target="_blank" rel="noreferrer">
                      Source report ↗
                    </a>
                  ) : null}
                  {floodFlow?.eventId === selected.id ? (
                    <span className="chip" style={{ borderColor: '#38bdf866', color: '#38bdf8' }}>
                      drains {floodFlow.compass} · {floodFlow.confidence} confidence
                    </span>
                  ) : null}
                </div>
              </div>
            </Panel>
          ) : null}

          <Panel>
            <PanelHead
              title="Live global feeds"
              subtitle={fetchedAt ? `Updated ${new Date(fetchedAt).toLocaleTimeString()}` : 'Loading…'}
              icon={<Radio size={15} />}
              tone="info"
            />
            <div className="space-y-2 p-4">
              <div className="flex flex-wrap gap-1.5">
                {(['usgs', 'gdacs', 'reliefweb'] as const).map((s) => (
                  <span
                    key={s}
                    className="chip text-[10px]"
                    style={{
                      borderColor: sources[s] === 'ok' ? '#16a34a66' : sources[s] === 'error' ? '#ff3b4766' : '#7c8aa544',
                      color: sources[s] === 'ok' ? '#16a34a' : sources[s] === 'error' ? '#ff3b47' : '#7c8aa5',
                    }}
                  >
                    {SOURCE_LABEL[s]} {sources[s] === 'ok' ? '●' : sources[s] === 'error' ? '○ failed' : '…'}
                  </span>
                ))}
              </div>
              {grouped.map((g) => (
                <div key={g.kind} className="flex items-center justify-between rounded-lg border border-base-700/60 bg-base-850/60 px-3 py-2">
                  <span className="flex items-center gap-2 text-[12px] text-ink">
                    <span className="h-2 w-2 rounded-full" style={{ background: EVENT_KIND_META[g.kind].color }} />
                    {EVENT_KIND_META[g.kind].label}
                  </span>
                  <span className="font-mono text-[11px] text-ink-muted">{g.events.length}</span>
                </div>
              ))}
              {!events.length ? <p className="text-[12px] text-ink-faint">No events in the current window.</p> : null}
            </div>
          </Panel>

          {sitreps.length ? (
            <Panel>
              <PanelHead title="Citizen situation reports" subtitle="Geo-tagged by people on the ground" icon={<BadgeCheck size={15} />} tone="elevated" />
              <div className="space-y-2 p-4">
                {sitreps.slice(0, 5).map((r) => (
                  <div key={r.id} className="rounded-lg border border-base-700/60 bg-base-850/60 px-3 py-2 text-[12px]">
                    <div className="flex items-center justify-between">
                      <span className="font-medium capitalize text-ink">{r.kind.replace('_', ' ')}</span>
                      <span className="text-[10px] text-ink-faint">{r.synced ? 'synced' : 'queued'}</span>
                    </div>
                    <div className="mt-0.5 text-ink-muted">{r.text}</div>
                  </div>
                ))}
              </div>
            </Panel>
          ) : null}
        </div>
      </div>

      {/* ---------- news strip ---------- */}
      <Panel>
        <PanelHead title="Around the world — latest" subtitle="Ranked by severity, then recency" icon={<Radio size={15} />} tone="info" />
        <div className="grid gap-2 p-4 md:grid-cols-2 xl:grid-cols-3">
          {rankForNews(events, 12).map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => setSelectedId(e.id)}
              className="rounded-xl border border-base-700/60 bg-base-850/60 p-3 text-left transition hover:border-base-600 hover:bg-base-800/70"
            >
              <div className="flex items-center gap-2 text-[11px]" style={{ color: EVENT_KIND_META[e.kind].color }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: EVENT_KIND_META[e.kind].color }} />
                {EVENT_KIND_META[e.kind].label} · {SOURCE_LABEL[e.source]} · {e.severityLabel}
              </div>
              <div className="mt-1 line-clamp-2 text-[12.5px] font-medium text-ink">{e.title}</div>
              <div className="mt-1 text-[10.5px] text-ink-faint">
                {e.place} · {new Date(e.at).toLocaleDateString()} {new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </button>
          ))}
        </div>
      </Panel>

      {/* ---------- coordinator escalation ---------- */}
      {nearby.length && !coordinatorUnlocked ? (
        <Panel className="border-threat-elevated/40">
          <div className="flex flex-wrap items-center gap-3 p-4">
            <ShieldAlert size={18} style={{ color: TONE_HEX.elevated }} />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-ink">You are inside a live event's watch ring</div>
              <div className="text-[11.5px] text-ink-muted">
                Everyone around an affected area becomes part of the response. Unlock the Management portal to verify reports, post broadcasts and
                coordinate shelters for {nearest?.event.place}.
              </div>
            </div>
            <button type="button" className="btn btn-primary !py-2" onClick={() => setCoordinatorUnlocked(true)}>
              Become a local coordinator
            </button>
          </div>
        </Panel>
      ) : null}

    </div>
  );
}
