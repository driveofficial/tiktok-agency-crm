// ============================================================================
// sheet-push — เขียนข้อมูลจาก Supabase กลับไป Google Sheet (full-rewrite ต่อแท็บ)
// เรียกจาก Postgres trigger (records insert/update/delete) ผ่าน pg_net
// (ดู backend/supabase/migrations/0011_sheet_push_trigger.sql)
//
// ก่อนใช้:
//   1) แชร์ทุกแท็บของ spreadsheet ให้ service account เป็น Editor
//   2) ตั้ง secret: GOOGLE_SERVICE_ACCOUNT_JSON, SHEET_PUSH_SECRET
//   3) เติม sheets.spreadsheet_id + sheets.tab_name ให้ตรงกับไฟล์จริง
//
// POST /functions/v1/sheet-push
//   header: x-webhook-secret: <SHEET_PUSH_SECRET>
//   body:   { "sheet_id": "<uuid>" }
//   resp:   { ok, skipped?, sheet, rows }
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import { importPKCS8, SignJWT } from "npm:jose@5";

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

interface ServiceAccount { client_email: string; private_key: string; }

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const key = await importPKCS8(sa.private_key, "RS256");
  const now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({ scope: "https://www.googleapis.com/auth/spreadsheets" })
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
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  if (!res.ok) throw new Error("google token error: " + await res.text());
  const body = await res.json();
  return body.access_token as string;
}

async function updateRange(token: string, spreadsheetId: string, range: string, values: unknown[][]) {
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ values }),
  });
  if (!res.ok) throw new Error("sheets update error: " + await res.text());
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

  const secret = Deno.env.get("SHEET_PUSH_SECRET");
  if (!secret) return json({ ok: false, error: "server missing SHEET_PUSH_SECRET" }, 500);
  const got = req.headers.get("x-webhook-secret") ?? "";
  if (!safeEqual(got, secret)) return json({ ok: false, error: "unauthorized" }, 401);

  let payload: { sheet_id?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, error: "invalid json" }, 400);
  }
  if (!payload.sheet_id) return json({ ok: false, error: "missing sheet_id" }, 400);

  const saJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (!saJson) return json({ ok: false, error: "server missing GOOGLE_SERVICE_ACCOUNT_JSON" }, 500);
  let sa: ServiceAccount;
  try {
    sa = JSON.parse(saJson);
  } catch {
    return json({ ok: false, error: "GOOGLE_SERVICE_ACCOUNT_JSON invalid json" }, 500);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const { data: sheet, error: se } = await supabase
      .from("sheets").select("id,headers,spreadsheet_id,tab_name").eq("id", payload.sheet_id).single();
    if (se) throw se;
    if (!sheet.spreadsheet_id || !sheet.tab_name) {
      return json({ ok: true, skipped: true, reason: "sheet not linked to a spreadsheet" });
    }

    // PostgREST caps a single .select() at its default max-rows (1000), so any
    // sheet with more records than that would silently get truncated here and
    // the truncated set would then overwrite the full sheet below. Page through
    // .range() until we've fetched the known total row count.
    //
    // - .order("position").order("id") gives a deterministic tiebreaker: "position"
    //   has no UNIQUE constraint, so without a secondary sort key, ties could be
    //   ordered inconsistently across separate paginated queries and skip/duplicate
    //   a row at a page boundary.
    // - We fetch the total count up front and advance `from` by the ACTUAL number
    //   of rows returned each page (not the requested pageSize), stopping once the
    //   running total reaches the known count (or a page comes back empty, as a
    //   safety net). This avoids relying on "page shorter than requested" as the
    //   end-of-data signal, which would silently under-fetch if PostgREST's
    //   server-side max-rows were ever configured below pageSize.
    const { count: totalCount, error: ce } = await supabase
      .from("records").select("*", { count: "exact", head: true }).eq("sheet_id", payload.sheet_id);
    if (ce) throw ce;
    const total = totalCount ?? 0;

    const records: { data: unknown }[] = [];
    const pageSize = 1000;
    for (let from = 0; records.length < total; ) {
      const { data: page, error: re } = await supabase
        .from("records").select("data").eq("sheet_id", payload.sheet_id)
        .order("position").order("id")
        .range(from, from + pageSize - 1);
      if (re) throw re;
      if (!page || page.length === 0) break;
      records.push(...page);
      from += page.length;
    }

    const headers = (sheet.headers ?? []) as unknown[];
    const rows = records.map((r) => r.data as unknown[]);
    const tab = sheet.tab_name as string;

    // Single atomic write instead of clear-then-write: two separate HTTP calls
    // (a `:clear` POST followed by a `values.update` PUT) are not guaranteed to
    // be serialized/consistent on Google's backend — confirmed live, a delete
    // that shrank the sheet left a stale trailing row after clear+write
    // reported success, and only a second independent call fixed it. Padding
    // the written values with blank rows out to a fixed high-water mark lets
    // one PUT overwrite any prior larger dataset in the same request, so
    // there's no second call for Google's backend to race against.
    const values: unknown[][] = [headers, ...rows];
    const MIN_TOTAL_ROWS = 3000; // comfortably above this project's largest sheet (~2101 rows)
    const blankRow = new Array(headers.length || 1).fill("");
    while (values.length < MIN_TOTAL_ROWS) values.push(blankRow);

    const token = await getAccessToken(sa);
    await updateRange(token, sheet.spreadsheet_id as string, `${tab}!A1`, values);

    return json({ ok: true, sheet: payload.sheet_id, rows: rows.length });
  } catch (e) {
    return json({ ok: false, error: String((e as Error).message ?? e) }, 500);
  }
});
