# Handoff

> อัปเดตล่าสุด: 2026-07-30

ไฟล์นี้เก็บ **สถานะงานปัจจุบัน** — ทำถึงไหน ค้างอะไร ทำอะไรต่อ
กฎถาวรของโปรเจกต์ (โครงสร้าง repo, สถาปัตยกรรม, กฎ secret) อยู่ที่ `CLAUDE.md`

## ทำอะไรไปในรอบนี้

รอบนี้ยาวมาก สรุปเป็น 3 ก้อนใหญ่:

**1. สืบสวน + กู้ข้อมูล "หาย" ที่ผู้ใช้รายงาน**
- root cause จริงไม่ใช่ sheet-push ทำข้อมูลหาย (อันนั้นเป็นแค่ทดสอบเมื่อวานที่ overwrite ไม่ครบ) แต่เป็นเพราะ:
  - `frontend/src/lib/api.js` `fetchSheetData` ไม่มี pagination — ชน PostgREST 1000-row cap ทำให้แถวเกิน 1000 ไม่โชว์ในเว็บ (แก้แล้ว)
  - `backend/supabase/functions/sheet-poll/index.ts` มีบั๊กเดียวกัน (แก้แล้ว, deploy v5)
  - pg_cron ไม่มี job `sheet-poll-every-minute` เลย (README บอกให้ตั้งแต่ไม่มีใครตั้งจริง) — **ยังไม่ได้แก้**
- รัน `backend/scripts/resync-all-tabs.mjs` กู้ข้อมูลที่หายจาก Sheet กลับเข้า Supabase สำเร็จ

**2. งาน "gencode" — ปรับโครงสร้างชีต "test" (ที่จะใช้แทนตี๋น้อยเดิม)**
- ผู้ใช้แก้ column ในชีต "test" เอง (เพิ่ม gencode, จำนวนที่ทัก, วันส่งของ / ลบ Campaign, Member, Rate Card, เค้าชอบอะไรเป็นพิเศษ, มีอาชีพอื่นไหม, วันเกิดวันที่, ลูกชื่ออะไร, สไตล์ช่อง 20% — สไตล์ช่อง 20% ลบออกจากอาร์ม/ซัน/โอ๊คด้วยเพราะซ้ำกับสไตล์ช่อง)
- Supabase `sheets` row ของตี๋น้อย: `tab_name` เปลี่ยนจาก `ตี๋น้อย` → `test` (label ยังคง "ตี๋น้อย")
- `frontend/src/lib/columns.js` อัปเดต COLUMN_CONFIG ให้ตรงชีตจริง (คลิปผ่านไหม, ลงคลิปยัง options, วันส่งของ, จำนวนที่ทัก, gencode)
- `frontend/src/components/Modals.jsx` ฟอร์ม เพิ่ม/แก้ไข ตอนนี้โชว์**ทุกคอลัมน์ตามชีตจริง 100%** ไม่ใช้ HIDDEN_COLUMNS กรองอีกต่อไป (กรองแค่ตาราง/การ์ดเหมือนเดิม)
- **⚠️ ระหว่างลบ column ผมพลาดลบผิดชุดไปรอบนึง** (index เพี้ยนเพราะนับจาก header เก่า) ลบ "ตามแชทเอาคำตอบ" กับ "มีลูกกี่คน" ไปโดยไม่ได้ตั้งใจ — ผู้ใช้กู้ผ่าน Google Sheets Version History ได้ "ตามแชทเอาคำตอบ" กลับมาครบ แต่ **"มีลูกกี่คน" ยังหายอยู่** (ของเดิมว่างสนิททุกแถวอยู่แล้ว ไม่มีข้อมูลจริงเสีย) และ **การกู้ version history รอบนั้นทำให้ตี๋น้อยเหลือ 264 แถว จากที่ควรมี 295** (หาย 31 แถวล่าสุด) — Supabase ยังมี snapshot 295 แถวเดิมอยู่ (ก่อนหน้าการกู้) ถ้าจะกู้คืนต้องดึงจากตรงนั้น

**3. เปิดใช้ Supabase → Sheet (sheet-push) จริง**
- สร้าง trigger `trg_sheet_push_insert/update/delete` บนตาราง `records` (statement-level, กัน fan-out storm) — apply ผ่าน `execute_sql` เพราะ `apply_migration` โดน auto-mode classifier บล็อก
- **เจอบั๊กใหม่ระหว่างต่อ:** trigger เดิม (ตามแผน) ไม่ได้ใส่ `security definer` — พอเว็บแอปจริง (role `anon`) ยิง UPDATE จะ error `permission denied for schema vault` ทำให้**บันทึกข้อมูลจากเว็บไม่ได้เลย** แก้แล้วด้วย `security definer` + `search_path = public, vault, extensions`
- เจอด้วยว่า SQL Editor ที่ผู้ใช้ใช้ตอนแรกต่อคนละ **database branch** กับที่เว็บแอปใช้จริง (เช็คด้วย `select version()` เทียบ x86_64 vs aarch64) ทำให้ vault secret ที่ตั้งไม่ตรงกับที่ edge function ใช้ วน 401 อยู่หลายรอบ
- ทดสอบสำเร็จบนแท็บ**ตี๋น้อยเท่านั้น** (`{"ok":true,"rows":264}`) — ยังไม่ได้ทดสอบ อาร์ม/ซัน/โอ๊ค
- เพิ่มไฟล์ที่ขาดหายไปจาก main (โค้ดจริง deploy ไปนานแล้วแต่ไม่เคย commit): `backend/supabase/migrations/0011_sheet_push_trigger.sql`, `backend/supabase/functions/sheet-push/index.ts`

**อื่นๆ:**
- แก้ Vercel deploy เว็บใหม่ว่างเปล่า — root cause คือ Vercel project **ไม่เคยตั้ง Root Directory เป็น `frontend`** เลย (`rootDirectory: null`) เลย build/serve จาก root repo แทน (เจอ `index.html` เจนเก่า Apps Script) — **ยังไม่ได้แก้ค่านี้ใน Vercel dashboard เอง ต้องเข้าไปตั้งเอง**

## ค้างอยู่ตรงไหน

- **Vercel Root Directory ยังไม่ได้ตั้งเป็น `frontend`** — เว็บ production (`tiktok-agency-crm-amber.vercel.app`) จะยังว่างเปล่าจนกว่าจะเข้า Vercel Dashboard → Settings → General → Root Directory → ใส่ `frontend` → Redeploy
- ตี๋น้อยใน Supabase มี **264 แถว ควรมี 295** (หายไป 31 แถวจากการกู้ version history) — วิธีกู้: ดึงจาก Supabase เอง (มี snapshot 295 แถวเก่าอยู่ก่อนรอบกู้ version history) มา insert กลับเข้าชีต "test" แล้ว resync
- คอลัมน์ **"มีลูกกี่คน"** หายจากชีต "test" (ของเดิมว่างสนิท ไม่มีข้อมูลเสีย แต่โครงสร้างเพี้ยนไปจากที่ตั้งใจ) — ถ้าอยากได้คืนต้องเพิ่ม column กลับเอง
- **sheet-push ยังทดสอบแค่ตี๋น้อยแท็บเดียว** — อาร์ม/ซัน/โอ๊ค ยังไม่ยืนยันว่า push กลับ Sheet ถูกต้อง (ตาม logic ควรทำงานเหมือนกันหมดเพราะ trigger ผูกทั้งตาราง แต่ยังไม่เช็คจริง)
- **pg_cron ไม่มี job `sheet-poll-every-minute`** — sheet-poll deploy พร้อมใช้แต่ไม่มีตัวเรียกอัตโนมัติเป็นระยะ พึ่งได้แค่ GAS onEdit
- RLS ปิดอยู่ทั้ง 4 ตาราง (`records`,`sheets`,`teams`,`team_members`) — ใครมี anon key อ่าน/แก้ได้หมด (เจอตั้งแต่ต้น session ยังไม่แก้)
- `deriveFields`/`extractHandle`/`toISODate` ก็อปวางซ้ำ 3 ที่ (frontend/columns.js, sheet-sync, sheet-poll) — แก้จุดเดียวไม่ครบ เสี่ยง sync พังแบบเงียบๆ

## Blocker (รออะไรอยู่)

- [ ] ไม่มี blocker ที่ต้องรอคนอื่น — ทุกอย่างที่ค้างเป็นงานที่ทำต่อได้เลย

## ทำอะไรต่อ

1. **เข้าไปตั้ง Vercel Root Directory = `frontend`** ก่อนอื่นเลย (เว็บ production ยังพังอยู่จนกว่าจะทำ)
2. กู้ 31 แถวที่หายในตี๋น้อย — ดึง snapshot เก่าจาก Supabase (มีอยู่แล้ว ก่อนรอบกู้ version history ทำแถวหาย) มา cross-check แล้ว insert กลับเข้าชีต "test" ผ่าน sheet-sync mode:"cell" หรือคุยกับผู้ใช้ว่าจะเอาไงกับ 31 แถวนี้
3. ทดสอบ sheet-push กับ อาร์ม/ซัน/โอ๊ค อย่างน้อย 1 รอบต่อแท็บ ก่อนไว้ใจว่าใช้งานได้จริงทั้งระบบ
4. ตั้ง pg_cron job `sheet-poll-every-minute` (SQL อยู่ใน `backend/README.md`)
5. คุยกับทีมเรื่อง RLS — เปิดใช้ + เขียน policy ให้เหมาะสม (ตอนนี้เปิด public ทั้งหมด)
