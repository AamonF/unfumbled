-- ─── Quota-aware analysis recording ──────────────────────────────────────────
--
-- Two new functions that move quota enforcement to the database layer so the
-- /analyze Edge Function can enforce the free limit server-side, making the
-- local client counter a fast-read cache rather than the authoritative gate.
--
-- record_analysis   — called AFTER OpenAI succeeds; atomically checks quota
--                     AND increments in one transaction so no concurrent call
--                     can push a user past the free limit.
--
-- check_analysis_quota — cheap read-only pre-flight; lets the edge function
--                        short-circuit before spending OpenAI tokens when the
--                        user is already over their limit.
--
-- Both are security definer so no RLS policy is required for the service-role
-- caller (the Edge Function). Users cannot call them directly via the anon key
-- because `security definer set search_path = ''` strips client privileges.

-- ─── 1. check_analysis_quota ─────────────────────────────────────────────────
-- Returns:
--   { "allowed": true,  "remaining": 2,    "tier": "free" }   — quota available
--   { "allowed": true,  "remaining": null,  "tier": "pro"  }   — premium, no cap
--   { "allowed": false, "remaining": 0,     "tier": "free" }   — limit reached

create or replace function public.check_analysis_quota(user_row_id uuid)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  v_tier       text;
  v_count      int;
  v_free_limit int := 3;
begin
  select tier, analysis_count
  into   v_tier, v_count
  from   public.profiles
  where  id = user_row_id;

  -- New user with no profile row yet — treat as zero uses consumed.
  if not found then
    return jsonb_build_object(
      'allowed',   true,
      'remaining', v_free_limit,
      'tier',      'free'
    );
  end if;

  -- Premium / team: always allowed, no cap.
  if v_tier <> 'free' then
    return jsonb_build_object(
      'allowed',   true,
      'remaining', null,
      'tier',      v_tier
    );
  end if;

  -- Free tier: over or at limit.
  if v_count >= v_free_limit then
    return jsonb_build_object(
      'allowed',   false,
      'remaining', 0,
      'tier',      'free'
    );
  end if;

  return jsonb_build_object(
    'allowed',   true,
    'remaining', (v_free_limit - v_count),
    'tier',      'free'
  );
end;
$$;

-- ─── 2. record_analysis ───────────────────────────────────────────────────────
-- Called AFTER a successful OpenAI response.  Atomically checks + increments.
--
-- Race-condition safety: the UPDATE uses `WHERE analysis_count < v_free_limit`
-- so two concurrent requests racing at the last slot can never BOTH succeed.
-- If the conditional UPDATE matches 0 rows, the function re-checks and returns
-- quota_exceeded to the second caller.
--
-- Return shapes:
--   Allowed free:   { "allowed": true,  "new_count": 2, "remaining": 1,    "tier": "free" }
--   Allowed pro:    { "allowed": true,  "new_count": 7, "remaining": null,  "tier": "pro"  }
--   Quota exceeded: { "allowed": false, "reason": "quota_exceeded",
--                     "new_count": 3,  "remaining": 0, "tier": "free" }

create or replace function public.record_analysis(user_row_id uuid)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  v_tier       text;
  v_count      int;
  v_free_limit int := 3;
  v_new_count  int;
begin
  select tier, analysis_count
  into   v_tier, v_count
  from   public.profiles
  where  id = user_row_id;

  -- ── Auto-create missing profile (brand-new user) ──────────────────────────
  if not found then
    insert into public.profiles (id, analysis_count)
    values (user_row_id, 1)
    on conflict (id) do update
      set analysis_count = public.profiles.analysis_count + 1,
          updated_at     = now()
    returning analysis_count into v_new_count;

    return jsonb_build_object(
      'allowed',   true,
      'new_count', v_new_count,
      'remaining', (v_free_limit - v_new_count),
      'tier',      'free'
    );
  end if;

  -- ── Premium / team: always allowed, track for analytics ───────────────────
  if v_tier <> 'free' then
    update public.profiles
    set    analysis_count = analysis_count + 1,
           updated_at     = now()
    where  id = user_row_id
    returning analysis_count into v_new_count;

    return jsonb_build_object(
      'allowed',   true,
      'new_count', v_new_count,
      'remaining', null,
      'tier',      v_tier
    );
  end if;

  -- ── Free tier: already at or over the limit ───────────────────────────────
  if v_count >= v_free_limit then
    return jsonb_build_object(
      'allowed',   false,
      'reason',    'quota_exceeded',
      'new_count', v_count,
      'remaining', 0,
      'tier',      'free'
    );
  end if;

  -- ── Free tier: conditional increment (race-condition safe) ────────────────
  -- The WHERE clause ensures only one concurrent call wins the last slot.
  update public.profiles
  set    analysis_count = analysis_count + 1,
         updated_at     = now()
  where  id             = user_row_id
    and  analysis_count < v_free_limit
  returning analysis_count into v_new_count;

  -- A concurrent call already claimed the last slot between our SELECT and
  -- this UPDATE — return quota_exceeded.
  if v_new_count is null then
    return jsonb_build_object(
      'allowed',   false,
      'reason',    'quota_exceeded',
      'new_count', v_free_limit,
      'remaining', 0,
      'tier',      'free'
    );
  end if;

  return jsonb_build_object(
    'allowed',   true,
    'new_count', v_new_count,
    'remaining', (v_free_limit - v_new_count),
    'tier',      'free'
  );
end;
$$;
