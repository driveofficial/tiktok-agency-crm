// ============================================================================
// _shared/deriveFields.ts — ใช้ร่วมกันโดย sheet-sync + sheet-poll (เดิมก็อปวาง
// ซ้ำกันเป๊ะๆ ทั้ง 2 ที่ — แก้จุดเดียวไม่ครบมาแล้ว เสี่ยง sync พังแบบเงียบๆ)
//
// frontend/src/lib/columns.js มี deriveFields/extractHandle/toISODate ชุดเดียวกัน
// อีกชุด แต่ import ข้าม frontend/backend ไม่ได้ (Vercel build root = frontend/
// เท่านั้น, เห็นแค่ไฟล์ใน frontend/) ถ้าแก้ logic ตรงนี้ ต้องไปแก้
// frontend/src/lib/columns.js ให้ตรงกันด้วยมือ (ดูคอมเมนต์ในไฟล์นั้น)
// ============================================================================

export function extractHandle(val: unknown): string | null {
  const s = String(val ?? "").trim();
  if (!s || s === "-") return null;
  const m = s.match(/tiktok\.com\/@([\w.\-]+)/i);
  if (m) return "@" + m[1].toLowerCase();
  if (/^https?:\/\//i.test(s)) return null;
  if (/^@[\w.\-]+$/.test(s)) return s.toLowerCase();
  if (/^[\w.\-]+$/.test(s)) return "@" + s.toLowerCase();
  return null;
}

export const onlyDigits = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const normYear = (y: number) => (y >= 2400 ? y - 543 : y);

export function toISODate(raw: unknown): string | null {
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

export function deriveFields(headers: unknown[], data: unknown[]) {
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
