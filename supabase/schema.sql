-- REACH shared backend schema (Supabase free tier)
-- Run this once in the Supabase SQL editor (Dashboard → SQL → New query).

create table if not exists public.community_reports (
  id text primary key,
  device_id text,
  kind text not null,
  title text not null,
  detail text,
  author text,
  zone_id text,
  road_id text,
  shelter_id text,
  status text default 'pending',
  trust text default 'community',
  created_at bigint not null
);

create table if not exists public.missing_persons (
  id text primary key,
  device_id text,
  name text not null,
  age_band text,
  description text,
  last_seen_location text,
  last_seen_at bigint,
  status text default 'missing',
  -- responder-only contacts are never synced: null on the server
  contact text,
  notes jsonb default '[]',
  created_at bigint not null,
  updated_at bigint
);

create table if not exists public.sos_events (
  id text primary key,
  device_id text,
  lat double precision not null,
  lng double precision not null,
  name text,
  people_count int default 1,
  message text,
  needs jsonb default '[]',
  severity text default 'critical',
  status text default 'raised',
  created_at bigint not null
);

create table if not exists public.broadcasts (
  id text primary key,
  device_id text,
  title text not null,
  body text,
  severity text default 'info',
  author text,
  area text,
  created_at bigint not null
);

create table if not exists public.shelter_updates (
  id bigint generated always as identity primary key,
  device_id text,
  shelter_id text not null,
  capacity int,
  occupancy_delta int,
  note text,
  created_at bigint default (extract(epoch from now()) * 1000)::bigint
);

-- The anon key is a public client key; REACH uses open write/read so any
-- device (citizen or coordinator) can share without accounts.
alter table public.community_reports enable row level security;
alter table public.missing_persons enable row level security;
alter table public.sos_events enable row level security;
alter table public.broadcasts enable row level security;
alter table public.shelter_updates enable row level security;

create policy "public read reports" on public.community_reports for select using (true);
create policy "public insert reports" on public.community_reports for insert with check (true);
create policy "public update reports" on public.community_reports for update using (true);
create policy "public read missing" on public.missing_persons for select using (true);
create policy "public insert missing" on public.missing_persons for insert with check (true);
create policy "public update missing" on public.missing_persons for update using (true);
create policy "public read sos" on public.sos_events for select using (true);
create policy "public insert sos" on public.sos_events for insert with check (true);
create policy "public read broadcasts" on public.broadcasts for select using (true);
create policy "public insert broadcasts" on public.broadcasts for insert with check (true);
create policy "public update broadcasts" on public.broadcasts for update using (true);
create policy "public read shelter_updates" on public.shelter_updates for select using (true);
create policy "public insert shelter_updates" on public.shelter_updates for insert with check (true);

-- Realtime is enabled by default on all tables in new projects; if inserts
-- do not appear live, run: alter publication supabase_realtime add table public.community_reports; (etc.)
