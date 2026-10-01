import { useState } from 'react';
import {
  Building2,
  Cross,
  Droplets,
  Hospital,
  Layers,
  MapPin,
  Mountain,
  Route as RouteIcon,
  Search,
  Siren,
  Waves,
} from 'lucide-react';
import clsx from 'clsx';
import type { Analysis } from '../lib/engine/analysis';
import { useReach, type LayerState } from '../lib/store';
import { MapView } from '../components/MapView';
import { DirectionsPanel } from '../components/DirectionsPanel';
import { WeatherPanel } from '../components/WeatherPanel';
import { Bar, Banner, LevelPill, Panel, PanelHead, Switch, TONE_HEX } from '../components/ui';
import { HOSPITAL_BY_ID, ZONE_BY_ID } from '../lib/data/region';
import { formatKm, formatNumber, riskColor } from '../lib/geo';

const LAYER_META: {
  key: keyof LayerState;
  label: string;
  hint: string;
  tone: 'info' | 'high' | 'low' | 'elevated' | 'moderate' | 'accent' | 'critical';
}[] = [
  { key: 'flood', label: 'Flood risk', hint: 'Depth proxy per zone from rainfall + river stage', tone: 'info' },
  { key: 'landslide', label: 'Landslide risk', hint: 'Slope-failure probability from saturation', tone: 'high' },
  { key: 'fire', label: 'Wildfire risk', hint: 'Fire-weather index × fuel load (Fosberg)', tone: 'critical' },
  { key: 'slope', label: 'Slope / elevation', hint: 'Terrain shading by elevation', tone: 'moderate' },
  { key: 'settlements', label: 'Settlements', hint: 'Population centres sized by headcount', tone: 'accent' },
  { key: 'roads', label: 'Roads', hint: 'Coloured by hazard exposure', tone: 'info' },
  { key: 'hospitals', label: 'Hospitals', hint: 'Green = reachable, red = no road access', tone: 'low' },
  { key: 'shelters', label: 'Shelters', hint: 'Badge shows free capacity', tone: 'low' },
  { key: 'riskZones', label: 'High-risk zones', hint: 'Composite risk outline', tone: 'elevated' },
  { key: 'blockedRoads', label: 'Blocked road markers', hint: 'Roads removed from routing', tone: 'elevated' },
  { key: 'safeRoute', label: 'Least-risk route', hint: 'Active SafeRoute for the selected origin', tone: 'low' },
  { key: 'realRoute', label: 'Live road directions', hint: 'Real OSRM route drawn from your pins', tone: 'accent' },
];

export function LiveMap({ analysis }: { analysis: Analysis }) {
  const layers = useReach((s) => s.layers);
  const setLayer = useReach((s) => s.setLayer);
  const toggleLayer = useReach((s) => s.toggleLayer);
  const selectedZoneId = useReach((s) => s.selectedZoneId);
  const setSelectedZoneId = useReach((s) => s.setSelectedZoneId);
  const setFocus = useReach((s) => s.setFocus);
  const setNav = useReach((s) => s.setNav);
  const setRouteOriginZoneId = useReach((s) => s.setRouteOriginZoneId);
  const emergencyMode = useReach((s) => s.emergencyMode);
  const [query, setQuery] = useState('');

  const zone = selectedZoneId ? ZONE_BY_ID[selectedZoneId] : null;
  const zr = selectedZoneId ? analysis.zones.find((z) => z.zoneId === selectedZoneId) : null;
  const plan = selectedZoneId ? analysis.plans[selectedZoneId] : null;
  const shelter = plan?.shelterId ? analysis.shelters.find((s) => s.id === plan.shelterId) : null;
  const hospital = zr?.nearestHospitalId ? HOSPITAL_BY_ID[zr.nearestHospitalId] : null;

  const results = query
    ? analysis.zones.filter((z) => ZONE_BY_ID[z.zoneId]?.name.toLowerCase().includes(query.toLowerCase()))
    : [];

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_368px]">
      <div className="space-y-4">
        <Panel className="overflow-hidden">
          <PanelHead
            title="Live multi-hazard map"
            subtitle="Toggle any layer independently · click zones, roads, shelters or hospitals for detail"
            icon={<MapPin size={15} />}
            tone={emergencyMode ? 'critical' : 'info'}
            right={
              <div className="flex items-center gap-2">
                <span className="chip border-base-600/70 bg-base-800/60 text-ink-muted">
                  <Waves size={11} /> {analysis.hazard.rainfallRateMmHr.toFixed(1)} mm/hr
                </span>
                <span
                  className="chip"
                  style={{
                    color: emergencyMode ? TONE_HEX.critical : TONE_HEX.low,
                    borderColor: emergencyMode ? `${TONE_HEX.critical}55` : `${TONE_HEX.low}55`,
                    background: emergencyMode ? `${TONE_HEX.critical}18` : `${TONE_HEX.low}18`,
                  }}
                >
                  {emergencyMode ? 'EMERGENCY RESPONSE MODE' : 'ANALYSIS MODE'}
                </span>
              </div>
            }
          />
          <div className="p-3">
            <MapView analysis={analysis} height="h-[62vh] min-h-[420px]" />
          </div>
        </Panel>

        <DirectionsPanel analysis={analysis} />

        <Panel>
          <PanelHead
            title="Layer control"
            subtitle="Every hazard, asset and network layer can be switched on or off"
            icon={<Layers size={15} />}
            tone="info"
            right={
              <div className="flex gap-1.5">
                <button
                  type="button"
                  className="btn !px-2 !py-1 text-[11px]"
                  onClick={() => LAYER_META.forEach((l) => setLayer(l.key, true))}
                >
                  All on
                </button>
                <button
                  type="button"
                  className="btn !px-2 !py-1 text-[11px]"
                  onClick={() => LAYER_META.forEach((l) => setLayer(l.key, false))}
                >
                  All off
                </button>
              </div>
            }
          />
          <div className="grid gap-1 p-3 sm:grid-cols-2 xl:grid-cols-3">
            {LAYER_META.map((l) => (
              <div key={l.key} className="rounded-xl border border-base-700/60 bg-base-900/40 px-2 py-1">
                <Switch
                  checked={layers[l.key]}
                  onChange={() => toggleLayer(l.key)}
                  tone={l.tone}
                  label={l.label}
                  hint={l.hint}
                />
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* ---------- side panel ---------- */}
      <div className="space-y-4">
        <WeatherPanel compact />

        <Panel>
          <PanelHead title="Find a zone" subtitle="Search settlements in the district" icon={<Search size={15} />} tone="info" />
          <div className="p-3">
            <input
              className="field"
              placeholder="Search zones…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {results.length ? (
              <div className="mt-2 space-y-1">
                {results.map((r) => {
                  const z = ZONE_BY_ID[r.zoneId];
                  return (
                    <button
                      key={r.zoneId}
                      type="button"
                      className="flex w-full items-center gap-2.5 rounded-lg border border-base-700/60 bg-base-900/50 px-2.5 py-2 text-left transition hover:border-base-600"
                      onClick={() => {
                        setSelectedZoneId(r.zoneId);
                        setFocus(z.lat, z.lng, 14);
                        setQuery('');
                      }}
                    >
                      <span className="h-2 w-2 rounded-full" style={{ background: riskColor(r.level) }} />
                      <span className="flex-1 text-[12px] text-ink">{z.name}</span>
                      <span className="font-mono text-[11px]" style={{ color: riskColor(r.level) }}>
                        {Math.round(r.risk)}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {analysis.zones.slice(0, 8).map((z) => {
                const zone = ZONE_BY_ID[z.zoneId];
                const active = z.zoneId === selectedZoneId;
                return (
                  <button
                    key={z.zoneId}
                    type="button"
                    onClick={() => {
                      setSelectedZoneId(z.zoneId);
                      setFocus(zone.lat, zone.lng, 14);
                    }}
                    className={clsx(
                      'rounded-full border px-2.5 py-1 text-[11px] transition',
                      active ? 'border-threat-info/50 bg-threat-info/15 text-threat-info' : 'border-base-700/70 text-ink-muted hover:text-ink',
                    )}
                  >
                    {zone.name.split(' ')[0]}
                  </button>
                );
              })}
            </div>
          </div>
        </Panel>

        {zone && zr ? (
          <Panel className="overflow-hidden">
            <div className="h-[3px] w-full" style={{ background: riskColor(zr.level) }} />
            <PanelHead
              title={zone.name}
              subtitle={`${zone.kind} · ${zone.terrain} terrain · ${zone.elevationM} m AMSL`}
              icon={<MapPin size={15} />}
              tone={zr.level as 'critical'}
              right={<LevelPill level={zr.level}>{Math.round(zr.risk)}/100</LevelPill>}
            />
            <div className="space-y-3.5 p-4">
              {zr.isolated ? (
                <Banner tone="critical" icon={<Siren size={14} />} title="Zone isolated">
                  No road route to any shelter or hospital. Rescue deployment or air evacuation is the only option.
                </Banner>
              ) : null}

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-base-700/60 bg-base-900/50 p-2.5">
                  <div className="flex items-center gap-1.5 hud-text">
                    <Droplets size={11} /> Flood
                  </div>
                  <div className="mt-1.5 font-mono text-[15px]" style={{ color: TONE_HEX.info }}>
                    {Math.round(zr.flood * 100)}%
                  </div>
                  <Bar className="mt-1.5" value={zr.flood} tone="info" height={4} />
                </div>
                <div className="rounded-xl border border-base-700/60 bg-base-900/50 p-2.5">
                  <div className="flex items-center gap-1.5 hud-text">
                    <Mountain size={11} /> Slope failure
                  </div>
                  <div className="mt-1.5 font-mono text-[15px]" style={{ color: TONE_HEX.high }}>
                    {Math.round(zr.landslide * 100)}%
                  </div>
                  <Bar className="mt-1.5" value={zr.landslide} tone="high" height={4} />
                </div>
                <div className="rounded-xl border border-base-700/60 bg-base-900/50 p-2.5">
                  <div className="hud-text">Population exposed</div>
                  <div className="mt-1.5 font-mono text-[15px] text-ink">{formatNumber(zr.populationAtRisk)}</div>
                  <div className="text-[10px] text-ink-faint">of {formatNumber(zone.population)}</div>
                </div>
                <div className="rounded-xl border border-base-700/60 bg-base-900/50 p-2.5">
                  <div className="hud-text">Needs assistance</div>
                  <div className="mt-1.5 font-mono text-[15px]" style={{ color: TONE_HEX.elevated }}>
                    {formatNumber(zr.populationNeedingAssistance)}
                  </div>
                  <div className="text-[10px] text-ink-faint">self-evacuation {Math.round(zone.selfEvacuation * 100)}%</div>
                </div>
              </div>

              <div className="rounded-xl border border-base-700/60 bg-base-900/50 p-3">
                <div className="hud-text mb-2">Evacuation recommendation</div>
                {shelter ? (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[12.5px] font-medium text-ink">{shelter.name}</div>
                        <div className="text-[10.5px] text-ink-faint">
                          {formatNumber(shelter.available)} spaces free · {shelter.accessibility} access
                        </div>
                      </div>
                      <RouteIcon size={14} className="mt-0.5 shrink-0" style={{ color: TONE_HEX.low }} />
                    </div>
                    <Bar className="mt-2" value={shelter.occupancyPct} tone={shelter.occupancyPct > 0.85 ? 'critical' : 'low'} height={5} />
                    <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">{plan?.reason}</p>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        className="btn btn-primary flex-1 !py-2 text-[11.5px]"
                        onClick={() => {
                          setRouteOriginZoneId(selectedZoneId);
                          setNav('saferoute');
                        }}
                      >
                        <RouteIcon size={13} /> Least-risk route
                      </button>
                      <button type="button" className="btn flex-1 !py-2 text-[11.5px]" onClick={() => setNav('shelters')}>
                        <Building2 size={13} /> Shelter detail
                      </button>
                    </div>
                  </>
                ) : (
                  <Banner tone="critical" title="No reachable shelter">
                    This zone cannot be assigned a shelter by road. Treat as an isolation case.
                  </Banner>
                )}
              </div>

              <div className="rounded-xl border border-base-700/60 bg-base-900/50 p-3">
                <div className="hud-text mb-2">Medical access</div>
                <div className="flex items-center gap-2.5">
                  <Cross size={14} style={{ color: zr.hospitalReachable ? TONE_HEX.low : TONE_HEX.critical }} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] text-ink">{hospital?.name ?? 'No hospital reachable'}</div>
                    <div className="text-[10.5px] text-ink-faint">
                      {zr.hospitalReachable
                        ? `${hospital?.beds} beds${hospital?.trauma ? ' · trauma centre' : ''}${hospital?.helipad ? ' · helipad' : ''}`
                        : 'Road access severed'}
                    </div>
                  </div>
                  {zr.nearestShelterKm != null ? (
                    <span className="shrink-0 font-mono text-[11px] text-ink-muted">
                      {formatKm(zr.nearestShelterKm)}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="flex gap-2">
                <button type="button" className="btn btn-danger flex-1 !py-2.5 text-[11.5px]" onClick={() => setNav('sos')}>
                  <Siren size={13} /> Raise SOS here
                </button>
                <button
                  type="button"
                  className="btn flex-1 !py-2.5 text-[11.5px]"
                  onClick={() => setNav('community')}
                >
                  <Hospital size={13} /> Report hazard
                </button>
              </div>
            </div>
          </Panel>
        ) : (
          <Panel>
            <PanelHead title="Zone detail" icon={<MapPin size={15} />} tone="info" />
            <div className="p-4 text-[12px] text-ink-muted">
              Select a zone on the map or from the list above to see its hazard breakdown, evacuation recommendation and
              medical access.
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}
