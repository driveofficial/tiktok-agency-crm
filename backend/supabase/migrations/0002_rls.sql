-- ============================================================================
-- 0002_rls.sql — Row Level Security: กันข้อมูลตามทีม
-- ผู้ใช้เห็น/แก้เฉพาะทีมที่ตัวเองเป็นสมาชิก (team_members). เจ้าของเอเจนซี่ที่อยู่
-- หลายทีม → เห็นข้ามทีม. Postgres เปิด public ผ่าน anon key จึงต้องมี RLS เสมอ.
-- ============================================================================

-- security definer + ตั้ง search_path กัน recursion ตอน policy อ่าน team_members เอง
create or replace function is_team_member(tid uuid)
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

alter table teams        enable row level security;
alter table team_members enable row level security;
alter table sheets       enable row level security;
alter table records      enable row level security;

-- teams: เห็นเฉพาะทีมที่เป็นสมาชิก
drop policy if exists teams_read on teams;
create policy teams_read on teams for select
  using (is_team_member(id));

-- team_members: เห็นแถวของตัวเอง (เลี่ยง recursion: อ้าง auth.uid() ตรงๆ ไม่ผ่าน is_team_member)
drop policy if exists members_self on team_members;
create policy members_self on team_members for select
  using (user_id = auth.uid());

-- sheets: อ่าน/เขียนตามทีม
drop policy if exists sheets_read on sheets;
create policy sheets_read on sheets for select
  using (is_team_member(team_id));
drop policy if exists sheets_write on sheets;
create policy sheets_write on sheets for all
  using (is_team_member(team_id))
  with check (is_team_member(team_id));

-- records: อ่าน/เขียนตามทีม (ใช้ team_id ที่ denormalize → ไม่ต้อง join sheets)
drop policy if exists records_read on records;
create policy records_read on records for select
  using (is_team_member(team_id));
drop policy if exists records_write on records;
create policy records_write on records for all
  using (is_team_member(team_id))
  with check (is_team_member(team_id));
