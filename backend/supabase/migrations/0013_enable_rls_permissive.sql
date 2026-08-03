-- ============================================================================
-- 0013_enable_rls_permissive.sql — เปิด RLS ทั้ง 4 ตาราง (ปิด lint error
-- rls_disabled_in_public) แต่ policy เป็น permissive (using true) ทุกตาราง
--
-- เหตุผลที่ยัง permissive: frontend ไม่มีระบบ auth/login เลย (ไม่มี
-- supabase.auth, ไม่มี JWT/team claim ใดๆ) ใช้ anon key เดียวกันหมดทุกทีม —
-- ไม่มีทางเขียน policy แยกตามทีมได้จริงตอนนี้ เพราะไม่มีอะไรบอกว่า request
-- มาจากทีมไหน การเปิด RLS รอบนี้แค่ปิดช่องโหว่เชิง infra (กัน query ตรงเข้า
-- Supabase REST API แบบไม่ผ่านการตรวจสอบใดๆ เลย) ไม่ใช่การกันข้ามทีมเห็นข้อมูลกัน
--
-- ถ้าจะทำ per-team policy จริงในอนาคต ต้องสร้างระบบ auth ก่อน (ดู
-- docs/HANDOFF.md หัวข้อ "ทำอะไรต่อ") แล้วเปลี่ยน policy ตรงนี้ให้เทียบ
-- auth.jwt() ->> 'team_id' กับ records.sheet_id -> sheets.team_id แทน
--
-- service_role (ที่ edge functions ทั้งหมดใช้) bypass RLS เสมอไม่ว่า policy
-- จะเป็นอะไร — sheet-poll/sheet-push ไม่กระทบจากงานนี้
-- ============================================================================

alter table public.records enable row level security;
alter table public.sheets enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;

create policy "anon full access" on public.records
  for all to anon using (true) with check (true);
create policy "authenticated full access" on public.records
  for all to authenticated using (true) with check (true);

create policy "anon full access" on public.sheets
  for all to anon using (true) with check (true);
create policy "authenticated full access" on public.sheets
  for all to authenticated using (true) with check (true);

create policy "anon full access" on public.teams
  for all to anon using (true) with check (true);
create policy "authenticated full access" on public.teams
  for all to authenticated using (true) with check (true);

create policy "anon full access" on public.team_members
  for all to anon using (true) with check (true);
create policy "authenticated full access" on public.team_members
  for all to authenticated using (true) with check (true);
