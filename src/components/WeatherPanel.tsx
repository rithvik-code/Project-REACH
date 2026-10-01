import { useMemo } from 'react';
import {
  CloudRain,
  CloudSun,
  Droplets,
  Flame,
  Gauge,
  MapPin,
  PhoneCall,
  RefreshCw,
  Satellite,
  Sigma,
  Thermometer,
  TriangleAlert,
  Wind,
} from 'lucide-react';
import clsx from 'clsx';
import { INDIA_LOCATIONS, LOCATION_BY_ID } from '../lib/data/india';
import { useReach } from '../lib/store';
import { formatClock, round } from '../lib/geo';
import { Bar, Panel, PanelHead, TONE_HEX, type Tone } from './ui';
import type { Disturbance } from '../lib/types';

const SEVERITY_TONE: Record<string, Tone> = {
  critical: 'critical',
  high: 'high',
  elevated: 'elevated',
  moderate: 'moderate',
  low: 'low',
};

const FIRE_TONE: Record<string, Tone> = {
  extreme: 'critical',
  very_high: 'high',
  high: 'elevated',
  moderate: 'moderate',
  low: 'low',
};

/** Number to call for each disturbance type — REACH's safety mechanism. */
const DISTURBANCE_CALL: Record<Disturbance['kind'], { number: string; who: string }> = {
  very_heavy_rain: { number: '1078', who: 'Disaster control room' },
  heavy_rain: { number: '1078', who: 'Disaster control room' },
  thunderstorm: { number: '112', who: 'National emergency' },
  high_wind: { number: '112', who: 'National emergency' },
  heatwave: { number: '108', who: 'Ambulance / medical' },
  fire_weather: { number: '101', who: 'Fire & rescue' },
  dry_spell: { number: '112', who: 'National emergency' },
};

export function WeatherPanel({ compact = false }: { compact?: boolean }) {
  const locationId = useReach((s) => s.liveLocationId);
  const setLiveLocationId = useReach((s) => s.setLiveLocationId);
  const weather = useReach((s) => s.weather);
  const state = useReach((s) => s.weatherState);
  const connectivity = useReach((s) => s.connectivity);
  const simulateOffline = useReach((s) => s.simulateOffline);

  const loc = LOCATION_BY_ID[locationId];
  const online = connectivity === 'online' && !simulateOffline;

  const maxPrecip = useMemo(
    () => Math.max(4, ...(weather?.hourly.map((h) => h.precipMm) ?? [0])),
    [weather],
  );

  const sourceBadge = weather
    ? weather.source === 'open-meteo'
      ? { text: 'LIVE SATELLITE + STATION FEED', tone: TONE_HEX.low }
      : weather.source === 'cached'
        ? { text: 'CACHED — LAST DOWNLOAD', tone: TONE_HEX.elevated }
        : { text: 'OFFLINE MODEL ESTIMATE', tone: TONE_HEX.high }
    : { text: 'NO DATA', tone: TONE_HEX.neutral };

  return (
    <Panel className="overflow-hidden">
      <PanelHead
        title="Live weather watch — India"
        subtitle="Real forecast data pulled for the selected Indian district, with predicted disturbances and fire danger"
        icon={<Satellite size={15} />}
        tone="info"
        right={
          <span
            className="chip"
            style={{ color: sourceBadge.tone, borderColor: `${sourceBadge.tone}55`, background: `${sourceBadge.tone}18` }}
          >
            {state === 'loading' ? <RefreshCw size={10} className="animate-spin" /> : null}
            {sourceBadge.text}
          </span>
        }
      />

      <div className="space-y-3.5 p-4">
        {/* --- location selector --- */}
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-threat-info/40 bg-threat-info/10 text-threat-info">
            <MapPin size={14} />
          </span>
          <select
            className="field flex-1"
            value={locationId}
            onChange={(e) => setLiveLocationId(e.target.value)}
            aria-label="Select monitored location"
          >
            {INDIA_LOCATIONS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}, {l.state}
              </option>
            ))}
          </select>
        </div>
        {loc ? <p className="text-[10.5px] leading-relaxed text-ink-faint">{loc.note}</p> : null}

        {weather ? (
          <>
            {/* --- current conditions --- */}
            <div className="rounded-xl border border-base-700/60 bg-base-900/50 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  {weather.current.precipMm > 0.2 ? (
                    <CloudRain size={26} className="text-threat-info" />
                  ) : (
                    <CloudSun size={26} className="text-threat-elevated" />
                  )}
                  <div>
                    <div className="font-mono text-2xl leading-none text-ink">
                      {round(weather.current.temperatureC, 1)}°C
                    </div>
                    <div className="mt-0.5 text-[11px] text-ink-muted">{weather.current.condition}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-ink-faint">
                    Updated {formatClock(weather.fetchedAt)}
                  </div>
                  <div className="text-[10.5px] text-ink-muted">{weather.timezone}</div>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Readout icon={<Droplets size={11} />} label="Humidity" value={`${Math.round(weather.current.humidity)}%`} />
                <Readout icon={<Wind size={11} />} label="Wind" value={`${Math.round(weather.current.windKmh)} km/h`} />
                <Readout icon={<CloudRain size={11} />} label="Rain now" value={`${round(weather.current.precipMm, 1)} mm`} />
                <Readout icon={<Gauge size={11} />} label="Pressure" value={`${Math.round(weather.current.pressureHpa)} hPa`} />
              </div>
            </div>

            {/* --- fire danger --- */}
            <div className="rounded-xl border border-base-700/60 bg-base-900/50 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[11.5px] text-ink">
                  <Flame size={13} style={{ color: TONE_HEX[FIRE_TONE[weather.fireClass]] }} />
                  Fire-weather danger
                </div>
                <span
                  className="chip"
                  style={{
                    color: TONE_HEX[FIRE_TONE[weather.fireClass]],
                    borderColor: `${TONE_HEX[FIRE_TONE[weather.fireClass]]}55`,
                    background: `${TONE_HEX[FIRE_TONE[weather.fireClass]]}18`,
                  }}
                >
                  {weather.fireClass.replace('_', ' ').toUpperCase()} · {Math.round(weather.fireDanger * 100)}/100
                </span>
              </div>
              <Bar className="mt-2" value={weather.fireDanger} tone={FIRE_TONE[weather.fireClass]} height={6} />
              <p className="mt-1.5 text-[10.5px] leading-relaxed text-ink-faint">
                Fosberg fire-weather index from live temperature, humidity and wind. Above 0.70, forest and scrub fires
                spread fast — keep escape routes clear and call the fire service on 101.
              </p>
            </div>

            {/* --- 24h strip --- */}
            {weather.hourly.length ? (
              <div className="rounded-xl border border-base-700/60 bg-base-900/50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
                    Next 24 hours
                  </span>
                  <span className="font-mono text-[10px] text-ink-faint">mm/h · °C</span>
                </div>
                <div className="flex h-11 items-end gap-[3px]">
                  {weather.hourly.map((h) => {
                    const heightPx = Math.max(3, (h.precipMm / maxPrecip) * 44);
                    const hot = h.temperatureC >= 40;
                    return (
                      <div
                        key={h.time}
                        className="relative flex-1"
                        title={`${formatClock(new Date(h.time).getTime())} — ${round(h.precipMm, 1)} mm/h · ${round(
                          h.temperatureC,
                          0,
                        )}°C · ${Math.round(h.humidity)}% RH`}
                      >
                        <div
                          className="w-full rounded-sm transition"
                          style={{
                            height: `${heightPx}px`,
                            background: h.precipMm > 0.2 ? TONE_HEX.info : hot ? TONE_HEX.high : '#2a3348',
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 flex justify-between font-mono text-[9.5px] text-ink-faint">
                  <span>now</span>
                  <span>+12h</span>
                  <span>+24h</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-ink-faint">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-sm" style={{ background: TONE_HEX.info }} /> rain
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-sm" style={{ background: TONE_HEX.high }} /> ≥40°C
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Thermometer size={10} /> peak {round(Math.max(...weather.hourly.map((h) => h.temperatureC)), 0)}°C
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Sigma size={10} /> 24h rain{' '}
                    {round(weather.hourly.reduce((a, h) => a + h.precipMm, 0), 1)} mm
                  </span>
                </div>
              </div>
            ) : null}

            {/* --- predicted disturbances --- */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
                  Predicted disturbances
                </span>
                <span className="font-mono text-[10px] text-ink-faint">{weather.disturbances.length} flagged</span>
              </div>

              {weather.disturbances.length ? (
                <div className="space-y-2">
                  {weather.disturbances.slice(0, compact ? 3 : 6).map((d) => {
                    const tone = SEVERITY_TONE[d.severity];
                    const call = DISTURBANCE_CALL[d.kind];
                    return (
                      <div
                        key={d.id}
                        className="rounded-xl border px-3 py-2.5"
                        style={{ borderColor: `${TONE_HEX[tone]}44`, background: `${TONE_HEX[tone]}10` }}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <TriangleAlert size={12} style={{ color: TONE_HEX[tone] }} />
                          <span className="text-[12px] font-medium text-ink">{d.label}</span>
                          <span
                            className="chip ml-auto"
                            style={{
                              color: TONE_HEX[tone],
                              borderColor: `${TONE_HEX[tone]}55`,
                              background: `${TONE_HEX[tone]}18`,
                            }}
                          >
                            {d.leadHours <= 0 ? 'NOW' : `T+${d.leadHours}h`}
                          </span>
                        </div>
                        <p className="mt-1.5 text-[11px] leading-relaxed text-ink-muted">{d.detail}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-ink-faint">
                          <span>Peak {d.peakValue.toFixed(d.unit === 'index' ? 2 : 0)} {d.unit}</span>
                          <span>{formatClock(new Date(d.startsAt).getTime())} → {formatClock(new Date(d.endsAt).getTime())}</span>
                          <a
                            href={`tel:${call.number.replace(/\s/g, '')}`}
                            className="ml-auto inline-flex items-center gap-1 font-mono font-semibold"
                            style={{ color: TONE_HEX[tone] }}
                          >
                            <PhoneCall size={10} /> {call.number} · {call.who}
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="rounded-xl border border-base-700/60 bg-base-900/40 px-3 py-3 text-[11px] text-ink-muted">
                  No significant weather disturbance is forecast in the next 72 hours for {loc?.name ?? 'this location'}.
                  That is a good window to restock shelter supplies and re-open maintained roads.
                </p>
              )}
            </div>

            {/* --- 3-day outlook --- */}
            {weather.daily.length ? (
              <div className="grid gap-2 sm:grid-cols-3">
                {weather.daily.slice(0, 3).map((d, i) => (
                  <div key={d.date} className="rounded-xl border border-base-700/60 bg-base-900/50 p-2.5">
                    <div className="text-[10px] uppercase tracking-[0.12em] text-ink-faint">
                      {i === 0 ? 'Today' : new Date(d.date).toLocaleDateString([], { weekday: 'short' })}
                    </div>
                    <div className="mt-1 font-mono text-[13px] text-ink">
                      {round(d.tMin, 0)}–{round(d.tMax, 0)}°C
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-[10.5px] text-ink-muted">
                      <CloudRain size={10} /> {round(d.precipMm, 1)} mm
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-ink-faint">
                      <Wind size={10} /> gusts {round(d.gustKmh, 0)} km/h
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <p className="rounded-xl border border-base-700/60 bg-base-900/40 px-3 py-4 text-[11px] text-ink-muted">
            {online ? 'Loading live weather…' : 'No cached weather for this location yet. Connect once to download it.'}
          </p>
        )}

        {!online ? (
          <div
            className={clsx(
              'rounded-xl border px-3 py-2.5 text-[10.5px] leading-relaxed',
              'border-threat-elevated/40 bg-threat-elevated/10 text-ink-muted',
            )}
          >
            Offline: showing the last downloaded reading{weather?.source === 'open-meteo' ? '' : ' or a modelled estimate'}.
            Live satellite and weather data resume automatically when connectivity returns.
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

function Readout({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-base-700/50 bg-base-900/40 px-2 py-1.5">
      <div className="flex items-center gap-1.5 text-[9.5px] uppercase tracking-[0.12em] text-ink-faint">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 font-mono text-[12.5px] text-ink">{value}</div>
    </div>
  );
}
