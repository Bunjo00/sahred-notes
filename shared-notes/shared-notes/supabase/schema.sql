-- ─────────────────────────────────────────────────────────────
--  Shared Notes: database setup
--  Paste ALL of this into Supabase → SQL Editor → New query → Run.
--  Safe to run again (e.g. after updating the app).
--
--  Then set your group password with ONE more query:
--      select set_group_password('pick a long pass phrase');
-- ─────────────────────────────────────────────────────────────

create extension if not exists pgcrypto with schema extensions;

-- ── Notes ────────────────────────────────────────────────────
create table if not exists public.notes (
  id          uuid primary key default gen_random_uuid(),
  title       text not null default '' check (char_length(title) <= 200),
  body        text not null default '' check (char_length(body) <= 100000),
  pinned      boolean not null default false,
  updated_by  text not null default 'Someone' check (char_length(updated_by) <= 40),
  editor_id   text check (char_length(editor_id) <= 64),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.notes add column if not exists deleted_at timestamptz;
alter table public.notes add column if not exists deleted_by text check (char_length(deleted_by) <= 40);

-- The server owns the timestamps:
--  • "last edited" only changes when the text changes (pinning/trashing don't count)
--  • "deleted at" is set by the server when a note goes to trash
create or replace function public.notes_touch()
returns trigger language plpgsql as $$
begin
  if new.title is distinct from old.title or new.body is distinct from old.body then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
    new.updated_by := old.updated_by;
    new.editor_id  := old.editor_id;
  end if;
  if new.deleted_at is not null and old.deleted_at is null then
    new.deleted_at := now();
  elsif new.deleted_at is not null then
    new.deleted_at := old.deleted_at;
  end if;
  if new.deleted_at is null then new.deleted_by := null; end if;
  new.created_at := old.created_at;
  return new;
end $$;

drop trigger if exists notes_touch on public.notes;
create trigger notes_touch before update on public.notes
  for each row execute function public.notes_touch();

create or replace function public.notes_before_insert()
returns trigger language plpgsql as $$
begin
  new.created_at := now(); new.updated_at := now();
  new.deleted_at := null;  new.deleted_by := null;
  return new;
end $$;

drop trigger if exists notes_before_insert on public.notes;
create trigger notes_before_insert before insert on public.notes
  for each row execute function public.notes_before_insert();

-- ── Group password + members ─────────────────────────────────
-- Each device signs in anonymously (no account, no email). Entering the right
-- group password once adds that device to "members". Only members can see or
-- change notes. Nobody can read these tables through the API.
create table if not exists public.group_settings (
  id            int primary key default 1 check (id = 1),
  password_hash text not null
);
create table if not exists public.members (
  user_id   uuid primary key references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now()
);
create table if not exists public.join_attempts (
  id      bigserial primary key,
  user_id uuid not null,
  at      timestamptz not null default now()
);
create index if not exists join_attempts_user_at on public.join_attempts (user_id, at);

alter table public.group_settings enable row level security;
alter table public.members        enable row level security;
alter table public.join_attempts  enable row level security;
revoke all on public.group_settings, public.members, public.join_attempts from anon, authenticated;

create or replace function public.is_member()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where user_id = auth.uid());
$$;

create or replace function public.join_group(p_password text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare
  uid uuid := auth.uid();
  h   text;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if exists (select 1 from public.members where user_id = uid) then return true; end if;

  -- At most 5 wrong tries per device every 10 minutes.
  if (select count(*) from public.join_attempts
      where user_id = uid and at > now() - interval '10 minutes') >= 5 then
    raise exception 'Too many wrong tries. Wait 10 minutes and try again.';
  end if;

  select password_hash into h from public.group_settings where id = 1;
  if h is null then raise exception 'No group password has been set yet (see README).'; end if;

  if crypt(coalesce(p_password, ''), h) <> h then
    insert into public.join_attempts (user_id) values (uid);
    return false;
  end if;

  insert into public.members (user_id) values (uid) on conflict do nothing;
  delete from public.join_attempts where user_id = uid;
  return true;
end $$;

-- Run from the SQL Editor only. Changing it does NOT kick people out; to make
-- everyone re-enter the new password, also run:  delete from public.members;
create or replace function public.set_group_password(p_password text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if char_length(coalesce(p_password, '')) < 8 then
    raise exception 'Use at least 8 characters (a few random words is best).';
  end if;
  insert into public.group_settings (id, password_hash)
  values (1, crypt(p_password, gen_salt('bf', 10)))
  on conflict (id) do update set password_hash = excluded.password_hash;
end $$;

-- Trash older than 30 days is removed for good. Called by the app on load.
create or replace function public.purge_old_trash()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not public.is_member() then return 0; end if;
  delete from public.notes where deleted_at < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end $$;

-- Used by the GitHub keep-alive job. Reveals nothing.
create or replace function public.keep_alive()
returns integer language sql stable as $$ select 1 $$;

revoke all on function public.is_member()               from public, anon;
revoke all on function public.join_group(text)          from public, anon;
revoke all on function public.set_group_password(text)  from public, anon, authenticated;
revoke all on function public.purge_old_trash()         from public, anon;
grant execute on function public.is_member()       to authenticated;
grant execute on function public.join_group(text)  to authenticated;
grant execute on function public.purge_old_trash() to authenticated;
grant execute on function public.keep_alive()      to anon, authenticated;

-- ── Who can do what with notes ───────────────────────────────
-- Members: read, add, edit, move to trash, restore.
-- Nobody (members included) can permanently delete through the API.
alter table public.notes enable row level security;

drop policy if exists "notes: anyone can read"     on public.notes;
drop policy if exists "notes: anyone can add"      on public.notes;
drop policy if exists "notes: anyone can edit"     on public.notes;
drop policy if exists "notes: anyone can delete"   on public.notes;
drop policy if exists "notes: members can read"    on public.notes;
drop policy if exists "notes: members can add"     on public.notes;
drop policy if exists "notes: members can edit"    on public.notes;

revoke all on public.notes from anon;
revoke delete, truncate on public.notes from authenticated;
grant select, insert, update on public.notes to authenticated;

create policy "notes: members can read" on public.notes
  for select to authenticated using (public.is_member());
create policy "notes: members can add"  on public.notes
  for insert to authenticated with check (public.is_member());
create policy "notes: members can edit" on public.notes
  for update to authenticated using (public.is_member()) with check (public.is_member());

-- ── Live updates ─────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notes'
  ) then
    alter publication supabase_realtime add table public.notes;
  end if;
end $$;
