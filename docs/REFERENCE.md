# Reference — ID/รหัสอ้างอิง (ไม่ใช่ secret)

ไฟล์นี้เก็บ **ID/รหัสอ้างอิงที่ไม่ใช่ความลับ** (spreadsheet id, sheet uuid, project ref ฯลฯ)
เพื่อไม่ต้องไล่หาใหม่ทุกครั้ง — **ไม่มี secret ค่าจริงในไฟล์นี้เลย** (SHEET_SYNC_SECRET,
SHEET_PUSH_SECRET, SUPABASE_SERVICE_ROLE_KEY, private_key ของ service account ฯลฯ
ไม่เก็บที่นี่ ดูกฎที่ `CLAUDE.md` หัวข้อ "Secret — กฎเข้ม")

## Supabase

- project ref: `fxjaeqeuxdlnwyxwrozf`
- pg_cron job: `sheet-poll-every-minute` (jobid 6, schedule `* * * * *`)

## Google Sheet — spreadsheet เดียว 4 แท็บ

- spreadsheet id: `1uGNuLClySwpkENlbi1lPIbDeL-q06uF2N8P9neXTKbU`
- team_id (Supabase `teams`, ทีมเดียวตอนนี้): `84498bd5-92e9-4207-934d-c8418484a911` (ชื่อทีม: "ทักอินฟูรับคอมมิชชั่น 10%")

| label (`sheets.label`) | tab_name จริงในชีต | `sheets.id` (uuid, ใช้เรียก sheet-push) | gid ภายใน Google Sheet |
|---|---|---|---|
| อาร์ม | อาร์ม | `55661051-5544-41f7-a583-d9d6cdd84baf` | `9969379` |
| ซัน | ซัน | `b24438b6-21ee-45cc-9ac3-a9220a4738ce` | `1282755086` |
| โอ๊ค | โอ๊ค | `3c1c25ef-2b45-4acc-99b3-f3584db04dd5` | `1272785643` |
| ตี๋น้อย | ตี๋น้อย | `e7f29498-ed78-4fcb-a913-680e9421115f` | `1801828853` |

ทั้ง 4 แท็บ header ตรงกัน 19 คอลัมน์ (ยืนยันแล้ว 2026-08-03): ลำดับ, วันที่, จำนวนที่ทัก, ชื่อเล่น,
Tiktok (วางลิงค์ช่อง), จำนวนผู้ติดตามใน Tiktok, เฉลี่ยวิวคร่าวๆ, สไตล์ช่อง, ติดต่อกันช่องทางไหน,
ช่องทางติดต่อ, ทัก/ยังไม่ทัก, สถานะ, คอมเมนท์ให้ตอบแชท, ตามแชทเอาคำตอบ, วันส่งของ, วันได้รับของ,
ลงคลิปยัง, คลิปผ่านไหม, gencode

⚠️ อย่า hardcode ค่าพวกนี้ลงโค้ด — โค้ดต้องอ่าน `sheets.spreadsheet_id`/`sheets.tab_name` จาก
Supabase เสมอ (ดู `CLAUDE.md`) ตารางนี้ไว้อ่านอ้างอิงตอน debug/query ตรงเท่านั้น

## Edge functions (backend/supabase/functions/)

- `sheet-sync` — รับ push แบบ manual/batch จากสคริปต์ (`backend/scripts/`)
- `sheet-poll` — Sheet → Supabase, รันทุกนาทีผ่าน pg_cron ด้านบน
- `sheet-push` — Supabase → Sheet, ยิงจาก trigger บนตาราง `records` เวลาเว็บแอปเขียนข้อมูล
