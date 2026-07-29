-- ============================================================================
-- 0007_sheets_unique_label.sql — unique (team_id,label) -> webhook upsert
-- ชีตแบบ idempotent + กันชีตซ้ำในทีม
-- (ย้อนมาจาก migration ที่ apply ตรงผ่าน MCP ไปแล้วก่อนหน้านี้ ไม่เคยมีไฟล์ใน repo)
-- ============================================================================

create unique index if not exists uq_sheets_team_label on sheets (team_id, label);
