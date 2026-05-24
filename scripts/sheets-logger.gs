// Google Apps Script — deploy as Web App
// 1. Create a new Google Sheet
// 2. Extensions → Apps Script → paste this
// 3. Deploy → New deployment → Web app
//    - Execute as: Me
//    - Who has access: Anyone
// 4. Copy the URL into src/utils/voiceLogger.ts

var SHEET_ID = '1pKd_MMwZebjErhxFmdqYzYdmQF42jf39_MqBtulv7Do';

function doPost(e) {
  var sheet = SpreadsheetApp.openById(SHEET_ID).getActiveSheet();

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Timestamp', 'Raw', 'Matched', 'Confidence', 'Distance', 'Source', 'Category', 'Confirmed']);
  }

  var data = JSON.parse(e.postData.contents);
  var logs = data.logs || [];

  for (var i = 0; i < logs.length; i++) {
    var log = logs[i];
    sheet.appendRow([
      log.ts,
      log.raw,
      log.matched || '',
      log.confidence,
      log.distance,
      log.source,
      log.category,
      log.confirmed || ''
    ]);
  }

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, count: logs.length }))
    .setMimeType(ContentService.MimeType.JSON);
}
