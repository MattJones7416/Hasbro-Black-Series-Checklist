import path from "node:path";
import XLSX from "xlsx";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const workbookPath = path.join(repoRoot, "data", "Hasbro Black Series Catalog.xlsx");
const officialCollectionUrl = "https://shop.hasbro.com/en-us/star-wars/black-series";
const overwrite = process.argv.includes("--overwrite");

function toOptionalString(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeType(rawType) {
  const value = toOptionalString(rawType).toLowerCase();
  if (value === "figure" || value === "figures") return "Figures";
  if (value === "helmet" || value === "helmets") return "Helmets";
  if (value === "lightsaber" || value === "lightsabers" || value === "lightsaber range") return "Lightsabers";
  return value;
}

function officialUrlForType() {
  return officialCollectionUrl;
}

const workbook = XLSX.readFile(workbookPath, { cellDates: true });
const sheet = workbook.Sheets["Catalog"];
if (!sheet) {
  throw new Error('Workbook is missing a "Catalog" sheet.');
}

const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
if (rows.length === 0) {
  throw new Error('Workbook "Catalog" sheet is empty.');
}

const headers = rows[0].map((value) => toOptionalString(value));
const typeIndex = headers.indexOf("type");
const productUrlIndex = headers.indexOf("product_url");
let officialUrlIndex = headers.indexOf("official_url");

if (typeIndex === -1 || productUrlIndex === -1) {
  throw new Error('Workbook is missing one of the required columns: type, product_url.');
}

if (officialUrlIndex === -1) {
  headers.splice(productUrlIndex + 1, 0, "official_url");
  rows[0] = headers;
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    rows[rowIndex].splice(productUrlIndex + 1, 0, "");
  }
  officialUrlIndex = productUrlIndex + 1;
}

let updatedCount = 0;
for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
  const row = rows[rowIndex];
  const currentValue = toOptionalString(row[officialUrlIndex]);
  if (currentValue && !overwrite) continue;

  const type = normalizeType(row[typeIndex]);
  row[officialUrlIndex] = officialUrlForType(type);
  updatedCount += 1;
}

const rebuiltSheet = XLSX.utils.aoa_to_sheet(rows);
for (const key of ["!cols", "!rows", "!autofilter", "!merges"]) {
  if (sheet[key]) rebuiltSheet[key] = sheet[key];
}

workbook.Sheets["Catalog"] = rebuiltSheet;
XLSX.writeFile(workbook, workbookPath);

console.log(`Synced ${updatedCount} official_url value(s) in ${workbookPath}`);
