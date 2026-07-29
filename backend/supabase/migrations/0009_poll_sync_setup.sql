-- ============================================================================
-- 0009_poll_sync_setup.sql — เตรียม infra สำหรับ sync แบบ poll (ไม่ผ่าน GAS)
-- เปิด pg_net (เรียก HTTP จาก Postgres) + pg_cron (ตั้งเวลารัน) และเพิ่มคอลัมน์
-- ผูก sheets แต่ละแถวกับไฟล์ Google Sheet จริง (spreadsheet_id + tab_name)
-- ============================================================================

create extension if not exists pg_net  with schema extensions;
create extension if not exists pg_cron with schema extensions;

alter table sheets add column if not exists spreadsheet_id text;
alter table sheets add column if not exists tab_name text;

comment on column sheets.spreadsheet_id is 'Google Sheets file ID ที่ sheet-poll ใช้ดึงข้อมูล (ต้องแชร์ไฟล์ให้ service account ก่อน)';
comment on column sheets.tab_name       is 'ชื่อแท็บในไฟล์ที่ spreadsheet_id ชี้ไป — ต้องตรงกับที่เห็นบน Google Sheets เป๊ะ';
