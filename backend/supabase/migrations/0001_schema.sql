-- ============================================================================
-- 0001_schema.sql — โครงฐานข้อมูล TikTok Agency CRM (แทน Google Sheets)
-- โมเดล: teams → sheets → records. คอลัมน์ไดนามิกเก็บเป็น JSONB array (data)
-- ตรงกับ headers ของแต่ละ sheet — คง "คอลัมน์ยืดหยุ่น + fuzzy match ไทย" ฝั่ง client
-- ============================================================================

create extension if not exists pg_trgm;      -- search ไทยแบบ ilike/trigram
create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- ทีม (เดิม = source ใน Master Config)
create table if not exists teams (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  position   int  not null default 0,
  created_at timestamptz not null default now()
);

-- ผู้ใช้ ↔ ทีม (คุม RLS + บทบาท)
create table if not exists team_members (
  user_id uuid not null references auth.users(id) on delete cascade,
  team_id uuid not null references teams(id)      on delete cascade,
  role    text not null default 'member',   -- member | lead | owner
  primary key (user_id, team_id)
);

-- ชีต (เดิม = แท็บใน spreadsheet)
create table if not exists sheets (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references teams(id) on delete cascade,
  label      text not null,                 -- ชื่อโชว์ (เดิม = ชื่อแท็บ/คนดูแล)
  headers    jsonb not null default '[]'::jsonb,  -- array หัวคอลัมน์ คุมลำดับ
  position   int  not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_sheets_team on sheets (team_id, position);

-- แถวครีเอเตอร์ — data = array cell ตรง headers เป๊ะ (เหมือน row เดิมในชีต)
create table if not exists records (
  id         uuid primary key default gen_random_uuid(),
  sheet_id   uuid not null references sheets(id) on delete cascade,
  team_id    uuid not null references teams(id)  on delete cascade, -- denormalize → RLS/dashboard เบา
  position   int  not null,                 -- ลำดับในชีต (แทน rowIndex)
  data       jsonb not null default '[]'::jsonb,

  -- derived (คำนวณตอนเขียนจาก headers+data ฝั่ง client) — ใช้ index/aggregate
  handle     text,      -- @handle จากลิงก์ TikTok
  phone      text,      -- เบอร์เฉพาะตัวเลข
  status     text,
  platform   text,      -- "ติดต่อกันช่องทางไหน"
  commission text,
  shipped    text,      -- "ส่งของถึงยัง"
  clip       text,      -- "ลงคลิปยัง"
  row_date   date,      -- คอลัมน์ "วันที่" (แปลง พ.ศ.→ค.ศ. แล้ว)

  version    int not null default 1,        -- optimistic lock แทน expectedRow fingerprint
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists idx_records_sheet   on records (sheet_id, position);
create index if not exists idx_records_team     on records (team_id);
create index if not exists idx_records_handle   on records (handle);
create index if not exists idx_records_phone    on records (phone);
create index if not exists idx_records_status   on records (team_id, status);
create index if not exists idx_records_data_trgm on records using gin ((data::text) gin_trgm_ops);

-- version + updated_at อัตโนมัติทุก update (กันเขียนทับด้วย optimistic lock)
create or replace function bump_version() returns trigger
language plpgsql as $$
begin
  new.version    := old.version + 1;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_bump on records;
create trigger trg_bump before update on records
for each row execute function bump_version();
