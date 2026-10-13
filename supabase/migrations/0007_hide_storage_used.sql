-- storage_used is private to its owner (how much of their quota a user consumes). It was readable
-- by any client — even anon — through the public profiles row. Carve the column out with a column
-- privilege and serve the owner's own value through a scoped SECURITY DEFINER function instead.
-- Public profile reads use explicit columns (lib/actions/common.js PROFILE_COLS = id,username,
-- display_name) that never include storage_used, so nothing legitimate breaks; only a `select=*`
-- or an explicit `storage_used` select by a client is now denied.
revoke select (storage_used) on public.profiles from anon, authenticated;

create or replace function public.my_storage_used()
returns bigint
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce(storage_used, 0) from public.profiles where id = auth.uid();
$$;
revoke execute on function public.my_storage_used() from public, anon;
grant execute on function public.my_storage_used() to authenticated;

notify pgrst, 'reload schema';
