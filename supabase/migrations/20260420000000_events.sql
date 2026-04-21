-- ─── Events (analytics) ──────────────────────────────────────────────────────
-- Lightweight event log used for product analytics. Rows are written
-- client-side by `lib/analytics.ts#trackEvent` and are only readable by the
-- user that produced them. Never store message content or private
-- conversations here — see lib/analytics.ts safety rules.

create extension if not exists "uuid-ossp";

create table public.events (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references auth.users(id) on delete cascade,
  event_name  text not null
                constraint event_name_length check (char_length(event_name) between 1 and 64),
  metadata    jsonb,
  created_at  timestamptz not null default now()
);

create index events_user_id_created_idx on public.events (user_id, created_at desc);
create index events_event_name_idx on public.events (event_name);

alter table public.events enable row level security;

create policy "Users can insert their own events"
  on public.events for insert
  with check ((select auth.uid()) = user_id);

create policy "Users can view their own events"
  on public.events for select
  using ((select auth.uid()) = user_id);
