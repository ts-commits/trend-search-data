const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");

const SHEET_ID = process.env.GOOGLE_SHEET_ID || "1ekbwT7okBC477cjeZwZWCgXqsTM6Gg-Xyez6YGEshNQ";
const SHEET_NAME = process.env.GOOGLE_SHEET_NAME || "시트1";

const DOCS_DIR = path.join(__dirname, "..", "docs");
const SEO_DIR = path.join(DOCS_DIR, "seo");

const CATEGORY_PREFIX_MAP = {
  "광고 및 주요 시장": "market",
  "이용자 트렌드": "user",
  "미디어 트렌드": "media",
  "패션/화장품 업종 트렌드": "fashionbeauty",
  "유통 업종 트렌드": "retail",
  "식음료 업종 트렌드": "food",
  "게임 업종 트렌드": "game",
  "관광레저 업종 트렌드": "travelleisure",
  "수송 업종 트렌드": "transport",
  "금융보험 업종 트렌드": "finance"
};

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
  const category = (row.category || "").trim();
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
  return !!(item.title && item.url && item.category);
}

function buildSearchJsonItem(item, seoId) {
  return {
    id: seoId,
    title: item.title,
    source: item.source,
    url: item.url,
    type: item.type,
    category: item.category,
    summary: item.summary,
    tags: item.tags,
    keywords: item.keywords,
    updatedAt: item.updatedAt
  };
}

function buildSeoHtml(item, seoId) {
  const mergedTags = [...item.tags, ...item.keywords].filter(Boolean);
  const uniqueTags = [...new Set(mergedTags)].slice(0, 4);

  const tagsHtml = uniqueTags.length
    ? `
  <ul class="ts-seo-tags">
    ${uniqueTags.map(tag => `<li>${escapeHtml(tag)}</li>`).join("\n    ")}
  </ul>`
    : "";

  return `<!-- SEO:START ${seoId} -->
<div class="ts-seo-item" data-seo-id="${escapeHtml(seoId)}" data-category="${escapeHtml(item.category)}" data-type="${escapeHtml(item.type)}">
  <h3 class="ts-seo-title">
    <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">
      ${escapeHtml(item.title)}
    </a>
  </h3>
  <p class="ts-seo-meta">
    ${item.source ? `<span class="ts-seo-source">${escapeHtml(item.source)}</span>` : ""}
    ${item.source && item.type ? `<span class="ts-seo-dot">·</span>` : ""}
    ${item.type ? `<span class="ts-seo-type">${escapeHtml(item.type)}</span>` : ""}
  </p>
  ${item.summary ? `<p class="ts-seo-summary">${escapeHtml(item.summary)}</p>` : ""}
  ${tagsHtml}
</div>
<!-- SEO:END ${seoId} -->`;
}

function groupByCategory(items) {
  const grouped = {};
  items.forEach(item => {
    if (!grouped[item.category]) {
      grouped[item.category] = [];
    }
    grouped[item.category].push(item);
  });
  return grouped;
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
  ensureDir(SEO_DIR);

  const rawRows = await fetchSheetRows();
  const items = rawRows.map(normalizeRow).filter(isValidItem);
  const grouped = groupByCategory(items);

  const counters = {};
  const jsonOutput = [];
  const allHtmlBlocks = [];

  Object.keys(grouped).forEach(category => {
    const prefix = CATEGORY_PREFIX_MAP[category] || "item";
    counters[prefix] = 0;

    const blocks = grouped[category].map(item => {
      counters[prefix] += 1;
      const seoId = `${prefix}-${String(counters[prefix]).padStart(3, "0")}`;

      jsonOutput.push(buildSearchJsonItem(item, seoId));

      const html = buildSeoHtml(item, seoId);
      allHtmlBlocks.push(html);
      return html;
    });

    fs.writeFileSync(
      path.join(SEO_DIR, `${prefix}.html`),
      blocks.join("\n\n"),
      "utf8"
    );
  });

  fs.writeFileSync(
    path.join(DOCS_DIR, "search-data.json"),
    JSON.stringify(jsonOutput, null, 2),
    "utf8"
  );

  fs.writeFileSync(
    path.join(SEO_DIR, "all.html"),
    allHtmlBlocks.join("\n\n"),
    "utf8"
  );

  console.log("search-data.json + seo html 생성 완료");
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
