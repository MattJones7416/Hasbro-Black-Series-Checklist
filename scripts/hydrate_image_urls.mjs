import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import XLSX from "xlsx";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const workbookPath = path.join(repoRoot, "data", "Hasbro Black Series Catalog.xlsx");
const sheetName = "Catalog";
const userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";

function getFlag(name) {
  return process.argv.includes(name);
}

function getNumberArg(name, fallback) {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  if (!match) return fallback;
  const parsed = Number.parseInt(match.slice(prefix.length), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toOptionalString(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function toBoolean(value) {
  if (typeof value === "boolean") return value;
  const normalized = String(value ?? "").trim().toLowerCase();
  return !(normalized === "" || normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off");
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function deriveActionFigure411ImageUrl(pageUrl) {
  try {
    const url = new URL(pageUrl);
    if (url.hostname !== "www.actionfigure411.com" && url.hostname !== "actionfigure411.com") {
      return "";
    }
    const slug = url.pathname.split("/").filter(Boolean).pop()?.replace(/\.php$/i, "").trim();
    if (!slug) return "";
    return `${url.origin}/star-wars/images/${slug}.jpg`;
  } catch {
    return "";
  }
}

function extractImageUrl(html, pageUrl) {
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
    /"image"\s*:\s*\[\s*"([^"]+)"/i,
    /"image"\s*:\s*"([^"]+)"/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (!match?.[1]) continue;
    const decoded = decodeHtml(match[1]).replace(/\\\//g, "/").trim();
    if (!decoded) continue;
    return new URL(decoded, pageUrl).toString();
  }

  return "";
}

async function fetchImageUrl(pageUrl) {
  const derived = deriveActionFigure411ImageUrl(pageUrl);
  if (derived) {
    return derived;
  }

  const response = await fetch(pageUrl, {
    headers: {
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
      "cache-control": "no-cache",
      "pragma": "no-cache",
      "user-agent": userAgent,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const html = await response.text();
  const imageUrl = extractImageUrl(html, pageUrl);
  if (!imageUrl) {
    throw new Error("No image URL found");
  }

  return imageUrl;
}

const overwrite = getFlag("--overwrite");
const dryRun = getFlag("--dry-run");
const limit = getNumberArg("--limit", Number.MAX_SAFE_INTEGER);
const concurrency = getNumberArg("--concurrency", 8);
const sleepMs = getNumberArg("--sleep-ms", 120);

const workbook = XLSX.readFile(workbookPath);
const sheet = workbook.Sheets[sheetName];

if (!sheet) {
  throw new Error(`Workbook is missing the "${sheetName}" sheet.`);
}

const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
if (rows.length < 2) {
  throw new Error("Workbook has no data rows.");
}

const headers = rows[0].map((value) => String(value).trim());
const imageColumn = headers.indexOf("image_url");
const urlColumn = headers.indexOf("product_url");
const activeColumn = headers.indexOf("active");
const itemIdColumn = headers.indexOf("item_id");

if (imageColumn === -1 || urlColumn === -1 || activeColumn === -1 || itemIdColumn === -1) {
  throw new Error("Workbook is missing one of the required columns: item_id, product_url, image_url, active.");
}

const targets = [];
for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
  const row = rows[rowIndex];
  const productUrl = toOptionalString(row[urlColumn]);
  const imageUrl = toOptionalString(row[imageColumn]);
  const active = toBoolean(row[activeColumn]);
  const itemId = toOptionalString(row[itemIdColumn]);

  if (!active || !productUrl || !itemId) continue;
  if (!overwrite && imageUrl) continue;

  targets.push({
    rowIndex,
    itemId,
    productUrl,
    currentImageUrl: imageUrl,
  });
}

const selectedTargets = targets.slice(0, limit);
let cursor = 0;
let completed = 0;
let updated = 0;
const failures = [];

async function worker() {
  while (true) {
    const currentIndex = cursor;
    cursor += 1;
    if (currentIndex >= selectedTargets.length) return;

    const target = selectedTargets[currentIndex];

    try {
      const imageUrl = await fetchImageUrl(target.productUrl);
      if (imageUrl !== target.currentImageUrl) {
        const cellAddress = XLSX.utils.encode_cell({ r: target.rowIndex, c: imageColumn });
        sheet[cellAddress] = { t: "s", v: imageUrl };
        updated += 1;
      }
    } catch (error) {
      failures.push({
        itemId: target.itemId,
        productUrl: target.productUrl,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    completed += 1;
    if (completed % 25 === 0 || completed === selectedTargets.length) {
      console.log(`Processed ${completed}/${selectedTargets.length} rows`);
    }

    if (sleepMs > 0) {
      await delay(sleepMs);
    }
  }
}

await Promise.all(Array.from({ length: Math.min(concurrency, selectedTargets.length || 1) }, () => worker()));

if (!dryRun) {
  XLSX.writeFile(workbook, workbookPath);
}

console.log(`Hydrated ${updated} image URLs${dryRun ? " (dry run)" : ""}.`);
if (failures.length) {
  console.log(`Failed rows: ${failures.length}`);
  for (const failure of failures.slice(0, 25)) {
    console.log(`- ${failure.itemId}: ${failure.error}`);
  }
  if (failures.length > 25) {
    console.log(`...and ${failures.length - 25} more`);
  }
}
