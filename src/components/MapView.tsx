import { Circle, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { useEffect, useMemo } from 'react';
import { HAZARD_POINTS, HOSPITALS, NODE_BY_ID, REGION, ROADS, SHELTERS, ZONES, ZONE_BY_ID } from '../lib/data/region';
import type { Analysis } from '../lib/engine/analysis';
import { useReach } from '../lib/store';
import { formatCompact, formatNumber, riskColor, riskFromScore } from '../lib/geo';
import type { BasemapKind } from '../lib/types';
import clsx from 'clsx';

function divIcon(html: string, className = '') {
  return L.divIcon({
    html,
    className: `reach-marker ${className}`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

const hospitalIcon = (tone: string, offline: boolean) =>
  divIcon(
    `<div style="
      width:26px;height:26px;display:grid;place-items:center;border-radius:8px;
      background:${offline ? 'rgba(120,30,40,0.9)' : 'rgba(255,255,255,0.95)'};
      border:1.5px solid ${tone};color:${tone};font-weight:700;font-size:15px;
      box-shadow:0 1px 6px rgba(0,0,0,0.35);font-family:monospace;">+</div>`,
  );

const shelterIcon = (free: number, tone: string) =>
  divIcon(
    `<div style="
      width:26px;height:26px;display:grid;place-items:center;border-radius:8px;
      background:rgba(255,255,255,0.95);border:1.5px solid ${tone};color:${tone};
      font-size:10px;font-weight:700;font-family:monospace;box-shadow:0 1px 6px rgba(0,0,0,0.35)">
      ${free > 999 ? '999+' : Math.max(0, Math.round(free))}</div>`,
  );

const sosIcon = () =>
  divIcon(
    `<div style="position:relative;width:26px;height:26px;">
       <span class="reach-pulse" style="position:absolute;inset:0;background:rgba(255,59,71,0.5);"></span>
       <span style="position:absolute;inset:3px;border-radius:50%;background:#ff3b47;border:2px solid #fff;
         display:grid;place-items:center;color:#fff;font-size:10px;font-weight:800;font-family:monospace;">SOS</span>
     </div>`,
  );

const pinIcon = (label: string, hex: string) =>
  divIcon(
    `<div style="display:flex;flex-direction:column;align-items:center;transform:translateY(-6px)">
       <div style="background:${hex};color:#fff;font:700 10px/1 ui-monospace,monospace;padding:4px 7px;border-radius:999px;
         border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.45);white-space:nowrap">${label}</div>
       <div style="width:2px;height:10px;background:${hex}"></div>
     </div>`,
    'reach-pin',
  );

/* ------------------------------------------------------------------ */
/* Basemaps                                                           */
/* ------------------------------------------------------------------ */

const BASEMAPS: Record<
  BasemapKind,
  { url: string; attribution: string; subdomains?: string[]; maxNativeZoom: number; label: string }
> = {
  streets: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    subdomains: ['a', 'b', 'c', 'd'],
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    maxNativeZoom: 19,
    label: 'Streets',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics',
    maxNativeZoom: 18,
    label: 'Satellite',
  },
  terrain: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    subdomains: ['a', 'b', 'c'],
    attribution: '&copy; OpenStreetMap contributors, SRTM | &copy; OpenTopoMap',
    maxNativeZoom: 16,
    label: 'Terrain',
  },
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    subdomains: ['a', 'b', 'c', 'd'],
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    maxNativeZoom: 19,
    label: 'Dark',
  },
};

function Focuser() {
  const map = useMap();
  const focus = useReach((s) => s.focus);
  useEffect(() => {
    if (!focus) return;
    map.flyTo([focus.lat, focus.lng], focus.zoom ?? map.getZoom(), { duration: 0.8 });
  }, [focus, map]);
  return null;
}

/** Captures map clicks while the operator is dropping a route origin or destination. */
function PinPicker() {
  const picking = useReach((s) => s.pickingPin);
  const setRoutePin = useReach((s) => s.setRoutePin);
  const setPickingPin = useReach((s) => s.setPickingPin);
  const map = useMap();

  useEffect(() => {
    map.getContainer().style.cursor = picking ? 'crosshair' : '';
    return () => {
      map.getContainer().style.cursor = '';
    };
  }, [picking, map]);

  useMapEvents({
    click(e) {
      if (!picking) return;
      const label = `${e.latlng.lat.toFixed(4)}°N, ${e.latlng.lng.toFixed(4)}°E`;
      setRoutePin(picking, { lat: e.latlng.lat, lng: e.latlng.lng, label });
      setPickingPin(null);
    },
  });
  return null;
}

export function MapView({
  analysis,
  height = 'h-full',
  interactive = true,
}: {
  analysis: Analysis;
  height?: string;
  interactive?: boolean;
}) {
  const layers = useReach((s) => s.layers);
  const basemap = useReach((s) => s.basemap);
  const setBasemap = useReach((s) => s.setBasemap);
  const emergencyMode = useReach((s) => s.emergencyMode);
  const setSelectedZoneId = useReach((s) => s.setSelectedZoneId);
  const setSelectedShelterId = useReach((s) => s.setSelectedShelterId);
  const setSelectedRoadId = useReach((s) => s.setSelectedRoadId);
  const setNav = useReach((s) => s.setNav);
  const routeOriginZoneId = useReach((s) => s.routeOriginZoneId);
  const selectedZoneId = useReach((s) => s.selectedZoneId);
  const sosAlerts = useReach((s) => s.sosAlerts);
  const realRoute = useReach((s) => s.realRoute);
  const routeOrigin = useReach((s) => s.routeOrigin);
  const routeDest = useReach((s) => s.routeDest);

  const tile = BASEMAPS[basemap];

  const zoneRisk = useMemo(
    () => Object.fromEntries(analysis.zones.map((z) => [z.zoneId, z])),
    [analysis.zones],
  );

  const activeRoute = useMemo(() => {
    const plan = routeOriginZoneId ? analysis.plans[routeOriginZoneId] : null;
    return plan?.route ?? null;
  }, [analysis.plans, routeOriginZoneId]);

  const activeRouteIds = useMemo(() => {
    if (!activeRoute?.reachable) return [];
    return activeRoute.path.map((leg) => leg.roadId);
  }, [activeRoute]);

  const routePositions = useMemo(() => {
    if (!activeRoute?.reachable) return [] as [number, number][];
    const pts: [number, number][] = [];
    activeRoute.path.forEach((leg, i) => {
      const a = NODE_BY_ID[leg.fromNode];
      const b = NODE_BY_ID[leg.toNode];
      if (!a || !b) return;
      if (i === 0) pts.push([a.lat, a.lng]);
      pts.push([b.lat, b.lng]);
    });
    return pts;
  }, [activeRoute]);

  return (
    <div className={`relative ${height} w-full overflow-hidden rounded-2xl border border-base-700/70 bg-base-950`}>
      <MapContainer
        center={REGION.center}
        zoom={REGION.zoom}
        minZoom={10}
        maxZoom={19}
        zoomControl={interactive}
        dragging={interactive}
        scrollWheelZoom={interactive}
        className="h-full w-full"
        preferCanvas
      >
        <TileLayer
          key={basemap}
          url={tile.url}
          attribution={tile.attribution}
          subdomains={tile.subdomains ?? 'abc'}
          maxZoom={19}
          maxNativeZoom={tile.maxNativeZoom}
        />
        <Focuser />
        <PinPicker />

        {/* ---------- flood risk field ---------- */}
        {layers.flood &&
          ZONES.map((z) => {
            const f = analysis.hazard.perZone[z.id]?.flood ?? 0;
            if (f < 0.08) return null;
            return (
              <Circle
                key={`flood_${z.id}`}
                center={[z.lat, z.lng]}
                radius={z.radiusKm * 1000 * (0.75 + 0.55 * f)}
                pathOptions={{
                  color: '#0ea5e9',
                  weight: 1,
                  opacity: 0.6,
                  fillColor: '#0ea5e9',
                  fillOpacity: Math.min(0.55, 0.12 + f * 0.5),
                }}
                eventHandlers={{ click: () => setSelectedZoneId(z.id) }}
              >
                <Tooltip sticky>
                  <b>{z.name}</b>
                  <br />
                  Flood intensity {Math.round(f * 100)}%
                  <br />
                  Zone elevation {z.elevationM} m
                </Tooltip>
              </Circle>
            );
          })}

        {/* ---------- landslide risk field ---------- */}
        {layers.landslide &&
          ZONES.map((z) => {
            const l = analysis.hazard.perZone[z.id]?.landslide ?? 0;
            if (l < 0.08) return null;
            return (
              <Circle
                key={`land_${z.id}`}
                center={[z.lat, z.lng]}
                radius={z.radiusKm * 1000 * (0.6 + 0.55 * l)}
                pathOptions={{
                  color: '#b45309',
                  weight: 1,
                  opacity: 0.65,
                  dashArray: '4 4',
                  fillColor: '#f59e0b',
                  fillOpacity: Math.min(0.45, 0.08 + l * 0.42),
                }}
                eventHandlers={{ click: () => setSelectedZoneId(z.id) }}
              >
                <Tooltip sticky>
                  <b>{z.name}</b>
                  <br />
                  Slope failure probability {Math.round(l * 100)}%
                  <br />
                  Terrain: {z.terrain}
                </Tooltip>
              </Circle>
            );
          })}

        {/* ---------- wildfire risk field ---------- */}
        {layers.fire &&
          ZONES.map((z) => {
            const fi = analysis.hazard.perZone[z.id]?.fire ?? 0;
            if (fi < 0.15) return null;
            return (
              <Circle
                key={`fire_${z.id}`}
                center={[z.lat, z.lng]}
                radius={z.radiusKm * 1000 * (0.7 + 0.6 * fi)}
                pathOptions={{
                  color: '#dc2626',
                  weight: 1.2,
                  opacity: 0.6,
                  dashArray: '2 6',
                  fillColor: '#ef4444',
                  fillOpacity: Math.min(0.42, 0.06 + fi * 0.4),
                }}
                eventHandlers={{ click: () => setSelectedZoneId(z.id) }}
              >
                <Tooltip sticky>
                  <b>{z.name}</b>
                  <br />
                  Wildfire pressure {Math.round(fi * 100)}%
                  <br />
                  Fuel load {(z.baseFire ?? 0.2).toFixed(2)} · {z.terrain} terrain
                </Tooltip>
              </Circle>
            );
          })}

        {/* ---------- slope / elevation ---------- */}
        {layers.slope &&
          ZONES.map((z) => {
            const t = Math.min(1, Math.max(0, (z.elevationM - 530) / 400));
            return (
              <Circle
                key={`elev_${z.id}`}
                center={[z.lat, z.lng]}
                radius={z.radiusKm * 1000 * 1.15}
                pathOptions={{
                  color: `hsl(${140 - t * 140}, 70%, 55%)`,
                  weight: 1,
                  opacity: 0.4,
                  fillColor: `hsl(${140 - t * 140}, 70%, 45%)`,
                  fillOpacity: 0.16,
                }}
              >
                <Tooltip sticky>
                  {z.name} — {z.elevationM} m AMSL
                </Tooltip>
              </Circle>
            );
          })}

        {/* ---------- high risk zones ---------- */}
        {layers.riskZones &&
          analysis.zones.map((zr) => {
            const z = ZONE_BY_ID[zr.zoneId];
            if (!z || zr.level === 'low' || zr.level === 'moderate') return null;
            const hex = riskColor(zr.level);
            return (
              <Circle
                key={`risk_${z.id}`}
                center={[z.lat, z.lng]}
                radius={z.radiusKm * 1000 * 1.32}
                pathOptions={{
                  color: hex,
                  weight: zr.level === 'critical' ? 2.5 : 1.5,
                  opacity: 0.85,
                  dashArray: zr.level === 'critical' ? undefined : '8 6',
                  fillColor: hex,
                  fillOpacity: 0.05,
                }}
                eventHandlers={{ click: () => setSelectedZoneId(z.id) }}
              >
                <Tooltip sticky>
                  <b>{z.name}</b> — risk {Math.round(zr.risk)}/100 ({zr.level})
                  <br />
                  {formatNumber(zr.populationAtRisk)} residents exposed
                  {zr.fire >= 0.5 ? <><br />🔥 Wildfire pressure {Math.round(zr.fire * 100)}%</> : null}
                  {zr.isolated ? <><br />⚠ ISOLATED — no road route out</> : null}
                </Tooltip>
              </Circle>
            );
          })}

        {/* ---------- roads ---------- */}
        {layers.roads &&
          ROADS.map((r) => {
            const a = NODE_BY_ID[r.from];
            const b = NODE_BY_ID[r.to];
            const h = analysis.hazard.perRoad[r.id];
            const closed = h && !h.passable;
            const caution = h?.closure?.level === 'caution';
            const risk = h?.risk ?? 0;
            const onRoute = layers.safeRoute && activeRouteIds.includes(r.id);
            if (onRoute && layers.safeRoute) return null;
            const color = closed ? '#ff3b47' : caution ? '#ffb020' : riskColor(riskFromScore(risk * 100));
            return (
              <Polyline
                key={r.id}
                positions={[
                  [a.lat, a.lng],
                  [b.lat, b.lng],
                ]}
                pathOptions={{
                  color: closed ? '#ff3b47' : onRoute ? '#22d38b' : color,
                  weight: onRoute ? 6 : closed ? 4 : 3,
                  opacity: closed ? 0.95 : 0.7,
                  dashArray: closed ? '3 7' : undefined,
                }}
                eventHandlers={{
                  click: () => {
                    setSelectedRoadId(r.id);
                    setNav('saferoute');
                  },
                }}
              >
                <Tooltip sticky>
                  <b>
                    {r.id} · {r.name}
                  </b>
                  <br />
                  Status: {closed ? 'OUT OF SERVICE' : caution ? 'CAUTION' : 'PASSABLE'}
                  {h?.blockingHazard ? ` (${h.blockingHazard})` : ''}
                  <br />
                  Exposure {Math.round(risk * 100)}% · fire {Math.round((h?.fire ?? 0) * 100)}% · {r.lengthKm} km · {r.kind}
                  {h?.closure ? (
                    <>
                      <br />
                      Reported: {h.closure.reason}
                    </>
                  ) : null}
                </Tooltip>
              </Polyline>
            );
          })}

        {/* ---------- least-risk route (REACH model) ---------- */}
        {layers.safeRoute && routePositions.length > 1 ? (
          <>
            <Polyline positions={routePositions} pathOptions={{ color: '#22d38b', weight: 11, opacity: 0.16 }} />
            <Polyline
              positions={routePositions}
              pathOptions={{ color: '#22d38b', weight: 4.5, opacity: 0.98, dashArray: '14 9' }}
            />
          </>
        ) : null}

        {/* ---------- real driving directions (OSRM) ---------- */}
        {layers.realRoute && realRoute && realRoute.geometry.length > 1 ? (
          <>
            <Polyline positions={realRoute.geometry} pathOptions={{ color: '#1a73e8', weight: 12, opacity: 0.2 }} />
            <Polyline positions={realRoute.geometry} pathOptions={{ color: '#1a73e8', weight: 5, opacity: 1 }} />
          </>
        ) : null}

        {routeOrigin ? (
          <Marker position={[routeOrigin.lat, routeOrigin.lng]} icon={pinIcon('START', '#16a34a')}>
            <Tooltip permanent direction="right">
              Start — {routeOrigin.label}
            </Tooltip>
          </Marker>
        ) : null}
        {routeDest ? (
          <Marker position={[routeDest.lat, routeDest.lng]} icon={pinIcon('DEST', '#1a73e8')}>
            <Tooltip permanent direction="right">
              Destination — {routeDest.label}
            </Tooltip>
          </Marker>
        ) : null}

        {/* ---------- blocked markers ---------- */}
        {layers.blockedRoads &&
          ROADS.filter((r) => analysis.hazard.perRoad[r.id] && !analysis.hazard.perRoad[r.id].passable).map((r) => {
            const a = NODE_BY_ID[r.from];
            const b = NODE_BY_ID[r.to];
            const mid: [number, number] = [(a.lat + b.lat) / 2, (a.lng + b.lng) / 2];
            return (
              <Marker
                key={`blk_${r.id}`}
                position={mid}
                icon={divIcon(
                  `<div style="width:22px;height:22px;display:grid;place-items:center;border-radius:6px;
                    background:rgba(255,59,71,0.92);color:#fff;font-size:13px;font-weight:800;
                    border:1px solid #fff3;box-shadow:0 1px 6px rgba(0,0,0,.4)">✕</div>`,
                )}
              >
                <Tooltip>{r.id} closed — routing recalculated</Tooltip>
              </Marker>
            );
          })}

        {/* ---------- settlements ---------- */}
        {layers.settlements &&
          ZONES.map((z) => {
            const zr = zoneRisk[z.id];
            const hex = zr ? riskColor(zr.level) : '#7c8aa5';
            return (
              <Circle
                key={`set_${z.id}`}
                center={[z.lat, z.lng]}
                radius={220 + Math.min(600, z.population / 40)}
                pathOptions={{
                  color: hex,
                  weight: selectedZoneId === z.id ? 2.5 : 1,
                  opacity: 0.95,
                  fillColor: hex,
                  fillOpacity: selectedZoneId === z.id ? 0.5 : 0.3,
                }}
                eventHandlers={{
                  click: () => {
                    setSelectedZoneId(z.id);
                  },
                }}
              >
                <Tooltip sticky>
                  <b>{z.name}</b>
                  <br />
                  Population {formatNumber(z.population)} · {z.kind}
                  <br />
                  {zr ? `Risk ${Math.round(zr.risk)}/100 (${zr.level})` : '—'}
                </Tooltip>
              </Circle>
            );
          })}

        {/* ---------- hazard hot spots ---------- */}
        {HAZARD_POINTS.filter(
          (hp) =>
            (hp.kind === 'flood' && layers.flood) ||
            (hp.kind === 'landslide' && layers.landslide) ||
            (hp.kind === 'fire' && layers.fire),
        ).map((hp) => (
          <Circle
            key={hp.id}
            center={[hp.lat, hp.lng]}
            radius={320}
            pathOptions={{
              color: hp.kind === 'flood' ? '#0ea5e9' : hp.kind === 'landslide' ? '#f59e0b' : '#ef4444',
              weight: 2,
              opacity: 0.9,
              dashArray: '2 5',
            }}
          >
            <Tooltip sticky>
              <b>
                {hp.kind === 'flood' ? 'Flood hot spot' : hp.kind === 'landslide' ? 'Landslide hot spot' : 'Fire hot spot'}
              </b>
              <br />
              {hp.label}
            </Tooltip>
          </Circle>
        ))}

        {/* ---------- hospitals ---------- */}
        {layers.hospitals &&
          HOSPITALS.map((h) => {
            const hs = analysis.hospitals.find((x) => x.id === h.id);
            const offline = !hs?.reachable;
            const tone = offline ? '#ff3b47' : hs?.status === 'strained' ? '#ffb020' : '#16a34a';
            return (
              <Marker
                key={h.id}
                position={[h.lat, h.lng]}
                icon={hospitalIcon(tone, offline)}
                eventHandlers={{ click: () => setNav('shelters') }}
              >
                <Tooltip>
                  <b>{h.name}</b>
                  <br />
                  {h.beds} beds {h.trauma ? '· trauma centre' : ''} {h.helipad ? '· helipad' : ''}
                  <br />
                  {offline ? '⚠ NO ROAD ACCESS' : `Reachable · ${hs?.status}`}
                </Tooltip>
              </Marker>
            );
          })}

        {/* ---------- shelters ---------- */}
        {layers.shelters &&
          SHELTERS.map((s) => {
            const st = analysis.shelters.find((x) => x.id === s.id);
            const tone = st
              ? st.available <= 0
                ? '#ff3b47'
                : st.risk === 'critical' || st.risk === 'high'
                  ? '#ff7a29'
                  : st.available > 80
                    ? '#16a34a'
                    : '#ffb020'
              : '#7c8aa5';
            return (
              <Marker
                key={s.id}
                position={[s.lat, s.lng]}
                icon={shelterIcon(st?.available ?? 0, tone)}
                eventHandlers={{
                  click: () => {
                    setSelectedShelterId(s.id);
                    setNav('shelters');
                  },
                }}
              >
                <Tooltip>
                  <b>{s.name}</b>
                  <br />
                  {st ? `${formatNumber(st.occupied)}/${formatNumber(st.capacity)} occupied · ${formatNumber(st.available)} free` : ''}
                  <br />
                  {st?.reachableZoneIds.length ?? 0} zone(s) routed here · {s.accessibility} access
                </Tooltip>
              </Marker>
            );
          })}

        {/* ---------- SOS beacons ---------- */}
        {sosAlerts
          .filter((a) => a.status !== 'cancelled')
          .map((a) => (
            <Marker key={a.id} position={[a.lat, a.lng]} icon={sosIcon()}>
              <Tooltip permanent direction="top">
                SOS · {a.name || 'Unnamed'} · {a.peopleCount} pax {a.synced ? '· sent' : '· queued'}
              </Tooltip>
            </Marker>
          ))}
      </MapContainer>

      {/* basemap switcher */}
      <div className="absolute right-3 top-3 z-[500] flex flex-col gap-1 rounded-xl border border-base-700/80 bg-base-900/90 p-1 backdrop-blur">
        {(Object.keys(BASEMAPS) as BasemapKind[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setBasemap(k)}
            className={clsx(
              'rounded-lg px-2 py-1 text-[10.5px] font-medium transition',
              basemap === k ? 'bg-threat-info/20 text-threat-info' : 'text-ink-muted hover:bg-base-800/70 hover:text-ink',
            )}
          >
            {BASEMAPS[k].label}
          </button>
        ))}
      </div>

      {/* vignette / scanline for emergency mode */}
      {emergencyMode ? (
        <div
          className="pointer-events-none absolute inset-0 z-[400]"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(255,59,71,0) 45%, rgba(255,59,71,0.16) 100%)',
          }}
        >
          <div className="absolute inset-x-0 top-0 h-[2px] animate-sweep bg-threat-critical/70" />
        </div>
      ) : null}

      <Legend analysis={analysis} />
    </div>
  );
}

function Legend({ analysis }: { analysis: Analysis }) {
  const basemap = useReach((s) => s.basemap);
  const levels = ['critical', 'high', 'elevated', 'moderate', 'low'] as const;
  const onLight = basemap === 'streets';
  return (
    <div
      className={clsx(
        'pointer-events-none absolute bottom-3 left-3 z-[500] max-w-[250px] rounded-xl border p-3 backdrop-blur',
        onLight ? 'border-black/10 bg-white/90 text-black' : 'border-base-700/80 bg-base-900/90',
      )}
    >
      <div className={clsx('mb-2 text-[10px] font-semibold uppercase tracking-[0.18em]', onLight ? 'text-black/50' : 'text-ink-faint')}>
        Risk legend
      </div>
      <div className="space-y-1">
        {levels.map((l) => (
          <div key={l} className={clsx('flex items-center gap-2 text-[11px]', onLight ? 'text-black/70' : 'text-ink-muted')}>
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: riskColor(l) }} />
            <span className="capitalize">{l}</span>
            <span className={clsx('ml-auto', onLight ? 'text-black/40' : 'text-ink-faint')}>
              {l === 'critical' ? '≥78' : l === 'high' ? '60+' : l === 'elevated' ? '42+' : l === 'moderate' ? '24+' : '<24'}
            </span>
          </div>
        ))}
      </div>
      <div className={clsx('mt-2.5 space-y-1 border-t pt-2 text-[10px]', onLight ? 'border-black/10 text-black/50' : 'border-base-700/60 text-ink-faint')}>
        <div className="flex items-center gap-2">
          <span className="inline-block h-0.5 w-5" style={{ background: '#22d38b' }} /> least-risk route (model)
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-0.5 w-5" style={{ background: '#1a73e8' }} /> live road directions
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-0.5 w-5 border-t-2 border-dashed" style={{ borderColor: '#ff3b47' }} /> road out of service
        </div>
        <div className="mt-1">
          Population at risk: {formatCompact(analysis.totals.populationAtRisk)} · Roads closed: {analysis.totals.blockedRoads}
          {analysis.totals.fireZones ? ` · Fire zones: ${analysis.totals.fireZones}` : ''}
        </div>
      </div>
    </div>
  );
}
