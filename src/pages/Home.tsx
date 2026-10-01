import {
  ArrowRight,
  Bot,
  Building2,
  Clock,
  Compass,
  HeartPulse,
  HelpCircle,
  MapPin,
  Phone,
  Route as RouteIcon,
  ShieldCheck,
  Siren,
  TriangleAlert,
  Users,
  Waves,
} from 'lucide-react';
import type { Analysis } from '../lib/engine/analysis';
import { useReach, type NavKey } from '../lib/store';
import { Banner, Bar, LevelPill, Panel, PanelHead, Stat, TONE_HEX } from '../components/ui';
import { ZONE_BY_ID } from '../lib/data/region';
import { formatCompact, formatNumber, riskColor } from '../lib/geo';
import clsx from 'clsx';

interface Intent {
  key: NavKey;
  title: string;
  blurb: string;
  icon: typeof Siren;
  tone: keyof typeof TONE_HEX;
  audience: ('resident' | 'operator')[];
}

const INTENTS: Intent[] = [
  {
    key: 'sos',
    title: 'I need help now',
    blurb: 'Send an SOS with your location, or reach 112, 108 and the air rescue helplines in one tap.',
    icon: Siren,
    tone: 'critical',
    audience: ['resident', 'operator'],
  },
  {
    key: 'saferoute',
    title: 'Get me out safely',
    blurb: 'See the least-risk way out of your area, and which roads are already closed.',
    icon: RouteIcon,
    tone: 'low',
    audience: ['resident', 'operator'],
  },
  {
    key: 'shelters',
    title: 'Find a shelter',
    blurb: 'Live capacity, facilities, accessibility and how far each shelter is from you.',
    icon: Building2,
    tone: 'info',
    audience: ['resident', 'operator'],
  },
  {
    key: 'assistant',
    title: 'Ask a question',
    blurb: '“What do I carry?” “What if someone is missing?” — answered offline by REACH Assistant.',
    icon: Bot,
    tone: 'accent',
    audience: ['resident', 'operator'],
  },
  {
    key: 'community',
    title: 'Report or find someone',
    blurb: 'Report a closed road or a shelter update, or file and check missing / safe persons.',
    icon: Users,
    tone: 'elevated',
    audience: ['resident', 'operator'],
  },
  {
    key: 'preparedness',
    title: 'Prepare before it hits',
    blurb: 'Interactive checklists for before, during and after — flood, landslide and general.',
    icon: ShieldCheck,
    tone: 'moderate',
    audience: ['resident', 'operator'],
  },
  {
    key: 'command',
    title: 'Open the Command Center',
    blurb: 'The four questions, the fallout chain, and the ranked priority action list.',
    icon: Compass,
    tone: 'info',
    audience: ['operator'],
  },
  {
    key: 'map',
    title: 'Open the Live Map',
    blurb: 'Toggle flood, landslide, slope, settlements, roads, hospitals and shelters.',
    icon: MapPin,
    tone: 'info',
    audience: ['operator'],
  },
  {
    key: 'timeline',
    title: 'Run the timeline',
    blurb: 'Scrub 12 hours back and 24 hours forward to see where the hazard is heading.',
    icon: Clock,
    tone: 'elevated',
    audience: ['operator'],
  },
];

export function Home({ analysis }: { analysis: Analysis }) {
  const setNav = useReach((s) => s.setNav);
  const audience = useReach((s) => s.audience);
  const setAudience = useReach((s) => s.setAudience);
  const emergencyMode = useReach((s) => s.emergencyMode);
  const toggleEmergencyMode = useReach((s) => s.toggleEmergencyMode);
  const setFocus = useReach((s) => s.setFocus);
  const setSelectedZoneId = useReach((s) => s.setSelectedZoneId);

  const worst = analysis.zones[0];
  const worstZone = worst ? ZONE_BY_ID[worst.zoneId] : null;
  const bestShelter = [...analysis.shelters].sort(
    (a, b) => a.occupancyPct - b.occupancyPct || a.riskScore - b.riskScore,
  )[0];

  const tiles = INTENTS.filter((i) => i.audience.includes(audience));
  const gap = analysis.totals.shelterGap;

  const questions = [
    {
      q: 'WHERE IS THE DANGER?',
      tone: 'critical' as const,
      answer: worstZone
        ? `${worstZone.name} — risk ${Math.round(worst!.risk)}/100`
        : 'No zone is currently above threshold',
      detail: worst
        ? `${Math.round(worst.flood * 100)}% flood intensity, ${Math.round(worst.landslide * 100)}% slope-failure probability. ${analysis.graph.removed.length} road(s) removed from the network.`
        : '',
      go: () => setNav('map'),
      cta: 'See it on the map',
    },
    {
      q: 'WHO IS AT RISK?',
      tone: 'high' as const,
      answer: `${formatNumber(analysis.totals.populationAtRisk)} residents exposed`,
      detail: `${formatNumber(analysis.totals.populationNeedingAssistance)} of them cannot self-evacuate and need assistance. ${analysis.totals.isolatedZones} zone(s) are cut off entirely.`,
      go: () => setNav('command'),
      cta: 'Break it down',
    },
    {
      q: 'WHERE CAN THEY GO?',
      tone: gap > 0 ? ('critical' as const) : ('low' as const),
      answer: bestShelter
        ? `${bestShelter.name} — ${formatNumber(bestShelter.available)} spaces free`
        : 'Shelter data unavailable',
      detail:
        gap > 0
          ? `Capacity shortfall of ${formatNumber(gap)} spaces. Overflow will need additional sites or evacuation beyond the district.`
          : `Capacity is sufficient by ${formatNumber(-gap)} spaces across ${analysis.shelters.length} shelters.`,
      go: () => setNav('shelters'),
      cta: 'Open shelters',
    },
    {
      q: 'WHAT SHOULD HAPPEN NEXT?',
      tone: 'info' as const,
      answer: analysis.actions[0]?.title ?? 'No action required',
      detail: analysis.actions[0]?.rationale ?? '',
      go: () => setNav('command'),
      cta: 'Full priority list',
    },
  ];

  return (
    <div className="space-y-5">
      {/* ---------- hero ---------- */}
      <Panel className="relative overflow-hidden">
        <div className="grid-lines pointer-events-none absolute inset-0 opacity-60" />
        <div className="relative grid gap-5 p-5 lg:grid-cols-[1.35fr_1fr] lg:p-7">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <LevelPill level={worst?.level ?? 'low'}>
                {worst ? `${worst.level.toUpperCase()} ALERT` : 'ALL CLEAR'}
              </LevelPill>
              <span className="chip border-base-600/70 bg-base-800/70 text-ink-muted">
                <Waves size={12} /> {analysis.hazard.rainfallRateMmHr.toFixed(1)} mm/hr rainfall
              </span>
              <span className="chip border-base-600/70 bg-base-800/70 text-ink-muted">
                <Clock size={12} /> {emergencyMode ? 'Emergency Response Mode' : 'Analysis Mode'}
              </span>
            </div>

            <h1 className="mt-4 text-2xl font-bold leading-tight text-ink sm:text-[30px]">
              {worstZone ? (
                <>
                  Highest risk right now is{' '}
                  <span style={{ color: riskColor(worst?.level ?? 'low') }}>{worstZone.name}</span>.
                </>
              ) : (
                'No zone is currently above the risk threshold.'
              )}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
              REACH runs continuous risk, route, shelter and communication analysis for Varun Valley District. It keeps
              working when the network does not: cached maps, saved hazard layers, emergency numbers, your SOS queue and
              the local assistant all stay available offline.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" className="btn btn-danger !px-5 !py-3 text-sm font-bold" onClick={() => setNav('sos')}>
                <Siren size={17} /> Emergency SOS
              </button>
              <button
                type="button"
                className="btn !px-5 !py-3"
                onClick={() => {
                  if (worstZone) {
                    setSelectedZoneId(worstZone.id);
                    setFocus(worstZone.lat, worstZone.lng, 14);
                  }
                  setNav('map');
                }}
              >
                <MapPin size={16} /> Show me the danger
              </button>
              <button type="button" className="btn btn-primary !px-5 !py-3" onClick={() => setNav('saferoute')}>
                <RouteIcon size={16} /> Route me out
              </button>
              <button
                type="button"
                className={clsx('btn !px-5 !py-3', emergencyMode && 'btn-danger')}
                onClick={toggleEmergencyMode}
              >
                <TriangleAlert size={16} /> {emergencyMode ? 'Exit Emergency Mode' : 'Enter Emergency Mode'}
              </button>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2 text-[11px] text-ink-faint">
              <span>I am viewing this as</span>
              {(['resident', 'operator'] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAudience(a)}
                  className={clsx(
                    'rounded-full border px-3 py-1 transition',
                    audience === a
                      ? 'border-threat-info/50 bg-threat-info/15 text-threat-info'
                      : 'border-base-600/70 text-ink-muted hover:text-ink',
                  )}
                >
                  {a === 'resident' ? 'A resident / family' : 'A coordinator / responder'}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 self-start">
            <Stat
              label="Population at risk"
              value={formatCompact(analysis.totals.populationAtRisk)}
              sub={`of ${formatCompact(analysis.totals.totalPopulation)} in district`}
              tone="high"
              icon={<Users size={14} />}
              onClick={() => setNav('command')}
            />
            <Stat
              label="Needing assistance"
              value={formatCompact(analysis.totals.populationNeedingAssistance)}
              sub="elderly, disabled, no transport"
              tone="elevated"
              icon={<HeartPulse size={14} />}
              onClick={() => setNav('command')}
            />
            <Stat
              label="Shelter spaces free"
              value={formatNumber(analysis.totals.shelterCapacityAvailable)}
              sub={gap > 0 ? `${formatNumber(gap)} short of demand` : 'sufficient for demand'}
              tone={gap > 0 ? 'critical' : 'low'}
              icon={<Building2 size={14} />}
              onClick={() => setNav('shelters')}
            />
            <Stat
              label="Roads out of service"
              value={analysis.totals.blockedRoads}
              sub="auto-removed from routing"
              tone="elevated"
              icon={<RouteIcon size={14} />}
              onClick={() => setNav('saferoute')}
            />
          </div>
        </div>
      </Panel>

      {/* ---------- domino warning ---------- */}
      {analysis.domino.criticalityScore >= 20 ? (
        <Banner
          tone={analysis.domino.criticalityScore >= 45 ? 'critical' : 'high'}
          icon={<TriangleAlert size={15} />}
          title={`Domino risk ${Math.round(analysis.domino.criticalityScore)}/100 — ${analysis.domino.steps.length} cascading effects detected`}
        >
          {analysis.domino.steps[1]?.title ?? analysis.domino.steps[0]?.title}
          <button type="button" className="ml-2 underline decoration-dotted hover:text-ink" onClick={() => setNav('command')}>
            Open the fallout chain
          </button>
        </Banner>
      ) : null}

      {/* ---------- the four questions ---------- */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-ink">The four questions</h2>
          <span className="hud-text">answered continuously</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {questions.map((item) => (
            <Panel key={item.q} className="flex flex-col overflow-hidden">
              <div className="h-[3px] w-full" style={{ background: TONE_HEX[item.tone] }} />
              <div className="flex flex-1 flex-col p-4">
                <div className="hud-text" style={{ color: TONE_HEX[item.tone] }}>
                  {item.q}
                </div>
                <div className="mt-2.5 text-[15px] font-semibold leading-snug text-ink">{item.answer}</div>
                <p className="mt-2 flex-1 text-[12px] leading-relaxed text-ink-muted">{item.detail}</p>
                <button
                  type="button"
                  onClick={item.go}
                  className="mt-3 inline-flex items-center gap-1.5 self-start text-[12px] font-medium transition hover:gap-2.5"
                  style={{ color: TONE_HEX[item.tone] }}
                >
                  {item.cta} <ArrowRight size={13} />
                </button>
              </div>
            </Panel>
          ))}
        </div>
      </div>

      {/* ---------- intent tiles (the simple part) ---------- */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-ink">What do you need?</h2>
          <span className="hud-text">{audience === 'resident' ? 'resident view' : 'coordinator view'}</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {tiles.map((t) => {
            const Icon = t.icon;
            const hex = TONE_HEX[t.tone];
            return (
              <button
                key={t.key + t.title}
                type="button"
                onClick={() => setNav(t.key)}
                className="group relative overflow-hidden rounded-2xl border border-base-700/70 bg-base-850/70 p-4 text-left transition hover:-translate-y-0.5 hover:border-base-600 hover:bg-base-800/80 active:translate-y-0"
              >
                <div
                  className="absolute inset-x-0 top-0 h-[2px] opacity-70 transition group-hover:opacity-100"
                  style={{ background: `linear-gradient(90deg, ${hex}, transparent)` }}
                />
                <div className="flex items-start gap-3.5">
                  <span
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border transition group-hover:scale-105"
                    style={{ color: hex, borderColor: `${hex}44`, background: `${hex}14` }}
                  >
                    <Icon size={19} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-[15px] font-semibold text-ink">
                      {t.title}
                      <ArrowRight size={14} className="opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" style={{ color: hex }} />
                    </span>
                    <span className="mt-1 block text-[12px] leading-relaxed text-ink-muted">{t.blurb}</span>
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ---------- offline + readiness strip ---------- */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <PanelHead
            title="What still works without internet"
            subtitle="REACH is offline-first — the critical path never depends on connectivity"
            icon={<ShieldCheck size={15} />}
            tone="low"
          />
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            <div>
              <div className="hud-text mb-2" style={{ color: TONE_HEX.low }}>
                Offline — always available
              </div>
              <ul className="space-y-1.5 text-[12px] leading-relaxed text-ink-muted">
                {[
                  'Cached map tiles and previously downloaded hazard layers',
                  'Emergency contacts and dialling links (112, 108, 1078, air rescue)',
                  'SOS queue — stored and transmitted when signal returns',
                  'Shelter information and previously calculated routes',
                  'Preparedness guides and the local assistant knowledge base',
                ].map((t) => (
                  <li key={t} className="flex gap-2">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full" style={{ background: TONE_HEX.low }} />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="hud-text mb-2" style={{ color: TONE_HEX.info }}>
                Online — refreshed live
              </div>
              <ul className="space-y-1.5 text-[12px] leading-relaxed text-ink-muted">
                {[
                  'Fresh satellite and weather data',
                  'Cloud synchronisation of reports and shelter updates',
                  'New community reports and verification',
                  'Live updates and remote alerts from the control room',
                ].map((t) => (
                  <li key={t} className="flex gap-2">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full" style={{ background: TONE_HEX.info }} />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Panel>

        <Panel>
          <PanelHead
            title="Readiness"
            subtitle="How prepared the district is for this event"
            icon={<ShieldCheck size={15} />}
            tone="elevated"
          />
          <div className="space-y-4 p-4">
            <div>
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-ink-muted">Composite readiness</span>
                <span className="font-mono text-ink">{analysis.totals.readiness}%</span>
              </div>
              <Bar
                className="mt-2"
                value={analysis.totals.readiness / 100}
                tone={analysis.totals.readiness >= 70 ? 'low' : analysis.totals.readiness >= 45 ? 'elevated' : 'critical'}
                height={8}
              />
            </div>
            <div>
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-ink-muted">Shelter capacity coverage</span>
                <span className="font-mono text-ink">
                  {Math.round(
                    Math.min(
                      120,
                      (analysis.totals.shelterCapacityAvailable / Math.max(1, analysis.totals.shelterDemand)) * 100,
                    ),
                  )}
                  %
                </span>
              </div>
              <Bar
                className="mt-2"
                value={Math.min(1, analysis.totals.shelterCapacityAvailable / Math.max(1, analysis.totals.shelterDemand))}
                tone="info"
                height={8}
              />
            </div>
            <button
              type="button"
              className="btn w-full"
              onClick={() => setNav('preparedness')}
            >
              <HelpCircle size={14} /> Open preparedness checklists
            </button>
            <button type="button" className="btn w-full btn-danger" onClick={() => setNav('sos')}>
              <Phone size={14} /> Emergency numbers &amp; SOS
            </button>
          </div>
        </Panel>
      </div>
    </div>
  );
}
