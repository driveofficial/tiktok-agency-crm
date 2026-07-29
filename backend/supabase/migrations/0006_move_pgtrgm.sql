-- ============================================================================
-- 0006_move_pgtrgm.sql — ย้าย pg_trgm ออกจาก public (advisor WARN 0014)
-- index gin_trgm_ops ผูก OID -> ยังทำงานหลังย้าย schema
-- ============================================================================

alter extension pg_trgm set schema extensions;
