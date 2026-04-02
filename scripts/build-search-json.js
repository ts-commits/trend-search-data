const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const SHEET_NAME = 'resources';
const OUTPUT_DIR = path.join(__dirname, '..', 'docs');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'search-data.json');

function splitPipe(value) {
  if (!value) return [];
  return String(value)
    .split(/[|,·\/]/)
    .map(v => v.trim())
    .filter(Boolean);
}

function normalizeDate(value) {
  if (!value) return '';
  return String(value).trim();
}

function normalizeText(value) {
  if (!value) return '';
  return String(value).trim();
}

function normalizeRow(row, headerMap) {
  const id = normalizeText(row[headerMap.id] || '');
  const title = normalizeText(row[headerMap.title] || '');
  const year = normalizeText(row[headerMap.year] || '');
  const source = normalizeText(row[headerMap.source] || '');
  const url = normalizeText(row[headerMap.url] || '');
  const type = normalizeText(row[headerMap.type] || '');
  const category = normalizeText(row[headerMap.category] || '');
  const summary = normalizeText(row[headerMap.summary] || '');
  const tags = splitPipe(row[headerMap.tags] || '');
  const keywords = splitPipe(row[headerMap.keywords] || '');
  const updatedAt = normalizeDate(row[headerMap.updatedAt] || '');

  return {
    id,
    title,
    year,
    source,
    url,
    type,
    category,
    summary,
    tags,
    keywords,
    updatedAt,
    searchText: [
      title,
      year,
      source,
      type,
      category,
      summary,
      ...tags,
      ...keywords
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
  };
}

async function main() {
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;

  if (!keyJson) throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_KEY');
  if (!spreadsheetId) throw new Error('Missing GOOGLE_SHEETS_ID');

  const credentials = JSON.parse(keyJson);

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
  });

  const sheets = google.sheets({ version: 'v4', auth });

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAME}!A:Z`
  });

  const values = response.data.values || [];
  if (!values.length) {
    throw new Error('Sheet is empty');
  }

  const headers = values[0].map((v) => String(v).trim());
  const rows = values.slice(1);

  const headerMap = {
    id: headers.indexOf('id'),
    title: headers.indexOf('title'),
    year: headers.indexOf('year'),
    source: headers.indexOf('source'),
    url: headers.indexOf('url'),
    type: headers.indexOf('type'),
    category: headers.indexOf('category'),
    summary: headers.indexOf('summary'),
    tags: headers.indexOf('tags'),
    keywords: headers.indexOf('keywords'),
    updatedAt: headers.indexOf('updatedAt')
  };

  for (const [key, idx] of Object.entries(headerMap)) {
    if (idx === -1) {
      throw new Error(`Missing required header: ${key}`);
    }
  }

  const items = rows
    .map((row) => normalizeRow(row, headerMap))
    .filter((item) => item.title && item.url);

  items.sort((a, b) => {
    const da = a.updatedAt || '';
    const db = b.updatedAt || '';
    return db.localeCompare(da);
  });

  const payload = {
    updatedAt: new Date().toISOString(),
    count: items.length,
    items
  };

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(payload, null, 2), 'utf8');

  const noJekyllPath = path.join(OUTPUT_DIR, '.nojekyll');
  if (!fs.existsSync(noJekyllPath)) {
    fs.writeFileSync(noJekyllPath, '', 'utf8');
  }

  console.log(`Built ${items.length} items`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
