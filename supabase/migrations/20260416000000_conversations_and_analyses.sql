-- ─── Conversations ───────────────────────────────────────────────────────────
-- Stores the raw text the user pasted in for analysis.
-- Kept separate from the analysis result so a conversation can be
-- re-analyzed in the future without duplicating the text.

create table public.conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  body        text not null
                constraint conversation_min_length check (char_length(body) >= 20),
  preview     text not null
                constraint preview_max_length check (char_length(preview) <= 200),
  created_at  timestamptz not null default now()
);

create index conversations_user_id_idx on public.conversations (user_id);

alter table public.conversations enable row level security;

create policy "Users can view their own conversations"
  on public.conversations for select
  using ((select auth.uid()) = user_id);

create policy "Users can insert their own conversations"
  on public.conversations for insert
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own conversations"
  on public.conversations for delete
  using ((select auth.uid()) = user_id);


-- ─── Analyses ────────────────────────────────────────────────────────────────
-- Stores the full AI analysis result as JSONB alongside denormalized
-- columns for sorting and filtering in list views.

create table public.analyses (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  conversation_id   uuid not null references public.conversations(id) on delete cascade,
  title             text not null
                      constraint title_max_length check (char_length(title) <= 120),
  result            jsonb not null,
  brutal_honesty    boolean not null default false,
  interest_score    smallint not null
                      constraint interest_score_range check (interest_score between 0 and 100),
  ghost_risk        text not null
                      constraint ghost_risk_values check (ghost_risk in ('low', 'medium', 'high')),
  created_at        timestamptz not null default now()
);

create index analyses_user_id_created_idx on public.analyses (user_id, created_at desc);
create index analyses_conversation_id_idx on public.analyses (conversation_id);

alter table public.analyses enable row level security;

create policy "Users can view their own analyses"
  on public.analyses for select
  using ((select auth.uid()) = user_id);

create policy "Users can insert their own analyses"
  on public.analyses for insert
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own analyses"
  on public.analyses for delete
  using ((select auth.uid()) = user_id);
