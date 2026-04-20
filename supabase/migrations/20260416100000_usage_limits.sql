-- ─── User profiles (usage tracking) ──────────────────────────────────────────
-- Tracks per-user usage and subscription tier.
-- Inserted automatically via trigger on auth.users creation.

create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  tier            text not null default 'free'
                    constraint tier_values check (tier in ('free', 'pro', 'team')),
  analysis_count  int not null default 0
                    constraint analysis_count_non_negative check (analysis_count >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can read own profile"
  on public.profiles for select
  using ((select auth.uid()) = id);

create policy "Users can update own profile"
  on public.profiles for update
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Auto-create profile when a new auth user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Atomic increment: returns the NEW count so the client knows immediately
create or replace function public.increment_analysis_count(user_row_id uuid)
returns int
language plpgsql
security definer set search_path = ''
as $$
declare
  new_count int;
begin
  update public.profiles
  set analysis_count = analysis_count + 1,
      updated_at     = now()
  where id = user_row_id
  returning analysis_count into new_count;

  if new_count is null then
    -- Profile doesn't exist yet (edge case); create it
    insert into public.profiles (id, analysis_count)
    values (user_row_id, 1)
    on conflict (id) do update
      set analysis_count = public.profiles.analysis_count + 1,
          updated_at     = now()
    returning analysis_count into new_count;
  end if;

  return new_count;
end;
$$;
