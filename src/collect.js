/**
 * Google Play 有料カジノ ランキング自動集計
 * コムシード株式会社 5タイトル対象
 */

const gplay = require('google-play-scraper');
const { google } = require('googleapis');

// ==========================================
// 対象アプリ定義
// ==========================================
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

// ==========================================
// Google Play からランキング取得
// ==========================================
async function fetchRankings() {
  const rankings = {};
  APP_ORDER.forEach(id => rankings[id] = 201); // 201 = 圏外

  console.log('Google Play 有料カジノ ランキングを取得中...');

  const apps = await gplay.list({
    category: gplay.category.GAME_CASINO,
    collection: gplay.collection.TOP_PAID,
    num: 200,
    country: 'jp',
    lang: 'ja',
    throttle: 10,
  });

  console.log(`取得したアプリ数: ${apps.length}`);

  apps.forEach((app, i) => {
    if (TARGET_APPS[app.appId] !== undefined) {
      rankings[app.appId] = i + 1;
      console.log(`  ${i + 1}位: ${TARGET_APPS[app.appId]}`);
    }
  });

  APP_ORDER.forEach(id => {
    if (rankings[id] === 201) {
      console.log(`  圏外: ${TARGET_APPS[id]}`);
    }
  });

  return rankings;
}

// ==========================================
// Google スプレッドシートに書き込み
// ==========================================
async function writeToSheets(rankings) {
  const serviceAccountKey = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const spreadsheetId = process.env.SPREADSHEET_ID;

  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccountKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });
  const SHEET_NAME = 'ランキング推移';

  // 今日の日付 (JST)
  const now = new Date();
  const jst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  const today = `${jst.getFullYear()}/${String(jst.getMonth() + 1).padStart(2, '0')}/${String(jst.getDate()).padStart(2, '0')}`;
  const timeStr = `${String(jst.getHours()).padStart(2, '0')}:${String(jst.getMinutes()).padStart(2, '0')}`;

  // 行データ作成
  const newRow = [
    today,
    ...APP_ORDER.map(id => rankings[id] === 201 ? '圏外' : rankings[id]),
    timeStr,
  ];

  // 既存データ取得
  let rows = [];
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEET_NAME}!A:A`,
    });
    rows = response.data.values || [];
  } catch (e) {
    // シートが存在しない場合は作成
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      resource: {
        requests: [{
          addSheet: {
            properties: { title: SHEET_NAME },
          },
        }],
      },
    }).catch(() => {});
  }

  // ヘッダー行を確認・作成
  if (rows.length === 0) {
    const headers = ['日付', ...APP_ORDER.map(id => TARGET_APPS[id]), '取得時刻'];
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${SHEET_NAME}!A1`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [headers] },
    });
    console.log('ヘッダー行を作成しました');
    rows = [headers];
  }

  // 同日データの上書きチェック
  let existingRow = -1;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i] && rows[i][0] === today) {
      existingRow = i + 1;
      break;
    }
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

// ==========================================
// メイン処理
// ==========================================
async function main() {
  console.log('=== Google Play 有料カジノ ランキング集計 開始 ===');
  console.log(new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }));

  if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    throw new Error('環境変数 GOOGLE_SERVICE_ACCOUNT_KEY が設定されていません');
  }
  if (!process.env.SPREADSHEET_ID) {
    throw new Error('環境変数 SPREADSHEET_ID が設定されていません');
  }

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
