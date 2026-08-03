-- ============================================================================
-- 0015_records_position_unique.sql — กัน addRow ฝั่ง frontend คำนวณ position
-- ชนกันเงียบๆ เมื่อมี 2 คน (2 เครื่อง) add แถวพร้อมกันในชีตเดียว
--
-- บั๊กเดิม: addRow อ่าน max(position) แล้ว insert ที่ +1 โดยไม่มี transaction/lock
-- และ schema ไม่เคยบังคับ unique (sheet_id, position) เลย — สอง insert เกือบพร้อม
-- กันอ่าน max เดิมได้ค่าเดียวกัน ได้ position ซ้ำ ซึ่งไปกระทบ fetchAllRecords/
-- sheet-push ที่พึ่ง position เป็นตัวจัดลำดับหน้า pagination (ดู 0014 ก่อนหน้า)
--
-- ทางแก้: บังคับ unique constraint ระดับ DB แล้วให้ addRow/insertRow ฝั่ง client
-- retry ด้วย position ใหม่เมื่อชน (ดู frontend/src/lib/api.js)
-- เช็คแล้วไม่มี (sheet_id, position) ซ้ำอยู่ในข้อมูลปัจจุบัน ก่อน apply
-- ============================================================================

alter table records add constraint records_sheet_id_position_key unique (sheet_id, position);
