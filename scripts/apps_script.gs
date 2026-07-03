/**
 * Google Apps Script backend for survey.html.
 *
 * Setup (once, ~2 minutes):
 *   1. Create a Google Sheet named "Tomi Tree Responses"; add a sheet tab
 *      called "responses" with header row:
 *      timestamp,name,email,advisor,status,grad_year,is_professor,affiliation,title,note,bio,photo_url,source
 *   2. Extensions → Apps Script → paste this file.
 *   3. Deploy → New deployment → type "Web app" →
 *      Execute as: Me · Who has access: Anyone.
 *   4. Copy the web-app URL into APPS_SCRIPT_URL at the top of survey.html.
 *
 * The GitHub Action (or a manual run of build_data.py) pulls
 *   <web-app-url>?format=csv
 * and passes it to scripts/build_data.py --survey.
 */

const SHEET_NAME = 'responses';
const FIELDS = ['name', 'email', 'advisor', 'status', 'grad_year',
  'is_professor', 'affiliation', 'title', 'note', 'bio', 'photo_url', 'source'];

function doPost(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const p = e.parameter || {};
  sheet.appendRow([new Date()].concat(FIELDS.map(function (f) { return p[f] || ''; })));
  return ContentService.createTextOutput('ok');
}

// GET returns the responses as CSV (email column excluded) for the site build.
function doGet(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const values = sheet.getDataRange().getValues();
  const header = ['timestamp'].concat(FIELDS);
  const emailIdx = header.indexOf('email');
  const rows = values.map(function (r, i) {
    const row = i === 0 ? header : r;
    return row.filter(function (_, j) { return j !== emailIdx; })
      .map(function (c) {
        const s = String(c).replace(/"/g, '""');
        return /[",\n]/.test(s) ? '"' + s + '"' : s;
      }).join(',');
  });
  return ContentService.createTextOutput(rows.join('\n'))
    .setMimeType(ContentService.MimeType.CSV);
}
