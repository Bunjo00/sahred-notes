-- ─────────────────────────────────────────────────────────────
--  Upgrade: adds folders to an existing Shared Notes database.
--  Paste into Supabase → SQL Editor → New query → Run.
--  Safe to run more than once. Your notes, password and members stay as they are.
--  (New setups don't need this: schema.sql already includes it.)
-- ─────────────────────────────────────────────────────────────

create table if not exists public.folders (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 1 and 60),
  created_at timestamptz not null default now()
);
alter table public.notes add column if not exists folder_id uuid
  references public.folders (id) on delete set null;
create index if not exists notes_folder_id on public.notes (folder_id);

alter table public.folders enable row level security;
revoke all on public.folders from anon;
grant select, insert, update, delete on public.folders to authenticated;

drop policy if exists "folders: members can read"   on public.folders;
drop policy if exists "folders: members can add"    on public.folders;
drop policy if exists "folders: members can rename" on public.folders;
drop policy if exists "folders: members can delete" on public.folders;
create policy "folders: members can read"   on public.folders
  for select to authenticated using (public.is_member());
create policy "folders: members can add"    on public.folders
  for insert to authenticated with check (public.is_member());
create policy "folders: members can rename" on public.folders
  for update to authenticated using (public.is_member()) with check (public.is_member());
create policy "folders: members can delete" on public.folders
  for delete to authenticated using (public.is_member());

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'folders'
  ) then
    alter publication supabase_realtime add table public.folders;
  end if;
end $$;
