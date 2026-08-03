-- ============================================================================
-- 0014_fix_sync_empty_wipe.sql — กัน sync_sheet_records ลบข้อมูลทั้งชีตทิ้ง
-- เมื่อ payload ว่างเปล่า
--
-- บั๊กเดิม: sheet-poll ส่ง p_rows = [] เข้ามาได้ถ้า Google Sheets API คืนค่า
-- values ว่าง (อ่านพลาดชั่วคราว, permission หลุดชั่วขณะ, ฯลฯ) — sync_sheet_records
-- คำนวณ v_max_position จาก p_rows ที่ว่าง ได้ -1 แล้ว delete records ที่
-- position > -1 คือลบทุกแถวของชีตนั้นทิ้งหมด รันทุกนาทีผ่าน pg_cron จึงเสี่ยงสูง
--
-- ทางแก้: ถ้า payload ว่างและชีตนั้นมี record อยู่แล้วจริง ให้ข้ามรอบ sync นี้
-- ทั้งก้อน (ไม่ insert/update/delete อะไรเลย) แทนที่จะตีความว่าเป็นการลบทุกแถว
-- ============================================================================

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

  if jsonb_array_length(p_rows) = 0
     and exists (select 1 from records where sheet_id = p_sheet_id)
  then
    return jsonb_build_object('updated', 0, 'inserted', 0, 'deleted', 0, 'skipped', true);
  end if;

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
