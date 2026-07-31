// ============================================================================
// sheet-poll — ดึงข้อมูลจาก Google Sheets ตรงๆ ผ่าน Sheets API (ไม่พึ่ง GAS เลย)
// เรียกเป็นช่วงๆ (pg_cron) แทนที่ onEdit trigger — polling จึงมีดีเลย์ตามรอบที่ตั้ง
// ไม่ใช่ push แบบ realtime-sync.gs แต่ไม่ต้องพึ่งสคริปต์ในฝั่ง Google Sheets เลย
//
// ก่อนใช้:
//   1) สร้าง Google Cloud service account, เปิด Sheets API, ดาวน์โหลด JSON key
//   2) แชร์ไฟล์ Google Sheet แต่ละไฟล์ให้ service account email (แค่ Viewer พอ)
//   3) ตั้ง secret: supabase secrets set GOOGLE_SERVICE_ACCOUNT_JSON='<เนื้อไฟล์ JSON ทั้งไฟล์>'
//   4) เติม sheets.spreadsheet_id + sheets.tab_name ให้ตรงกับไฟล์จริงของแต่ละ sheet
//   5) ตั้ง pg_cron ให้ยิง endpoint นี้เป็นช่วงๆ (ดู backend/README.md)
//
// POST /functions/v1/sheet-poll
//   header: x-webhook-secret: <SHEET_SYNC_SECRET>  (secret เดียวกับ sheet-sync)
//   resp:   { ok, sheets, updated, inserted, deleted }
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import { importPKCS8, SignJWT } from "npm:jose@5";
import { deriveFields } from "../_shared/deriveFields.ts";

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

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const key = await importPKCS8(sa.private_key, "RS256");
  const now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({ scope: "https://www.googleapis.com/auth/spreadsheets.readonly" })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error("google token error: " + await res.text());
  const body = await res.json();
  return body.access_token as string;
}

async function fetchSheetValues(
  accessToken: string,
  spreadsheetId: string,
  tabName: string,
): Promise<string[][]> {
  const range = encodeURIComponent(tabName);
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueRenderOption=FORMATTED_VALUE`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    throw new Error(`sheets api error (${spreadsheetId}/${tabName}): ${await res.text()}`);
  }
  const body = await res.json();
  return (body.values ?? []) as string[][];
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

  const secret = Deno.env.get("SHEET_SYNC_SECRET");
  if (!secret) return json({ ok: false, error: "server missing SHEET_SYNC_SECRET" }, 500);
  const got = req.headers.get("x-webhook-secret") ?? "";
  if (!safeEqual(got, secret)) return json({ ok: false, error: "unauthorized" }, 401);

  const saJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (!saJson) return json({ ok: false, error: "server missing GOOGLE_SERVICE_ACCOUNT_JSON" }, 500);
  let sa: ServiceAccount;
  try {
    sa = JSON.parse(saJson);
  } catch {
    return json({ ok: false, error: "GOOGLE_SERVICE_ACCOUNT_JSON is not valid json" }, 500);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  let updated = 0, inserted = 0, deleted = 0, sheetsSynced = 0;

  try {
    const token = await getAccessToken(sa);

    const { data: sheetsToSync, error: se } = await supabase
      .from("sheets")
      .select("id,team_id,label,headers,spreadsheet_id,tab_name")
      .not("spreadsheet_id", "is", null)
      .not("tab_name", "is", null);
    if (se) throw se;

    for (const sh of sheetsToSync ?? []) {
      const values = await fetchSheetValues(token, sh.spreadsheet_id as string, sh.tab_name as string);
      const headers = values[0] ?? [];
      const rows = values.slice(1);
      sheetsSynced++;

      // เขียนทั้งหมด (header + insert/update/delete) ผ่าน RPC เดียวใน 1 transaction
      // แทนการยิง insert/update/delete ทีละแถวผ่าน PostgREST — ทีละแถวคือคนละ
      // statement ทำให้ trigger notify_sheet_push ยิง sheet-push แยกทุกแถว ชน
      // Google Sheets write quota (429) มาแล้ว (2026-07-31) RPC ตั้ง session flag
      // ข้าม trigger ตลอด transaction เดียวกันนี้ทั้งก้อน — ดู 0012_sheet_poll_skip_push.sql
      const rowsPayload = rows.map((row, i) => ({ position: i, data: row, ...deriveFields(headers, row) }));
      const { data: syncResult, error: syncErr } = await supabase.rpc("sync_sheet_records", {
        p_sheet_id: sh.id,
        p_team_id: sh.team_id,
        p_headers: headers,
        p_rows: rowsPayload,
      });
      if (syncErr) throw syncErr;
      updated += syncResult?.updated ?? 0;
      inserted += syncResult?.inserted ?? 0;
      deleted += syncResult?.deleted ?? 0;
    }
  } catch (e) {
    return json({ ok: false, error: String((e as Error).message ?? e) }, 500);
  }

  return json({ ok: true, sheets: sheetsSynced, updated, inserted, deleted });
});
