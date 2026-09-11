/**
 * Google Play 有料カジノ ランキング 過去データ バックフィル
 * 2026/08/11 〜 2026/09/10 の31日分を挿入する（1回限り実行）
 */

const { google } = require('googleapis');

const HISTORICAL_DATA = [
  ['2026/08/11',  2,    15,  1,  9,    13,    '09:00'],
  ['2026/08/12',  2,    19,  1,  10,   16,    '09:00'],
  ['2026/08/13',  2,    16,  1,  11,   '圏外', '09:00'],
  ['2026/08/14',  2,    14,  1,  '圏外','圏外', '09:00'],
  ['2026/08/15',  3,    15,  1,  8,    11,    '09:00'],
  ['2026/08/16',  2,    20,  1,  8,    18,    '09:00'],
  ['2026/08/17',  3,    24,  1,  9,    19,    '09:00'],
  ['2026/08/18',  3,    21,  1,  9,    25,    '09:00'],
  ['2026/08/19',  4,    12,  1,  9,    14,    '09:00'],
  ['2026/08/20',  4,    12,  1,  9,    14,    '09:00'],
  ['2026/08/21',  3,    13,  1,  9,    15,    '09:00'],
  ['2026/08/22',  3,    15,  1,  12,   17,    '09:00'],
  ['2026/08/23',  3,    15,  1,  11,   17,    '09:00'],
  ['2026/08/24',  3,    14,  1,  9,    16,    '09:00'],
  ['2026/08/25',  2,    11,  1,  '圏外', 13,  '09:00'],
  ['2026/08/26',  2,    14,  1,  9,    16,    '09:00'],
  ['2026/08/27',  2,    14,  1,  9,    16,    '09:00'],
  ['2026/08/28',  3,    14,  1,  10,   16,    '09:00'],
  ['2026/08/29',  4,    14,  1,  8,    16,    '09:00'],
  ['2026/08/30',  3,    13,  1,  9,    16,    '09:00'],
  ['2026/08/31',  3,    13,  1,  9,    15,    '09:00'],
  ['2026/09/01',  3,    13,  1,  7,    15,    '09:00'],
  ['2026/09/02',  3,    13,  1,  7,    15,    '09:00'],
  ['2026/09/03',  3,    12,  1,  7,    '圏外', '09:00'],
  ['2026/09/04',  3,    12,  1,  7,    '圏外', '09:00'],
  ['2026/09/05',  3,    12,  1,  7,    '圏外', '09:00'],
  ['2026/09/06',  3,    8,   1,  '圏外','圏外', '09:00'],
  ['2026/09/07',  5,    7,   2,  '圏外','圏外', '09:00'],
  ['2026/09/08',  5,    7,   2,  '圏外','圏外', '09:00'],
  ['2026/09/09',  '圏外', 4, 5,  '圏外','圏外', '09:00'],
  ['2026/09/10',  '圏外', 4, 19, '圏外','圏外', '09:00'],
];

const SHEET_NAME = 'ランキング推移';

async function main() {
  console.log('=== バックフィル開始 ===');
  console.log(`挿入件数: ${HISTORICAL_DATA.length} 件`);

  const serviceAccountKey = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const spreadsheetId = process.env.SPREADSHEET_ID;

  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccountKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAME}!A:G`,
  });
  const existing = response.data.values || [];
  console.log(`現在の行数: ${existing.length}`);

  if (existing.length === 0) {
    console.error('ヘッダー行が存在しません。先に collect.js を実行してください。');
    process.exit(1);
  }

  const existingDates = new Set();
  for (let i = 1; i < existing.length; i++) {
    if (existing[i] && existing[i][0]) existingDates.add(existing[i][0]);
  }
  console.log('既存の日付:', [...existingDates]);

  const toInsert = HISTORICAL_DATA.filter(row => !existingDates.has(row[0]));
  console.log(`新規挿入: ${toInsert.length} 件`);

  if (toInsert.length === 0) {
    console.log('挿入するデータがありません。終了します。');
    return;
  }

  const existingDataRows = existing.slice(1);
  const allRows = [...existingDataRows, ...toInsert];
  allRows.sort((a, b) => (a[0] || '').localeCompare(b[0] || ''));

  const allValues = [existing[0], ...allRows];
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${SHEET_NAME}!A1`,
    valueInputOption: 'USER_ENTERED',
    resource: { values: allValues },
  });

  console.log(`完了: 合計 ${allRows.length} 行を書き込みました`);
  console.log('=== バックフィル完了 ===');
}

main().catch(e => {
  console.error('エラー:', e.message);
  process.exit(1);
});
