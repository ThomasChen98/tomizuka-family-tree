/**
 * Google Apps Script backend for survey.html.
 *
 * Setup (once): see README. To UPDATE an existing deployment without changing
 * its URL: Apps Script editor → paste this file → Deploy → Manage deployments
 * → ✏️ edit → Version: "New version" → Deploy. The first run after adding the
 * photo-upload feature asks for a new Drive authorization — approve it.
 *
 * Endpoints:
 *   POST — appends a survey response; if photo_data (base64 JPEG data-URL)
 *          is present, saves it to Drive folder "TomiTreePhotos" (anyone with
 *          link can view) and records the Drive URL in photo_url.
 *   GET  — returns all responses as CSV, email column excluded.
 */

const SHEET_NAME = 'responses';
// 'homepage' is appended at the END so pre-existing rows stay aligned.
const FIELDS = ['name', 'email', 'advisor', 'status', 'grad_year',
  'is_professor', 'affiliation', 'title', 'note', 'bio', 'photo_url',
  'source', 'homepage'];

function doPost(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const p = e.parameter || {};

  if (p.photo_data && p.photo_data.indexOf('base64,') > -1) {
    try {
      const bytes = Utilities.base64Decode(p.photo_data.split('base64,')[1]);
      const safe = (p.name || 'photo').replace(/[^\w\- ]/g, '').trim() || 'photo';
      const blob = Utilities.newBlob(bytes, 'image/jpeg', safe + '.jpg');
      const file = getFolder_().createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      p.photo_url = 'https://drive.google.com/uc?export=download&id=' + file.getId();
    } catch (err) {
      // keep whatever photo_url the form carried
    }
  }

  sheet.appendRow([new Date()].concat(FIELDS.map(function (f) { return p[f] || ''; })));
  return ContentService.createTextOutput('ok');
}

function getFolder_() {
  const it = DriveApp.getFoldersByName('TomiTreePhotos');
  return it.hasNext() ? it.next() : DriveApp.createFolder('TomiTreePhotos');
}

// GET returns the responses as CSV (email column excluded) for the site build.
function doGet(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const values = sheet.getDataRange().getValues();
  const header = ['timestamp'].concat(FIELDS);
  const emailIdx = header.indexOf('email');
  const rows = values.map(function (r, i) {
    // pad old rows that predate newly appended columns
    const row = i === 0 ? header : header.map(function (_, j) {
      return j < r.length ? r[j] : '';
    });
    return row.filter(function (_, j) { return j !== emailIdx; })
      .map(function (c) {
        const s = String(c).replace(/"/g, '""');
        return /[",\n]/.test(s) ? '"' + s + '"' : s;
      }).join(',');
  });
  return ContentService.createTextOutput(rows.join('\n'))
    .setMimeType(ContentService.MimeType.CSV);
}
