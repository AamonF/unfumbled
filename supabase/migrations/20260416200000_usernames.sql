-- ─── Usernames ───────────────────────────────────────────────────────────────
-- Adds a unique, case-insensitive username to every profile. Captured at
-- sign-up via `auth.users.raw_user_meta_data ->> 'username'` and materialised
-- into `public.profiles.username` by the `handle_new_user` trigger so the app
-- can refer to users by their chosen handle instead of their email.
--
-- Format: 3–20 characters, letters/digits/underscores only. Enforced twice:
-- once at the app layer (friendly errors) and once as a CHECK constraint here
-- (defence-in-depth against a malformed user_metadata payload).

alter table public.profiles
  add column username text
    constraint username_format_check
      check (
        username is null
        or username ~ '^[A-Za-z0-9_]{3,20}$'
      );

-- Case-insensitive uniqueness. Nulls are allowed so existing rows (and any
-- future row where the trigger fires before a username is set) don't collide.
create unique index profiles_username_unique_ci
  on public.profiles (lower(username))
  where username is not null;

-- Replace the new-user trigger function to also capture the username from
-- `raw_user_meta_data`. The client passes it via `supabase.auth.signUp`'s
-- `options.data.username`, which Supabase writes to `raw_user_meta_data`.
-- `display_name` continues to default to the email local part so legacy
-- code paths keep working if the metadata payload is ever missing.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  raw_username text;
begin
  raw_username := nullif(btrim(new.raw_user_meta_data ->> 'username'), '');

  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    raw_username,
    coalesce(raw_username, split_part(new.email, '@', 1))
  );

  return new;
end;
$$;
