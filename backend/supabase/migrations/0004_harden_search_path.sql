-- ============================================================================
-- 0004_harden_search_path.sql — ตั้ง search_path คงที่ให้ทุกฟังก์ชัน
-- ปิด advisor WARN function_search_path_mutable (กัน search_path hijack)
-- ============================================================================

alter function bump_version()                    set search_path = public;
alter function get_dashboard_rows()              set search_path = public;
alter function check_duplicate(text, text, text) set search_path = public;
alter function search_team(uuid, text)           set search_path = public;
