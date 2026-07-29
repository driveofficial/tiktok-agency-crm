-- ============================================================================
-- seed.sql — ข้อมูลตัวอย่างสำหรับ dev (ไม่ใช้ตอน production)
-- รันหลัง 0001–0003. ผูก user เข้าทีมเองภายหลัง (ดู README ขั้นตอน 4)
-- ============================================================================

insert into teams (name, position) values
  ('Drive',   0),
  ('Sereniz', 1)
on conflict (name) do nothing;

-- ชีตตัวอย่าง 1 อันต่อทีม พร้อม headers มาตรฐาน (ตรง MOCK_HEADERS เดิม)
with t as (select id, name from teams where name in ('Drive','Sereniz'))
insert into sheets (team_id, label, headers, position)
select
  t.id,
  case t.name when 'Drive' then 'อาร์ม' else 'คิม' end,
  '["ลำดับ","วันที่","จำนวน","ชื่อเล่น","ชื่อเล่นTiktok (วางลิงค์ช่อง)","จำนวนผู้ติดตาม","เฉลี่ยวิวคร่าวๆ","สไตล์ช่อง","ติดต่อกันช่องทางไหน","ช่องทางติดต่อ","ทัก/ยังไม่ทัก","สถานะ","Commission","คอมเมนท์ให้ตอบแชท","ตามแชทเอาคำตอบ","ส่งของถึงยัง","ได้รับของวันไหน","ลงคลิปยัง","ที่อยู่","เบอร์โทร"]'::jsonb,
  0
from t
on conflict do nothing;
