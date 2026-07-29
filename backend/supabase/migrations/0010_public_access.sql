-- ============================================================================
-- 0010_public_access.sql — ตัด login gate: เปิดเข้าถึงสาธารณะทั้งหมด (ไม่มี auth แล้ว)
-- ยกเลิก RLS ตามทีม (0002_rls.sql) — ทุกคนที่มี anon key อ่าน/เขียนได้ทุกทีม
-- ============================================================================

drop policy if exists teams_read    on teams;
drop policy if exists members_self  on team_members;
drop policy if exists sheets_read   on sheets;
drop policy if exists sheets_write  on sheets;
drop policy if exists records_read  on records;
drop policy if exists records_write on records;

alter table teams        disable row level security;
alter table team_members disable row level security;
alter table sheets       disable row level security;
alter table records      disable row level security;

drop function if exists is_team_member(uuid);
