-- ============================================================================
-- 0003_rpc.sql — RPC ที่แทน logic หนักใน code.gs เดิม
-- ทุกฟังก์ชัน security invoker → RLS ของ records/sheets จำกัดเฉพาะทีมผู้ใช้เอง
-- ============================================================================

-- ---------------------------------------------------------------------------
-- DASHBOARD: คืน aggregated flat rows. ฝั่ง lib/api.js reshape เป็น nested เดิม
-- { overall, byTeam, bySheet } × { all, today, week, month, history, daily }.
-- ไม่ทำ nested JSON ใน SQL เพราะ history/daily ซ้อนกันหลายชั้น แก้ยาก/เปราะ.
-- ---------------------------------------------------------------------------
create or replace function get_dashboard_rows()
returns table (
  sheet_id     uuid,
  sheet_name   text,   -- ใช้เป็น key ของ bySheet (ตรงกับ sheet.id ที่ frontend ใช้)
  team_name    text,
  sheet_label  text,
  row_date     date,
  status       text,
  platform     text,
  commission   text,
  shipped      text,
  clip         text,
  cnt          bigint
)
language sql
security invoker
stable
as $$
  select
    r.sheet_id,
    r.sheet_id::text                                   as sheet_name,
    t.name                                             as team_name,
    s.label                                            as sheet_label,
    r.row_date,
    coalesce(nullif(btrim(r.status), ''),     'Unknown') as status,
    coalesce(nullif(btrim(r.platform), ''),   'Unknown') as platform,
    coalesce(nullif(btrim(r.commission), ''), 'Unknown') as commission,
    coalesce(nullif(btrim(r.shipped), ''),    'Unknown') as shipped,
    coalesce(nullif(btrim(r.clip), ''),       'Unknown') as clip,
    count(*)                                            as cnt
  from records r
  join sheets s on s.id = r.sheet_id
  join teams  t on t.id = r.team_id
  group by r.sheet_id, t.name, s.label, r.row_date,
           r.status, r.platform, r.commission, r.shipped, r.clip;
$$;

-- ---------------------------------------------------------------------------
-- DEDUP ข้ามทีม: เทียบ @handle > เบอร์. คืนบริบทไว้โชว์คำเตือน (ของใคร/ทักแล้วยัง)
-- RLS จำกัดเฉพาะทีมผู้ใช้ (owner ที่อยู่ทุกทีมยังเห็นครบ) — ปลอดภัยกว่า global เดิม
-- ---------------------------------------------------------------------------
create or replace function check_duplicate(
  p_handle  text default null,
  p_phone   text default null,
  p_contact text default null   -- รับไว้เผื่ออนาคต ตอนนี้ยังไม่ใช้จับ (handle/phone แม่นกว่า)
)
returns table (
  sheet_id    uuid,
  sheet_label text,
  team_name   text,
  contacted   boolean,
  status      text,
  row_date    date
)
language sql
security invoker
stable
as $$
  select
    r.sheet_id,
    s.label as sheet_label,
    t.name  as team_name,
    coalesce(r.data::text ilike '%ทักแล้ว%', false) as contacted,
    r.status,
    r.row_date
  from records r
  join sheets s on s.id = r.sheet_id
  join teams  t on t.id = r.team_id
  where (p_handle is not null and p_handle <> '' and r.handle = p_handle)
     or (p_phone  is not null and length(p_phone) >= 6 and r.phone = p_phone)
  limit 20;
$$;

-- ---------------------------------------------------------------------------
-- SEARCH ทั้งทีม: ค้นทุกชีตในทีมเดียว (GIN trgm บน data::text). limit กัน payload บวม
-- ฝั่ง api.js จัดกลุ่มตามชีตให้ตรงรูป { groups, total, capped } เดิม
-- ---------------------------------------------------------------------------
create or replace function search_team(
  p_team_id uuid,
  p_query   text
)
returns table (
  sheet_id     uuid,
  sheet_label  text,
  headers      jsonb,
  "position"   int,
  data         jsonb
)
language sql
security invoker
stable
as $$
  select r.sheet_id, s.label, s.headers, r.position, r.data
  from records r
  join sheets s on s.id = r.sheet_id
  where r.team_id = p_team_id
    and length(btrim(coalesce(p_query, ''))) >= 2
    and r.data::text ilike '%' || p_query || '%'
  order by s.position, r.position
  limit 200;
$$;
