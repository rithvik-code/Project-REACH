import { useState } from 'react';
import {
  Building2,
  Cross,
  Flag,
  Loader2,
  MapPin,
  Navigation,
  Route as RouteIcon,
  TriangleAlert,
  X,
} from 'lucide-react';
import clsx from 'clsx';
import type { Analysis } from '../lib/engine/analysis';
import { useReach } from '../lib/store';
import { ZONE_BY_ID } from '../lib/data/region';
import { etaLabel, fetchDirections, formatDistance, formatDuration } from '../lib/engine/directions';
import { Bar, Panel, PanelHead, TONE_HEX } from './ui';

export function DirectionsPanel({ analysis }: { analysis: Analysis }) {
  const routeOrigin = useReach((s) => s.routeOrigin);
  const routeDest = useReach((s) => s.routeDest);
  const setRoutePin = useReach((s) => s.setRoutePin);
  const pickingPin = useReach((s) => s.pickingPin);
  const setPickingPin = useReach((s) => s.setPickingPin);
  const realRoute = useReach((s) => s.realRoute);
  const setRealRoute = useReach((s) => s.setRealRoute);
  const busy = useReach((s) => s.directionsBusy);
  const setBusy = useReach((s) => s.setDirectionsBusy);
  const setLayer = useReach((s) => s.setLayer);
  const setFocus = useReach((s) => s.setFocus);
  const connectivity = useReach((s) => s.connectivity);
  const simulateOffline = useReach((s) => s.simulateOffline);

  const [error, setError] = useState<string | null>(null);

  const online = connectivity === 'online' && !simulateOffline;
  const selectedZoneId = useReach((s) => s.selectedZoneId);
  const zone = selectedZoneId ? ZONE_BY_ID[selectedZoneId] : null;
  const plan = selectedZoneId ? analysis.plans[selectedZoneId] : null;
  const assigned = plan?.shelterId ? analysis.shelters.find((s) => s.id === plan.shelterId) : null;

  const setFromZone = () => {
    if (!zone) return;
    setRoutePin('origin', { lat: zone.lat, lng: zone.lng, label: zone.name });
    setFocus(zone.lat, zone.lng, 14);
  };
  const setToShelter = () => {
    if (!assigned) return;
    setRoutePin('dest', { lat: assigned.lat, lng: assigned.lng, label: assigned.name });
  };
  const setToHospital = () => {
    const h = analysis.hospitals.find((x) => x.reachable) ?? analysis.hospitals[0];
    if (h) setRoutePin('dest', { lat: h.lat, lng: h.lng, label: h.name });
  };

  const go = async () => {
    if (!routeOrigin || !routeDest) return;
    setBusy(true);
    setError(null);
    try {
      const route = await fetchDirections(routeOrigin, routeDest, {
        originLabel: routeOrigin.label,
        destLabel: routeDest.label,
      });
      setRealRoute(route);
      setLayer('realRoute', true);
      if (route.source === 'straight') setError('Road routing unavailable — showing a straight-line estimate.');
    } catch {
      setError('Could not calculate a route. Check connectivity and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel className="overflow-hidden">
      <PanelHead
        title="Directions"
        subtitle="Real turn-by-turn driving directions over the actual road network, with live distance and travel time"
        icon={<Navigation size={15} />}
        tone="info"
        right={
          realRoute ? (
            <button
              type="button"
              className="btn !px-2 !py-1 text-[11px]"
              onClick={() => {
                setRealRoute(null);
                setRoutePin('origin', null);
                setRoutePin('dest', null);
                setError(null);
              }}
            >
              <X size={12} /> Clear
            </button>
          ) : null
        }
      />
      <div className="space-y-3 p-4">
        {/* --- pins --- */}
        <div className="space-y-2">
          <PinRow
            tone="#16a34a"
            icon={<MapPin size={13} />}
            label="From"
            value={routeOrigin?.label}
            onPick={() => setPickingPin(pickingPin === 'origin' ? null : 'origin')}
            picking={pickingPin === 'origin'}
            onClear={() => setRoutePin('origin', null)}
          />
          <PinRow
            tone="#1a73e8"
            icon={<Flag size={13} />}
            label="To"
            value={routeDest?.label}
            onPick={() => setPickingPin(pickingPin === 'dest' ? null : 'dest')}
            picking={pickingPin === 'dest'}
            onClear={() => setRoutePin('dest', null)}
          />
        </div>

        {pickingPin ? (
          <p className="rounded-lg border border-threat-info/40 bg-threat-info/10 px-3 py-2 text-[11px] text-threat-info">
            Tap anywhere on the map to drop the {pickingPin === 'origin' ? 'starting point' : 'destination'}.
          </p>
        ) : null}

        {/* --- quick fills --- */}
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className="btn !px-2.5 !py-1 text-[11px]" onClick={setFromZone} disabled={!zone}>
            <MapPin size={11} /> From selected zone
          </button>
          <button type="button" className="btn !px-2.5 !py-1 text-[11px]" onClick={setToShelter} disabled={!assigned}>
            <Building2 size={11} /> To assigned shelter
          </button>
          <button type="button" className="btn !px-2.5 !py-1 text-[11px]" onClick={setToHospital}>
            <Cross size={11} /> To nearest hospital
          </button>
        </div>

        <button
          type="button"
          className="btn btn-primary w-full !py-2.5"
          onClick={go}
          disabled={!routeOrigin || !routeDest || busy}
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <RouteIcon size={14} />}
          {busy ? 'Calculating route…' : 'Get directions'}
        </button>

        {!online ? (
          <p className="text-[11px] leading-relaxed text-ink-faint">
            You are offline, so live road routing is limited. Any route already calculated stays available on the map.
          </p>
        ) : null}
        {error ? (
          <div className="flex items-start gap-2 rounded-lg border border-threat-elevated/40 bg-threat-elevated/10 px-2.5 py-2">
            <TriangleAlert size={12} className="mt-0.5 shrink-0 text-threat-elevated" />
            <span className="text-[10.5px] leading-relaxed text-ink-muted">{error}</span>
          </div>
        ) : null}

        {/* --- result --- */}
        {realRoute ? (
          <div className="space-y-3 border-t border-base-700/60 pt-3">
            <div className="grid grid-cols-3 gap-2">
              <Metric label="Distance" value={formatDistance(realRoute.distanceM)} tone={TONE_HEX.info} />
              <Metric label="Travel time" value={formatDuration(realRoute.durationS)} tone={TONE_HEX.low} />
              <Metric label="Arrive by" value={etaLabel(realRoute.durationS)} tone={TONE_HEX.elevated} />
            </div>

            <div className="rounded-xl border border-base-700/60 bg-base-900/50 p-2.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-ink-muted">
                  {realRoute.originLabel} → {realRoute.destLabel}
                </span>
                <span
                  className="chip"
                  style={{
                    color: realRoute.source === 'osrm' ? TONE_HEX.low : TONE_HEX.elevated,
                    borderColor: `${realRoute.source === 'osrm' ? TONE_HEX.low : TONE_HEX.elevated}55`,
                    background: `${realRoute.source === 'osrm' ? TONE_HEX.low : TONE_HEX.elevated}18`,
                  }}
                >
                  {realRoute.source === 'osrm' ? 'LIVE ROAD ROUTE' : 'ESTIMATE'}
                </span>
              </div>
              <p className="mt-1.5 text-[10.5px] leading-relaxed text-ink-faint">{realRoute.note}</p>
            </div>

            <div>
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
                Turn-by-turn
              </div>
              <ol className="space-y-2">
                {realRoute.steps.map((s, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span
                      className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[10px] font-semibold"
                      style={{
                        color: i === 0 ? TONE_HEX.low : i === realRoute.steps.length - 1 ? TONE_HEX.info : TONE_HEX.neutral,
                        borderColor: '#2a3348',
                      }}
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] leading-snug text-ink">{s.instruction}</span>
                      {s.distanceM > 5 ? (
                        <span className="mt-0.5 block font-mono text-[10.5px] text-ink-faint">
                          {formatDistance(s.distanceM)}
                          {s.durationS > 30 ? ` · ${formatDuration(s.durationS)}` : ''}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            <div>
              <div className="flex items-center justify-between text-[11px] text-ink-muted">
                <span>Road-hazard scan of this corridor</span>
                <span className="font-mono text-ink">
                  {analysis.totals.blockedRoads} road(s) closed district-wide
                </span>
              </div>
              <Bar className="mt-1.5" value={Math.min(1, analysis.totals.blockedRoads / 10)} tone="elevated" height={5} />
              <p className="mt-1.5 text-[10.5px] leading-relaxed text-ink-faint">
                Live directions follow real roads but do not know about flood depth. Cross-check the SafeRoute tab, where
                the least-risk corridor avoids the roads REACH has taken out of service.
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

function PinRow({
  tone,
  icon,
  label,
  value,
  onPick,
  onClear,
  picking,
}: {
  tone: string;
  icon: React.ReactNode;
  label: string;
  value?: string;
  onPick: () => void;
  onClear: () => void;
  picking: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border"
        style={{ color: tone, borderColor: `${tone}55`, background: `${tone}18` }}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">{label}</div>
        <div className={clsx('truncate text-[12px]', value ? 'text-ink' : 'text-ink-faint')}>
          {value ?? 'Not set'}
        </div>
      </div>
      <button
        type="button"
        onClick={onPick}
        className={clsx('btn !px-2 !py-1 text-[11px]', picking && 'btn-primary')}
      >
        {picking ? 'Tap map…' : 'Set on map'}
      </button>
      {value ? (
        <button type="button" className="btn btn-ghost !px-1.5 !py-1" onClick={onClear} aria-label="Clear pin">
          <X size={12} />
        </button>
      ) : null}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-xl border border-base-700/60 bg-base-900/50 p-2.5">
      <div className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">{label}</div>
      <div className="mt-1 font-mono text-[14px]" style={{ color: tone }}>
        {value}
      </div>
    </div>
  );
}
