const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");

const SHEET_ID = process.env.GOOGLE_SHEET_ID || "1ekbwT7okBC477cjeZwZWCgXqsTM6Gg-Xyez6YGEshNQ";
const SHEET_NAME = process.env.GOOGLE_SHEET_NAME || "resources";

const DOCS_DIR = path.join(__dirname, "..", "docs");

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function splitCommaText(value = "") {
  return String(value)
    .split(",")
    .map(v => v.trim())
    .filter(Boolean);
}

function normalizeRow(row) {
  const title = (row.title || "").trim();
  const source = (row.source || "").trim();
  const url = (row.url || "").trim();
  const type = (row.type || "").trim();
  const category = splitCommaText(row.category || "");
  const summary = (row.summary || "").trim();
  const tags = splitCommaText(row.tags || "");
  const keywords = splitCommaText(row.keywords || "");
  const updatedAt = (row.updatedAt || "").trim();

  return {
    title,
    source,
    url,
    type,
    category,
    summary,
    tags,
    keywords,
    updatedAt
  };
}

function isValidItem(item) {
  return !!(item.title && item.url && item.category && item.category.length);
}
async function getSheetsClient() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"]
  });

  return google.sheets({ version: "v4", auth });
}

async function fetchSheetRows() {
  const sheets = await getSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A:Z`
  });

  const values = response.data.values || [];
  if (!values.length) return [];

  const headers = values[0].map(v => String(v).trim());
  const rows = values.slice(1).map(row => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index] || "";
    });
    return obj;
  });

  return rows;
}

async function main() {
  ensureDir(DOCS_DIR);

  const rawRows = await fetchSheetRows();
  const items = rawRows
    .map(normalizeRow)
    .filter(isValidItem);

  fs.writeFileSync(
    path.join(DOCS_DIR, "search-data.json"),
    JSON.stringify(items, null, 2),
    "utf8"
  );

  console.log("search-data.json 생성 완료");
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
