-- 0007's `revoke select (storage_used)` was a no-op: profiles has a table-wide `grant select` to
-- anon/authenticated, and a column-level REVOKE cannot carve a single column out of a table-wide
-- grant. Do it correctly: drop the table-wide SELECT and re-grant SELECT on only the public columns
-- (every column except storage_used). The owner reads its own storage_used via my_storage_used()
-- (0007); service_role keeps full access. Public reads select explicit columns, so nothing breaks.
revoke select on public.profiles from anon, authenticated;
grant select (id, username, display_name, avatar_url, tags, created_at)
  on public.profiles to anon, authenticated;

notify pgrst, 'reload schema';
