# REACH × Supabase — 5-minute setup

REACH's two portals (Citizen / Management) share live data through a free
Supabase project. Until one is configured, REACH runs fully offline-first with
local-only data — nothing breaks without Supabase.

## 1. Create the project

1. Go to [supabase.com](https://supabase.com) → **Start your project** → sign up free.
2. **New project** → pick any name (e.g. `reach-backend`) and a region near you (Mumbai works for India) → create. The free tier includes 500 MB DB, 2 GB egress, realtime — plenty.

## 2. Create the tables

1. In the project dashboard open **SQL Editor** → **New query**.
2. Paste the entire contents of [`supabase/schema.sql`](./schema.sql) → **Run**.
   You should see `Success. No rows returned`.

## 3. Copy the two keys into REACH

1. **Project Settings → API**.
2. Copy **Project URL** and the **anon public** key (NOT the service_role key — it must never touch a browser).
3. In REACH: **Community Reports → ⚙ Sync settings**, paste both, **Connect**.

## 4. Verify

- Device A (management portal): post a broadcast or verify a report.
- Device B (citizen portal, any phone/other network): it appears within a second via realtime — no refresh.
- Flip REACH to offline (airplane mode / offline toggle): reports queue locally, then push automatically on reconnect.

## Security notes (honest scope)

- The anon key is a *public* client key; RLS policies in the schema are open
  read/write on purpose so account-free disaster reporting works. This is
  appropriate for the hackathon scope; production would add auth (phone OTP)
  and rate limits.
- `missing_persons.contact` is only synced when visibility is `public`.
  Responder-only contacts never leave the device.
- The service_role key is never used by the frontend.
