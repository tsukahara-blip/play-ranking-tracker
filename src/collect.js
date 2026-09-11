/**
 * Google Play 有料カジノ ランキング自動集計
 * コムシード株式会社 5タイトル対象
 */

const { chromium } = require('playwright');
const { google } = require('googleapis');

const TARGET_APPS = {
  'net.commseed.pssinoni3':     'スマスロ 新鬼武者3',
  'net.commseed.p_sg8':         'P戦国乙女7 終焉の関ヶ原 平和',
  'net.commseed.psvvv2':        'パチスロ 革命機ヴァルヴレイヴ2',
  'net.commseed.pskaguya':      'パチスロ かぐや様は告らせたい',
  'net.commseed.karakuri2maou': 'eフィーバーからくりサーカス2 魔王ver.',
};

const APP_ORDER = [
  'net.commseed.pssinoni3',
  'net.commseed.p_sg8',
  'net.commseed.psvvv2',
  'net.commseed.pskaguya',
  'net.commseed.karakuri2maou',
];

async function fetchRankings() {
  const rankings = {};
  APP_ORDER.forEach(id => rankings[id] = 201);

  const browser = await chromium.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    locale: 'ja-JP',
    extraHTTPHeaders: { 'Accept-Language': 'ja,en-US;q=0.9' },
  });

  const page = await context.newPage();
  let rankingData = null;

  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('batchexecute') && url.includes('vyAe2')) {
      try {
        const text = await response.text();
        if (text.length > 1000) {
          rankingData = text;
          console.log(`batchexecute レスポンス取得: ${text.length} bytes`);
        }
      } catch (e) {}
    }
  });

  console.log('Google Play に移動中...');
  await page.goto('https://play.google.com/store/apps/category/GAME_CASINO?hl=ja&gl=JP', {
    waitUntil: 'networkidle',
    timeout: 60000,
  });

  try {
    const paidTab = await page.locator('text=有料').first();
    await paidTab.waitFor({ timeout: 10000 });
    await paidTab.click();
    console.log('「有料」タブをクリックしました');
    await page.waitForTimeout(4000);
  } catch (e) {
    console.log('「有料」タブが見つかりません:', e.message);
    await page.screenshot({ path: 'debug.png' });
  }

  await browser.close();

  if (!rankingData) {
    throw new Error('ランキングデータを取得できませんでした。debug.png を確認してください。');
  }

  const allIds = [];
  const seen = {};
  const marker = '",7]';
  let idx = 0;

  while (true) {
    const pos = rankingData.indexOf(marker, idx);
    if (pos < 0) break;
    let start = pos - 1;
    let found = false;
    for (let i = start; i >= Math.max(0, pos - 120); i--) {
      if (rankingData[i] === '"') { start = i + 1; found = true; break; }
    }
    if (found) {
      const appId = rankingData.substring(start, pos);
      if (/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+)+$/.test(appId) &&
          appId.length < 100 && !seen[appId]) {
        seen[appId] = true;
        allIds.push(appId);
      }
    }
    idx = pos + marker.length;
  }

  console.log(`抽出されたアプリ数: ${allIds.length}`);

  allIds.forEach((appId, i) => {
    if (TARGET_APPS[appId] !== undefined) {
      rankings[appId] = i + 1;
      console.log(`  ${i + 1}位: ${TARGET_APPS[appId]}`);
    }
  });

  APP_ORDER.forEach(id => {
    if (rankings[id] === 201) console.log(`  圏外: ${TARGET_APPS[id]}`);
  });

  return rankings;
}

async function writeToSheets(rankings) {
  const serviceAccountKey = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const spreadsheetId = process.env.SPREADSHEET_ID;

  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccountKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });
  const SHEET_NAME = 'ランキング推移';

  const now = new Date();
  const jst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  const today = `${jst.getFullYear()}/${String(jst.getMonth() + 1).padStart(2, '0')}/${String(jst.getDate()).padStart(2, '0')}`;
  const timeStr = `${String(jst.getHours()).padStart(2, '0')}:${String(jst.getMinutes()).padStart(2, '0')}`;

  const newRow = [
    today,
    ...APP_ORDER.map(id => rankings[id] === 201 ? '圏外' : rankings[id]),
    timeStr,
  ];

  let rows = [];
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEET_NAME}!A:A`,
    });
    rows = response.data.values || [];
  } catch (e) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      resource: { requests: [{ addSheet: { properties: { title: SHEET_NAME } } }] },
    }).catch(() => {});
  }

  if (rows.length === 0) {
    const headers = ['日付', ...APP_ORDER.map(id => TARGET_APPS[id]), '取得時刻'];
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${SHEET_NAME}!A1`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [headers] },
    });
    rows = [headers];
  }

  let existingRow = -1;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i] && rows[i][0] === today) { existingRow = i + 1; break; }
  }

  if (existingRow > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_NAME}!A${existingRow}`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [newRow] },
    });
    console.log(`${today} のデータを更新しました (行${existingRow})`);
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${SHEET_NAME}!A1`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [newRow] },
    });
    console.log(`${today} のデータを追記しました`);
  }

  console.log('書き込みデータ:', newRow);
}

async function main() {
  console.log('=== Google Play 有料カジノ ランキング集計 開始 ===');
  console.log(new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }));

  if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY)
    throw new Error('環境変数 GOOGLE_SERVICE_ACCOUNT_KEY が設定されていません');
  if (!process.env.SPREADSHEET_ID)
    throw new Error('環境変数 SPREADSHEET_ID が設定されていません');

  const rankings = await fetchRankings();
  console.log('\nランキング結果:', rankings);

  await writeToSheets(rankings);
  console.log('=== 完了 ===');
}

main().catch(e => {
  console.error('エラー:', e.message);
  console.error(e.stack);
  process.exit(1);
});
