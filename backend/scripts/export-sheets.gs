/**
 * export-sheets.gs — รันในโปรเจกต์ Google Apps Script "เดิม" ครั้งเดียว เพื่อ dump
 * ทุกชีตออกมาเป็น JSON แล้วเอาไปเข้า Supabase ด้วย import-to-supabase.mjs
 *
 * วิธีใช้:
 *   1) วางไฟล์นี้ในโปรเจกต์ GAS เดิม (ที่มี code.gs กับ getRoutingMap อยู่แล้ว)
 *   2) เลือกฟังก์ชัน exportAllSheetsToDrive แล้วกด Run (อนุญาตสิทธิ์)
 *   3) จะได้ไฟล์ crm-export.json ใน Google Drive (root) — ดาวน์โหลดมาไว้ในโฟลเดอร์นี้
 *
 * โครง JSON: [{ team, label, headers: [...], rows: [[...], ...] }]
 * (team = source, label = ชื่อแท็บ/คนดูแล — ตรงกับ routing เดิม)
 */
function exportAllSheetsToDrive() {
  const map = getRoutingMap();            // ใช้ logic routing เดิม
  const out = [];

  map.forEach(item => {
    if (item.id === 'ERROR') return;
    try {
      const ss = SpreadsheetApp.openById(item.id);
      const sheet = ss.getSheetByName(item.tabName);
      if (!sheet || sheet.getLastRow() < 1) return;
      const data = sheet.getDataRange().getDisplayValues();
      out.push({
        team:    item.source,
        label:   item.label,
        headers: data[0] || [],
        rows:    data.slice(1),
      });
    } catch (e) {
      Logger.log('skip ' + item.name + ': ' + e.message);
    }
  });

  const json = JSON.stringify(out);
  const file = DriveApp.createFile('crm-export.json', json, MimeType.PLAIN_TEXT);
  Logger.log('เขียนแล้ว: ' + file.getUrl() + '  (' + out.length + ' ชีต)');
  return file.getUrl();
}
