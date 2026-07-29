// ============================================================================
// sheet-sync — Edge Function webhook รับ snapshot ชีตจาก Google Apps Script
// แล้ว full-replace records ต่อชีต (idempotent). ใช้ SERVICE_ROLE ข้าม RLS
// เพราะ webhook ไม่มี user session — auth ด้วย shared secret header แทน
//
// POST /functions/v1/sheet-sync
//   header: x-webhook-secret: <SHEET_SYNC_SECRET>
//   body:   { "sheets": [ { team, label, headers:[...], rows:[[...],...] } ] }
//           (รับ array เปล่าๆ ก็ได้)
//   resp:   { ok, teams, sheets, records }
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

// --- derive helpers (mirror frontend lib/columns.js deriveFields) ---
function extractHandle(val: unknown): string | null {
  const s = String(val ?? "").trim();
  if (!s || s === "-") return null;
  const m = s.match(/tiktok\.com\/@([\w.\-]+)/i);
  if (m) return "@" + m[1].toLowerCase();
  if (/^https?:\/\//i.test(s)) return null;
  if (/^@[\w.\-]+$/.test(s)) return s.toLowerCase();
  if (/^[\w.\-]+$/.test(s)) return "@" + s.toLowerCase();
  return null;
}
const onlyDigits = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const normYear = (y: number) => (y >= 2400 ? y - 543 : y);
function toISODate(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  let y: number | undefined, mo: number | undefined, d: number | undefined;
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
  // กันวันที่พิมพ์ผิด (ปีเพี้ยน เช่น "20226-04-28") ที่ทำ Postgres date พัง
  if (y < 2000 || y > 2100 || mo! < 1 || mo! > 12 || d! < 1 || d! > 31) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function deriveFields(headers: unknown[], data: unknown[]) {
  const find = (pred: (h: string) => boolean) =>
    headers.findIndex((h) => h != null && pred(String(h)));
  const val = (i: number) => (i > -1 ? String(data[i] ?? "").trim() : "");
  const linkIdx = find((h) =>
    h.includes("ลิงค์") || h.includes("ลิงก์") || h.toLowerCase().includes("tiktok")
  );
  let dateIdx = headers.findIndex((h) => String(h).trim() === "วันที่");
  if (dateIdx === -1) dateIdx = find((h) => String(h).trim().startsWith("วันที่"));
  const phone = onlyDigits(val(find((h) => h.includes("เบอร์") || h.includes("โทร"))));
  return {
    handle: extractHandle(val(linkIdx)),
    phone: phone.length >= 6 ? phone : null,
    status: val(find((h) => h.includes("สถานะ"))) || null,
    platform: val(find((h) => h.includes("ติดต่อกันช่องทางไหน"))) || null,
    commission: val(find((h) => h.includes("Commission"))) || null,
    shipped: val(find((h) => h.includes("ส่งของ"))) || null,
    clip: val(find((h) => h.includes("ลงคลิป"))) || null,
    row_date: toISODate(val(dateIdx)),
  };
}

// constant-time compare กัน timing attack บน secret
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

interface SheetPayload {
  team: string;
  label: string;
  headers: unknown[];
  rows: unknown[][];
}

// incremental: onEdit เดียว → แถวเดียว (แทน full snapshot ทั้งชีต ไวกว่าเยอะ)
interface CellPayload {
  mode: "cell";
  team: string;
  label: string;
  headers: unknown[];
  position: number;
  row: unknown[];
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

  const secret = Deno.env.get("SHEET_SYNC_SECRET");
  if (!secret) return json({ ok: false, error: "server missing SHEET_SYNC_SECRET" }, 500);
  const got = req.headers.get("x-webhook-secret") ?? "";
  if (!safeEqual(got, secret)) return json({ ok: false, error: "unauthorized" }, 401);

  let payload: { sheets?: SheetPayload[] } | SheetPayload[] | CellPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, error: "invalid json" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // incremental single-row upsert (จาก onEdit trigger) — ข้ามการ full-replace ด้านล่างไปเลย
  if (!Array.isArray(payload) && (payload as CellPayload)?.mode === "cell") {
    const p = payload as CellPayload;
    if (!p.team || !p.label || typeof p.position !== "number" || !Array.isArray(p.row)) {
      return json({ ok: false, error: "invalid cell payload" }, 400);
    }
    try {
      const { data: teamRow, error: te } = await supabase
        .from("teams").upsert({ name: p.team }, { onConflict: "name" }).select("id").single();
      if (te) throw te;
      const teamId = teamRow.id as string;

      const { data: sheetRow, error: se } = await supabase
        .from("sheets")
        .upsert({ team_id: teamId, label: p.label, headers: p.headers ?? [] }, { onConflict: "team_id,label" })
        .select("id").single();
      if (se) throw se;
      const sheetId = sheetRow.id as string;

      const derived = deriveFields(p.headers ?? [], p.row);
      const { data: existing, error: fe } = await supabase
        .from("records").select("id").eq("sheet_id", sheetId).eq("position", p.position).maybeSingle();
      if (fe) throw fe;

      if (existing) {
        const { error: ue } = await supabase.from("records")
          .update({ data: p.row, ...derived }).eq("id", existing.id);
        if (ue) throw ue;
      } else {
        const { error: ie } = await supabase.from("records")
          .insert({ sheet_id: sheetId, team_id: teamId, position: p.position, data: p.row, ...derived });
        if (ie) throw ie;
      }
      return json({ ok: true, mode: "cell", sheet: sheetId, position: p.position });
    } catch (e) {
      return json({ ok: false, error: String((e as Error).message ?? e) }, 500);
    }
  }

  const sheets: SheetPayload[] = Array.isArray(payload) ? payload : (payload.sheets ?? []);
  if (!Array.isArray(sheets) || sheets.length === 0) {
    return json({ ok: false, error: "no sheets in payload" }, 400);
  }

  const teamIds = new Map<string, string>();
  let sheetCount = 0;
  let recordCount = 0;

  try {
    for (const sh of sheets) {
      if (!sh?.team || !sh?.label) continue;

      // 1) team (unique name)
      let tid = teamIds.get(sh.team);
      if (!tid) {
        const { data, error } = await supabase
          .from("teams")
          .upsert({ name: sh.team }, { onConflict: "name" })
          .select("id")
          .single();
        if (error) throw error;
        tid = data.id as string;
        teamIds.set(sh.team, tid);
      }

      // 2) sheet (unique team_id,label) — upsert headers
      const { data: sheetRow, error: se } = await supabase
        .from("sheets")
        .upsert(
          { team_id: tid, label: sh.label, headers: sh.headers ?? [] },
          { onConflict: "team_id,label" },
        )
        .select("id")
        .single();
      if (se) throw se;
      const sheetId = sheetRow.id as string;
      sheetCount++;

      // 3) full-replace records ของชีตนี้ (snapshot semantics)
      const { error: de } = await supabase.from("records").delete().eq("sheet_id", sheetId);
      if (de) throw de;

      const recs = (sh.rows ?? []).map((row, idx) => ({
        sheet_id: sheetId,
        team_id: tid,
        position: idx,
        data: row,
        ...deriveFields(sh.headers ?? [], row),
      }));

      for (let i = 0; i < recs.length; i += 500) {
        const { error: re } = await supabase.from("records").insert(recs.slice(i, i + 500));
        if (re) throw re;
      }
      recordCount += recs.length;
    }
  } catch (e) {
    return json({ ok: false, error: String((e as Error).message ?? e) }, 500);
  }

  return json({ ok: true, teams: teamIds.size, sheets: sheetCount, records: recordCount });
});
