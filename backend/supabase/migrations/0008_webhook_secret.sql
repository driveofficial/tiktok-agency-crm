-- ============================================================================
-- 0008_webhook_secret.sql — เก็บ secret ของ webhook ใน DB (rotate ได้ด้วย SQL)
-- RLS เปิดแบบไม่มี policy => anon/authenticated อ่านไม่ได้เลย, มีแต่ service_role
-- (edge function) อ่านผ่าน
-- (ย้อนมาจาก migration ที่ apply ตรงผ่าน MCP ไปแล้วก่อนหน้านี้ — ถูก drop ใน 0008b
-- เพราะสุดท้ายเลือกเก็บ secret เป็น Edge Function secret แทน ไม่ใช้คอลัมน์ DB)
-- ============================================================================

create table if not exists webhook_secret (
  id     int  primary key default 1 check (id = 1),
  secret text not null,
  updated_at timestamptz not null default now()
);
alter table webhook_secret enable row level security;
comment on table webhook_secret is 'shared secret สำหรับ edge function sheet-sync; อ่านได้เฉพาะ service_role';
