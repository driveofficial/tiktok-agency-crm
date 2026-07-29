// ============================================================================
// columns.js — config คอลัมน์ + fuzzy match หัวไทย + สี + pipeline
// ยกจาก utils.html เดิม (เป็น ES module) + เพิ่ม deriveFields สำหรับ derived columns
// ============================================================================

export const COLUMN_CONFIG = {
    "เฉลี่ยวิวคร่าวๆ": { type: "select", options: ["-","หลักร้อย", "หลักพัน", "หลักหมื่น", "หลักแสน", "หลักล้าน"] },
    "สไตล์ช่อง": { type: "select", options: ["-","ไลฟ์สไตล์", "รีวิวสินค้า", "เทคนิคออกกำลังกาย", "ความรู้", "บันเทิง"] },
    "ติดต่อกันช่องทางไหน": { type: "select", options: ["-","Line", "Facebook", "Email", "โทรศัพท์", "Tiktok", "Instagram"] },
    "ทัก/ยังไม่ทัก": { type: "select", options: ["-","ยังไม่ทัก", "ทักแล้ว"] },
    "สถานะ": { type: "select", options: ["-", "รับข้อเสนอแต่ยังไม่กดขอสินค้า", "รับข้อเสนอ", "กำลังตัดสินใจ", "ไม่รับข้อเสนอ", "ไม่รับ / มีเรทการ์ด", "อ่าน แต่ไม่ตอบ", "ไม่อ่าน", "สนใจ", "ดีลจบ"] },
    "Commission": { type: "select", options: ["-","10%", "15%", "20%"] },
    "คอมเมนท์ให้ตอบแชท": { type: "select", options: ["-", "คอมเมนท์แล้ว", "ยังไม่เมนท์"] },
    "ตามแชทเอาคำตอบ": { type: "select", options: ["-", "ตามแล้ว", "ยังไม่ตาม"] },
    "ส่งของถึงยัง": { type: "select", options: ["-", "ยังไม่ส่ง", "ส่งแล้ว"] },
    "ลงคลิปยัง": { type: "select", options: ["-", "ยังไม่ลง", "ลงแล้ว"] },
    "ได้รับของวันไหน": { type: "date" },
    "วันที่": { type: "date" },
    "ลำดับ": { type: "text", readOnly: true },
    "จำนวน": { type: "text" }
};

export const HIDDEN_COLUMNS = [
    "Campaign", "Member", "Rate Card", "สไตล์ช่อง 20%", "เค้าชอบอะไรเป็นพิเศษ",
    "มีอาชีพอื่นไหม", "วันเกิดวันที่", "มีลูกกี่คน", "ลูกชื่ออะไร", "ที่อยุ่", "ที่อยู่"
];

export const INFO_DETAIL_COLUMNS = ["Rate Card"];

export function getColumnConfig(headerName) {
    if (!headerName) return null;
    const cleanHeader = headerName.trim();
    const config = COLUMN_CONFIG;
    if (config[cleanHeader]) return { key: cleanHeader, config: config[cleanHeader] };
    if (cleanHeader.includes("สถานะ")) return { key: "สถานะ", config: config["สถานะ"] };
    if (cleanHeader.includes("ทัก")) return { key: "ทัก/ยังไม่ทัก", config: config["ทัก/ยังไม่ทัก"] };
    if (cleanHeader.includes("คอมเมนท์")) return { key: "คอมเมนท์ให้ตอบแชท", config: config["คอมเมนท์ให้ตอบแชท"] };
    if (cleanHeader.includes("ตามแชท") || cleanHeader.includes("ตามงาน")) return { key: "ตามแชทเอาคำตอบ", config: config["ตามแชทเอาคำตอบ"] };
    if (cleanHeader.includes("วิว")) return { key: "เฉลี่ยวิวคร่าวๆ", config: config["เฉลี่ยวิวคร่าวๆ"] };
    if (cleanHeader.includes("สไตล์")) return { key: "สไตล์ช่อง", config: config["สไตล์ช่อง"] };
    if (cleanHeader.includes("ติดต่อกัน")) return { key: "ติดต่อกันช่องทางไหน", config: config["ติดต่อกันช่องทางไหน"] };
    if (cleanHeader.includes("Commission")) return { key: "Commission", config: config["Commission"] };
    if (cleanHeader.includes("ได้รับของ")) return { key: "ได้รับของวันไหน", config: config["ได้รับของวันไหน"] };
    if (cleanHeader.includes("ส่งของ")) return { key: "ส่งของถึงยัง", config: config["ส่งของถึงยัง"] };
    if (cleanHeader.includes("ลงคลิป")) return { key: "ลงคลิปยัง", config: config["ลงคลิปยัง"] };
    return null;
}

// วันที่วันนี้ local timezone (YYYY-MM-DD) — เลี่ยง toISOString() ที่เป็น UTC
export function todayISO() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// ดึง "@ชื่อช่อง" จากลิงก์ TikTok (เก็บตัวพิมพ์เดิมไว้แสดง)
export function extractTiktokUsername(val) {
    const s = String(val == null ? '' : val).trim();
    if (!s || s === '-') return '';
    const m = s.match(/tiktok\.com\/@([\w.\-]+)/i);
    if (m) return '@' + m[1];
    if (/^https?:\/\//i.test(s)) return '';
    if (/^@[\w.\-]+$/.test(s)) return s;
    if (/^[\w.\-]+$/.test(s)) return '@' + s;
    return s;
}

// @handle normalize (lowercase) — ใช้จับซ้ำ, mirror server extractHandle
export function extractHandle(val) {
    const s = String(val == null ? '' : val).trim();
    if (!s || s === '-') return '';
    const m = s.match(/tiktok\.com\/@([\w.\-]+)/i);
    if (m) return '@' + m[1].toLowerCase();
    if (/^https?:\/\//i.test(s)) return '';
    if (/^@[\w.\-]+$/.test(s)) return s.toLowerCase();
    if (/^[\w.\-]+$/.test(s)) return '@' + s.toLowerCase();
    return '';
}

export const onlyDigits = (v) => String(v == null ? '' : v).replace(/\D/g, '');

const normYear = (y) => (y >= 2400 ? y - 543 : y);

// แปลงค่าวันที่ในชีต → 'YYYY-MM-DD' (รองรับ พ.ศ. / D-M-Y) หรือ null
// validate ปี 2000-2100 กันวันที่พิมพ์ผิด (เช่น "20226-04-28") ทำ Postgres date พัง
export function toISODate(raw) {
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

// คำนวณ derived columns จาก headers+data (ใช้ตอน insert/update เข้า Supabase)
export function deriveFields(headers, data) {
    const find = (pred) => headers.findIndex(h => h && pred(String(h)));
    const val  = (i) => (i > -1 ? String(data[i] ?? '').trim() : '');
    const linkIdx = find(h => h.includes('ลิงค์') || h.includes('ลิงก์') || h.toLowerCase().includes('tiktok'));
    let dateIdx = headers.findIndex(h => String(h).trim() === 'วันที่');
    if (dateIdx === -1) dateIdx = find(h => String(h).trim().startsWith('วันที่'));
    const phone = onlyDigits(val(find(h => h.includes('เบอร์') || h.includes('โทร'))));
    return {
        handle:     extractHandle(val(linkIdx)) || null,
        phone:      phone.length >= 6 ? phone : null,
        status:     val(find(h => h.includes('สถานะ'))) || null,
        platform:   val(find(h => h.includes('ติดต่อกันช่องทางไหน'))) || null,
        commission: val(find(h => h.includes('Commission'))) || null,
        shipped:    val(find(h => h.includes('ส่งของ'))) || null,
        clip:       val(find(h => h.includes('ลงคลิป'))) || null,
        row_date:   toISODate(val(dateIdx)),
    };
}

// ชื่อที่ใช้แสดง: ชื่อเล่น → @ช่อง TikTok → ช่องทางติดต่อ → "ไม่ระบุชื่อ"
export function getDisplayName(headers, row) {
    if (!headers || !row) return 'ไม่ระบุชื่อ';
    const findVal = (pred) => {
        const i = headers.findIndex(h => h && pred(String(h).toLowerCase()));
        return i === -1 ? '' : String(row[i] == null ? '' : row[i]).trim();
    };
    const isLinkCol = (h) => h.indexOf('tiktok') > -1 || h.indexOf('ลิงค์') > -1 || h.indexOf('ลิงก์') > -1;
    const nick = findVal(h => h.indexOf('ชื่อเล่น') > -1 && !isLinkCol(h));
    if (nick && nick !== '-') return nick;
    const uname = extractTiktokUsername(findVal(isLinkCol));
    if (uname) return uname;
    const contact = findVal(h => h.indexOf('ช่องทางติดต่อ') > -1);
    if (contact && contact !== '-') return contact;
    return 'ไม่ระบุชื่อ';
}

export function getChecklistItems(headers, row) {
    if (!headers || !row) return [];
    const find = (pred) => headers.findIndex(h => h && pred(String(h)));
    const items = [];
    const pushIf = (idx, label, doneFn) => {
        if (idx === -1) return;
        const v = row[idx];
        const done = doneFn(String(v || ''));
        let toggleable = false, doneValue = null, undoneValue = null;
        const cfg = getColumnConfig(String(headers[idx]));
        const opts = cfg && cfg.config && cfg.config.type === 'select'
            ? (cfg.config.options || []).filter(o => o !== '-')
            : [];
        if (opts.length === 2) {
            const doneOpts = opts.filter(o => doneFn(String(o)));
            const undoneOpts = opts.filter(o => !doneFn(String(o)));
            if (doneOpts.length === 1 && undoneOpts.length === 1) {
                toggleable = true;
                doneValue = doneOpts[0];
                undoneValue = undoneOpts[0];
            }
        }
        items.push({ label, value: v, done, idx, toggleable, doneValue, undoneValue });
    };
    pushIf(find(h => h.includes('ทัก')), 'ทักแชท', v => v.includes('ทักแล้ว'));
    pushIf(find(h => h.includes('คอมเมนท์')), 'คอมเมนท์', v => v.includes('คอมเมนท์แล้ว'));
    pushIf(find(h => h.includes('ตามแชท') || h.includes('ตามงาน')), 'ตามแชท', v => v.includes('ตามแล้ว'));
    pushIf(find(h => h.includes('สถานะ')), 'ปิดดีล / รับข้อเสนอ', v => v.includes('ดีลจบ') || (v.includes('รับข้อเสนอ') && !v.includes('ไม่รับ') && !v.includes('ยังไม่กดขอ')));
    pushIf(find(h => h.includes('ส่งของ')), 'ส่งของถึงยัง', v => v.includes('ส่งแล้ว'));
    pushIf(find(h => h.includes('ได้รับของ')), 'ได้รับของวันไหน', v => v.trim() !== '' && v.trim() !== '-');
    pushIf(find(h => h.includes('ลงคลิป')), 'ลงคลิปยัง', v => v.includes('ลงแล้ว'));
    return items;
}

export function getPipelineStage(headers, row) {
    if (!headers || !row) return null;
    const find = (pred) => headers.findIndex(h => h && pred(String(h)));
    const val = (idx) => idx > -1 ? String(row[idx] || '').trim() : '';
    const contacted = val(find(h => h.includes('ทัก')));
    const status = val(find(h => h.includes('สถานะ')));
    const shipped = val(find(h => h.includes('ส่งของ')));
    const received = val(find(h => h.includes('ได้รับของ')));
    const clip = val(find(h => h.includes('ลงคลิป')));
    if (status.includes('ไม่รับ') || status.includes('ปฏิเสธ') || status.includes('เรทการ์ด')) {
        return { index: 1, label: 'ไม่รับข้อเสนอ', dropped: true };
    }
    if (status.includes('ไม่อ่าน') || status.includes('ไม่ตอบ')) {
        return { index: 1, label: status.includes('ไม่อ่าน') ? 'ไม่อ่าน' : 'อ่านแต่ไม่ตอบ', dropped: true };
    }
    if (status.includes('ดีลจบ')) return { index: 4, label: 'ดีลจบ', dropped: false };
    if (status.includes('รับข้อเสนอ')) {
        if (shipped.includes('ส่งแล้ว') || clip.includes('ลงแล้ว') || (received && received !== '-')) {
            return { index: 3, label: 'ส่งของ/รอคลิป', dropped: false };
        }
        return { index: 2, label: 'รับข้อเสนอ', dropped: false };
    }
    if (status.includes('กำลังตัดสินใจ') || status.includes('สนใจ')) {
        return { index: 1, label: 'กำลังตัดสินใจ', dropped: false };
    }
    if (contacted.includes('ทักแล้ว')) return { index: 1, label: 'ทักแล้ว/รอตอบ', dropped: false };
    return { index: 0, label: 'ยังไม่ทัก', dropped: false };
}

export function getStageChipClasses(stage) {
    if (!stage) return "bg-slate-100 text-slate-500 border-slate-200";
    if (stage.dropped) return "bg-rose-50 text-rose-600 border-rose-200";
    switch (stage.index) {
        case 0: return "bg-slate-100 text-slate-500 border-slate-200";
        case 1: return "bg-indigo-50 text-indigo-600 border-indigo-200";
        case 2: return "bg-cyan-50 text-cyan-700 border-cyan-200";
        case 3: return "bg-amber-50 text-amber-700 border-amber-200";
        case 4: return "bg-emerald-50 text-emerald-700 border-emerald-200";
        default: return "bg-slate-100 text-slate-500 border-slate-200";
    }
}

export function getStatusColor(val, headerName) {
    const s = String(val || "").toLowerCase();
    const t = String(headerName || "").toLowerCase();
    if (s === "-" || s === "") return "bg-slate-50 border-slate-200 text-slate-400";
    if (t.includes("สถานะ")) {
        if (s.includes("ดีลจบ") || s.includes("อนุมัติ")) return "bg-green-100 text-green-800 border-green-200 font-bold";
        if (s.includes("รับข้อเสนอ") && s.includes("ยังไม่กดขอ")) return "bg-cyan-100 text-cyan-700 border-cyan-200 font-bold ring-1 ring-cyan-400/30";
        if (s.includes("รับข้อเสนอ") && !s.includes("ไม่รับ")) return "bg-emerald-100 text-emerald-700 border-emerald-200";
        if (s.includes("ไม่รับ") || s.includes("ปฏิเสธ") || s.includes("เรทการ์ด")) return "bg-rose-100 text-rose-700 border-rose-200";
        if (s.includes("กำลังตัดสินใจ") || s.includes("รอ") || s.includes("สนใจ")) return "bg-amber-100 text-amber-700 border-amber-200";
        if (s.includes("อ่าน") || s.includes("ไม่อ่าน") || s.includes("ไม่ตอบ")) return "bg-slate-100 text-slate-600 border-slate-200";
    }
    if (t.includes("ทัก") || t.includes("คอมเมนท์") || t.includes("ตาม") || t.includes("ส่งของ") || t.includes("ลงคลิป")) {
        if (s.includes("แล้ว") || s.includes("ทักแล้ว") || s.includes("คอมเมนท์แล้ว") || s.includes("ตามแล้ว") || s.includes("ส่งแล้ว") || s.includes("ลงแล้ว") || s.includes("ปกติ")) return "bg-emerald-50 text-emerald-600 border-emerald-200 font-medium";
        if (s.includes("ยังไม่") || s.includes("ช้า")) return "bg-orange-50 text-orange-600 border-orange-200";
        if (s.includes("อ่านไม่ตอบ")) return "bg-red-50 text-red-600 border-red-200";
    }
    if (t.includes("ติดต่อ")) {
        if (s.includes("line")) return "bg-[#06c755]/10 text-[#06c755] border-[#06c755]/20 font-bold";
        if (s.includes("facebook")) return "bg-[#1877f2]/10 text-[#1877f2] border-[#1877f2]/20 font-bold";
        if (s.includes("instagram") || s.includes("ig")) return "bg-[#e1306c]/10 text-[#e1306c] border-[#e1306c]/20 font-bold";
        if (s.includes("tiktok")) return "bg-black/5 text-black border-black/10 font-bold";
        if (s.includes("email")) return "bg-blue-50 text-blue-700 border-blue-200";
        if (s.includes("โทร")) return "bg-cyan-50 text-cyan-700 border-cyan-200";
    }
    if (t.includes("วิว")) {
        if (s.includes("หลักล้าน")) return "bg-rose-100 text-rose-700 border-rose-200 font-bold";
        if (s.includes("หลักแสน")) return "bg-purple-100 text-purple-700 border-purple-200 font-semibold";
        if (s.includes("หลักหมื่น")) return "bg-blue-100 text-blue-700 border-blue-200";
        if (s.includes("หลักพัน")) return "bg-sky-100 text-sky-700 border-sky-200";
        if (s.includes("หลักร้อย")) return "bg-slate-100 text-slate-600 border-slate-200";
    }
    if (t.includes("สไตล์")) {
        if (s.includes("ไลฟ์สไตล์")) return "bg-orange-100 text-orange-700 border-orange-200";
        if (s.includes("รีวิว")) return "bg-lime-100 text-lime-700 border-lime-200";
        if (s.includes("ออกกำลังกาย")) return "bg-teal-100 text-teal-700 border-teal-200";
        if (s.includes("ความรู้")) return "bg-indigo-100 text-indigo-700 border-indigo-200";
        if (s.includes("บันเทิง")) return "bg-pink-100 text-pink-700 border-pink-200";
    }
    if (t.includes("commission")) {
        if (s.includes("20%")) return "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200 font-bold";
        if (s.includes("15%")) return "bg-purple-100 text-purple-700 border-purple-200";
        if (s.includes("10%")) return "bg-violet-50 text-violet-700 border-violet-200";
    }
    return "bg-white border-slate-200 text-slate-700";
}
