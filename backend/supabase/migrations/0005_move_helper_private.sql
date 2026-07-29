-- ============================================================================
-- 0005_move_helper_private.sql — ย้าย is_team_member เข้า schema private
-- SECURITY DEFINER ใน public เปิดเป็น REST /rpc endpoint (advisor WARN 0028/0029)
-- ย้ายเข้า private → PostgREST ไม่ expose แต่ RLS policy ยังเรียกได้
-- ============================================================================

create schema if not exists private;
grant usage on schema private to anon, authenticated;

create or replace function private.is_team_member(tid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from team_members
    where user_id = auth.uid() and team_id = tid
  );
$$;

-- ชี้ policy จาก public.is_team_member -> private.is_team_member
drop policy if exists teams_read    on teams;
create policy teams_read on teams for select
  using (private.is_team_member(id));

drop policy if exists sheets_read   on sheets;
create policy sheets_read on sheets for select
  using (private.is_team_member(team_id));
drop policy if exists sheets_write  on sheets;
create policy sheets_write on sheets for all
  using (private.is_team_member(team_id))
  with check (private.is_team_member(team_id));

drop policy if exists records_read  on records;
create policy records_read on records for select
  using (private.is_team_member(team_id));
drop policy if exists records_write on records;
create policy records_write on records for all
  using (private.is_team_member(team_id))
  with check (private.is_team_member(team_id));

drop function if exists public.is_team_member(uuid);
