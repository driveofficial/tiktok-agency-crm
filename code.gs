

// ------------------------------------------------------------------------------------------------------------------
// 🟢 ส่วน Backend (Server-side)
// ------------------------------------------------------------------------------------------------------------------

// *** 1. ใส่ ID ของไฟล์ Master Config ที่นี่ ***
const MASTER_CONFIG_ID = "1rQa3L3aDux1ElL3VGSXsEPBDPfxUgw59CmyFRZppW58"; 
const MASTER_TAB_NAME_IN_CONFIG_FILE = "Master_config"; 

// รายชื่อ Tab ที่ไม่ต้องการให้นำมาแสดง (System Tabs)
const IGNORED_TABS = ["Config", "Dashboard", "Master", "Template", "Lists", "Dropdowns", "Sheet1", "Data","เรทการ์ด sereniz"];

// แท็บที่ต้องข้ามตอน import ทั้งสเปรดชีต: ทั้ง IGNORED_TABS (ตรงเป๊ะ) + แท็บเรทการ์ดของทุกทีม
// ("เรทการ์ด <ทีม>" เช่น "เรทการ์ด drive", "เรทการ์ด sereniz") เพราะเป็นชีตอ้างอิงราคา ไม่ใช่ไปป์ไลน์ครีเอเตอร์
function isIgnoredTab(name) {
  if (IGNORED_TABS.includes(name)) return true;
  if (String(name == null ? '' : name).indexOf('เรทการ์ด') > -1) return true;
  return false;
}

// --- CACHE HELPERS ---
const CACHE = CacheService.getScriptCache();
const CACHE_TIME = 21600; // 6 hours
// 30 min. Longer than the 10-min precompute trigger (createPrecomputeTrigger) so the dashboard/index
// cache is refreshed ~3x per TTL window and real users almost never hit a cold full-sheet scan. Writes
// still clear the dashboard cache immediately, so data stays correct — this only governs idle staleness.
const DASHBOARD_CACHE_TIME = 1800;
// 🟢 FORCE RESET CACHE KEY (V13) - เปลี่ยน Key เพื่อบังคับโหลดข้อมูลใหม่ (เพิ่ม byShipped/byClip)
const CACHE_KEY_ROUTING = "ROUTING_MAP_V13_RESET";
const CACHE_KEY_DASHBOARD = "DASHBOARD_DATA_V15_RESET";
const CACHE_KEY_DIRECTORY = "CREATOR_INDEX_V1"; // index ครีเอเตอร์ทุกชีต (ใช้เช็คซ้ำข้ามทีม)
const CACHE_KEY_TEAM_CORPUS = "TEAM_CORPUS_V1_"; // + <ชื่อทีม> — รวมทุกแถวของทุกชีตในทีม (ใช้ค้นข้ามชีต)

function include(filename) {
  try {
    return HtmlService.createHtmlOutputFromFile(filename).getContent();
  } catch (e) {
    Logger.log(`Error loading file: ${filename}`);
    return `<script>console.error("❌ Failed to load: ${filename}.html. Please check if the file exists in Apps Script editor!");</script>`;
  }
}

function getCachedData(key) {
  const cached = CACHE.get(key);
  return cached ? JSON.parse(cached) : null;
}

function setCachedData(key, data, durationSec) {
  try {
    CACHE.put(key, JSON.stringify(data), durationSec);
  } catch (e) {
    console.error("Cache put error", e);
  }
}

function clearDashboardCache() {
  CACHE.remove(CACHE_KEY_DASHBOARD);
}

function clearSystemCache() {
  clearTeamCorpusCache(); // ต้องอ่าน routing (ยังแคชอยู่) เพื่อรู้รายชื่อทีม — ล้างก่อนลบ routing
  CACHE.remove(CACHE_KEY_ROUTING);
  CACHE.remove(CACHE_KEY_DASHBOARD);
  CACHE.remove(CACHE_KEY_DIRECTORY);
  return { success: true };
}

// CacheService list key ไม่ได้ จึงต้องประกอบคีย์เอง: TEAM_CORPUS_V1_<ทีม> ของทุกทีมใน routing
// (ใช้ตอน "ซิงก์ทีม" เพื่อบังคับให้ global search ดึงข้อมูลสดรอบถัดไป แทนที่จะรอ TTL 30 นาที)
function clearTeamCorpusCache() {
  try {
    const teams = Array.from(new Set(getRoutingMap().map(i => i.source)));
    const keys = teams.map(t => CACHE_KEY_TEAM_CORPUS + t);
    if (keys.length) CACHE.removeAll(keys);
  } catch (e) {
    console.warn('clearTeamCorpusCache: ' + e.message);
  }
}

// --------------------------------------------------------------------------
// CREATOR DIRECTORY (เช็คชื่อ/ลิงก์ซ้ำข้ามทุกชีต — กันทักซ้ำข้ามทีม)
// --------------------------------------------------------------------------
// สร้าง index จากทุกชีต: key ('L:'+ลิงก์ | 'N:'+ชื่อเล่น) -> [{ sheet, label }]
// แคช ~10 นาที และ "ไม่" เคลียร์ทุกครั้งที่เขียน (ต่างจาก dashboard) เพราะการ rescan ทุกสเปรดชีต
// กินเวลานาน ถ้าเคลียร์ทุก add จะทำให้การเพิ่มรายการถัดไปช้า — การเตือนซ้ำเป็นแค่ตัวช่วย ไม่ใช่ correctness
// จึงยอมให้ข้อมูลคลาดได้ ~10 นาที (ชีตปัจจุบันยังเช็คสดจาก rows ฝั่งหน้าเว็บอยู่แล้ว)
function getCreatorIndex() {
  const cached = getCachedData(CACHE_KEY_DIRECTORY);
  if (cached) return cached;

  const norm = s => String(s == null ? '' : s).trim().toLowerCase().replace(/\/+$/, '');
  const map = getRoutingMap();
  const index = {};

  map.forEach(item => {
    if (item.id === "ERROR") return;
    try {
      const ss = SpreadsheetApp.openById(item.id);
      const sheet = ss.getSheetByName(item.tabName);
      if (!sheet || sheet.getLastRow() < 2) return;

      const data = sheet.getDataRange().getDisplayValues();
      const headers = data[0];
      const linkIdx = headers.findIndex(h => { const x = String(h); return x.includes('ลิงค์') || x.includes('ลิงก์') || x.toLowerCase().includes('tiktok'); });
      const nameIdx = headers.findIndex(h => String(h).includes('ชื่อเล่น') && !String(h).toLowerCase().includes('tiktok'));
      if (linkIdx === -1 && nameIdx === -1) return;

      data.slice(1).forEach(row => {
        const label = (nameIdx > -1 && row[nameIdx]) ? String(row[nameIdx]).trim() : (linkIdx > -1 ? String(row[linkIdx] || '').trim() : '');
        const add = (key) => {
          if (!key) return;
          if (!index[key]) index[key] = [];
          index[key].push({ sheet: item.name, label: label });
        };
        if (linkIdx > -1) { const l = norm(row[linkIdx]); if (l) add('L:' + l); }
        if (nameIdx > -1) { const n = norm(row[nameIdx]); if (n) add('N:' + n); }
      });
    } catch (e) {
      console.warn(`Index skip ${item.name}: ${e.message}`);
    }
  });

  setCachedData(CACHE_KEY_DIRECTORY, index, DASHBOARD_CACHE_TIME);
  return index;
}

function checkDuplicate(link, name) {
  try {
    const norm = s => String(s == null ? '' : s).trim().toLowerCase().replace(/\/+$/, '');
    const index = getCreatorIndex();
    const l = norm(link);
    const n = norm(name);
    let matches = [];
    if (l && index['L:' + l]) matches = index['L:' + l];       // เจอลิงก์ตรงก่อน
    else if (n && index['N:' + n]) matches = index['N:' + n];  // ไม่มีลิงก์ค่อยเทียบชื่อเล่น
    return { success: true, matches: matches };
  } catch (e) {
    return { success: false, matches: [], error: e.message };
  }
}

// --------------------------------------------------------------------------
// GLOBAL SEARCH (ค้นข้ามทุกชีตในทีมเดียว — โชว์ว่าเจอในชีตของใคร)
// --------------------------------------------------------------------------
// รวมทุกแถวของทุกชีตในทีมไว้เป็น corpus แล้วแคช (~30 นาที เท่า dashboard) เพื่อไม่ให้ทุกครั้งที่พิมพ์
// ต้อง rescan ทั้งทีมใหม่ (ช้า). ข้อมูลอาจคลาดได้ ~30 นาทีเหมือน creator index — ยอมได้เพราะ search
// เป็นตัวช่วยหา ไม่ใช่ correctness (ชีตที่เปิดอยู่ยังเช็คสดจาก rows ฝั่งหน้าเว็บ)
function getTeamCorpus(teamSource) {
  const key = CACHE_KEY_TEAM_CORPUS + teamSource;
  const cached = getCachedData(key);
  if (cached) return cached;

  const map = getRoutingMap();
  const corpus = []; // [{ sheet, label, headers, rows: [[...]] }]
  map.forEach(item => {
    if (item.source !== teamSource || item.id === "ERROR") return;
    try {
      const ss = SpreadsheetApp.openById(item.id);
      const sheet = ss.getSheetByName(item.tabName);
      if (!sheet || sheet.getLastRow() < 2) return;
      const data = sheet.getDataRange().getDisplayValues();
      corpus.push({ sheet: item.name, label: item.label, headers: data[0], rows: data.slice(1) });
    } catch (e) {
      console.warn(`Corpus skip ${item.name}: ${e.message}`);
    }
  });

  // อาจเกิน 100KB (ลิมิต CacheService) แล้ว put ล้มเงียบๆ — ไม่เป็นไร แค่รอบหน้าจะ rescan อีก
  setCachedData(key, corpus, DASHBOARD_CACHE_TIME);
  return corpus;
}

// ค้นทุกชีตในทีม: คืนผลจัดกลุ่มตามชีต (มี label ชื่อชีตไว้โชว์) + headers เพื่อให้หน้าเว็บ render ชื่อ/สถานะได้
// query ต้องยาว >= 2 ตัวอักษร; จำกัดผลรวมที่ MAX เพื่อกัน payload บวม
function searchTeamData(teamSource, query) {
  try {
    if (!teamSource) return { success: true, groups: [], total: 0 };
    const q = String(query == null ? "" : query).trim().toLowerCase();
    if (q.length < 2) return { success: true, groups: [], total: 0 };

    const corpus = getTeamCorpus(teamSource);
    const MAX = 200;
    const groups = [];
    let total = 0;

    for (let s = 0; s < corpus.length && total < MAX; s++) {
      const sh = corpus[s];
      const matches = [];
      for (let i = 0; i < sh.rows.length && total < MAX; i++) {
        const row = sh.rows[i];
        let hit = false;
        for (let c = 0; c < row.length; c++) {
          if (String(row[c] == null ? "" : row[c]).toLowerCase().indexOf(q) > -1) { hit = true; break; }
        }
        if (hit) { matches.push({ row: row, originalIndex: i }); total++; }
      }
      if (matches.length) groups.push({ sheet: sh.sheet, label: sh.label, headers: sh.headers, matches: matches });
    }

    return { success: true, groups: groups, total: total, capped: total >= MAX };
  } catch (e) {
    return { success: false, error: e.message, groups: [], total: 0 };
  }
}

function doGet(e) {
  return HtmlService.createTemplateFromFile('index')
      .evaluate()
      .setTitle('TikTok Agency CRM')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// --- ROUTER SERVICE ---

function getRoutingMap() {
  const cachedMap = getCachedData(CACHE_KEY_ROUTING); 
  if (cachedMap) return cachedMap;

  try {
    const ss = SpreadsheetApp.openById(MASTER_CONFIG_ID);
    const sheet = ss.getSheetByName(MASTER_TAB_NAME_IN_CONFIG_FILE);
    if (!sheet) throw new Error(`ไม่พบ Tab "${MASTER_TAB_NAME_IN_CONFIG_FILE}" ในไฟล์ Config`);
    
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];

    const configData = sheet.getRange(2, 1, lastRow - 1, 3).getDisplayValues();
    let finalMap = [];
    const usedNames = new Set();
    // กัน config ซ้ำ: ถ้า 2 row ชี้สเปรดชีต+แท็บเดียวกัน (คนเดียวกัน) ให้เก็บใบเดียว
    // เพื่อไม่ให้ระบบเติม suffix ชื่อทีม เช่น "โอ๊ค (Drive Sereniz)" ทั้งที่ในชีตชื่อ "โอ๊ค"
    // (คนละคนชื่อซ้ำจะ id/tab ต่างกัน จึงยังถูกแยกชื่อตามเดิม)
    const seenTargets = new Set();
    const targetKey = (id, tab) => `${id}::${tab}`;

    const registerName = (baseName, sourceName) => {
      let unique = baseName;
      if (usedNames.has(unique)) unique = `${baseName} (${sourceName})`;
      let counter = 2;
      while (usedNames.has(unique)) {
        unique = `${baseName} ${counter}`;
        counter++;
      }
      usedNames.add(unique);
      return unique;
    };

    configData.forEach((row, index) => {
      const sourceName = row[0] ? row[0].toString().trim() : `File ${index+1}`; 
      const spreadsheetId = row[1] ? row[1].toString().trim() : "";
      const specificTabName = (row.length > 2 && row[2]) ? row[2].toString().trim() : "";

      if (!spreadsheetId) return; 

      if (specificTabName !== "") {
        try {
          SpreadsheetApp.openById(spreadsheetId);
          const key = targetKey(spreadsheetId, specificTabName);
          if (seenTargets.has(key)) return; // config ซ้ำ (ชี้ชีต+แท็บเดิม) — ข้าม
          seenTargets.add(key);
          const safeName = registerName(specificTabName, sourceName);
          // name = unique id ใช้ค้นชีต (อาจมี suffix เมื่อชื่อชนข้ามทีม); label = ชื่อแท็บดิบไว้โชว์
          // (UI แยกแสดงทีละทีม จึงไม่ต้องเห็น suffix — เช่น "โอ๊ค" ที่มีทั้งทีม drive และ Sereniz)
          finalMap.push({ name: safeName, label: specificTabName, id: spreadsheetId, tabName: specificTabName, source: sourceName });
        } catch (e) {
           console.warn(`Skip ${specificTabName}: Access Denied`);
        }
      } else {
        try {
          const targetSS = SpreadsheetApp.openById(spreadsheetId);
          const allSheets = targetSS.getSheets();
          allSheets.forEach(s => {
            const sName = s.getName();
            if (!isIgnoredTab(sName) && !s.isSheetHidden()) {
              const key = targetKey(spreadsheetId, sName);
              if (seenTargets.has(key)) return; // config ซ้ำ (ชี้ชีต+แท็บเดิม) — ข้าม
              seenTargets.add(key);
              const safeName = registerName(sName, sourceName);
              finalMap.push({ name: safeName, label: sName, id: spreadsheetId, tabName: sName, source: sourceName });
            }
          });
        } catch (err) {
          finalMap.push({ name: `⚠️ Access Denied: ${sourceName}`, label: `⚠️ Access Denied: ${sourceName}`, id: "ERROR", tabName: "ERROR", source: sourceName });
        }
      }
    });
    
    setCachedData(CACHE_KEY_ROUTING, finalMap, CACHE_TIME);
    return finalMap;

  } catch (e) {
    throw new Error("Master Config Error: " + e.message);
  }
}

function getTargetInfo(displayName) {
  let map = getRoutingMap();
  let target = map.find(item => item.name === displayName);
  if (!target) {
     CACHE.remove(CACHE_KEY_ROUTING);
     map = getRoutingMap();
     target = map.find(item => item.name === displayName);
  }
  if (!target) throw new Error(`ไม่พบข้อมูลของ: ${displayName}`);
  if (target.id === "ERROR") throw new Error("กรุณาแชร์สิทธิ์ Edit ไฟล์นี้ให้กับบัญชีเจ้าของ App Script");
  return target;
}

function getSheetNames() {
  try {
    const map = getRoutingMap();
    return { success: true, data: map }; 
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// --------------------------------------------------------------------------
// DASHBOARD SERVICE
// --------------------------------------------------------------------------
function getDashboardData() {
  const cachedDash = getCachedData(CACHE_KEY_DASHBOARD);
  if (cachedDash) return { success: true, data: cachedDash, cached: true };

  // ใช้ getUserLock (ไม่ใช่ getScriptLock) เพราะการสแกนทุกชีตกินเวลานาน ถ้าถือ script lock ไว้
  // จะไปบล็อก addData/updateData/deleteData จนเขียนลงชีตไม่ได้ (waitLock 10 วิ แล้ว timeout).
  // getUserLock ยังกันไม่ให้คำนวณ dashboard ซ้อนกันเอง แต่ "ไม่" ชนกับ lock ที่ใช้ตอนเขียนข้อมูล
  const lock = LockService.getUserLock();
  if (!lock.tryLock(5000)) return { success: false, error: "System busy calculating stats." };

  try {
    const map = getRoutingMap();
    const result = {
      overall: initStatsObj(),
      byTeam: {}, 
      bySheet: {}
    };

    const now = new Date();
    const todayStr = formatDateISO(now);
    const startOfWeek = getStartOfWeek(now);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    map.forEach(item => {
      if (item.id === "ERROR") return;

      try {
        const ss = SpreadsheetApp.openById(item.id);
        const sheet = ss.getSheetByName(item.tabName);
        
        const sheetStats = initStatsObj();
        
        if (!result.byTeam[item.source]) {
            result.byTeam[item.source] = initStatsObj();
        }

        if (sheet && sheet.getLastRow() > 1) {
          const dataRange = sheet.getDataRange().getDisplayValues();
          const headers = dataRange[0];
          const values = dataRange.slice(1);
          
          // หาคอลัมน์วันที่แบบยืดหยุ่น (ให้ตรงกับ fuzzy match ฝั่งหน้าเว็บ) — เอา "วันที่" เป๊ะก่อน
          // ถ้าไม่เจอค่อยเอาหัวที่ขึ้นต้นด้วย "วันที่" (เช่น "วันที่ทัก") โดยเลี่ยง "วันเกิดวันที่"
          let dateIdx = headers.findIndex(h => String(h).trim() === "วันที่");
          if (dateIdx === -1) dateIdx = headers.findIndex(h => String(h).trim().startsWith("วันที่"));
          const statusIdx = headers.findIndex(h => h.includes("สถานะ"));
          const platformIdx = headers.findIndex(h => h.includes("ติดต่อกันช่องทางไหน"));
          const commIdx = headers.findIndex(h => h.includes("Commission"));
          const shippedIdx = headers.findIndex(h => h.includes("ส่งของ"));
          const clipIdx = headers.findIndex(h => h.includes("ลงคลิป"));

          values.forEach(row => {
            const rowDateStr = dateIdx > -1 ? row[dateIdx] : "";
            const status = statusIdx > -1 ? (row[statusIdx] || "Unknown") : "Unknown";
            const platform = platformIdx > -1 ? (row[platformIdx] || "Unknown") : "Unknown";
            const comm = commIdx > -1 ? (row[commIdx] || "Unknown") : "Unknown";
            const shipped = shippedIdx > -1 ? (row[shippedIdx] || "Unknown") : "Unknown";
            const clip = clipIdx > -1 ? (row[clipIdx] || "Unknown") : "Unknown";

            // Helper to update specific object
            const up = (obj, s, p, c, sh, cl) => {
                 obj.total++;
                 obj.byStatus[s] = (obj.byStatus[s] || 0) + 1;
                 obj.byPlatform[p] = (obj.byPlatform[p] || 0) + 1;
                 obj.byCommission[c] = (obj.byCommission[c] || 0) + 1;
                 obj.byShipped[sh] = (obj.byShipped[sh] || 0) + 1;
                 obj.byClip[cl] = (obj.byClip[cl] || 0) + 1;
            };

            // นับทุกแถวใน "ทั้งหมด" (all) เสมอ ไม่ว่าจะกรอกวันที่หรือไม่ เพื่อให้ยอดตรงกับจำนวนแถวจริงในชีต
            // (Product Principle #1: ชีตคือแหล่งความจริง)
            up(sheetStats.all, status, platform, comm, shipped, clip);

            // ไม่มีวันที่ → นับเฉพาะ all แล้วข้ามการจัดกลุ่มตามช่วงเวลา (today/week/month/history/daily)
            const hasDate = rowDateStr && rowDateStr.toString().trim() !== "";
            if (!hasDate) return;

            const rowDate = parseDate(rowDateStr);

            if (rowDate) {
              const isoDate = formatDateISO(rowDate);

              if (isoDate === todayStr) up(sheetStats.today, status, platform, comm, shipped, clip);
              if (rowDate >= startOfMonth) up(sheetStats.month, status, platform, comm, shipped, clip);
              if (rowDate >= startOfWeek) up(sheetStats.week, status, platform, comm, shipped, clip);

              // History
              const monthKey = `${rowDate.getFullYear()}-${String(rowDate.getMonth() + 1).padStart(2, '0')}`;
              if (!sheetStats.history) sheetStats.history = {};
              if (!sheetStats.history[monthKey]) sheetStats.history[monthKey] = { total: 0, byStatus: {}, byPlatform: {}, byCommission: {}, byShipped: {}, byClip: {} };
              up(sheetStats.history[monthKey], status, platform, comm, shipped, clip);

              // 🟢 Daily Timeline (สำคัญมากสำหรับ Custom Date)
              if (!sheetStats.daily) sheetStats.daily = {};
              if (!sheetStats.daily[isoDate]) sheetStats.daily[isoDate] = { total: 0, byStatus: {}, byPlatform: {}, byCommission: {}, byShipped: {}, byClip: {} };
              up(sheetStats.daily[isoDate], status, platform, comm, shipped, clip);
            }
          });
        }
        
        result.bySheet[item.name] = sheetStats;
        mergeStats(result.byTeam[item.source], sheetStats);
        mergeStats(result.overall, sheetStats);

      } catch (err) {
        console.error(`Error processing ${item.name}: ${err.message}`);
      }
    });

    setCachedData(CACHE_KEY_DASHBOARD, result, DASHBOARD_CACHE_TIME);
    return { success: true, data: result };

  } catch (err) {
    return { success: false, error: err.toString() };
  } finally {
    lock.releaseLock();
  }
}

// --- Dashboard Helpers ---
function initStatsObj() {
  const bucket = () => ({ total: 0, byStatus: {}, byPlatform: {}, byCommission: {}, byShipped: {}, byClip: {} });
  return { 
    all: bucket(), 
    today: bucket(), 
    week: bucket(), 
    month: bucket(),
    history: {},
    daily: {} // 🟢 ต้องมี daily ไม่งั้น custom range จะไม่ทำงาน
  };
}

function mergeStats(target, source) {
  // Merge Standard
  ['all', 'today', 'week', 'month'].forEach(tf => {
    target[tf].total += source[tf].total;
    ['byStatus', 'byPlatform', 'byCommission', 'byShipped', 'byClip'].forEach(key => {
        Object.keys(source[tf][key]).forEach(k => {
            target[tf][key][k] = (target[tf][key][k] || 0) + source[tf][key][k];
        });
    });
  });

  // Merge Maps (history, daily)
  ['history', 'daily'].forEach(mapName => {
      if (source[mapName]) {
          if (!target[mapName]) target[mapName] = {};
          Object.keys(source[mapName]).forEach(key => {
              if (!target[mapName][key]) target[mapName][key] = { total: 0, byStatus: {}, byPlatform: {}, byCommission: {}, byShipped: {}, byClip: {} };
              const t = target[mapName][key];
              const s = source[mapName][key];

              t.total += s.total;
              ['byStatus', 'byPlatform', 'byCommission', 'byShipped', 'byClip'].forEach(prop => {
                   Object.keys(s[prop]).forEach(k => {
                       t[prop][k] = (t[prop][k] || 0) + s[prop][k];
                   });
              });
          });
      }
  });
}

// แปลงปี พ.ศ. → ค.ศ. (เช่น 2569 → 2026) ถ้าปี >= 2400 เพื่อให้จัดกลุ่มช่วงเวลาถูกต้อง
function normYear(y) { return y >= 2400 ? y - 543 : y; }

function parseDate(dateStr) {
  if (!dateStr) return null;
  // Format: YYYY-MM-DD
  if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const parts = dateStr.split('-');
    return new Date(normYear(+parts[0]), parts[1] - 1, parts[2]);
  }
  // Format: DD/MM/YYYY or D/M/YYYY (Thai Format Support)
  if (dateStr.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
    const parts = dateStr.split('/');
    return new Date(normYear(+parts[2]), parts[1] - 1, parts[0]);
  }
  // Fallback
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

function formatDateISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getStartOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); 
  return new Date(d.setDate(diff));
}

// --------------------------------------------------------------------------
// CRUD FUNCTIONS
// --------------------------------------------------------------------------

// OPTIMISTIC-CONCURRENCY GUARD (กันเขียนผิดแถว)
// การเขียน/ลบอิง "ตำแหน่งแถว" (rowIndex) ที่หน้าเว็บโหลดมา ถ้ามีคนแก้ชีตตรงๆ หรืออีกคน
// แทรก/ลบแถวพร้อมกัน ตำแหน่งจะเลื่อน แล้วเราจะไปทับ/ลบ "แถวผิด" เงียบๆ ป้องกันด้วยการให้
// หน้าเว็บส่ง "สแนปช็อตแถวเดิม" (expectedRow) มาด้วย แล้วเทียบกับค่าจริงในชีตก่อนเขียน
// ถ้าไม่ตรง = แถวถูกแก้ไปแล้ว → คืน conflict ให้หน้าเว็บรีเฟรชแทนที่จะทับข้อมูลผิด
function rowFingerprint(arr) {
  const a = (arr || []).map(v => String(v === null || v === undefined ? '' : v));
  while (a.length && a[a.length - 1] === '') a.pop(); // ตัดช่องว่างท้ายทิ้ง (ทนต่อคอลัมน์ท้ายที่ว่าง)
  return a.join('');
}
// true = ตรง (เขียนได้); false = ไม่ตรง/แถวหาย (conflict). expectedRow ว่าง = ข้ามการเช็ค (เข้ากันได้กับไคลเอนต์เก่า)
function rowMatches(sheet, actualRow, expectedRow) {
  if (expectedRow === null || expectedRow === undefined) return true;
  const lastRow = sheet.getLastRow();
  if (actualRow < 2 || actualRow > lastRow) return false; // แถวไม่อยู่ตรงตำแหน่งเดิมแล้ว
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const current = sheet.getRange(actualRow, 1, 1, lastCol).getDisplayValues()[0];
  return rowFingerprint(current) === rowFingerprint(expectedRow);
}
const CONFLICT_MSG = "ข้อมูลแถวนี้ในชีตถูกแก้ไปแล้ว ระบบโหลดข้อมูลล่าสุดให้แล้ว โปรดลองใหม่";

function getData(displayName) {
  try {
    const info = getTargetInfo(displayName);
    const ss = SpreadsheetApp.openById(info.id);
    const sheet = ss.getSheetByName(info.tabName);
    if (!sheet) return { success: false, error: `ไม่พบ Tab` };
    const range = sheet.getDataRange();
    const values = range.getDisplayValues();
    if (values.length < 2) return { success: true, headers: values.length>0?values[0]:[], data: [] };
    return { success: true, headers: values[0], data: values.slice(1) };
  } catch (err) { return { success: false, error: err.toString() }; }
}

function addData(displayName, rowData) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000); 
    const info = getTargetInfo(displayName);
    const ss = SpreadsheetApp.openById(info.id);
    const sheet = ss.getSheetByName(info.tabName);
    const stringRow = rowData.map(d => String(d === null || d === undefined ? '' : d));
    sheet.appendRow(stringRow);
    clearDashboardCache(); 
    return { success: true };
  } catch (err) { return { success: false, error: err.toString() }; } finally { lock.releaseLock(); }
}

function updateData(displayName, rowIndex, rowData, expectedRow) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const info = getTargetInfo(displayName);
    const ss = SpreadsheetApp.openById(info.id);
    const sheet = ss.getSheetByName(info.tabName);
    const actualRow = rowIndex + 2;
    if (!rowMatches(sheet, actualRow, expectedRow)) return { success: false, conflict: true, error: CONFLICT_MSG };
    const stringRow = rowData.map(d => String(d === null || d === undefined ? '' : d));
    sheet.getRange(actualRow, 1, 1, stringRow.length).setValues([stringRow]);
    clearDashboardCache();
    return { success: true };
  } catch (err) { return { success: false, error: err.toString() }; } finally { lock.releaseLock(); }
}

function deleteData(displayName, rowIndex, expectedRow) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const info = getTargetInfo(displayName);
    const ss = SpreadsheetApp.openById(info.id);
    const sheet = ss.getSheetByName(info.tabName);
    const actualRow = rowIndex + 2;
    if (!rowMatches(sheet, actualRow, expectedRow)) return { success: false, conflict: true, error: CONFLICT_MSG };
    sheet.deleteRow(actualRow);
    clearDashboardCache();
    return { success: true };
  } catch (err) { return { success: false, error: err.toString() }; } finally { lock.releaseLock(); }
}

// Re-insert a previously deleted row back at its ORIGINAL position (used by "undo delete" in the UI).
// Positional insert — not appendRow — so the restored row lands exactly where it was, keeping the
// sheet an exact match of the app (Product Principle #1: ชีตคือแหล่งความจริง).
function insertRowData(displayName, rowIndex, rowData) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const info = getTargetInfo(displayName);
    const ss = SpreadsheetApp.openById(info.id);
    const sheet = ss.getSheetByName(info.tabName);
    const actualRow = rowIndex + 2; // same +2 convention as updateData/deleteData (header row + 1-based)
    const stringRow = rowData.map(d => String(d === null || d === undefined ? '' : d));
    // If the target row is beyond the sheet's allocated rows, just append; otherwise insert-and-shift.
    if (actualRow > sheet.getMaxRows()) {
      sheet.appendRow(stringRow);
    } else {
      sheet.insertRowBefore(actualRow);
      sheet.getRange(actualRow, 1, 1, stringRow.length).setValues([stringRow]);
    }
    clearDashboardCache();
    return { success: true };
  } catch (err) { return { success: false, error: err.toString() }; } finally { lock.releaseLock(); }
}

// --------------------------------------------------------------------------
// BULK ACTIONS (multi-row select in the UI)
// --------------------------------------------------------------------------

function bulkUpdateCell(displayName, rowIndices, colIndex, value, expectedRows) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const info = getTargetInfo(displayName);
    const ss = SpreadsheetApp.openById(info.id);
    const sheet = ss.getSheetByName(info.tabName);
    // เช็คทุกแถวก่อน ถ้ามีแถวไหนถูกแก้ไปแล้วให้ยกเลิกทั้งก้อน (ไม่เขียนบางส่วน) กันอัปเดตโดนแถวผิด
    if (expectedRows) {
      for (let k = 0; k < rowIndices.length; k++) {
        if (!rowMatches(sheet, rowIndices[k] + 2, expectedRows[k])) return { success: false, conflict: true, error: CONFLICT_MSG };
      }
    }
    const stringValue = String(value === null || value === undefined ? '' : value);
    rowIndices.forEach(rowIndex => {
      sheet.getRange(rowIndex + 2, colIndex + 1).setValue(stringValue);
    });
    clearDashboardCache();
    return { success: true };
  } catch (err) { return { success: false, error: err.toString() }; } finally { lock.releaseLock(); }
}

function bulkDeleteRows(displayName, rowIndices, expectedRows) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const info = getTargetInfo(displayName);
    const ss = SpreadsheetApp.openById(info.id);
    const sheet = ss.getSheetByName(info.tabName);
    // เช็คทุกแถวก่อนลบ ถ้ามีแถวไหนถูกแก้/เลื่อนไปแล้วให้ยกเลิกทั้งก้อน กันลบผิดแถว (ทำลายถาวร)
    if (expectedRows) {
      for (let k = 0; k < rowIndices.length; k++) {
        if (!rowMatches(sheet, rowIndices[k] + 2, expectedRows[k])) return { success: false, conflict: true, error: CONFLICT_MSG };
      }
    }
    // Delete from the bottom up so earlier deletions don't shift the row numbers of the ones still queued
    const sortedDesc = [...rowIndices].sort((a, b) => b - a);
    sortedDesc.forEach(rowIndex => {
      sheet.deleteRow(rowIndex + 2);
    });
    clearDashboardCache();
    return { success: true };
  } catch (err) { return { success: false, error: err.toString() }; } finally { lock.releaseLock(); }
}

// --------------------------------------------------------------------------
// ONE-TIME SETUP: เพิ่มหัวคอลัมน์ใหม่ (ส่งของถึงยัง / ได้รับของวันไหน / ลงคลิปยัง)
// ให้ทุกชีตที่ Master Config รู้จัก โดยข้ามชีตที่มีคอลัมน์นั้นอยู่แล้ว (เช็คด้วย fuzzy
// match แบบเดียวกับฝั่งหน้าเว็บใน getColumnConfig เพื่อไม่เพิ่มซ้ำ) — ไม่แตะแถวข้อมูลเดิม
//
// วิธีใช้: เปิดไฟล์นี้ใน Apps Script Editor -> เลือกฟังก์ชัน "setupFulfillmentColumns"
// จาก dropdown ด้านบน -> กด Run -> ดูผลลัพธ์ที่ View > Logs (หรือ Execution log)
// --------------------------------------------------------------------------
const NEW_FULFILLMENT_COLUMNS = ["ส่งของถึงยัง", "ได้รับของวันไหน", "ลงคลิปยัง"];

function setupFulfillmentColumns() {
  const map = getRoutingMap();
  const results = [];

  const isMissing = (headers, colName) => {
    if (colName === "ส่งของถึงยัง") return !headers.some(h => h.includes("ส่งของ"));
    if (colName === "ได้รับของวันไหน") return !headers.some(h => h.includes("ได้รับของ"));
    if (colName === "ลงคลิปยัง") return !headers.some(h => h.includes("ลงคลิป"));
    return !headers.includes(colName);
  };

  map.forEach(item => {
    if (item.id === "ERROR") {
      results.push(`⚠️ ข้าม ${item.name}: Access Denied`);
      return;
    }
    try {
      const ss = SpreadsheetApp.openById(item.id);
      const sheet = ss.getSheetByName(item.tabName);
      if (!sheet) {
        results.push(`⚠️ ข้าม ${item.name}: ไม่พบ Tab "${item.tabName}"`);
        return;
      }

      const lastCol = Math.max(sheet.getLastColumn(), 1);
      const headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0].map(h => String(h).trim());
      const missing = NEW_FULFILLMENT_COLUMNS.filter(col => isMissing(headers, col));

      if (missing.length === 0) {
        results.push(`✅ ${item.name}: มีคอลัมน์ครบแล้ว ไม่ต้องเพิ่ม`);
        return;
      }

      let nextCol = lastCol + 1;
      missing.forEach(col => {
        sheet.getRange(1, nextCol).setValue(col);
        nextCol++;
      });
      results.push(`➕ ${item.name}: เพิ่มคอลัมน์ [${missing.join(", ")}]`);

    } catch (e) {
      results.push(`❌ ${item.name}: ${e.message}`);
    }
  });

  const summary = results.join("\n");
  Logger.log(summary);
  clearSystemCache(); // เคลียร์ cache ทั้งหมดเพื่อให้ App โหลดคอลัมน์ใหม่ทันที
  return summary;
}

// --------------------------------------------------------------------------
// CACHE WARMING (time-driven trigger) — keep dashboard/creator-index warm so REAL
// users almost never trigger the slow full-scan of every sheet themselves.
//
// getDashboardData() and getCreatorIndex() each scan every spreadsheet on a cache miss
// (slow). This forces that recompute on a schedule instead, refreshing the cache before
// it expires (trigger every 10 min < DASHBOARD_CACHE_TIME 30 min = always warm, with a
// 2-run failure margin). Run by the trigger installed via createPrecomputeTrigger below.
// --------------------------------------------------------------------------
function precomputeCaches() {
  // Force a fresh recompute (remove first so the getters don't just return the stale cache).
  CACHE.remove(CACHE_KEY_DASHBOARD);
  const dash = getDashboardData();
  CACHE.remove(CACHE_KEY_DIRECTORY);
  const idx = getCreatorIndex();

  const msg = `precompute @ ${new Date().toISOString()}: dashboard=${dash && dash.success ? 'ok' : 'FAIL'}, indexKeys=${idx ? Object.keys(idx).length : 0}`;
  Logger.log(msg);
  return msg;
}

// ONE-TIME SETUP: install the time-driven trigger that runs precomputeCaches() every 10 min.
// วิธีใช้: เปิดไฟล์นี้ใน Apps Script Editor -> เลือกฟังก์ชัน "createPrecomputeTrigger" -> กด Run (อนุญาตสิทธิ์ครั้งแรก)
// Re-running is safe: it removes any existing precompute trigger first so duplicates never stack.
function createPrecomputeTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'precomputeCaches')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('precomputeCaches').timeBased().everyMinutes(10).create();
  const msg = 'ติดตั้ง trigger แล้ว: precomputeCaches ทุก 10 นาที (dashboard/index จะอุ่นตลอด)';
  Logger.log(msg);
  return msg;
}

// Remove the cache-warming trigger (ถ้าต้องการปิด) — เลือกฟังก์ชันนี้แล้วกด Run
function deletePrecomputeTrigger() {
  const removed = ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'precomputeCaches');
  removed.forEach(t => ScriptApp.deleteTrigger(t));
  return `ลบ trigger แล้ว: ${removed.length} ตัว`;
}