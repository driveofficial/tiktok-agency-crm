// ============================================================================
// import-to-supabase.mjs — นำ crm-export.json (จาก export-sheets.gs) เข้า Supabase
//
// ใช้ service_role key (ข้าม RLS ตอน migrate). อย่า commit key นี้.
//
// วิธีใช้:
//   cd backend/scripts
//   npm install
//   SUPABASE_URL=https://xxx.supabase.co \
//   SUPABASE_SERVICE_ROLE=eyJ... \
//   node import-to-supabase.mjs ../../crm-export.json
// ============================================================================

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE;
const FILE = process.argv[2] || 'crm-export.json';

if (!URL || !KEY) {
  console.error('ต้องตั้ง SUPABASE_URL และ SUPABASE_SERVICE_ROLE');
  process.exit(1);
}

const supabase = createClient(URL, KEY, { auth: { persistSession: false } });

// --- derive helpers (mirror lib/columns.js deriveFields ฝั่ง frontend) ---
function extractHandle(val) {
  const s = String(val == null ? '' : val).trim();
  if (!s || s === '-') return null;
  const m = s.match(/tiktok\.com\/@([\w.\-]+)/i);
  if (m) return '@' + m[1].toLowerCase();
  if (/^https?:\/\//i.test(s)) return null;
  if (/^@[\w.\-]+$/.test(s)) return s.toLowerCase();
  if (/^[\w.\-]+$/.test(s)) return '@' + s.toLowerCase();
  return null;
}
const onlyDigits = (v) => String(v == null ? '' : v).replace(/\D/g, '');
const normYear = (y) => (y >= 2400 ? y - 543 : y);
function toISODate(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  let y, mo, d;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) { y = normYear(+m[1]); mo = +m[2]; d = +m[3]; }
  else {
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) { d = +m[1]; mo = +m[2]; y = normYear(+m[3]); }
  }
  if (y === undefined) {
    const dt = new Date(s);
    if (isNaN(dt.getTime())) return null;
    y = dt.getFullYear(); mo = dt.getMonth() + 1; d = dt.getDate();
  }
  if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
function deriveFields(headers, data) {
  const find = (pred) => headers.findIndex(h => h && pred(String(h)));
  const val  = (i) => (i > -1 ? String(data[i] ?? '').trim() : '');
  const linkIdx = find(h => h.includes('ลิงค์') || h.includes('ลิงก์') || h.toLowerCase().includes('tiktok'));
  let dateIdx = headers.findIndex(h => String(h).trim() === 'วันที่');
  if (dateIdx === -1) dateIdx = find(h => String(h).trim().startsWith('วันที่'));
  const phone = onlyDigits(val(find(h => h.includes('เบอร์') || h.includes('โทร'))));
  return {
    handle:     extractHandle(val(linkIdx)),
    phone:      phone.length >= 6 ? phone : null,
    status:     val(find(h => h.includes('สถานะ'))) || null,
    platform:   val(find(h => h.includes('ติดต่อกันช่องทางไหน'))) || null,
    commission: val(find(h => h.includes('Commission'))) || null,
    shipped:    val(find(h => h.includes('ส่งของ'))) || null,
    clip:       val(find(h => h.includes('ลงคลิป'))) || null,
    row_date:   toISODate(val(dateIdx)),
  };
}

// --- import ---
const dump = JSON.parse(readFileSync(FILE, 'utf8'));
console.log(`อ่าน ${dump.length} ชีตจาก ${FILE}`);

// 1) teams (unique จาก source)
const teamNames = [...new Set(dump.map(d => d.team))];
const teamId = {};
for (let i = 0; i < teamNames.length; i++) {
  const name = teamNames[i];
  const { data, error } = await supabase.from('teams')
    .upsert({ name, position: i }, { onConflict: 'name' }).select('id').single();
  if (error) throw error;
  teamId[name] = data.id;
}
console.log(`teams: ${teamNames.length}`);

// 2) sheets + records
let totalRows = 0;
for (let s = 0; s < dump.length; s++) {
  const sh = dump[s];
  const tid = teamId[sh.team];
  const { data: sheetRow, error: se } = await supabase.from('sheets')
    .insert({ team_id: tid, label: sh.label, headers: sh.headers, position: s })
    .select('id').single();
  if (se) throw se;
  const sheetId = sheetRow.id;

  const recs = (sh.rows || []).map((row, idx) => ({
    sheet_id: sheetId,
    team_id:  tid,
    position: idx,
    data:     row,
    ...deriveFields(sh.headers, row),
  }));

  // แบ่ง batch กัน payload ใหญ่เกิน
  for (let i = 0; i < recs.length; i += 500) {
    const { error: re } = await supabase.from('records').insert(recs.slice(i, i + 500));
    if (re) throw re;
  }
  totalRows += recs.length;
  console.log(`  ${sh.team} / ${sh.label}: ${recs.length} แถว`);
}
console.log(`เสร็จ. records ทั้งหมด: ${totalRows}`);
