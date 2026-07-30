-- ============================================================================
-- 0011_sheet_push_trigger.sql — เว็บ → Google Sheet: trigger เรียก sheet-push
-- ทุกครั้งที่ records เปลี่ยน (insert/update/delete) ยิง pg_net ไป edge function
-- sheet-push แบบ async (ไม่ block transaction ของเว็บ)
--
-- หมายเหตุ: ค่า secret จริงตั้งแยกต่างหาก ต้องตั้งทั้ง 2 จุดให้ค่าตรงกัน:
--   1) select vault.create_secret('<random>', 'sheet_push_secret', '...');
--   2) supabase secrets set SHEET_PUSH_SECRET=<ค่าเดียวกับข้อ 1>
--
-- statement-level trigger (via transition tables) แทน row-level:
-- statement เดียวที่แก้หลายแถว (เช่น bulkDeleteRows' delete().in(ids)) ต้องยิง
-- push แค่ครั้งเดียวต่อ sheet_id ไม่ใช่ยิงทีละแถว (fan-out storm — เคยทำ Sheet
-- ข้อมูลหายมาแล้วเมื่อ 2026-07-29 ตอนยังเป็น row-level trigger)
--
-- SECURITY DEFINER สำคัญมาก — ถ้าไม่ใส่ trigger จะรันด้วยสิทธิ์ของ role ที่ยิง
-- request มา (เช่น anon จากเว็บแอป) ซึ่งไม่มีสิทธิ์เข้า schema vault เลย ทำให้
-- UPDATE ทุกตัวจากเว็บแอป fail ด้วย "permission denied for schema vault"
-- (เจอปัญหานี้จริงตอนต่อ trigger กลับเข้าไปวันที่ 2026-07-30)
-- ============================================================================

create extension if not exists supabase_vault;

create or replace function notify_sheet_push() returns trigger
security definer
language plpgsql as $$
declare
  v_secret text;
  r record;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'sheet_push_secret';

  if v_secret is null then
    return null;
  end if;

  if TG_OP = 'DELETE' then
    for r in (select distinct sheet_id from old_table) loop
      perform net.http_post(
        url     := 'https://fxjaeqeuxdlnwyxwrozf.supabase.co/functions/v1/sheet-push',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
        body    := jsonb_build_object('sheet_id', r.sheet_id)
      );
    end loop;
  else
    -- INSERT: new_table เท่านั้น. UPDATE: new_table พอ เพราะ sheet_id ไม่เปลี่ยน
    -- ตอน update และทุกแถวที่เปลี่ยนอยู่ใน new_table อยู่แล้ว
    for r in (select distinct sheet_id from new_table) loop
      perform net.http_post(
        url     := 'https://fxjaeqeuxdlnwyxwrozf.supabase.co/functions/v1/sheet-push',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
        body    := jsonb_build_object('sheet_id', r.sheet_id)
      );
    end loop;
  end if;

  return null;
end $$;

alter function notify_sheet_push() set search_path = public, vault, extensions;

drop trigger if exists trg_sheet_push on records;
drop trigger if exists trg_sheet_push_insert on records;
drop trigger if exists trg_sheet_push_update on records;
drop trigger if exists trg_sheet_push_delete on records;

create trigger trg_sheet_push_insert
after insert on records
referencing new table as new_table
for each statement execute function notify_sheet_push();

create trigger trg_sheet_push_update
after update on records
referencing new table as new_table old table as old_table
for each statement execute function notify_sheet_push();

create trigger trg_sheet_push_delete
after delete on records
referencing old table as old_table
for each statement execute function notify_sheet_push();
