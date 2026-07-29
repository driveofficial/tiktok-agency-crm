/**
 * realtime-sync.gs — onEdit installable trigger: ส่งเฉพาะ "แถวที่แก้" เข้า Supabase ทันที
 * เสริม pushAllSheets (full sync ทั้งชีต ตั้งเวลารายชั่วโมง) ให้ค่าที่แก้ขึ้นไว 1-2 วินาที
 * แทนที่จะต้องรอ trigger รายชั่วโมง
 *
 * ครอบคลุมเฉพาะ "แก้ค่าเซลล์" (พิมพ์/เลือก dropdown ในแถวเดิม) เท่านั้น
 * เพิ่ม/ลบแถวทั้งแถว (insert/delete row) ยังต้องพึ่ง pushAllSheets รายชั่วโมงเหมือนเดิม
 * เพราะ onEdit ตรวจจับการเพิ่ม/ลบแถวไม่แม่นยำพอ (position ของแถวอื่นเลื่อนหมด)
 *
 * ข้อมูลจริงกระจายอยู่คนละไฟล์สเปรดชีตต่อทีม (ตาม getRoutingMap()) — onEdit ปกติผูกกับ
 * ไฟล์เดียว จึงต้องติด "installable trigger" แยกให้ทุกไฟล์ในระบบผ่าน installRealtimeTriggers()
 *
 * วางไฟล์นี้ในโปรเจกต์ GAS เดิม (ที่มี getRoutingMap + push-to-webhook.gs) แล้ว:
 *   1) ตั้ง Script Properties WEBHOOK_URL / WEBHOOK_SECRET ให้เหมือน push-to-webhook.gs
 *      (endpoint เดียวกัน — sheet-sync แยกโหมดจาก field "mode" ในตัว)
 *   2) เลือกฟังก์ชัน installRealtimeTriggers แล้ว Run ครั้งเดียว (ต้องกดอนุญาตสิทธิ์
 *      เข้าถึงทุกสเปรดชีตที่อยู่ใน routing map)
 *   3) ทุกครั้งที่เพิ่มทีม/ชีตใหม่ใน Master Config ให้รัน installRealtimeTriggers ซ้ำอีกที
 *      (กันไฟล์ใหม่ไม่มี trigger ติด)
 */

function installRealtimeTriggers() {
  const map = getRoutingMap();
  const seenIds = new Set();
  const existing = ScriptApp.getProjectTriggers().filter(
    t => t.getHandlerFunction() === 'handleRealtimeEdit'
  );

  map.forEach(item => {
    if (item.id === 'ERROR' || seenIds.has(item.id)) return;
    seenIds.add(item.id);
    try {
      const already = existing.some(t => t.getTriggerSourceId() === item.id);
      if (already) return;
      const ss = SpreadsheetApp.openById(item.id);
      ScriptApp.newTrigger('handleRealtimeEdit').forSpreadsheet(ss).onEdit().create();
      Logger.log('ติด onEdit trigger ให้ ' + ss.getName());
    } catch (e) {
      Logger.log('ติด trigger ไม่ได้ (' + item.id + '): ' + e.message);
    }
  });
}

/** ลบ trigger onEdit ทั้งหมดที่ installRealtimeTriggers ติดไว้ (เผื่อต้องปิดใช้งานชั่วคราว) */
function uninstallRealtimeTriggers() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'handleRealtimeEdit')
    .forEach(t => ScriptApp.deleteTrigger(t));
  Logger.log('ลบ onEdit trigger ทั้งหมดแล้ว');
}

function handleRealtimeEdit(e) {
  try {
    if (!e || !e.range) return;
    const editedRow = e.range.getRow();
    if (editedRow < 2) return;   // แก้หัวตาราง (row 1) — ข้าม ไม่ sync

    const editedSheet = e.range.getSheet();
    const spreadsheetId = e.source.getId();
    const tabName = editedSheet.getName();

    const item = getRoutingMap().find(m => m.id === spreadsheetId && m.tabName === tabName);
    if (!item) return;   // แก้แท็บที่ไม่ได้อยู่ใน routing (เช่น Master Config) — ข้าม

    const lastCol = editedSheet.getLastColumn();
    if (lastCol < 1) return;
    const headers = editedSheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
    const row = editedSheet.getRange(editedRow, 1, 1, lastCol).getDisplayValues()[0];
    const position = editedRow - 2;   // row 2 = แถวข้อมูลแรก = position 0 (ตรงกับ pushAllSheets)

    const props = PropertiesService.getScriptProperties();
    const url = props.getProperty('WEBHOOK_URL');
    const secret = props.getProperty('WEBHOOK_SECRET');
    if (!url || !secret) return;

    const res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-webhook-secret': secret },
      payload: JSON.stringify({
        mode: 'cell',
        team: item.source,
        label: item.label,
        headers: headers,
        position: position,
        row: row,
      }),
      muteHttpExceptions: true,
    });
    if (res.getResponseCode() >= 300) {
      Logger.log('realtime sync ล้มเหลว: ' + res.getResponseCode() + ' ' + res.getContentText());
    }
  } catch (err) {
    Logger.log('handleRealtimeEdit error: ' + err.message);
  }
}
