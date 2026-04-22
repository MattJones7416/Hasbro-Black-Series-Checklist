import fs from "node:fs/promises";
import path from "node:path";
import XLSX from "xlsx";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const workbookPath = path.join(repoRoot, "data", "Hasbro Black Series Catalog.xlsx");
const outputPath = path.join(repoRoot, "dist", "black-series-catalog.json");
const summaryPath = path.join(repoRoot, "dist", "catalog-summary.json");

const allowedTypes = new Set(["Figures", "Helmets", "Lightsaber Range"]);

function toOptionalString(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function toOptionalInt(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number.parseInt(String(value).trim(), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function toOptionalFloat(value) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = String(value).replace(/[$,]/g, "").trim();
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function toBoolean(value) {
  if (typeof value === "boolean") return value;
  const normalized = String(value ?? "").trim().toLowerCase();
  return !(normalized === "false" || normalized === "0" || normalized === "no" || normalized === "n" || normalized === "off" || normalized === "");
}

function normalizeType(rawType) {
  const value = toOptionalString(rawType);
  if (!value) return "Figures";
  const lower = value.toLowerCase();
  if (lower === "figures" || lower === "figure") return "Figures";
  if (lower === "helmets" || lower === "helmet") return "Helmets";
  if (lower === "lightsabers" || lower === "lightsaber" || lower === "lightsaber range") return "Lightsaber Range";
  return value;
}

function buildCatalogRow(row) {
  const itemId = toOptionalString(row.item_id);
  const type = normalizeType(row.type);
  const name = toOptionalString(row.name);
  const category = toOptionalString(row.category) || toOptionalString(row.release_year) || "Unknown";
  const line = toOptionalString(row.line);
  const wave = toOptionalString(row.wave);
  const displayNumber = toOptionalString(row.display_number);
  const releaseYear = toOptionalInt(row.release_year);
  const retailPrice = toOptionalFloat(row.retail_price_usd);
  const status = toOptionalString(row.status);
  const productUrl = toOptionalString(row.product_url);
  const imageUrl = toOptionalString(row.image_url);
  const description = toOptionalString(row.description);
  const source = toOptionalString(row.source) || "Manual";
  const sourceId = toOptionalString(row.source_id);

  if (!itemId) throw new Error(`Missing item_id for row ${JSON.stringify(row)}`);
  if (!allowedTypes.has(type)) throw new Error(`Unsupported type "${type}" for ${itemId}`);
  if (!name) throw new Error(`Missing name for ${itemId}`);

  return {
    checked: false,
    built: false,
    name,
    number: itemId,
    displayNumber,
    category,
    difficulty: null,
    sheets: null,
    link: productUrl,
    instructionsLink: "",
    type,
    status,
    threeSixtyView: "",
    modelDescription: description,
    productImage: imageUrl,
    line,
    wave,
    releaseYear,
    retailPrice,
    source,
    sourceId,
  };
}

const workbook = XLSX.readFile(workbookPath, { cellDates: true });
const sheet = workbook.Sheets["Catalog"];
if (!sheet) {
  throw new Error('Workbook is missing a "Catalog" sheet.');
}

const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
const activeRows = rows.filter((row) => toBoolean(row.active));
const catalog = activeRows.map(buildCatalogRow);

const seen = new Set();
for (const item of catalog) {
  if (seen.has(item.number)) {
    throw new Error(`Duplicate item_id detected: ${item.number}`);
  }
  seen.add(item.number);
}

const summary = {
  generatedAt: new Date().toISOString(),
  total: catalog.length,
  byType: catalog.reduce((acc, item) => {
    acc[item.type] = (acc[item.type] || 0) + 1;
    return acc;
  }, {}),
  byCategory: catalog.reduce((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + 1;
    return acc;
  }, {}),
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, JSON.stringify(catalog, null, 2) + "\n");
await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2) + "\n");

console.log(`Built ${catalog.length} catalog items -> ${outputPath}`);
