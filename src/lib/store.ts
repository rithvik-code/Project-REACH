import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_CONTACTS } from './data/emergencyContacts';
import { DEFAULT_SCENARIO } from './engine/hazard';
import type {
  BasemapKind,
  CommunityReport,
  EmergencyContact,
  MissingPerson,
  PreviewDevice,
  RoadClosure,
  Scenario,
  SosAlert,
  WeatherSnapshot,
} from './types';
import { uid } from './geo';
import { runAnalysis, type Analysis } from './engine/analysis';
import type { AssistantReply } from './engine/assistant';
import type { LatLng, RealRoute } from './engine/directions';
import { DEFAULT_LOCATION_ID, LOCATION_BY_ID } from './data/india';
import { fetchWeather, offlineWeather, readCachedWeather, WEATHER_TTL_MS } from './engine/weather';

export interface LlmConfig {
  /** 'offline' = built-in knowledge base, 'online' = call an LLM provider */
  mode: 'offline' | 'online';
  provider: 'openai' | 'gemini' | 'custom';
  apiKey: string;
  model: string;
  baseUrl: string;
}

export const DEFAULT_LLM: LlmConfig = {
  mode: 'offline',
  provider: 'openai',
  apiKey: '',
  model: 'gpt-4o-mini',
  baseUrl: 'https://api.openai.com/v1',
};

export interface RoutePin extends LatLng {
  label: string;
}

export type NavKey =
  | 'home'
  | 'command'
  | 'map'
  | 'saferoute'
  | 'timeline'
  | 'shelters'
  | 'sos'
  | 'community'
  | 'assistant'
  | 'preparedness';

export type Connectivity = 'online' | 'offline' | 'syncing';

export interface LayerState {
  flood: boolean;
  landslide: boolean;
  fire: boolean;
  slope: boolean;
  settlements: boolean;
  roads: boolean;
  hospitals: boolean;
  shelters: boolean;
  riskZones: boolean;
  blockedRoads: boolean;
  safeRoute: boolean;
  realRoute: boolean;
}

export const DEFAULT_LAYERS: LayerState = {
  flood: true,
  landslide: true,
  fire: true,
  slope: false,
  settlements: true,
  roads: true,
  hospitals: true,
  shelters: true,
  riskZones: true,
  blockedRoads: true,
  safeRoute: true,
  realRoute: true,
};

export interface ChatMessage {
  id: string;
  at: number;
  role: 'user' | 'assistant';
  text: string;
  reply?: AssistantReply;
}

interface State {
  /* navigation + shell */
  nav: NavKey;
  setNav: (n: NavKey) => void;
  emergencyMode: boolean;
  toggleEmergencyMode: () => void;
  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean) => void;
  audience: 'resident' | 'operator';
  setAudience: (a: 'resident' | 'operator') => void;

  /* connectivity */
  connectivity: Connectivity;
  setConnectivity: (c: Connectivity) => void;
  lastSyncAt: number | null;
  simulateOffline: boolean;
  setSimulateOffline: (v: boolean) => void;

  /* map + layers */
  layers: LayerState;
  toggleLayer: (k: keyof LayerState) => void;
  setLayer: (k: keyof LayerState, v: boolean) => void;
  focus: { lat: number; lng: number; zoom?: number; nonce: number } | null;
  setFocus: (lat: number, lng: number, zoom?: number) => void;

  /* basemap + device preview */
  basemap: BasemapKind;
  setBasemap: (b: BasemapKind) => void;
  previewDevice: PreviewDevice;
  setPreviewDevice: (d: PreviewDevice) => void;

  /* live location + weather */
  liveLocationId: string;
  setLiveLocationId: (id: string) => void;
  weather: WeatherSnapshot | null;
  setWeather: (w: WeatherSnapshot | null) => void;
  weatherState: 'idle' | 'loading' | 'ready' | 'error';
  setWeatherState: (s: 'idle' | 'loading' | 'ready' | 'error') => void;

  /* real directions */
  routeOrigin: RoutePin | null;
  routeDest: RoutePin | null;
  setRoutePin: (which: 'origin' | 'dest', pin: RoutePin | null) => void;
  pickingPin: 'origin' | 'dest' | null;
  setPickingPin: (p: 'origin' | 'dest' | null) => void;
  realRoute: RealRoute | null;
  setRealRoute: (r: RealRoute | null) => void;
  directionsBusy: boolean;
  setDirectionsBusy: (b: boolean) => void;

  /* assistant runtime */
  llm: LlmConfig;
  setLlm: (patch: Partial<LlmConfig>) => void;

  /* selection */
  selectedZoneId: string | null;
  setSelectedZoneId: (id: string | null) => void;
  selectedShelterId: string | null;
  setSelectedShelterId: (id: string | null) => void;
  selectedRoadId: string | null;
  setSelectedRoadId: (id: string | null) => void;
  routeOriginZoneId: string | null;
  setRouteOriginZoneId: (id: string | null) => void;

  /* time machine + scenario */
  hourOffset: number;
  setHourOffset: (h: number) => void;
  scenario: Scenario;
  setScenario: (patch: Partial<Scenario>) => void;
  resetScenario: () => void;

  /* road network */
  closures: RoadClosure[];
  addClosure: (roadId: string, reason: string, level?: 'blocked' | 'caution') => void;
  removeClosure: (roadId: string) => void;
  clearClosures: () => void;

  /* shelter capacity patches (verified updates) */
  capacityPatch: Record<string, number>;
  occupancyPatch: Record<string, number>;
  setCapacity: (shelterId: string, capacity: number) => void;
  adjustOccupancy: (shelterId: string, delta: number) => void;
  hospitalStatusPatch: Record<string, 'operational' | 'strained' | 'offline'>;
  setHospitalStatus: (id: string, status: 'operational' | 'strained' | 'offline') => void;

  /* SOS */
  sosAlerts: SosAlert[];
  activeSosId: string | null;
  raiseSos: (alert: Omit<SosAlert, 'id' | 'createdAt' | 'synced' | 'attempts'>) => string;
  cancelSos: (id: string) => void;
  flushSosQueue: () => number;

  /* community */
  reports: CommunityReport[];
  addReport: (r: Omit<CommunityReport, 'id' | 'createdAt' | 'status' | 'trust'> & { trust?: CommunityReport['trust'] }) => string;
  setReportStatus: (id: string, status: CommunityReport['status']) => void;
  missingPersons: MissingPerson[];
  addMissingPerson: (p: Omit<MissingPerson, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'notes'>) => string;
  setMissingStatus: (id: string, status: MissingPerson['status']) => void;
  addMissingNote: (id: string, note: string) => void;

  /* contacts */
  contacts: EmergencyContact[];
  upsertContact: (c: EmergencyContact) => void;
  removeContact: (id: string) => void;
  resetContacts: () => void;

  /* preparedness */
  checklistProgress: Record<string, boolean>;
  toggleTask: (taskId: string) => void;
  resetChecklist: (ids: string[]) => void;

  /* assistant */
  chat: ChatMessage[];
  pushUser: (text: string) => string;
  pushAssistant: (m: ChatMessage) => void;
  clearChat: () => void;
  residentProfile: string;
  setResidentProfile: (p: string) => void;
  assistantBusy: boolean;
  setAssistantBusy: (b: boolean) => void;

  /* derived */
  syncTick: number;
  bumpSync: () => void;
}

const now = () => Date.now();

export const useReach = create<State>()(
  persist(
    (set, get) => ({
      nav: 'home',
      setNav: (n) => set({ nav: n, sidebarOpen: false }),
      emergencyMode: false,
      toggleEmergencyMode: () => set((s) => ({ emergencyMode: !s.emergencyMode })),
      sidebarOpen: false,
      setSidebarOpen: (v) => set({ sidebarOpen: v }),
      audience: 'resident',
      setAudience: (a) => set({ audience: a }),

      connectivity: typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'online',
      setConnectivity: (c) =>
        set((s) => ({
          connectivity: c,
          lastSyncAt: c === 'online' ? now() : s.lastSyncAt,
        })),
      lastSyncAt: null,
      simulateOffline: false,
      setSimulateOffline: (v) => set({ simulateOffline: v }),

      layers: DEFAULT_LAYERS,
      toggleLayer: (k) => set((s) => ({ layers: { ...s.layers, [k]: !s.layers[k] } })),
      setLayer: (k, v) => set((s) => ({ layers: { ...s.layers, [k]: v } })),
      focus: null,
      setFocus: (lat, lng, zoom) => set({ focus: { lat, lng, zoom, nonce: now() } }),

      basemap: 'streets',
      setBasemap: (b) => set({ basemap: b }),
      previewDevice: 'desktop',
      setPreviewDevice: (d) => set({ previewDevice: d }),

      liveLocationId: DEFAULT_LOCATION_ID,
      setLiveLocationId: (id) => set({ liveLocationId: id, weatherState: 'loading' }),
      weather: null,
      setWeather: (w) => set({ weather: w }),
      weatherState: 'idle',
      setWeatherState: (s) => set({ weatherState: s }),

      routeOrigin: null,
      routeDest: null,
      setRoutePin: (which, pin) =>
        set(which === 'origin' ? { routeOrigin: pin, realRoute: null } : { routeDest: pin, realRoute: null }),
      pickingPin: null,
      setPickingPin: (p) => set({ pickingPin: p }),
      realRoute: null,
      setRealRoute: (r) => set({ realRoute: r }),
      directionsBusy: false,
      setDirectionsBusy: (b) => set({ directionsBusy: b }),

      llm: DEFAULT_LLM,
      setLlm: (patch) => set((s) => ({ llm: { ...s.llm, ...patch } })),

      selectedZoneId: 'z_riverbend',
      setSelectedZoneId: (id) => set({ selectedZoneId: id }),
      selectedShelterId: null,
      setSelectedShelterId: (id) => set({ selectedShelterId: id }),
      selectedRoadId: null,
      setSelectedRoadId: (id) => set({ selectedRoadId: id }),
      routeOriginZoneId: 'z_riverbend',
      setRouteOriginZoneId: (id) => set({ routeOriginZoneId: id }),

      hourOffset: 0,
      setHourOffset: (h) => set({ hourOffset: h }),
      scenario: DEFAULT_SCENARIO,
      setScenario: (patch) => set((s) => ({ scenario: { ...s.scenario, ...patch } })),
      resetScenario: () =>
        set({
          scenario: DEFAULT_SCENARIO,
          hourOffset: 0,
          capacityPatch: {},
          occupancyPatch: {},
          hospitalStatusPatch: {},
        }),

      // Seeded to match the verified community report below, so the initial
      // SafeRoute view already has a closed corridor to route around.
      closures: [
        {
          roadId: 'R14',
          reason: 'Causeway submerged — 40 cm of water across the carriageway',
          reportedBy: 'Ward 4 Volunteer (verified)',
          reportedAt: now() - 1000 * 60 * 42,
          verified: true,
          level: 'blocked',
        },
      ],
      addClosure: (roadId, reason, level = 'blocked') =>
        set((s) => ({
          closures: [
            ...s.closures.filter((c) => c.roadId !== roadId),
            { roadId, reason, level, reportedBy: 'Command operator', reportedAt: now(), verified: true },
          ],
        })),
      removeClosure: (roadId) => set((s) => ({ closures: s.closures.filter((c) => c.roadId !== roadId) })),
      clearClosures: () => set({ closures: [] }),

      capacityPatch: {},
      occupancyPatch: {},
      setCapacity: (shelterId, capacity) =>
        set((s) => ({ capacityPatch: { ...s.capacityPatch, [shelterId]: capacity } })),
      adjustOccupancy: (shelterId, delta) =>
        set((s) => ({
          occupancyPatch: { ...s.occupancyPatch, [shelterId]: (s.occupancyPatch[shelterId] ?? 0) + delta },
        })),
      hospitalStatusPatch: {},
      setHospitalStatus: (id, status) =>
        set((s) => ({ hospitalStatusPatch: { ...s.hospitalStatusPatch, [id]: status } })),

      sosAlerts: [],
      activeSosId: null,
      raiseSos: (alert) => {
        const id = uid('sos');
        const entry: SosAlert = {
          ...alert,
          id,
          createdAt: now(),
          attempts: 0,
          synced: get().connectivity === 'online',
        };
        set((s) => ({ sosAlerts: [entry, ...s.sosAlerts], activeSosId: id }));
        return id;
      },
      cancelSos: (id) => set((s) => ({ sosAlerts: s.sosAlerts.map((a) => (a.id === id ? { ...a, status: 'cancelled' } : a)), activeSosId: null })),
      flushSosQueue: () => {
        const pending = get().sosAlerts.filter((a) => !a.synced);
        if (!pending.length) return 0;
        set((s) => ({
          sosAlerts: s.sosAlerts.map((a) => (a.synced ? a : { ...a, synced: true, attempts: a.attempts + 1 })),
          lastSyncAt: now(),
        }));
        return pending.length;
      },

      reports: [
        {
          id: 'rep_seed_1',
          kind: 'road_closure',
          createdAt: now() - 1000 * 60 * 42,
          author: 'Ward 4 Volunteer',
          title: 'R14 Old Town Ghat Road under 40 cm of water',
          detail: 'Causeway is submerged near n_riverbend. Two-wheelers are still attempting it.',
          roadId: 'R14',
          status: 'verified',
          trust: 'verified',
          voice: { lat: 30.133, lng: 78.267 },
        },
        {
          id: 'rep_seed_2',
          kind: 'shelter_capacity',
          createdAt: now() - 1000 * 60 * 128,
          author: 'M. Iyer (Greenfield Dev Board)',
          title: 'Greenfield Sports Complex capacity raised 1200 → 1600',
          detail: 'Two additional halls opened. Water storage topped up for 48 hours.',
          shelterId: 's5',
          status: 'verified',
          trust: 'official',
        },
        {
          id: 'rep_seed_3',
          kind: 'hazard',
          createdAt: now() - 1000 * 60 * 15,
          author: 'Hillcrest resident',
          title: 'Fresh crack across Hillcrest Ridge Road near n_college',
          detail: 'Crack roughly 20 m long and widening. Water seeping through. Please inspect before residents use it.',
          roadId: 'R02',
          zoneId: 'z_hillcrest',
          status: 'pending',
          trust: 'community',
        },
      ],
      addReport: (r) => {
        const id = uid('rep');
        const entry: CommunityReport = {
          ...r,
          id,
          createdAt: now(),
          status: r.trust === 'official' ? 'verified' : 'pending',
          trust: r.trust ?? 'community',
        };
        set((s) => ({ reports: [entry, ...s.reports] }));
        return id;
      },
      setReportStatus: (id, status) =>
        set((s) => ({ reports: s.reports.map((r) => (r.id === id ? { ...r, status } : r)) })),

      missingPersons: [
        {
          id: 'mp_seed_1',
          createdAt: now() - 1000 * 60 * 96,
          updatedAt: now() - 1000 * 60 * 20,
          name: 'Anita Rao',
          ageBand: '60+',
          description: 'Last seen near the Old Town Ghat. Wearing a green saree. Uses a walking stick and is hard of hearing.',
          lastSeenLocation: 'Old Town Ghat steps, near n_oldtown',
          lastSeenAt: now() - 1000 * 60 * 300,
          contact: '+91 90000 22001 (responders only)',
          contactVisibility: 'responders',
          status: 'missing',
          notes: ['Reported to district control room 1078', 'Search focused on Riverbend Colony lanes'],
        },
        {
          id: 'mp_seed_2',
          createdAt: now() - 1000 * 60 * 240,
          updatedAt: now() - 1000 * 60 * 55,
          name: 'Ravi Kumar',
          ageBand: '18-40',
          description: 'Worker at the Industrial Belt. Was on night shift when the bridge closed.',
          lastSeenLocation: 'Industrial Estate Gate',
          lastSeenAt: now() - 1000 * 60 * 480,
          contact: '+91 90000 22002 (responders only)',
          contactVisibility: 'responders',
          status: 'safe',
          notes: ['Reached Northgate Stadium Complex shelter', 'Family informed'],
        },
      ],
      addMissingPerson: (p) => {
        const id = uid('mp');
        set((s) => ({
          missingPersons: [
            {
              ...p,
              id,
              createdAt: now(),
              updatedAt: now(),
              status: 'missing',
              notes: ['Report created locally — will sync when connectivity returns'],
            },
            ...s.missingPersons,
          ],
        }));
        return id;
      },
      setMissingStatus: (id, status) =>
        set((s) => ({
          missingPersons: s.missingPersons.map((m) =>
            m.id === id
              ? {
                  ...m,
                  status,
                  updatedAt: now(),
                  notes: [...m.notes, `Status changed to ${status} at ${new Date().toLocaleTimeString()}`],
                }
              : m,
          ),
        })),
      addMissingNote: (id, note) =>
        set((s) => ({
          missingPersons: s.missingPersons.map((m) =>
            m.id === id ? { ...m, notes: [...m.notes, note], updatedAt: now() } : m,
          ),
        })),

      contacts: DEFAULT_CONTACTS,
      upsertContact: (c) =>
        set((s) => ({
          contacts: s.contacts.some((x) => x.id === c.id)
            ? s.contacts.map((x) => (x.id === c.id ? c : x))
            : [...s.contacts, c],
        })),
      removeContact: (id) => set((s) => ({ contacts: s.contacts.filter((c) => c.id !== id) })),
      resetContacts: () => set({ contacts: DEFAULT_CONTACTS }),

      checklistProgress: {},
      toggleTask: (taskId) =>
        set((s) => ({ checklistProgress: { ...s.checklistProgress, [taskId]: !s.checklistProgress[taskId] } })),
      resetChecklist: (ids) =>
        set((s) => {
          const next = { ...s.checklistProgress };
          ids.forEach((i) => delete next[i]);
          return { checklistProgress: next };
        }),

      chat: [
        {
          id: 'chat_seed',
          at: now(),
          role: 'assistant',
          text: '',
        },
      ],
      pushUser: (text) => {
        const id = uid('msg');
        set((s) => ({ chat: [...s.chat, { id, at: now(), role: 'user', text }] }));
        return id;
      },
      pushAssistant: (m) => set((s) => ({ chat: [...s.chat, m] })),
      clearChat: () => set({ chat: [{ id: 'chat_seed', at: now(), role: 'assistant', text: '' }] }),
      residentProfile: '',
      setResidentProfile: (p) => set({ residentProfile: p }),
      assistantBusy: false,
      setAssistantBusy: (b) => set({ assistantBusy: b }),

      syncTick: 0,
      bumpSync: () => set((s) => ({ syncTick: s.syncTick + 1 })),
    }),
    {
      name: 'reach-offline-v1',
      partialize: (s) => ({
        contacts: s.contacts,
        checklistProgress: s.checklistProgress,
        sosAlerts: s.sosAlerts,
        reports: s.reports,
        missingPersons: s.missingPersons,
        closures: s.closures,
        capacityPatch: s.capacityPatch,
        occupancyPatch: s.occupancyPatch,
        hospitalStatusPatch: s.hospitalStatusPatch,
        residentProfile: s.residentProfile,
        audience: s.audience,
        lastSyncAt: s.lastSyncAt,
        layers: s.layers,
        basemap: s.basemap,
        liveLocationId: s.liveLocationId,
        llm: s.llm,
      }),
    },
  ),
);

/** Shared analysis selector — recomputed whenever any input changes. */
export function useAnalysis(): Analysis {
  const hourOffset = useReach((s) => s.hourOffset);
  const scenario = useReach((s) => s.scenario);
  const closures = useReach((s) => s.closures);
  const capacityPatch = useReach((s) => s.capacityPatch);
  const occupancyPatch = useReach((s) => s.occupancyPatch);
  const hospitalStatusPatch = useReach((s) => s.hospitalStatusPatch);
  const connectivity = useReach((s) => s.connectivity);
  const simulateOffline = useReach((s) => s.simulateOffline);
  const weather = useReach((s) => s.weather);

  return runAnalysis({
    hourOffset,
    scenario,
    closures,
    offline: simulateOffline || connectivity !== 'online',
    capacityPatch,
    occupancyPatch,
    hospitalStatusPatch,
    weather: weather
      ? {
          rainRateMmHr: weather.rainRateMmHr,
          saturation: weather.saturation,
          fireDanger: weather.fireDanger,
          tempC: weather.current.temperatureC,
          humidity: weather.current.humidity,
          windKmh: weather.current.windGustKmh || weather.current.windKmh,
        }
      : null,
  });
}

/**
 * Keeps the live weather snapshot in step with the selected Indian location.
 * Serves the last cached pull instantly (offline-first), then refreshes from
 * Open-Meteo whenever connectivity allows.
 */
export function useWeatherSync() {
  const locationId = useReach((s) => s.liveLocationId);
  const connectivity = useReach((s) => s.connectivity);
  const simulateOffline = useReach((s) => s.simulateOffline);
  const setWeather = useReach((s) => s.setWeather);
  const setWeatherState = useReach((s) => s.setWeatherState);
  const timer = useRef<number | null>(null);

  const online = connectivity === 'online' && !simulateOffline;

  useEffect(() => {
    const loc = LOCATION_BY_ID[locationId];
    if (!loc) return;
    let cancelled = false;

    const cached = readCachedWeather(locationId);
    if (cached) setWeather(cached);

    const load = async () => {
      if (!online) {
        setWeather(cached ?? offlineWeather(loc));
        setWeatherState(cached ? 'ready' : 'error');
        return;
      }
      setWeatherState('loading');
      try {
        const snap = await fetchWeather(loc);
        if (!cancelled) {
          setWeather(snap);
          setWeatherState('ready');
        }
      } catch {
        if (!cancelled) {
          setWeather(cached ?? offlineWeather(loc));
          setWeatherState('error');
        }
      }
    };

    void load();
    timer.current = window.setInterval(() => void load(), WEATHER_TTL_MS);
    return () => {
      cancelled = true;
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [locationId, online, setWeather, setWeatherState]);
}
