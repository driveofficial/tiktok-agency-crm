# Web → Google Sheet Sync — Design

## Context

CRM ปัจจุบัน (`backend/`, `frontend/`) มี sync ทิศทาง Sheet → Supabase อยู่แล้ว (2 แบบ: onEdit push ผ่าน GAS, และ poll ผ่าน Sheets API — ดู `backend/README.md` ข้อ 5-6). ไม่มีทิศทางกลับ (Supabase → Sheet) เลย. User ต้องการให้แก้ข้อมูลผ่านเว็บ CRM แล้วสะท้อนกลับไป Google Sheet จริงด้วย.

Spreadsheet เป้าหมาย: `ทักอินฟูรับคอมมิชชั่น 10% (ใหม่ล่าสุด!!)`
(`spreadsheet_id=1uGNuLClySwpkENlbi1lPIbDeL-q06uF2N8P9neXTKbU`, team ใน DB ชื่อ `ทักอินฟูรับคอมมิชชั่น 10%` — id `84498bd5-92e9-4207-934d-c8418484a911`)

มี 4 แท็บ: อาร์ม (gid 9969379, import แล้ว), ซัน (gid 1282755086), โอ๊ค (gid 1272785643), ตี๋น้อย (gid 1801828853) — 3 แท็บหลังยังไม่เคย import เข้า Supabase.

Service account ที่ใช้อยู่แล้ว (จาก sheet-poll setup เดิม, ไฟล์ `silent-emissary-485208-f8-4b1b1bcafc09.json`):
`sheet-api-key@silent-emissary-485208-f8.iam.gserviceaccount.com` — Sheets API เปิดอยู่แล้ว, อ่าน metadata/values ของไฟล์นี้ได้แล้วตอนนี้ (ไฟล์เป็น "anyone with link" ดูได้). ต้องขอสิทธิ์ **Editor** เพิ่มถึงจะเขียนได้.

## Scope

โปรเจกต์นี้แบ่งเป็น 2 sub-project ทำต่อเนื่องกัน:

### Sub-project A — Import แท็บที่เหลือ (prerequisite)
ดึงข้อมูล 3 แท็บ (ซัน, โอ๊ค, ตี๋น้อย) เข้า Supabase ให้ครบก่อน sheet-push จะมีประโยชน์กับทุกคน

### Sub-project B — Web → Sheet push (ฟีเจอร์หลัก)
ทุกครั้งที่ข้อมูลใน `records` เปลี่ยน (insert/update/delete ผ่านเว็บ) ให้เขียนกลับไป Google Sheet ทั้ง 4 แท็บ

## Sub-project A: Import แท็บที่เหลือ

**วิธี**: script local (Node) ดึงค่าจากแต่ละแท็บผ่าน Sheets API v4 (`values.get`, scope `spreadsheets.readonly`, auth ด้วย service account JWT — โค้ด auth pattern เหมือน `backend/supabase/functions/sheet-poll/index.ts`) แล้ว POST เข้า edge function `sheet-sync` ที่มีอยู่แล้ว (full-snapshot mode, auto-create team/sheet row ผ่าน `upsert onConflict`).

Payload ต่อแท็บ:
```json
{ "team": "ทักอินฟูรับคอมมิชชั่น 10%", "label": "<ชื่อแท็บ>", "headers": [...], "rows": [[...], ...] }
```

**ต้องใช้ `SHEET_SYNC_SECRET`** (มีอยู่แล้วใน Supabase secrets) — user รัน script เองในเครื่อง (ใส่ secret เป็น env var ตอนรัน, ไม่พิมพ์ในแชท), เพราะ Claude ไม่ควรเห็น/handle ค่า secret ตรงๆ.

**Verification**: หลัง import เช็ค `select sheets.label, count(*) from records join sheets on ... group by label` ผ่าน MCP (aggregate เท่านั้น ไม่ดึง raw data — บทเรียนจาก import "อาร์ม": ข้อมูลดิบผ่าน MCP ทีละมากๆ กิน token เยอะเกินไป).

## Sub-project B: Web → Sheet push

### Architecture
```
เว็บ (frontend/src/lib/api.js: addRow/updateRow/deleteRow/bulk*)
  → Supabase records table (insert/update/delete)
  → Postgres trigger (AFTER INSERT/UPDATE/DELETE, FOR EACH ROW)
  → pg_net.http_post (async, ไม่ block transaction)
  → Edge Function ใหม่ `sheet-push`
  → อ่าน sheets.headers + records ทั้งหมดของ sheet_id นั้น (เรียง position)
  → Google Sheets API: values.clear (A2:Z100000) + values.update (เริ่ม A1, values=[headers, ...rows])
```

### ทำไม full-rewrite แทน incremental patch
Incremental (update เฉพาะแถว/ลบแถวจริงด้วย batchUpdate) ต้องรู้ gid ของแท็บ, คำนวณเลขแถวจาก `position+2`, และตอน bulk-delete ต้องเรียงลบจากล่างขึ้นบนไม่งั้นเลขแถวเลื่อนผิด — ซับซ้อนและเปราะ. Full-rewrite เขียนทับด้วย state ล่าสุดจาก DB ทุกครั้ง ถูกต้องเสมอแม้เรียกซ้ำ/ชนกัน (idempotent). Trade-off: เปลือง API call กว่า แต่จังหวะแก้ข้อมูลของทีม (พิมพ์มือ) ไม่มีทางชน Sheets API quota (60 write/min/user).

### Auth
- **Google**: service account เดิม, ขยาย scope เป็น `https://www.googleapis.com/auth/spreadsheets` (write). User ต้องแชร์ทั้ง 4 แท็บ (ไฟล์เดียวกัน แชร์ครั้งเดียวพอ) ให้ service account เป็น **Editor**.
- **Supabase secret ใหม่**: `GOOGLE_SERVICE_ACCOUNT_JSON` (ยังไม่เคยตั้ง — set จากไฟล์ที่มีอยู่).
- **Trigger → Edge Function**: Postgres เรียก pg_net ข้าม process, ต้องแนบ secret header แต่ Postgres อ่าน Deno edge-function secret ตรงไม่ได้ → ใช้ **Supabase Vault** เก็บ secret ใหม่ (`sheet_push_secret`, ค่าสุ่มใหม่ที่ไม่ใช่ `SHEET_SYNC_SECRET` เดิม) ฝั่ง Postgres, trigger ดึงจาก `vault.decrypted_secrets` มาแปะ header. ตั้งค่าเดียวกันเป็น edge function secret `SHEET_PUSH_SECRET` ด้วย (คนละตัวจาก `SHEET_SYNC_SECRET` เดิม ป้องกันสับสนทิศทาง).

### DB changes
เติม `sheets.spreadsheet_id = '1uGNuLClySwpkENlbi1lPIbDeL-q06uF2N8P9neXTKbU'` และ `tab_name` (อาร์ม/ซัน/โอ๊ค/ตี๋น้อย ตามชื่อแท็บจริง) ให้ครบทั้ง 4 แถวใน `sheets`.

### Error handling
pg_net แบบ fire-and-forget — ถ้า push ไป Google ล้มเหลว (quota, สิทธิ์หมด, sheet ถูกลบ) เว็บไม่รู้ (การเขียนลง Supabase ไม่ถูก block). ดู log ผ่าน `get_logs` (edge function) ถ้าสงสัยว่าไม่ sync. ไม่ทำ retry queue (เกินความจำเป็นสำหรับสเกลปัจจุบัน — 1 spreadsheet/4 แท็บ). Sheet ไหนไม่มี `spreadsheet_id`/`tab_name` → function skip เงียบๆ (รองรับ sheet อื่นในอนาคตที่ยังไม่ผูก).

### Testing / Verification
1. เพิ่มแถวใหม่ผ่านเว็บ (แท็บ "อาร์ม") → เช็คแถวขึ้นในชีตจริงภายในไม่กี่วิ
2. แก้ cell ผ่านเว็บ → เช็คค่าตรงในชีต
3. ลบแถวผ่านเว็บ (เดี่ยว + bulk) → เช็คชีตแถวหายและแถวอื่นไม่เลื่อนผิด
4. เช็ค edge function logs ว่าไม่มี error ระหว่างทดสอบ
5. ทำซ้ำกับอีก 3 แท็บ (ซัน/โอ๊ค/ตี๋น้อย) หลัง import สำเร็จ

## Out of scope (YAGNI)
- Retry/queue สำหรับ push ที่ล้มเหลว
- Sync กลับทิศ (คนแก้ sheet ตรงๆ) — ตัดสินใจแล้วก่อนหน้านี้ว่าไม่ทำ (ดู memory `project-realtime-sync`)
- รองรับ sheet/team อื่นนอกเหนือจาก 4 แท็บนี้ (ทำเพิ่มได้ทีหลังแค่เติม spreadsheet_id/tab_name)
