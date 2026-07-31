-- ============================================================================
-- 0012_sheet_poll_skip_push.sql — กัน sheet-poll (Sheet → Supabase) ทำให้
-- trigger notify_sheet_push (Supabase → Sheet) ยิงตาม
--
-- ปัญหาที่เจอ (2026-07-31): sheet-poll เขียน records ทีละแถวผ่าน PostgREST
-- (.insert()/.update() แยก request ต่อแถว) แต่ละแถว = คนละ statement ในสายตา
-- Postgres แม้ trigger เป็น statement-level (กัน fan-out ของ 1 statement ที่แก้
-- หลายแถวได้) ก็ไม่ช่วยตรงนี้ เพราะแต่ละแถวคือคนละ statement อยู่แล้ว —
-- ผลคือยิง sheet-push แยกทุกแถวที่เปลี่ยน ชน Google Sheets write quota (429)
-- และเขียนข้อมูลกลับ Sheet โดยไม่จำเป็น (ข้อมูลมาจาก Sheet เองอยู่แล้ว)
--
-- ทางแก้: ย้าย insert/update/delete ของ sheet-poll มาไว้ใน RPC เดียว
-- (sync_sheet_records) ที่ตั้ง session flag app.skip_sheet_push ไว้ตลอด
-- transaction ของ RPC call นั้น — trigger เช็ค flag นี้ก่อนอย่างอื่นทั้งหมด
-- แล้วข้าม (return null) ถ้าติด ไม่ต้องแตะ vault/secret เลยด้วยซ้ำ
-- ============================================================================

create or replace function notify_sheet_push() returns trigger
security definer
language plpgsql as $$
declare
  v_secret text;
  r record;
begin
  if current_setting('app.skip_sheet_push', true) = 'true' then
    return null;
  end if;

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

-- RPC เดียวที่ sheet-poll เรียกต่อ 1 sheet แทน loop insert/update/delete ทีละแถว
create or replace function sync_sheet_records(
  p_sheet_id uuid,
  p_team_id uuid,
  p_headers jsonb,
  p_rows jsonb  -- array ของ {position, data, handle, phone, status, platform, commission, shipped, clip, row_date}
) returns jsonb
security definer
language plpgsql as $$
declare
  v_updated int := 0;
  v_inserted int := 0;
  v_deleted int := 0;
  v_row jsonb;
  v_existing_id uuid;
  v_existing_data jsonb;
  v_max_position int;
begin
  perform set_config('app.skip_sheet_push', 'true', true);

  update sheets set headers = p_headers
  where id = p_sheet_id and headers is distinct from p_headers;

  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    select id, data into v_existing_id, v_existing_data
    from records
    where sheet_id = p_sheet_id and position = (v_row->>'position')::int;

    if v_existing_id is null then
      insert into records (
        sheet_id, team_id, position, data,
        handle, phone, status, platform, commission, shipped, clip, row_date
      ) values (
        p_sheet_id, p_team_id, (v_row->>'position')::int, v_row->'data',
        v_row->>'handle', v_row->>'phone', v_row->>'status', v_row->>'platform',
        v_row->>'commission', v_row->>'shipped', v_row->>'clip',
        nullif(v_row->>'row_date', '')::date
      );
      v_inserted := v_inserted + 1;
    elsif v_existing_data is distinct from (v_row->'data') then
      update records set
        data = v_row->'data',
        handle = v_row->>'handle',
        phone = v_row->>'phone',
        status = v_row->>'status',
        platform = v_row->>'platform',
        commission = v_row->>'commission',
        shipped = v_row->>'shipped',
        clip = v_row->>'clip',
        row_date = nullif(v_row->>'row_date', '')::date
      where id = v_existing_id;
      v_updated := v_updated + 1;
    end if;
  end loop;

  select coalesce(max((r->>'position')::int), -1) into v_max_position
  from jsonb_array_elements(p_rows) r;

  delete from records where sheet_id = p_sheet_id and position > v_max_position;
  get diagnostics v_deleted = row_count;

  return jsonb_build_object('updated', v_updated, 'inserted', v_inserted, 'deleted', v_deleted);
end;
$$;

alter function sync_sheet_records(uuid, uuid, jsonb, jsonb) set search_path = public;
