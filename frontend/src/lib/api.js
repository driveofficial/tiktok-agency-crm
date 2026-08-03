// ============================================================================
// api.js — แทน google.script.run เดิมทั้งหมดด้วย Supabase
//
// คงชื่อ/รูปผลลัพธ์ของ function เดิม (fetchSheetData, addRow, ...) เพื่อให้
// คอมโพเนนต์ฝั่ง UI แทบไม่ต้องแก้. จุดสำคัญ:
//   - frontend อ้างแถวด้วย rowIndex (ตำแหน่งใน array) — api map เป็น record.id ผ่าน rowMeta
//   - optimistic lock ใช้คอลัมน์ version (แทน expectedRow fingerprint เดิม)
//   - dashboard: เรียก RPC get_dashboard_rows (flat) แล้ว reshape เป็น nested เดิม
// ============================================================================

import { supabase } from './supabase';
import { deriveFields, extractHandle, onlyDigits } from './columns';

// --- module cache: ให้ rowIndex ↔ record ตรงกับลำดับที่ fetch มา ---
const rowMeta = {};        // sheetId -> [{ id, version, position, data }]
const sheetHeaders = {};   // sheetId -> headers[]
const pendingUndo = {};    // sheetId -> position (ไว้กู้คืน insert ที่เดิม)
const teamIdByName = {};   // teamName -> teamId (search ต้องใช้ id, แต่ UI ใช้ชื่อ)

const ok = (extra = {}) => ({ success: true, ...extra });
const fail = (e) => ({ success: false, error: e?.message || String(e) });

// ---------------------------------------------------------------------------
// ROUTER / CONFIG
// ---------------------------------------------------------------------------
export async function fetchSheetNames() {
  try {
    const { data, error } = await supabase
      .from('sheets')
      .select('id,label,position,team_id,teams(name,position)')
      .order('position');
    if (error) throw error;

    const rows = (data || []).map(s => ({
      name: s.id,                 // unique id ที่ UI ใช้เป็น activeTab / key ของ bySheet
      label: s.label,             // ชื่อโชว์
      source: s.teams?.name || '', // ทีม
      id: s.id,
      tabName: s.label,
      _teamPos: s.teams?.position ?? 0,
      _pos: s.position ?? 0,
    }));
    // จำ teamName -> teamId ไว้ให้ search_team
    (data || []).forEach(s => { if (s.teams?.name) teamIdByName[s.teams.name] = s.team_id; });

    rows.sort((a, b) => a._teamPos - b._teamPos || a._pos - b._pos);
    rows.forEach(r => { delete r._teamPos; delete r._pos; });
    return ok({ data: rows });
  } catch (e) { return { ...fail(e), data: [] }; }
}

// ---------------------------------------------------------------------------
// READ
// ---------------------------------------------------------------------------
// PostgREST คืนสูงสุด 1000 แถว/query — sheet ที่มีมากกว่านั้นต้องวนดึงเป็นหน้าๆ
const PAGE_SIZE = 1000;
async function fetchAllRecords(sheetId) {
  const out = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    // ต้องมี tiebreaker (id) ต่อจาก position เสมอ — position ไม่มี unique constraint
    // เดิม เผื่อมีค่าซ้ำ ถ้า sort แค่ position เพียวๆ การแบ่งหน้าข้าม request
    // (.range ต่างรอบ) อาจเรียง tie ไม่เหมือนเดิม ทำให้แถวหายหรือซ้ำที่รอยต่อหน้า
    // (ดูจุดเดียวกันที่แก้ไว้แล้วใน sheet-push/index.ts)
    const { data, error } = await supabase.from('records')
      .select('id,position,data,version').eq('sheet_id', sheetId)
      .order('position').order('id').range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return out;
}

export async function fetchSheetData(sheetId) {
  try {
    const [{ data: sheet, error: se }, recs] = await Promise.all([
      supabase.from('sheets').select('headers').eq('id', sheetId).single(),
      fetchAllRecords(sheetId),
    ]);
    if (se) throw se;

    const headers = sheet?.headers || [];
    sheetHeaders[sheetId] = headers;
    rowMeta[sheetId] = (recs || []).map(r => ({ id: r.id, version: r.version, position: r.position, data: r.data }));
    return ok({ headers, data: (recs || []).map(r => r.data) });
  } catch (e) { return { ...fail(e), headers: [], data: [] }; }
}

// ---------------------------------------------------------------------------
// CREATE
// ---------------------------------------------------------------------------
// หา position ว่างแล้ว insert — ชน unique(sheet_id,position) ได้ถ้า 2 คน add
// พร้อมกันเกือบเป๊ะ (อ่าน max เดิมได้ค่าเดียวกัน) retry อ่านใหม่แล้วลองอีกครั้ง
async function insertAtNextPosition(sheetId, teamId, headers, row, attemptsLeft = 3) {
  const { data: last } = await supabase
    .from('records').select('position').eq('sheet_id', sheetId)
    .order('position', { ascending: false }).limit(1).maybeSingle();
  const position = (last?.position ?? -1) + 1;

  const { data: inserted, error } = await supabase.from('records')
    .insert({ sheet_id: sheetId, team_id: teamId, position, data: row, ...deriveFields(headers, row) })
    .select('id,version,position,data').single();
  if (error) {
    if (error.code === '23505' && attemptsLeft > 0) {
      return insertAtNextPosition(sheetId, teamId, headers, row, attemptsLeft - 1);
    }
    throw error;
  }
  return inserted;
}

export async function addRow(sheetId, row) {
  try {
    const headers = sheetHeaders[sheetId] || (await ensureHeaders(sheetId));
    const teamId = await ensureTeamId(sheetId);
    const inserted = await insertAtNextPosition(sheetId, teamId, headers, row);

    if (!rowMeta[sheetId]) rowMeta[sheetId] = [];
    rowMeta[sheetId].push({ id: inserted.id, version: inserted.version, position: inserted.position, data: inserted.data });
    return ok();
  } catch (e) { return fail(e); }
}

// ---------------------------------------------------------------------------
// UPDATE (optimistic lock ด้วย version)
// ---------------------------------------------------------------------------
export async function updateRow(sheetId, rowIndex, row, _expectedRow) {
  try {
    const meta = rowMeta[sheetId]?.[rowIndex];
    if (!meta) return { success: false, conflict: true, error: CONFLICT_MSG };
    const headers = sheetHeaders[sheetId] || (await ensureHeaders(sheetId));

    const { data: updated, error } = await supabase.from('records')
      .update({ data: row, ...deriveFields(headers, row) })
      .eq('id', meta.id).eq('version', meta.version)
      .select('id,version,data').maybeSingle();
    if (error) throw error;
    if (!updated) return { success: false, conflict: true, error: CONFLICT_MSG };

    meta.version = updated.version;
    meta.data = updated.data;
    return ok();
  } catch (e) { return fail(e); }
}

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------
export async function deleteRow(sheetId, rowIndex, _expectedRow) {
  try {
    const meta = rowMeta[sheetId]?.[rowIndex];
    if (!meta) return { success: false, conflict: true, error: CONFLICT_MSG };

    const { data: deleted, error } = await supabase.from('records')
      .delete().eq('id', meta.id).eq('version', meta.version).select('id');
    if (error) throw error;
    if (!deleted || deleted.length === 0) return { success: false, conflict: true, error: CONFLICT_MSG };

    pendingUndo[sheetId] = meta.position;   // ตำแหน่งเดิมไว้กู้คืน
    rowMeta[sheetId].splice(rowIndex, 1);
    return ok();
  } catch (e) { return fail(e); }
}

// กู้คืนแถวที่ลบ กลับไปตำแหน่งเดิม (undo delete)
export async function insertRow(sheetId, rowIndex, row) {
  try {
    const headers = sheetHeaders[sheetId] || (await ensureHeaders(sheetId));
    const teamId = await ensureTeamId(sheetId);
    const position = pendingUndo[sheetId] ?? rowIndex;   // ตำแหน่งเดิมที่เว้นว่างไว้หลังลบ

    let inserted, error;
    ({ data: inserted, error } = await supabase.from('records')
      .insert({ sheet_id: sheetId, team_id: teamId, position, data: row, ...deriveFields(headers, row) })
      .select('id,version,position,data').single());
    if (error) {
      // ตำแหน่งเดิมถูกคนอื่น insert ไปแล้วก่อนกดกู้คืน (ชน unique(sheet_id,position))
      // — ต่อท้ายแทน ดีกว่าทำ undo ล้มเหลวไปเลย
      if (error.code === '23505') {
        inserted = await insertAtNextPosition(sheetId, teamId, headers, row);
      } else {
        throw error;
      }
    }

    if (!rowMeta[sheetId]) rowMeta[sheetId] = [];
    rowMeta[sheetId].splice(rowIndex, 0, { id: inserted.id, version: inserted.version, position: inserted.position, data: inserted.data });
    delete pendingUndo[sheetId];
    return ok();
  } catch (e) { return fail(e); }
}

// ---------------------------------------------------------------------------
// BULK
// ---------------------------------------------------------------------------
export async function bulkUpdateCell(sheetId, rowIndices, colIndex, value, _expectedRows) {
  try {
    const metas = rowIndices.map(i => rowMeta[sheetId]?.[i]);
    if (metas.some(m => !m)) return { success: false, conflict: true, error: CONFLICT_MSG };
    const headers = sheetHeaders[sheetId] || (await ensureHeaders(sheetId));

    // เช็คทุกแถวก่อน: ถ้ามี version ไม่ตรงในชีต ยกเลิกทั้งก้อน (กันเขียนบางส่วน)
    const ids = metas.map(m => m.id);
    const { data: cur, error: ce } = await supabase.from('records').select('id,version').in('id', ids);
    if (ce) throw ce;
    const curVer = Object.fromEntries((cur || []).map(r => [r.id, r.version]));
    if (metas.some(m => curVer[m.id] !== m.version)) return { success: false, conflict: true, error: CONFLICT_MSG };

    const val = value == null ? '' : String(value);
    for (const m of metas) {
      const newData = [...m.data];
      newData[colIndex] = val;
      const { data: up, error } = await supabase.from('records')
        .update({ data: newData, ...deriveFields(headers, newData) })
        .eq('id', m.id).eq('version', m.version)
        .select('id,version,data').maybeSingle();
      if (error) throw error;
      if (!up) return { success: false, conflict: true, error: CONFLICT_MSG };
      m.version = up.version; m.data = up.data;
    }
    return ok();
  } catch (e) { return fail(e); }
}

export async function bulkDeleteRows(sheetId, rowIndices, _expectedRows) {
  try {
    const metas = rowIndices.map(i => rowMeta[sheetId]?.[i]);
    if (metas.some(m => !m)) return { success: false, conflict: true, error: CONFLICT_MSG };

    const ids = metas.map(m => m.id);
    // เช็ค version ก่อนลบ เหมือน bulkUpdateCell — กันลบทับแถวที่เพิ่งถูกแก้โดยคนอื่น
    // (หรือ sheet-poll sync) แบบเงียบๆ โดยไม่มี conflict warning
    const { data: cur, error: ce } = await supabase.from('records').select('id,version').in('id', ids);
    if (ce) throw ce;
    const curVer = Object.fromEntries((cur || []).map(r => [r.id, r.version]));
    if (metas.some(m => curVer[m.id] !== m.version)) return { success: false, conflict: true, error: CONFLICT_MSG };

    const { error } = await supabase.from('records').delete().in('id', ids);
    if (error) throw error;

    // ลบจาก meta จากล่างขึ้นบน ไม่ให้ index เลื่อน
    [...rowIndices].sort((a, b) => b - a).forEach(i => rowMeta[sheetId].splice(i, 1));
    return ok();
  } catch (e) { return fail(e); }
}

// ---------------------------------------------------------------------------
// DEDUP (ข้ามทีมที่ผู้ใช้เป็นสมาชิก)
// ---------------------------------------------------------------------------
export async function checkDuplicate(link, _name, phone, contact) {
  try {
    const p_handle = extractHandle(link) || null;
    const digits = onlyDigits(phone);
    const p_phone = digits.length >= 6 ? digits : null;
    if (!p_handle && !p_phone) return ok({ matches: [] });

    const { data, error } = await supabase.rpc('check_duplicate', {
      p_handle, p_phone, p_contact: contact || null,
    });
    if (error) throw error;
    const matches = (data || []).map(m => ({
      sheet: m.sheet_id,       // ใช้เทียบกับ activeTab (sheet id)
      owner: m.sheet_label,
      label: m.sheet_label,
      source: m.team_name,
      contacted: m.contacted,
      status: m.status || '',
      date: m.row_date || '',
    }));
    return ok({ matches });
  } catch (e) { return { ...fail(e), matches: [] }; }
}

// ---------------------------------------------------------------------------
// SEARCH ทั้งทีม
// ---------------------------------------------------------------------------
export async function searchTeamData(teamSource, query) {
  try {
    const q = String(query == null ? '' : query).trim();
    if (q.length < 2) return ok({ groups: [], total: 0 });
    let teamId = teamIdByName[teamSource];
    if (!teamId) { await fetchSheetNames(); teamId = teamIdByName[teamSource]; }
    if (!teamId) return ok({ groups: [], total: 0 });

    const { data, error } = await supabase.rpc('search_team', { p_team_id: teamId, p_query: q });
    if (error) throw error;

    const bySheet = new Map();
    (data || []).forEach(r => {
      if (!bySheet.has(r.sheet_id)) bySheet.set(r.sheet_id, { sheet: r.sheet_id, label: r.sheet_label, headers: r.headers, matches: [] });
      bySheet.get(r.sheet_id).matches.push({ row: r.data, originalIndex: r.position });
    });
    const groups = Array.from(bySheet.values());
    const total = (data || []).length;
    return ok({ groups, total, capped: total >= 200 });
  } catch (e) { return { ...fail(e), groups: [], total: 0 }; }
}

// ---------------------------------------------------------------------------
// DASHBOARD — RPC flat rows → reshape เป็น { overall, byTeam, bySheet }
// ---------------------------------------------------------------------------
// get_dashboard_rows() คืนหนึ่งแถวต่อกลุ่ม (sheet x วัน x สถานะ x แพลตฟอร์ม x ...)
// จำนวนกลุ่มมากกว่าจำนวนครีเอเตอร์จริงได้ง่าย (เกิน PostgREST cap 1000 ตั้งแต่ ~1500
// แถวขึ้นไป) ต้องแบ่งหน้าเหมือน fetchAllRecords ไม่งั้นยอดรวมบนแดชบอร์ดจะขาดหายเงียบๆ
async function fetchAllDashboardRows() {
  const out = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase.rpc('get_dashboard_rows').range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return out;
}

export async function fetchDashboardData() {
  try {
    const data = await fetchAllDashboardRows();
    return ok({ data: reshapeDashboard(data || []) });
  } catch (e) { return fail(e); }
}

// ไม่มี server cache แล้ว — refresh = refetch config
export async function clearSystemCache() { return ok(); }

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
const CONFLICT_MSG = 'ข้อมูลแถวนี้ในชีตถูกแก้ไปแล้ว ระบบโหลดข้อมูลล่าสุดให้แล้ว โปรดลองใหม่';

async function ensureHeaders(sheetId) {
  const { data } = await supabase.from('sheets').select('headers').eq('id', sheetId).single();
  const h = data?.headers || [];
  sheetHeaders[sheetId] = h;
  return h;
}
async function ensureTeamId(sheetId) {
  const { data } = await supabase.from('sheets').select('team_id').eq('id', sheetId).single();
  return data?.team_id;
}

const emptyBucket = () => ({ total: 0, byStatus: {}, byPlatform: {}, byCommission: {}, byShipped: {}, byClip: {} });
const emptyStats = () => ({ all: emptyBucket(), today: emptyBucket(), week: emptyBucket(), month: emptyBucket(), history: {}, daily: {} });

function bumpBucket(b, row) {
  b.total += row.cnt;
  b.byStatus[row.status] = (b.byStatus[row.status] || 0) + row.cnt;
  b.byPlatform[row.platform] = (b.byPlatform[row.platform] || 0) + row.cnt;
  b.byCommission[row.commission] = (b.byCommission[row.commission] || 0) + row.cnt;
  b.byShipped[row.shipped] = (b.byShipped[row.shipped] || 0) + row.cnt;
  b.byClip[row.clip] = (b.byClip[row.clip] || 0) + row.cnt;
}

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}
function isoDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function reshapeDashboard(rows) {
  const now = new Date();
  const todayStr = isoDate(now);
  const sow = startOfWeek(now); sow.setHours(0, 0, 0, 0);
  const som = new Date(now.getFullYear(), now.getMonth(), 1);

  const result = { overall: emptyStats(), byTeam: {}, bySheet: {} };

  const addTo = (stats, row) => {
    bumpBucket(stats.all, row);
    if (!row.row_date) return;
    const d = new Date(row.row_date); d.setHours(12, 0, 0, 0);
    const iso = isoDate(d);
    if (iso === todayStr) bumpBucket(stats.today, row);
    if (d >= som) bumpBucket(stats.month, row);
    if (d >= sow) bumpBucket(stats.week, row);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!stats.history[monthKey]) stats.history[monthKey] = emptyBucket();
    bumpBucket(stats.history[monthKey], row);
    if (!stats.daily[iso]) stats.daily[iso] = emptyBucket();
    bumpBucket(stats.daily[iso], row);
  };

  rows.forEach(row => {
    if (!result.bySheet[row.sheet_name]) result.bySheet[row.sheet_name] = emptyStats();
    if (!result.byTeam[row.team_name]) result.byTeam[row.team_name] = emptyStats();
    addTo(result.bySheet[row.sheet_name], row);
    addTo(result.byTeam[row.team_name], row);
    addTo(result.overall, row);
  });

  return result;
}
