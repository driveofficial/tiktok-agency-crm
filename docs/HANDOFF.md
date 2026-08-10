# Handoff

> อัปเดตล่าสุด: 2026-08-05

ไฟล์นี้เก็บ **สถานะงานปัจจุบัน** — ทำถึงไหน ค้างอะไร ทำอะไรต่อ
กฎถาวรของโปรเจกต์ (โครงสร้าง repo, สถาปัตยกรรม, กฎ secret) อยู่ที่ `CLAUDE.md`

## รอบ 2026-08-03 – 08-05 — แก้บั๊ก critical/high ทั้งสองเจน + งาน UI มือถือหลายรอบ + footer

**1. แก้บั๊ก critical/high ทั้งสองเจน รอบแรก (`b6f42c8`, 08-03)**
- เจนใหม่: กัน `sync_sheet_records`/`sheet-sync` ลบข้อมูลทั้งชีตทิ้งเมื่อ payload ว่างเปล่า, `bulkDeleteRows` เช็ค version ก่อนลบ, `fetchAllRecords` เพิ่ม tiebreaker กัน pagination พลาด, `sheet-poll` แยก error ต่อชีตไม่ให้ชีตเดียวพังบล็อกทั้งรอบ, เพิ่ม `unique(sheet_id, position)` กัน race ตอน add พร้อมกัน
- เจนเก่า: `parseDate` รองรับปี พ.ศ. ไม่ zero-pad + ปฏิเสธวันที่โรลโอเวอร์, `getStartOfWeek` zero time, `insertRowData` (undo) เช็ค `lastRow` กันแทรกผิดที่, clear `CACHE_KEY_DIRECTORY` ครบทุก mutator, bulk ops รายงาน partial success ให้ client resync แทน revert มั่ว, `setCachedData` เตือนใกล้ cache limit
- Migration `0014_fix_sync_empty_wipe.sql`, `0015_records_position_unique.sql` apply เข้า remote แล้ว
- ตรวจแล้ว `rowFingerprint` ไม่ใช่บั๊ก (มี delimiter `\x01` กันชนอยู่แล้ว) — ไม่ได้แก้จุดนั้น

**2. การ์ดครีเอเตอร์เรียงลำดับผิด (`d6aef3a`, 08-03)**
- เดิมเรียงตามคอลัมน์ "วันที่" ซึ่ง parse พังเวลาเจอวันที่พิมพ์ผิดรูปในชีตจริง (เช่น "20226-04-28") ทำให้แถวนั้นหลุดไปเรียงปนมั่ว — เปลี่ยนไปเรียงตามคอลัมน์ "ลำดับ" แทน + โชว์เลขลำดับบนการ์ดด้วย

**3. code review รอบสอง ทั้งสองเจน (`873a4a5`, 08-05)**
- เจนเก่า: tab access denied ไม่โชว์ placeholder, team corpus cache ไม่เคย clear ตอนแก้ข้อมูล (ค้างได้ถึง 30 นาที), แยก pipeline stage "รับข้อเสนอแต่ยังไม่กดขอสินค้า" ออกจาก "รับข้อเสนอ" เต็ม, search ไม่ reset หน้า, date parse กันปีเกินหลัก, `loadConfig` เช็ค tab หายด้วย (ไม่ใช่แค่ team หาย), `headers.findIndex` guard `h &&`, QuickStats label ไม่ตรงข้อมูลจริง
- เจนใหม่: search ไม่ reset หน้า + findIndex guard เหมือนเจนเก่า, `loadData` กัน race (request เก่า resolve ช้ากว่าทับ state ใหม่กว่า), `handleCellUpdate` revert เฉพาะ cell ที่ fail จริง (เดิม revert ทั้งอาเรย์ทำแก้ 2 cell ติดกันเสียของดีไปด้วย), `handleBulkStatusUpdate` reload หลังสำเร็จ, `CreatorCardBase` checkbox ไม่กดได้นอก selectMode แล้ว
- ตรวจสอบด้วย dev test 18/18 ผ่าน, dev build ผ่าน, frontend build ผ่าน

**4. งาน UI มือถือหลายรอบ (`7cfd31e`, `59a6cbc`, `7096663`, 08-05)**
- เพิ่มปุ่มเลื่อนขึ้นเร็วลอยบนมือถือ (state มีอยู่แล้วแต่ไม่เคย render จริง) + ลบปุ่มซ้ำใน pagination bar ออก
- ซ่อนข้อความ "SHOWING x-y OF z" บนมือถือ (จอแคบพื้นที่ไม่พอ), ปุ่ม FAB ขยับตำแหน่งกันบัง, ปุ่มใน EditModal footer เล็กลงบนจอแคบ
- แก้ระยะห่างปุ่มลอย (ปุ่ม + ชนปุ่มเลื่อนขึ้นเร็ว, บังไอคอนแก้ไข/ลบท้ายการ์ดใบสุดท้าย) + เพิ่ม gap ไอคอน header มือถือที่ชิดกันเกินไป

**5. ลบ Commission ออกจาก card view (`bbf6be5`, 08-05)**
- Commission ไม่มีในโครงสร้าง 19 คอลัมน์ที่ unify แล้ว โชว์แต่ "-" ตลอด — ตัดออกจาก `MobileCardBase`/`CreatorCardBase` แล้ว
- เพิ่มกฎ "แก้เจนเก่าแล้วต้อง `cd dev && npm run build` ก่อน commit" ลง `CLAUDE.md`

**6. เพิ่ม footer เว็บ (`52709ec`, 08-05)**
- ไอคอน Facebook/TikTok ของ Drive.Official, โลโก้ Drive (เปลี่ยนจากไฟล์รูปเป็น `DriveLogo` component — SVG in-code เปลี่ยนสีได้ผ่าน prop `textColor`), ข้อความลิขสิทธิ์ — ยังไม่ใส่ลิงก์นโยบาย/ข้อกำหนด/คุกกี้เพราะยังไม่มีหน้าจริง
- Layout มือถือ vs desktop ต่างกันจงใจ: มือถือเป็น sibling หลัง `main` (sticky-footer pattern ผ่าน `main flex-1`), desktop อยู่ใน `main` เลื่อนตามเนื้อหา
- เพิ่ม `Icons.TikTok`

## ค้างอยู่ตรงไหน (สืบทอดจากรอบ 2026-08-03 ก่อนหน้า — ยังไม่มีใครแตะ)

- **RLS เปิดแล้วแต่ยัง permissive** — `records`/`sheets`/`teams`/`team_members` มี policy `using(true) with check(true)` ให้ `anon`/`authenticated` ทุกตาราง ยังไม่กันทีม A เห็นข้อมูลทีม B เพราะไม่มีระบบ auth ให้อ้างอิง
- anon เรียก RPC `sync_sheet_records` ตรงได้เอง (เป็น `security definer`) — Supabase advisor เตือนแยก ยังไม่ได้ปิด (revoke execute หรือเปลี่ยนเป็น `security invoker`)
- `frontend/src/lib/columns.js` ยังมี `deriveFields`/`extractHandle`/`toISODate` แยกชุดของตัวเอง ไม่ได้ dedup รวมกับ `backend/supabase/functions/_shared/deriveFields.ts` เพราะ Vercel build root = `frontend/` เท่านั้น import ข้าม `backend/` ไม่ได้ (มีคอมเมนต์เตือนไว้ทั้งสองไฟล์)

## Blocker (รออะไรอยู่)

- [ ] ไม่มี blocker ที่ต้องรอคนอื่น — ทุกอย่างที่ค้างเป็นงานที่ทำต่อได้เลย

## ทำอะไรต่อ

1. คุยกับทีมเรื่องระบบ auth/login — ถ้าจะทำ RLS แบบกันข้ามทีมจริง ต้องมีตรงนี้ก่อน
2. ตัดสินใจเรื่อง RPC `sync_sheet_records` ที่ anon เรียกตรงได้ — revoke execute หรือเปลี่ยนเป็น security invoker
3. ถ้าทำ footer ต่อ: ใส่ลิงก์นโยบาย/ข้อกำหนด/คุกกี้ เมื่อมีหน้าจริงแล้ว
