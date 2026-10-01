/**
 * Supabase sync layer — the thin bridge between the offline-first store and
 * the shared backend (free tier, keyless signup for the user).
 *
 * Design rules:
 *  - The local store is ALWAYS the source of truth for the UI. Supabase is a
 *    mirror: we push local writes and pull remote writes, skipping ids we
 *    already have. This keeps REACH fully functional offline, which is the
 *    product's core promise.
 *  - Every push is fire-and-forget with console diagnostics; failures leave
 *    the local record untouched and it will be retried on the next flush.
 *  - Realtime channels broadcast inserts to every device instantly.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Broadcast, CommunityReport, MissingPerson, SosAlert, SupabaseConfig } from '../types';

const CFG_KEY = 'reach-supabase-cfg-v1';
const DEVICE_KEY = 'reach-device-id-v1';

let client: SupabaseClient | null = null;

export function loadConfig(): SupabaseConfig | null {
  try {
    const raw = window.localStorage.getItem(CFG_KEY);
    if (!raw) return null;
    const cfg = JSON.parse(raw) as SupabaseConfig;
    return cfg.url && cfg.anonKey ? cfg : null;
  } catch {
    return null;
  }
}

export function saveConfig(cfg: SupabaseConfig | null) {
  try {
    if (cfg) window.localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
    else window.localStorage.removeItem(CFG_KEY);
  } catch {
    /* ignore */
  }
  client = null;
  if (cfg) connect(cfg);
}

export function connect(cfg: SupabaseConfig): SupabaseClient {
  if (client) return client;
  client = createClient(cfg.url.replace(/\/$/, ''), cfg.anonKey, {
    auth: { persistSession: false },
    realtime: { params: { eventsPerSecond: 5 } },
  });
  return client;
}

export function getSupabase(): SupabaseClient | null {
  if (client) return client;
  const cfg = loadConfig();
  if (cfg) return connect(cfg);
  return null;
}

export function isSyncConfigured(): boolean {
  return getSupabase() !== null;
}

export function deviceId(): string {
  try {
    let id = window.localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = `dev_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
      window.localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return 'dev_unknown';
  }
}

/* ------------------------------------------------------------------ */
/* Row mapping                                                         */
/* ------------------------------------------------------------------ */

type Table = 'community_reports' | 'missing_persons' | 'sos_events' | 'broadcasts' | 'shelter_updates';

interface ShelterUpdateRow {
  shelter_id: string;
  capacity: number | null;
  occupancy_delta: number | null;
  note: string;
}

function toRow(table: Table, item: unknown): Record<string, unknown> {
  const base = { device_id: deviceId() };
  switch (table) {
    case 'community_reports': {
      const r = item as CommunityReport;
      return { ...base, id: r.id, kind: r.kind, title: r.title, detail: r.detail, author: r.author, zone_id: r.zoneId, road_id: r.roadId, shelter_id: r.shelterId, status: r.status, trust: r.trust, created_at: r.createdAt };
    }
    case 'missing_persons': {
      const m = item as MissingPerson;
      return { ...base, id: m.id, name: m.name, age_band: m.ageBand, description: m.description, last_seen_location: m.lastSeenLocation, last_seen_at: m.lastSeenAt, status: m.status, contact: m.contactVisibility === 'public' ? m.contact : null, notes: m.notes, created_at: m.createdAt, updated_at: m.updatedAt };
    }
    case 'sos_events': {
      const s = item as SosAlert;
      return { ...base, id: s.id, lat: s.lat, lng: s.lng, name: s.name, people_count: s.peopleCount, message: s.message, needs: s.needs, severity: s.severity, status: s.status, created_at: s.createdAt };
    }
    case 'broadcasts': {
      const b = item as Broadcast;
      return { ...base, id: b.id, title: b.title, body: b.body, severity: b.severity, author: b.author, area: b.area, created_at: b.at };
    }
    case 'shelter_updates': {
      const u = item as ShelterUpdateRow;
      return { ...base, shelter_id: u.shelter_id, capacity: u.capacity, occupancy_delta: u.occupancy_delta, note: u.note };
    }
  }
}

function fromReport(row: Record<string, unknown>): CommunityReport {
  return {
    id: String(row.id),
    kind: row.kind as CommunityReport['kind'],
    createdAt: Number(row.created_at),
    author: String(row.author ?? 'Remote'),
    title: String(row.title),
    detail: String(row.detail ?? ''),
    zoneId: (row.zone_id as string) ?? undefined,
    roadId: (row.road_id as string) ?? undefined,
    shelterId: (row.shelter_id as string) ?? undefined,
    status: (row.status as CommunityReport['status']) ?? 'pending',
    trust: (row.trust as CommunityReport['trust']) ?? 'community',
  };
}

function fromMissing(row: Record<string, unknown>): MissingPerson {
  return {
    id: String(row.id),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at ?? row.created_at),
    name: String(row.name),
    ageBand: String(row.age_band ?? 'unknown'),
    description: String(row.description ?? ''),
    lastSeenLocation: String(row.last_seen_location ?? ''),
    lastSeenAt: Number(row.last_seen_at ?? row.created_at),
    contact: String(row.contact ?? ''),
    contactVisibility: row.contact ? 'public' : 'responders',
    status: (row.status as MissingPerson['status']) ?? 'missing',
    notes: Array.isArray(row.notes) ? (row.notes as string[]) : [],
  };
}

function fromBroadcast(row: Record<string, unknown>): Broadcast {
  return {
    id: String(row.id),
    at: Number(row.created_at),
    author: String(row.author ?? 'Control room'),
    severity: (row.severity as Broadcast['severity']) ?? 'info',
    title: String(row.title),
    body: String(row.body ?? ''),
    area: (row.area as string) ?? undefined,
    synced: true,
  };
}

export interface PullResult {
  reports: CommunityReport[];
  missingPersons: MissingPerson[];
  broadcasts: Broadcast[];
}

/** Fetches the shared mirror of the three main tables. */
export async function pullAll(): Promise<PullResult> {
  const sb = getSupabase();
  if (!sb) return { reports: [], missingPersons: [], broadcasts: [] };
  const [reports, missing, broadcasts] = await Promise.all([
    sb.from('community_reports').select('*').order('created_at', { ascending: false }).limit(200),
    sb.from('missing_persons').select('*').order('created_at', { ascending: false }).limit(100),
    sb.from('broadcasts').select('*').order('created_at', { ascending: false }).limit(100),
  ]);
  return {
    reports: (reports.data ?? []).map(fromReport),
    missingPersons: (missing.data ?? []).map(fromMissing),
    broadcasts: (broadcasts.data ?? []).map(fromBroadcast),
  };
}

/** Push a list of local writes. Silently skips when Supabase is unconfigured. */
export async function pushWrites(
  writes: { reports?: CommunityReport[]; missingPersons?: MissingPerson[]; broadcasts?: Broadcast[] },
): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: 'not-configured' };
  try {
    const jobs: PromiseLike<unknown>[] = [];
    if (writes.reports?.length) jobs.push(sb.from('community_reports').upsert(writes.reports.map((r) => toRow('community_reports', r))));
    if (writes.missingPersons?.length) jobs.push(sb.from('missing_persons').upsert(writes.missingPersons.map((m) => toRow('missing_persons', m))));
    if (writes.broadcasts?.length) jobs.push(sb.from('broadcasts').upsert(writes.broadcasts.map((b) => toRow('broadcasts', b))));
    const results = await Promise.all(jobs);
    const firstErr = (results as { error?: { message?: string } }[]).find((r) => r?.error)?.error?.message;
    if (firstErr) return { ok: false, error: firstErr };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'push failed' };
  }
}

export interface SyncHandlers {
  onReport?: (r: CommunityReport) => void;
  onMissing?: (m: MissingPerson) => void;
  onBroadcast?: (b: Broadcast) => void;
  onStatus?: (s: 'connected' | 'error', msg?: string) => void;
}

let channel: ReturnType<SupabaseClient['channel']> | null = null;

/** Subscribes to realtime inserts. Returns an unsubscribe function. */
export function subscribeRealtime(handlers: SyncHandlers): () => void {
  const sb = getSupabase();
  if (!sb) return () => undefined;
  if (channel) {
    void sb.removeChannel(channel);
    channel = null;
  }
  channel = sb
    .channel('reach-live')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'community_reports' }, (payload) => {
      handlers.onReport?.(fromReport(payload.new as Record<string, unknown>));
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'missing_persons' }, (payload) => {
      handlers.onMissing?.(fromMissing(payload.new as Record<string, unknown>));
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'broadcasts' }, (payload) => {
      handlers.onBroadcast?.(fromBroadcast(payload.new as Record<string, unknown>));
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') handlers.onStatus?.('connected');
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') handlers.onStatus?.('error', status);
    });
  return () => {
    if (channel) void sb.removeChannel(channel);
    channel = null;
  };
}
