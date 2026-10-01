import { useEffect, useRef } from 'react';
import { useAnalysis, useReach, useWeatherSync, type NavKey } from './lib/store';
import { EmergencyDock, Sidebar, TopBar } from './components/Shell';
import { DevicePreviewFrame } from './components/DevicePreview';
import { Home } from './pages/Home';
import { CommandCenter } from './pages/CommandCenter';
import { LiveMap } from './pages/LiveMap';
import { SafeRoute } from './pages/SafeRoute';
import { Timeline } from './pages/Timeline';
import { Shelters } from './pages/Shelters';
import { Sos } from './pages/Sos';
import { CommunityReports } from './pages/CommunityReports';
import { Assistant } from './pages/Assistant';
import { Preparedness } from './pages/Preparedness';
import { Banner, TONE_HEX } from './components/ui';
import { AlertOctagon } from 'lucide-react';

export default function App() {
  const analysis = useAnalysis();
  useWeatherSync();
  const nav = useReach((s) => s.nav);
  const setNav = useReach((s) => s.setNav);
  const setConnectivity = useReach((s) => s.setConnectivity);
  const connectivity = useReach((s) => s.connectivity);
  const simulateOffline = useReach((s) => s.simulateOffline);
  const flushSosQueue = useReach((s) => s.flushSosQueue);
  const sosAlerts = useReach((s) => s.sosAlerts);
  const emergencyMode = useReach((s) => s.emergencyMode);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  /* ---- real connectivity detection ---- */
  useEffect(() => {
    const goOnline = () => {
      setConnectivity('syncing');
      window.setTimeout(() => {
        setConnectivity('online');
        flushSosQueue();
      }, 900);
    };
    const goOffline = () => setConnectivity('offline');
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    if (!navigator.onLine) setConnectivity('offline');
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [setConnectivity, flushSosQueue]);

  /* ---- switch to the map whenever emergency mode is turned on ---- */
  useEffect(() => {
    if (emergencyMode && nav === 'home') setNav('map');
  }, [emergencyMode, nav, setNav]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [nav]);

  const pendingSos = sosAlerts.filter((a) => !a.synced).length;
  const offline = simulateOffline || connectivity === 'offline';
  const syncing = !simulateOffline && connectivity === 'syncing';

  const pages: Record<NavKey, React.ReactNode> = {
    home: <Home analysis={analysis} />,
    command: <CommandCenter analysis={analysis} />,
    map: <LiveMap analysis={analysis} />,
    saferoute: <SafeRoute analysis={analysis} />,
    timeline: <Timeline analysis={analysis} />,
    shelters: <Shelters analysis={analysis} />,
    sos: <Sos analysis={analysis} />,
    community: <CommunityReports analysis={analysis} />,
    assistant: <Assistant analysis={analysis} />,
    preparedness: <Preparedness analysis={analysis} />,
  };

  return (
    <DevicePreviewFrame>
      <div className="flex h-full min-h-screen bg-base-950">
      <Sidebar analysis={analysis} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar analysis={analysis} />
        <main
          ref={scrollRef}
          className="relative flex-1 overflow-y-auto pb-24"
          style={
            emergencyMode
              ? { background: 'linear-gradient(180deg, rgba(255,59,71,0.06), rgba(5,7,12,0) 340px)' }
              : undefined
          }
        >
          <div className="mx-auto w-full max-w-[1680px] px-3 py-4 sm:px-4 sm:py-5">
            {offline ? (
              <div className="mb-4">
                <Banner
                  tone="elevated"
                  icon={<AlertOctagon size={14} />}
                  title="Offline disaster mode is active"
                >
                  Cached maps, downloaded hazard layers, emergency contacts, shelter information, previously calculated
                  routes and the local assistant all remain available.
                  {pendingSos > 0 ? ` ${pendingSos} SOS alert(s) are queued and will transmit automatically when signal returns.` : ''}
                  {' '}Fresh weather, satellite data and new community reports require connectivity.
                </Banner>
              </div>
            ) : syncing ? (
              <div className="mb-4">
                <Banner tone="info" title="Syncing…">
                  Pushing queued SOS alerts, community reports and shelter updates to the control room.
                </Banner>
              </div>
            ) : null}

            <div key={nav} className="animate-riseIn">
              {pages[nav]}
            </div>

            <footer className="mt-8 border-t border-base-700/60 pt-5 text-[11px] text-ink-faint">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="font-mono tracking-wider" style={{ color: TONE_HEX.info }}>
                  REACH · VVD-04 · Varun Valley District
                </span>
                <span>
                  Continuous loop: Detect → Analyze → Simulate → Communicate → Evacuate → Adapt → Recover
                </span>
                <span className="ml-auto">
                  Emergency: 112 · Ambulance 108 / 102 · Disaster 1078 · NDRF 011-24363260 / 9711077372 · Air ambulance 9540161344
                </span>
              </div>
              <p className="mt-2 max-w-4xl leading-relaxed">
                This deployment uses a synthetic district dataset for demonstration. Hazard fields, road networks and
                capacities are modelled, not surveyed. In a real emergency always follow instructions from your district
                disaster management authority.
              </p>
            </footer>
          </div>
        </main>
        <EmergencyDock />
      </div>
      </div>
    </DevicePreviewFrame>
  );
}
