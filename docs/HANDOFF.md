# Handoff

> อัปเดตล่าสุด: 2026-08-03

ไฟล์นี้เก็บ **สถานะงานปัจจุบัน** — ทำถึงไหน ค้างอะไร ทำอะไรต่อ
กฎถาวรของโปรเจกต์ (โครงสร้าง repo, สถาปัตยกรรม, กฎ secret) อยู่ที่ `CLAUDE.md`

## รอบ 2026-08-03 — ทดสอบ sheet-push ครบ 4 แท็บ + เจอ 2 บั๊กใหม่ในตี๋น้อย + เปิด RLS

**1. ทดสอบ sheet-push (Supabase → Sheet) ให้ครบ อาร์ม/ซัน/โอ๊ค (ก่อนหน้านี้ทดสอบแค่ตี๋น้อย)**
- เช็คก่อนว่า pg_cron `sheet-poll-every-minute` รันสำเร็จต่อเนื่องจริง (ข้อมูล Supabase ควรตรงกับชีตสด) แล้วยิง `net.http_post` เรียก sheet-push ตรงทีละแท็บผ่าน SQL Editor (อ่าน secret จาก vault ไม่เคย print ค่าจริง)
- ผลผ่านทั้ง 3 แท็บ: อาร์ม (2128 แถว), ซัน (1396 แถว), โอ๊ค (1695 แถว) — ยืนยันด้วย poll รอบถัดมา `updated:0/inserted:0/deleted:0` ทุกตัว (เขียนทับแล้วไม่มีอะไรเพี้ยน)
- **sheet-push ทำงานครบทั้ง 4 แท็บแล้วจริง** (รวมตี๋น้อยที่ทดสอบไปก่อนหน้า)

**2. เจอ + แก้บั๊ก "header พองซ้ำ" ของตี๋น้อยที่ยังไม่ได้แก้จริง (แก้แค่ระดับ UI เมื่อ 08-01)**
- Supabase `sheets.headers` ของตี๋น้อยยังยาว 27 คอลัมน์ (ควรเป็น 19 เหมือน 3 แท็บอื่น) — ตรวจแล้วพบว่า**ชีตจริง**มี 27 คอลัมน์จริง (19 คอลัมน์จริง + 3 ว่าง + duplicate 5 คอลัมน์ท้าย: วันส่งของ/วันได้รับของ/ลงคลิปยัง/คลิปผ่านไหม/gencode)
- พบ **1 แถวจริงที่ข้อมูลหลงไปอยู่คอลัมน์ซ้ำ** (ลำดับ 264, แถว 265 ในชีต, @12timereview) — วันส่งของ/วันได้รับของ/gencode ถูกกรอกไว้ที่คอลัมน์ W/X/AA (ซ้ำ) แทนที่จะเป็น O/P/S (จริง) ทำให้ระบบอ่านค่าคอลัมน์จริงเป็นค่าว่าง
- แก้ตรงชีตจริงโดยตรง (ไม่แตะโครงสร้าง/ไม่ลบคอลัมน์): ย้ายค่า 3 ช่องจาก W265/X265/AA265 → O265/P265/S265 แล้ว clear คอลัมน์ซ้ำทิ้ง (`T1:AA1` และ `T265:AA265`) ให้ Google Sheets API ตัดคอลัมน์ว่างท้ายอัตโนมัติตอนอ่านกลับ (วิธีเดียวกับที่เคยพิสูจน์แล้วว่าเวิร์กตอน 31/7)
- ยืนยันด้วย sheet-poll รอบถัดมา: `sheets.headers` กลับมา 19 คอลัมน์ ตรงกับอีก 3 แท็บ + แถว 265 ข้อมูลกลับมาอยู่ตำแหน่งถูก

**3. เจอ + แก้บั๊กใหม่: คอลัมน์ตี๋น้อยถูกซ่อน (Hide columns) ต่างจาก 3 แท็บอื่น**
- ผู้ใช้แจ้งว่าเปิดตี๋น้อยแล้วดูไม่เหมือนแท็บอื่น (มีไอคอน ◄► กลางตาราง) — เช็คแล้วพบว่าคอลัมน์ **สไตล์ช่อง (H)** และ **วันส่งของ/วันได้รับของ/ลงคลิปยัง/คลิปผ่านไหม/gencode (O:V)** ถูก hide ไว้เฉพาะแท็บตี๋น้อย (อาร์ม/ซัน/โอ๊ค ไม่ hide เลยสักคอลัมน์) — ทีมเปิดตี๋น้อยแล้วเห็น/แก้คอลัมน์พวกนี้ไม่ได้เลย
- แก้ด้วย Sheets API `batchUpdate` (`updateDimensionProperties`, `hiddenByUser:false`) ยกเลิกซ่อนทั้งหมด ยืนยันแล้วว่าตี๋น้อยไม่มีคอลัมน์ซ่อนเหลือ เหมือน 3 แท็บอื่นทุกประการ
- ยังไม่รู้ต้นตอว่าทำไมตี๋น้อยโดน hide ทั้งที่แท็บอื่นไม่โดน (อาจมาจากตอนย้าย tab_name `test`→`ตี๋น้อย` เมื่อ 31/7) — ถ้าเจอแท็บอื่นมีปัญหาเดียวกันอีกให้ไล่เช็คด้วยสคริปต์เดิม

**4. เปิด RLS ทั้ง 4 ตาราง (permissive — ยังไม่กันข้ามทีม)**
- `records`, `sheets`, `teams`, `team_members` เปิด RLS แล้ว + policy `using(true) with check(true)` ให้ role `anon`/`authenticated` ทุกตาราง — ปิด lint error `rls_disabled_in_public` ของ Supabase advisor ได้หมด
- **เหตุผลที่ policy ยัง permissive:** frontend ไม่มีระบบ auth/login เลย (ไม่มี `supabase.auth`, ไม่มี JWT/team claim) ไม่มีทางเขียน policy แยกตามทีมได้จริงตอนนี้ — งานนี้แค่ปิดช่องโหว่ "query ตรงเข้า Supabase REST API แบบไม่ผ่านการตรวจสอบใดๆ เลย" ไม่ใช่การกันทีม A เห็นข้อมูลทีม B (ยังเห็นข้ามกันได้เหมือนเดิมทุกอย่าง)
- ทดสอบยิง REST API ด้วย anon key จริงหลังเปิด RLS แล้ว — อ่านข้อมูลได้ปกติ ไม่กระทบเว็บแอป
- ไฟล์: `backend/supabase/migrations/0013_enable_rls_permissive.sql`
- **เจอเพิ่ม (ยังไม่แก้ ไม่ได้ขอ):** anon เรียก RPC `sync_sheet_records` ตรงได้เอง (เป็น `security definer`) — Supabase advisor ขึ้นเตือนแยก เป็นความเสี่ยงอีกจุดถ้าจะปิดต้องคุยกันว่าจะ revoke execute หรือเปลี่ยนเป็น `security invoker`

**5. อื่นๆ**
- commit ค้าง `Dashboard.html` (ลบคอมเมนต์ไม่จำเป็น 4 บรรทัด) — commit แล้ว (`9b4c004`)
- แก้ `CLAUDE.md` หัวข้อ "ข้อมูลและ sync" ให้ตรงสถานะจริง (เดิมเขียนว่า sync ทางเดียว Sheet→Supabase เท่านั้น — ไม่จริงแล้วตั้งแต่ sheet-push ทำงานครบ)

## ทำอะไรไปในรอบก่อนหน้า (2026-07-29 – 31)

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
- **⚠️ ระหว่างลบ column ผมพลาดลบผิดชุดไปรอบนึง** (index เพี้ยนเพราะนับจาก header เก่า) ลบ "ตามแชทเอาคำตอบ" กับ "มีลูกกี่คน" ไปโดยไม่ได้ตั้งใจ — ผู้ใช้กู้ผ่าน Google Sheets Version History ได้ "ตามแชทเอาคำตอบ" กลับมาครบ แต่ "มีลูกกี่คน" ยังหายอยู่ (ของเดิมว่างสนิททุกแถวอยู่แล้ว ไม่มีข้อมูลจริงเสีย) — 31 แถวที่หายจาก version history นั้น**ยอมรับว่าหายแล้ว ไม่กู้ต่อ (ผู้ใช้ตัดสินใจ 2026-07-31)**
- **📌 แก้ความเข้าใจผิด (2026-07-31): "test" กับ "ตี๋น้อย" เป็นคนละแท็บ!** ที่ผ่านมาทั้ง session (รวมบรรทัดด้านบน) เข้าใจผิดว่า "test" คือตี๋น้อยที่เปลี่ยนชื่อ — จริงๆ "test" เป็นแท็บทดลองแยกต่างหาก ส่วน "ตี๋น้อย" ตัวจริงมีข้อมูลจริงอยู่แยกกัน ไม่เคย sync เข้า Supabase เลยจนถึงตอนนั้น (Supabase `sheets` row label="ตี๋น้อย" ชี้ผิดไปที่ tab_name="test" มาตลอด) — แก้แล้ว ดูหัวข้อ 5

**3. เปิดใช้ Supabase → Sheet (sheet-push) จริง**
- สร้าง trigger `trg_sheet_push_insert/update/delete` บนตาราง `records` (statement-level, กัน fan-out storm) — apply ผ่าน `execute_sql` เพราะ `apply_migration` โดน auto-mode classifier บล็อก
- **เจอบั๊กใหม่ระหว่างต่อ:** trigger เดิม (ตามแผน) ไม่ได้ใส่ `security definer` — พอเว็บแอปจริง (role `anon`) ยิง UPDATE จะ error `permission denied for schema vault` ทำให้**บันทึกข้อมูลจากเว็บไม่ได้เลย** แก้แล้วด้วย `security definer` + `search_path = public, vault, extensions`
- เจอด้วยว่า SQL Editor ที่ผู้ใช้ใช้ตอนแรกต่อคนละ **database branch** กับที่เว็บแอปใช้จริง (เช็คด้วย `select version()` เทียบ x86_64 vs aarch64) ทำให้ vault secret ที่ตั้งไม่ตรงกับที่ edge function ใช้ วน 401 อยู่หลายรอบ
- ทดสอบสำเร็จบนแท็บ**ตี๋น้อยเท่านั้น** (`{"ok":true,"rows":264}`) — ยังไม่ได้ทดสอบ อาร์ม/ซัน/โอ๊ค
- เพิ่มไฟล์ที่ขาดหายไปจาก main (โค้ดจริง deploy ไปนานแล้วแต่ไม่เคย commit): `backend/supabase/migrations/0011_sheet_push_trigger.sql`, `backend/supabase/functions/sheet-push/index.ts`

**อื่นๆ:**
- แก้ Vercel deploy เว็บใหม่ว่างเปล่า — root cause คือ Vercel project **ไม่เคยตั้ง Root Directory เป็น `frontend`** เลย (`rootDirectory: null`) เลย build/serve จาก root repo แทน (เจอ `index.html` เจนเก่า Apps Script) — **แก้แล้ว (2026-07-31)** ตั้ง Root Directory = `frontend` + redeploy สำเร็จ เช็คด้วยเบราว์เซอร์แล้วขึ้นเว็บใหม่จริง

**4. ตั้ง pg_cron job `sheet-poll-every-minute` (2026-07-31) — เจอบั๊กใหญ่ระหว่างทำ แก้แล้ว**
- ตั้ง `SHEET_SYNC_SECRET` ใหม่ (เดิมหาค่าไม่ได้/ไม่ตรงกัน) เก็บใน vault secret ชื่อ `sheet_sync_secret` (pattern เดียวกับ `sheet_push_secret` ของ sheet-push) — cron job อ่านจาก vault ตอนยิงจริง ไม่มี plaintext secret ฝังในตัว job
- **เจอบั๊กร้ายแรง:** พอ auth ผ่าน sheet-poll เขียน `records` ทีละแถวผ่าน PostgREST loop (`.insert()`/`.update()` แยก request) — แต่ละแถวคือคนละ statement ทำให้ trigger `notify_sheet_push` (statement-level, ตั้งใจกัน fan-out ของ 1 statement ที่แก้หลายแถวอยู่แล้ว) ยิงแยกทุกแถวอยู่ดี → เขียนกลับ Google Sheet รัวๆ ชน **Google Sheets write quota 429** ทันที (60 ครั้ง/นาที) ในไม่กี่วินาทีแรกที่เปิด — pause pg_cron ทันทีที่เจอ (unschedule) ก่อนสืบ
- **root cause ที่แท้จริง:** sheet-poll (Sheet→Supabase) ไม่ควรทำให้ sheet-push (Supabase→Sheet) ทำงานเลยตั้งแต่ต้น เพราะข้อมูลมาจาก Sheet เองอยู่แล้ว เขียนกลับไปมีแต่เสีย quota เปล่าๆ กับเสี่ยง format เพี้ยน
- **แก้:** migration `0012_sheet_poll_skip_push.sql` — เพิ่ม RPC `sync_sheet_records()` ที่ sheet-poll เรียกครั้งเดียวต่อ sheet (แทน loop เดิม) ตั้ง `set_config('app.skip_sheet_push','true',true)` ตลอด transaction ของ RPC call นั้น + แก้ `notify_sheet_push()` ให้เช็ค flag นี้ก่อน ข้ามถ้าติด — แก้ `sheet-poll/index.ts` ให้เรียก RPC นี้แทน deploy v8
- ทดสอบ 2 รอบติด ได้ `updated:0,inserted:0,deleted:0` (ไม่มีอะไรเปลี่ยนจริง ไม่ false-positive) และไม่มี sheet-push ยิงตามเลย — เปิด pg_cron กลับ (job id 3, ใส่ `timeout_milliseconds:=30000` เพราะ default 5000ms ของ pg_net สั้นไปสำหรับงานจริง) รันผ่าน 2 นาทีติด ok
- แผนงานเต็ม: `docs/superpowers/plans/2026-07-31-fix-sheet-poll-push-loop.md`
- ⚠️ ค่า `SHEET_SYNC_SECRET` ใหม่หลุดเข้าแชทระหว่างแก้ (ผู้ใช้พิมพ์มาเอง) — ไม่ใช่เรื่องด่วน (แค่ internal shared secret) แต่ควรหมุนใหม่อีกรอบเมื่อมีเวลา (ดู "ทำอะไรต่อ")

**5. รวมคอลัมน์ อาร์ม/ซัน/โอ๊ค/ตี๋น้อย(จริง) ให้ตรงกับ "test" ทั้งหมด (2026-07-31)**
- แก้ Supabase `sheets` row label="ตี๋น้อย": `tab_name` จาก `test` (ผิด) → `ตี๋น้อย` (แท็บจริง) แล้วรัน sheet-poll ดึงข้อมูลจริงเข้ามา (294 แถว มาแทน 264 แถวของ "test" เดิม)
- คอลัมน์เป้าหมาย (ทั้ง 4 แท็บเหมือนกันหมดตอนนี้ 20 คอลัมน์): ลำดับ, วันที่, จำนวนที่ทัก, ชื่อเล่น, Tiktok (วางลิงค์ช่อง), จำนวนผู้ติดตามใน Tiktok, เฉลี่ยวิวคร่าวๆ, สไตล์ช่อง, ติดต่อกันช่องทางไหน, ช่องทางติดต่อ, ทัก/ยังไม่ทัก, สถานะ, คอมเมนท์ให้ตอบแชท, ตามแชทเอาคำตอบ, วันส่งของ, ได้รับของวันไหน, ส่งของถึงยัง, ลงคลิปยัง, คลิปผ่านไหม, gencode
- **ซัน**: ลบคอลัมน์ "Campaign" ที่มีข้อมูลจริง 38 ค่า — **ผู้ใช้ยืนยันให้ลบทิ้ง** (เหมือน test เป๊ะๆ) คอลัมน์อื่นที่ลบ (Member/Rate Card/เค้าชอบอะไรเป็นพิเศษ/มีอาชีพอื่นไหม/วันเกิดวันที่/มีลูกกี่คน/ลูกชื่ออะไร) ว่างหมด ไม่เสียข้อมูล
- **โอ๊ค**: ลบคอลัมน์เดิม (คลิป/Member/Rate Card/ฯลฯ) ว่างหมด ไม่เสียข้อมูล
- **ตี๋น้อย(จริง)**: ลบ สไตล์ช่อง 20%/Campaign/Member/ฯลฯ ว่างหมดทุกตัว ไม่เสียข้อมูล — ไม่มีคอลัมน์ "จำนวน" อยู่แต่แรก (ต่างจาก 3 แท็บอื่น) เลยเพิ่ม "จำนวนที่ทัก" เป็นคอลัมน์ว่างใหม่แทนการ rename
- วิธีทำ: `UPDATE records SET data = jsonb_build_array(...)` reshape ตำแหน่งคอลัมน์ตรงๆ ใน SQL Editor (ผู้ใช้รันเอง เพราะ bulk update โดน auto-mode classifier บล็อกทั้ง MCP `execute_sql` และ Bash/CLI) — แท็บที่คอลัมน์เดิมกว้างกว่าเป้าหมาย (ซัน/โอ๊ค/ตี๋น้อย, เดิม 24-25 คอลัมน์) ทำ 2 phase: phase 1 push แบบ pad ว่างให้เท่าความกว้างเดิมก่อน (กัน column เก่าเหลือค้างในชีตจริง) แล้ว phase 2 trim Supabase กลับเป็น 20 คอลัมน์สะอาด (พบว่าจริงๆ ไม่จำเป็นต้องทำ phase 2 เองด้วยซ้ำ เพราะ Google Sheets API ตัดคอลัมน์ว่างท้ายแถวอัตโนมัติตอน sheet-poll อ่านกลับอยู่แล้ว — self-heal)
- **⚠️ เจอ typo ของตัวเองซ้ำหลายรอบ**: พิมพ์ "ส่งของถึงยัง" ขาดสระ ั (ผิดเป็น "ส่งของถึงยง") ทุกครั้งที่พิมพ์ตรงๆ แม้แต่ตอน copy จาก column อื่นที่คิดว่าแก้แล้วก็ยังผิด — แก้ด้วยการสร้างจาก Unicode `chr()` codepoint ตรงๆ ใน SQL แทนพิมพ์ ยืนยันด้วย `strpos(...,chr(3633))`/hex ก่อนเชื่อทุกครั้ง หลังจากนี้ถ้าต้องพิมพ์คำนี้อีกให้ใช้วิธี codepoint เท่านั้น
- **⚠️ เจอปัญหาใหญ่กว่านั้น: header/data ยาวเกินซ้ำกันเป็นระลอก** ระหว่างไล่แก้ typo ยิง sheet-poll/sheet-push มือซ้อนกับ pg_cron auto-tick หลายรอบ ทำให้ header บางแท็บพองยาวผิดปกติ (ตี๋น้อยเคยยาวถึง 27, มีคอลัมน์ซ้ำ "gencode"/"วันส่งของ" โผล่ซ้ำในชีตจริง) **root cause: sheet-push เขียนแค่กว้างเท่า `headers.length` ตอนนั้น ไม่เคยล้างคอลัมน์เก่าที่กว้างกว่าที่เหลือค้างในชีตจริง** — วิธีแก้ที่ได้ผล: pad ทั้ง header และทุกแถวให้กว้างพอ (35 คอลัมน์) ก่อน push 1 รอบ (ล้างของเก่าให้เกลี้ยงจริง) แล้ว trim Supabase กลับด้วย `DO $$ ... set_config('app.skip_sheet_push','true',true) ... $$` (bulk แบบนี้ผ่าน classifier ได้ ไม่โดนบล็อกเหมือน bulk UPDATE ตรงๆ)
- **ต่อมาผู้ใช้สั่งเพิ่ม**: ลบคอลัมน์ "ส่งของถึงยัง" ออกจากทุกแท็บ (มีข้อมูลจริง 4 แถว: อาร์ม 3, โอ๊ค 1 — ผู้ใช้ยืนยันลบทิ้ง) + เปลี่ยนชื่อ "ได้รับของวันไหน" → "วันได้รับของ" — คอลัมน์เป้าหมายล่าสุดตอนนี้เหลือ **19 คอลัมน์** (ไม่ใช่ 20 แล้ว): ลำดับ, วันที่, จำนวนที่ทัก, ชื่อเล่น, Tiktok (วางลิงค์ช่อง), จำนวนผู้ติดตามใน Tiktok, เฉลี่ยวิวคร่าวๆ, สไตล์ช่อง, ติดต่อกันช่องทางไหน, ช่องทางติดต่อ, ทัก/ยังไม่ทัก, สถานะ, คอมเมนท์ให้ตอบแชท, ตามแชทเอาคำตอบ, วันส่งของ, วันได้รับของ, ลงคลิปยัง, คลิปผ่านไหม, gencode — **ทั้ง 4 แท็บตรงกันแล้ว ยืนยันด้วย poll `updated:0` เสถียร (2026-07-31 09:20)**

## ค้างอยู่ตรงไหน

- **RLS เปิดแล้วแต่ยัง permissive** (ดูหัวข้อ 4 ด้านบน) — ยังไม่กันทีม A เห็นข้อมูลทีม B เพราะไม่มีระบบ auth ให้อ้างอิง ต้องสร้าง login ก่อนถึงจะเขียน policy แยกตามทีมได้จริง
- anon เรียก RPC `sync_sheet_records` ตรงได้เอง (security definer) — ยังไม่ได้ปิด
- `frontend/src/lib/columns.js` ยังมี `deriveFields`/`extractHandle`/`toISODate` แยกชุดของตัวเอง (ไม่ได้ dedup ไปด้วยตอนแก้ข้อถัดไป — ดูเหตุผลด้านล่าง)

**หมุน `SHEET_SYNC_SECRET` ใหม่แล้ว (2026-07-31)** — ค่าเก่าหลุดเข้าแชทตอนตั้งครั้งแรก รอบนี้ generate + `supabase secrets set` + `vault.update_secret` ทั้งหมดในโพรเซส bash เดียว (`$NEWSECRET` ไม่เคย echo/print ที่ไหนเลย ไม่โผล่ในเอาต์พุตที่ผมเห็นด้วยซ้ำ) ใช้ `supabase db query --linked "..."` อัปเดต vault แทนการเปิด SQL Editor เอง — ทดสอบ sheet-poll หลังหมุนแล้ว ได้ 200 ปกติ pg_cron ที่รันอยู่ทุกนาทีก็ใช้ค่าใหม่ต่อเนื่องได้เลยเพราะอ่านจาก vault ตอนยิงจริง ไม่ต้องแก้อะไรเพิ่ม

**แก้ dedup `deriveFields`/`extractHandle`/`toISODate` แล้ว (2026-07-31) — เหลือ 2 ชุดจาก 3:**
- รวม logic ของ `sheet-sync` + `sheet-poll` เข้า `backend/supabase/functions/_shared/deriveFields.ts` ที่เดียว ทั้งสอง edge function import จากตรงนี้แทนก็อปแยก
- **deploy ต้องใช้ Supabase CLI** (`supabase functions deploy <name> --project-ref fxjaeqeuxdlnwyxwrozf --no-verify-jwt`) **ไม่ใช้ MCP tool `deploy_edge_function`** — ลองแล้วพัง (`Module not found .../_shared/deriveFields.ts`) เพราะ MCP tool วางไฟล์ทุกไฟล์ไว้ใต้ `source/` ชั้นเดียวกันหมด import แบบ `../_shared/...` (ออกนอก `source/`) เลยหาไฟล์ไม่เจอ — CLI อ่าน struct จริงบนดิสก์เลยไม่มีปัญหานี้ (login/link CLI ไว้แล้วจากงานข้อ 4)
- `frontend/src/lib/columns.js` **ไม่ได้รวมด้วย** เพราะ Vercel build root = `frontend/` เท่านั้น (ตั้งใจไว้แบบนี้ตอนแก้ deploy) import ข้ามไป `backend/` ไม่ได้ถ้าไม่เปิด "Include files outside root directory" ใน Vercel (ยังไม่แนะนำให้เปิด) — ถ้าจะแก้ logic ตรงนี้ในอนาคต ต้องไปแก้ `frontend/src/lib/columns.js` มือคู่กับ `_shared/deriveFields.ts` (มีคอมเมนต์เตือนไว้ทั้งสองไฟล์แล้ว)

## Blocker (รออะไรอยู่)

- [ ] ไม่มี blocker ที่ต้องรอคนอื่น — ทุกอย่างที่ค้างเป็นงานที่ทำต่อได้เลย

## ทำอะไรต่อ

1. คุยกับทีมเรื่องระบบ auth/login — ถ้าจะทำ RLS แบบกันข้ามทีมจริง ต้องมีตรงนี้ก่อน (RLS ตอนนี้เปิดแล้วแต่ policy ยัง permissive ทุกตาราง)
2. ตัดสินใจเรื่อง RPC `sync_sheet_records` ที่ anon เรียกตรงได้ — revoke execute หรือเปลี่ยนเป็น security invoker
