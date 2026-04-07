const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");

const SHEET_ID =
  process.env.GOOGLE_SHEET_ID || "1ekbwT7okBC477cjeZwZWCgXqsTM6Gg-Xyez6YGEshNQ";
const SHEET_NAME = process.env.GOOGLE_SHEET_NAME || "resources";

const DOCS_DIR = path.join(__dirname, "..", "docs");
const OUTPUT_PATH = path.join(DOCS_DIR, "search-data.json");

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function splitCommaText(value = "") {
  return String(value)
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function normalizePriority(value = "") {
  const num = Number(String(value).trim());
  if ([3, 2, 1, 0].includes(num)) return num;
  return 0;
}

function normalizeVisible(value = "") {
  return String(value).trim().toUpperCase() === "Y" ? "Y" : "N";
}

function parseDateToTime(value = "") {
  const raw = String(value).trim();
  if (!raw) return 0;

  const timestamp = new Date(raw).getTime();
  if (!Number.isNaN(timestamp)) return timestamp;

  return 0;
}

function normalizeRow(row) {
  const id = (row.id || "").trim();
  const priority = normalizePriority(row.priority || "");
  const title = (row.title || "").trim();
  const year = (row.year || "").trim();
  const source = (row.source || "").trim();
  const url = (row.url || "").trim();
  const type = (row.type || "").trim();
  const category = splitCommaText(row.category || "");
  const summary = (row.summary || "").trim();
  const tags = splitCommaText(row.tags || "");
  const keywords = splitCommaText(row.keywords || "");
  const updatedAt = (row.updatedAt || "").trim();
  const visible = normalizeVisible(row.visible || "");

  return {
    id,
    priority,
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
    visible
  };
}

function isValidItem(item) {
  return !!(
    item.title &&
    item.url &&
    Array.isArray(item.category) &&
    item.category.length > 0 &&
    item.visible === "Y"
  );
}

function dedupeItems(items) {
  const map = new Map();

  items.forEach((item) => {
    const key = item.id || item.url || item.title;
    if (!key) return;

    if (!map.has(key)) {
      map.set(key, item);
      return;
    }

    const existing = map.get(key);

    const currentPriority = Number(item.priority) || 0;
    const existingPriority = Number(existing.priority) || 0;

    const currentDate = parseDateToTime(item.updatedAt);
    const existingDate = parseDateToTime(existing.updatedAt);

    if (
      currentPriority > existingPriority ||
      (currentPriority === existingPriority && currentDate > existingDate)
    ) {
      map.set(key, item);
    }
  });

  return Array.from(map.values());
}

function sortItems(items) {
  return [...items].sort((a, b) => {
    if (b.priority !== a.priority) {
      return b.priority - a.priority;
    }

    const dateA = parseDateToTime(a.updatedAt);
    const dateB = parseDateToTime(b.updatedAt);

    if (dateB !== dateA) {
      return dateB - dateA;
    }

    return String(a.title || "").localeCompare(String(b.title || ""), "ko");
  });
}

function stripInternalFields(item) {
  const { visible, ...rest } = item;
  return rest;
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
    range: `${SHEET_NAME}!A:ZZ`
  });

  const values = response.data.values || [];
  if (!values.length) return [];

  const headers = values[0].map((v) => String(v).trim());

  return values.slice(1).map((row) => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index] || "";
    });
    return obj;
  });
}

async function main() {
  ensureDir(DOCS_DIR);

  const rawRows = await fetchSheetRows();

  const normalizedItems = rawRows.map(normalizeRow);
  const validItems = normalizedItems.filter(isValidItem);
  const dedupedItems = dedupeItems(validItems);
  const sortedItems = sortItems(dedupedItems).map(stripInternalFields);

  fs.writeFileSync(
    OUTPUT_PATH,
    JSON.stringify(sortedItems, null, 2),
    "utf8"
  );

  console.log("search-data.json 생성 완료");
  console.log(`rawRows: ${rawRows.length}`);
  console.log(`validItems: ${validItems.length}`);
  console.log(`dedupedItems: ${dedupedItems.length}`);
  console.log(`finalItems: ${sortedItems.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
