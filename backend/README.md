# Backend — Supabase (TikTok Agency CRM)

แทน Google Apps Script `code.gs` เดิม. Postgres + RLS + RPC. ไม่มี server แยก — frontend คุย Supabase ตรงผ่าน anon key, RLS เป็นด่านกันข้อมูล.

## โครงสร้าง
```
supabase/migrations/
  0001_schema.sql   teams, team_members, sheets, records (data JSONB + derived cols) + trigger version
  0002_rls.sql      is_team_member() + policies (กันข้อมูลตามทีม)
  0003_rpc.sql      get_dashboard_rows(), check_duplicate(), search_team()
supabase/seed.sql   ทีม/ชีตตัวอย่าง (dev)
supabase/functions/sheet-poll  poll Google Sheets API ตรงๆ (ไม่ผ่าน GAS เลย) — เรียกจาก pg_cron
scripts/
  export-sheets.gs        รันใน GAS เดิม → crm-export.json (ครั้งแรกตอน migrate)
  import-to-supabase.mjs  node: JSON → Supabase (คำนวณ derived cols)
  push-to-webhook.gs      full snapshot ทั้งชีต → sheet-sync (manual/รายชั่วโมง)
  realtime-sync.gs        onEdit → sync เฉพาะแถวที่แก้ (เร็วกว่า push-to-webhook มาก, ต้องพึ่ง GAS)
```

## Setup

### 1. สร้าง project + รัน migrations
สร้าง Supabase project แล้วรัน SQL ตามลำดับ (SQL Editor หรือ CLI):
```bash
# CLI
supabase db push          # รัน migrations/*.sql
# หรือ วางเนื้อ 0001→0002→0003 ใน SQL Editor ทีละไฟล์
```

### 2. เปิด Auth
Dashboard → Authentication → เปิด Email (magic link) และ/หรือ Google OAuth. คัดลอก:
- Project URL → `VITE_SUPABASE_URL`
- anon public key → `VITE_SUPABASE_ANON_KEY`
(ทั้งคู่ใส่ใน `frontend/.env`)

### 3. Migrate ข้อมูลจาก Google Sheets (ครั้งเดียว)
```
1) วาง scripts/export-sheets.gs ในโปรเจกต์ GAS เดิม → Run exportAllSheetsToDrive
   → ได้ crm-export.json ใน Google Drive → ดาวน์โหลดมาไว้ที่ backend/
2) cd backend/scripts && npm install
3) SUPABASE_URL=... SUPABASE_SERVICE_ROLE=... node import-to-supabase.mjs ../crm-export.json
```
> service_role key อยู่ที่ Settings → API. ใช้ตอน migrate เท่านั้น (ข้าม RLS). อย่า commit.

### 4. ผูกผู้ใช้เข้าทีม
หลัง user สมัคร/ login ครั้งแรก เพิ่มแถวใน `team_members` (SQL Editor):
```sql
insert into team_members (user_id, team_id, role)
select u.id, t.id, 'owner'
from auth.users u, teams t
where u.email = 'you@example.com';   -- owner = ทุกทีม; member = ระบุ t.name เฉพาะทีม
```

### 5. ต่อ real-time sync (Sheet → Supabase)
เพิ่ม `scripts/realtime-sync.gs` ในโปรเจกต์ GAS เดิม (ที่มี `getRoutingMap` + `push-to-webhook.gs`):
```
1) ตั้ง Script Properties WEBHOOK_URL / WEBHOOK_SECRET เหมือน push-to-webhook.gs
2) รัน installRealtimeTriggers ครั้งเดียว (กดอนุญาตสิทธิ์เข้าทุกสเปรดชีตใน routing map)
3) เพิ่มทีม/ชีตใหม่เมื่อไหร่ ให้รัน installRealtimeTriggers ซ้ำ (ไฟล์ใหม่ยังไม่มี trigger)
```
แก้ค่าเซลล์ในชีต → ขึ้น Supabase ภายใน 1-2 วิ (ไม่ต้องรอ `pushAllSheets` รายชั่วโมง).
**ข้อจำกัด**: ครอบคลุมแค่แก้ค่าเซลล์ในแถวเดิม — เพิ่ม/ลบแถวทั้งแถวยังต้องพึ่ง `pushAllSheets`
(full sync) เหมือนเดิม เพราะ `onEdit` ตรวจจับ insert/delete แถวไม่แม่นยำพอ (position เลื่อน).
ยังไม่มีทิศทาง Supabase → Sheet (แก้ใน CRM ไม่ย้อนกลับไป Sheet).

### 6. ต่อ sync แบบ poll (Sheet → Supabase, ไม่ผ่าน GAS เลย)
ทางเลือกแทนข้อ 5 ถ้าไม่อยากพึ่งสคริปต์ฝั่ง Google Sheets เลย — ดึงผ่าน Sheets API ตรงๆ
เป็นช่วงๆ แทน push (ดีเลย์ตามรอบที่ตั้ง ไม่ใช่ realtime เป๊ะ แต่ setup ง่ายกว่ามาก):

```
1) Google Cloud Console → สร้างโปรเจกต์ → เปิด "Google Sheets API"
   → IAM & Admin → Service Accounts → สร้าง service account → Keys → Add key (JSON)
   → ได้ไฟล์ JSON เก็บไว้ (มี client_email + private_key)

2) แชร์ไฟล์ Google Sheet ทุกไฟล์ที่ใช้จริง ให้ client_email ของ service account
   (สิทธิ์ Viewer พอ เพราะฝั่งนี้แค่อ่าน)

3) ตั้ง secret ให้ Edge Function:
   supabase secrets set GOOGLE_SERVICE_ACCOUNT_JSON="$(cat service-account.json)"
   supabase secrets set SHEET_SYNC_SECRET=<ค่าเดียวกับที่ตั้งไว้แล้วสำหรับ sheet-sync>

4) เติม spreadsheet_id + tab_name ให้ทุกแถวใน sheets (SQL Editor) —
   spreadsheet_id คือส่วน .../d/<ตรงนี้>/edit ของ URL ไฟล์ Google Sheet:
   update sheets set spreadsheet_id = '...', tab_name = '...' where id = '...';

5) ตั้ง pg_cron ให้ยิง sheet-poll เป็นช่วงๆ (SQL Editor — ใส่ project ref/anon key จริง):
   select cron.schedule(
     'sheet-poll-every-minute',
     '* * * * *',   -- ทุก 1 นาที (ปรับได้ เช่น '*/2 * * * *' = ทุก 2 นาที)
     $$
     select net.http_post(
       url     := 'https://fxjaeqeuxdlnwyxwrozf.supabase.co/functions/v1/sheet-poll',
       headers := jsonb_build_object('x-webhook-secret', '<SHEET_SYNC_SECRET จริง>'),
       body    := '{}'::jsonb
     );
     $$
   );
```
**ข้อจำกัด**: ดีเลย์ตามรอบ cron ที่ตั้ง (ไม่ใช่ push ทันทีเหมือนข้อ 5), มี rate limit ของ
Sheets API (ปกติเพียงพอสำหรับจำนวนชีตไม่มาก), ยังไม่มีทิศทาง Supabase → Sheet เหมือนกัน.
เลือกใช้ข้อ 5 หรือ ข้อ 6 อย่างใดอย่างหนึ่งพอ (ใช้พร้อมกันได้แต่ซ้ำซ้อนไม่จำเป็น).

## หมายเหตุพฤติกรรมที่ต่างจากเดิม
- Concurrency ใช้คอลัมน์ `version` แทน row fingerprint (`expectedRow`)
- Dedup/Search จำกัดเฉพาะทีมที่ผู้ใช้เป็นสมาชิก (RLS) — owner เห็นครบ
- ตัด CacheService + precompute trigger ทิ้ง (DB เร็วพอ)
