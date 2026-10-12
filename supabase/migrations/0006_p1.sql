-- P1 features (docs/ACTIONS_CONTRACT.md "Phase 2"): per-project version numbers, stars, explore
-- indexes, blob takedown.

-- ===== versions.number: 1, 2, 3 … per project, across main and copies =====
-- Assigned by a BEFORE INSERT trigger rather than inside commit_version / restore_version, so every
-- insert path gets a number (those two RPCs and the pgTAP fixtures in supabase/tests that insert
-- versions directly). commit_version is unchanged; restore_version is re-created below only for
-- its note text.
alter table public.versions add column number int;

update public.versions v
   set number = s.n
  from (select id, row_number() over (partition by project_id order by id) as n from public.versions) s
 where v.id = s.id;

alter table public.versions
  alter column number set not null,
  add constraint versions_project_number_key unique (project_id, number);

create function public.assign_version_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Lock the project row so concurrent saves to the same project (main or any copy) number one
  -- after another. commit_version / restore_version update this row later anyway; the unique
  -- constraint above is the backstop.
  perform 1 from public.projects where id = new.project_id for update;
  select coalesce(max(number), 0) + 1 into new.number
    from public.versions where project_id = new.project_id;
  return new;
end;
$$;
revoke execute on function public.assign_version_number() from public, anon, authenticated;

create trigger versions_assign_number
  before insert on public.versions
  for each row execute function public.assign_version_number();

-- Same as 0003 except the note names the restored version by its number ("v3"), which is what the
-- UI shows, instead of the raw id.
create or replace function public.restore_version(p_project_id uuid, p_version_id bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_actor(auth.uid());
  v_current bigint;
  v_old public.versions;
  v_new bigint;
begin
  select main_version_id into v_current from public.projects where id = p_project_id and owner_id = v_uid;
  if not found then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  -- Only versions that were on the main line of this project can be restored.
  if not exists (select 1 from public.main_history where project_id = p_project_id and version_id = p_version_id) then
    raise exception 'INVALID_VERSION' using errcode = 'P0001';
  end if;
  select * into v_old from public.versions where id = p_version_id;

  insert into public.versions (project_id, parent_id, author_id, note, file_paths, file_hashes)
  values (p_project_id, v_current, v_uid, 'Restored from v' || v_old.number, v_old.file_paths, v_old.file_hashes)
  returning id into v_new;

  update public.projects set main_version_id = v_new, updated_at = now()
   where id = p_project_id and main_version_id is not distinct from v_current;
  if not found then
    raise exception 'STALE_PARENT' using errcode = 'P0001';
  end if;
  insert into public.main_history (project_id, version_id, promoted_by) values (p_project_id, v_new, v_uid);
  return v_new;
end;
$$;
revoke execute on function public.restore_version(uuid, bigint) from public, anon;
grant execute on function public.restore_version(uuid, bigint) to authenticated;

-- ===== stars =====
alter table public.projects add column star_count int not null default 0 check (star_count >= 0);

create table public.stars (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  project_id  uuid not null references public.projects (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, project_id)
);
create index stars_project_idx on public.stars (project_id);

alter table public.stars enable row level security;
revoke insert, update, delete, truncate on public.stars from anon, authenticated;

create policy stars_select on public.stars
  for select to anon, authenticated
  using (public.is_project_readable(project_id));

-- star_count follows the stars rows, including rows removed by cascades (deleted users).
create function public.sync_star_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.projects set star_count = star_count + 1 where id = new.project_id;
  else
    update public.projects set star_count = greatest(star_count - 1, 0) where id = old.project_id;
  end if;
  return null;
end;
$$;
revoke execute on function public.sync_star_count() from public, anon, authenticated;

create trigger stars_sync_count
  after insert or delete on public.stars
  for each row execute function public.sync_star_count();

-- Stars or unstars a project the caller can read. Errors: NOT_AUTHENTICATED, USERNAME_REQUIRED, NOT_AUTHORIZED.
create function public.toggle_star(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_actor(auth.uid());
  v_starred boolean;
  v_count int;
begin
  if not public.is_project_readable(p_project_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  delete from public.stars where user_id = v_uid and project_id = p_project_id;
  if found then
    v_starred := false;
  else
    insert into public.stars (user_id, project_id) values (v_uid, p_project_id)
    on conflict do nothing;   -- a concurrent double-click already starred it
    v_starred := true;
  end if;

  select star_count into v_count from public.projects where id = p_project_id;
  return jsonb_build_object('starred', v_starred, 'star_count', v_count);
end;
$$;
revoke execute on function public.toggle_star(uuid) from public, anon;
grant execute on function public.toggle_star(uuid) to authenticated;

-- ===== explore =====
-- Keyset pages over public projects (getExplore: updated_at desc, id / star_count desc, id).
-- ponytail: search is ilike '%q%' on title/description (seq scan of public projects); add pg_trgm
-- GIN indexes on title and description when the table outgrows that.
create index projects_public_recent_idx on public.projects (updated_at desc, id) where visibility = 'public';
create index projects_public_stars_idx  on public.projects (star_count desc, id) where visibility = 'public';

-- ===== takedown =====
-- Blocks downloads of a blob (getDownloadUrls returns url: null, blocked: true). Returns false when
-- no blob has that hash. Service role only (scripts/takedown.mjs).
create function public.takedown_blob(p_hash bytea)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.blobs set blocked_at = coalesce(blocked_at, now()) where hash = p_hash;
  return found;
end;
$$;
revoke execute on function public.takedown_blob(bytea) from public, anon, authenticated;
grant execute on function public.takedown_blob(bytea) to service_role;

notify pgrst, 'reload schema';
