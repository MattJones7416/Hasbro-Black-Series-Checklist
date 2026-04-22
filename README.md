# Hasbro Black Series Checklist

Source-of-truth data repo for the Hasbro Black Series Checklist app.

## What lives here

- `data/Hasbro Black Series Catalog.xlsx`: the spreadsheet you can edit.
- `scripts/sync_official_urls.mjs`: fills blank `official_url` cells with the official Hasbro Black Series collection page.
- `scripts/hydrate_image_urls.mjs`: fills missing `image_url` cells from the linked ActionFigure411 product pages.
- `scripts/build_catalog.mjs`: converts the spreadsheet into app-ready JSON.
- `dist/black-series-catalog.json`: generated catalog consumed by the app.
- `dist/catalog-summary.json`: a lightweight summary of the generated output.

## Edit workflow

1. Open `data/Hasbro Black Series Catalog.xlsx`.
2. Update rows on the `Catalog` sheet.
3. Keep `item_id` unique and stable for existing rows.
4. Run `npm install` once.
5. If you want to backfill blank public links, run `npm run sync-official-links`.
6. If you added new rows without `image_url`, run `npm run hydrate-images`.
7. Run `npm run build` after each spreadsheet update.

## Important columns

- `item_id`: stable internal identifier used by the app. Do not change it for existing items.
- `type`: `Figures`, `Helmets`, or `Lightsabers`.
- `display_number`: collector-facing number shown in the app. Can be blank.
- `category`: the year bucket/group shown in the app list.
- `line`: packaging line or checklist section.
- `wave`: retailer or wave metadata.
- `release_year`: numeric release year.
- `retail_price_usd`: MSRP/reference price in USD.
- `status`: optional label, left blank in the starter seed.
- `product_url`: source/reference page used for data maintenance and image hydration.
- `official_url`: app-facing public link. If blank, the build falls back to the official Hasbro Black Series collection page.
- `active`: set to `FALSE` to omit a row from the generated app catalog without deleting it.

## Image refresh

- `npm run hydrate-images` updates blank `image_url` cells by scraping the linked `product_url` page for its canonical product image.
- `npm run sync-official-links` fills blank `official_url` cells with the official Hasbro Black Series collection page so the app opens Hasbro-owned links instead of third-party source pages.
- By default it only fills blank image cells and leaves any manual overrides alone.
- Optional flags:
  - `--overwrite`: replace existing `image_url` values too.
  - `--limit=25`: test on a subset before running the full refresh.
  - `--concurrency=8`: control how many pages are fetched in parallel.

## Starter seed

The initial spreadsheet was seeded on 2026-04-22 from the public ActionFigure411 checklist pages:

- https://www.actionfigure411.com/star-wars/black-series-checklist.php
- https://www.actionfigure411.com/star-wars/roleplay-checklist.php

The starter data currently includes figures, helmets, and Lightsabers, with the 6-inch Black Series line grouped under `Figures`.
