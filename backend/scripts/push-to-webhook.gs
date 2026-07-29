/**
 * push-to-webhook.gs — ส่ง snapshot ทุกชีตเข้า Supabase Edge Function `sheet-sync`
 * วางในโปรเจกต์ GAS เดิม (ที่มี getRoutingMap). แทน export→import แบบไฟล์
 *
 * ตั้งค่า Script Properties ก่อน (Project Settings → Script Properties):
 *   WEBHOOK_URL    = https://fxjaeqeuxdlnwyxwrozf.supabase.co/functions/v1/sheet-sync
 *   WEBHOOK_SECRET = <ค่าเดียวกับ SHEET_SYNC_SECRET ที่ตั้งใน Supabase>
 *
 * รันมือ: เลือก pushAllSheets แล้ว Run
 * ตั้ง trigger อัตโนมัติ: รัน installHourlyPush ครั้งเดียว (ส่งทุกชั่วโมง)
 */

function pushAllSheets() {
  const props  = PropertiesService.getScriptProperties();
  const url    = props.getProperty('WEBHOOK_URL');
  const secret = props.getProperty('WEBHOOK_SECRET');
  if (!url || !secret) throw new Error('ตั้ง WEBHOOK_URL + WEBHOOK_SECRET ใน Script Properties ก่อน');

  const map = getRoutingMap();
  const sheets = [];

  map.forEach(item => {
    if (item.id === 'ERROR') return;
    try {
      const ss = SpreadsheetApp.openById(item.id);
      const sheet = ss.getSheetByName(item.tabName);
      if (!sheet || sheet.getLastRow() < 1) return;
      const data = sheet.getDataRange().getDisplayValues();
      sheets.push({
        team:    item.source,
        label:   item.label,
        headers: data[0] || [],
        rows:    data.slice(1),
      });
    } catch (e) {
      Logger.log('skip ' + item.name + ': ' + e.message);
    }
  });

  const res = UrlFetchApp.fetch(url, {
    method:      'post',
    contentType: 'application/json',
    headers:     { 'x-webhook-secret': secret },
    payload:     JSON.stringify({ sheets: sheets }),
    muteHttpExceptions: true,
  });

  const code = res.getResponseCode();
  const body = res.getContentText();
  Logger.log('HTTP ' + code + ' — ' + body);
  if (code >= 300) throw new Error('webhook ล้มเหลว: ' + code + ' ' + body);
  return body;
}

/** ตั้ง trigger รายชั่วโมง (รันครั้งเดียว). ลบของเก่าก่อนกันซ้ำ */
function installHourlyPush() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'pushAllSheets')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('pushAllSheets').timeBased().everyHours(1).create();
  Logger.log('ตั้ง trigger pushAllSheets ทุกชั่วโมงแล้ว');
}
