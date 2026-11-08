"use strict";

const fs = require("node:fs");
const path = require("node:path");
const cities = require("./cities");
const {
  FOOD_PROVIDERS,
  validateFoodProviders,
} = require("./food-images");

function titleFromUrl(url) {
  const marker = "/wiki/";
  const markerIndex = url.indexOf(marker);
  if (markerIndex === -1) {
    throw new Error(`Invalid Wikimedia source URL: ${url}`);
  }
  return decodeURIComponent(url.slice(markerIndex + marker.length)).replaceAll(
    "_",
    " ",
  );
}

function cleanAuthor(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, "")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalLicenseUrl(value) {
  return String(value || "")
    .replace(/^http:/, "https:")
    .replace(/\/deed\.en\/?$/, "/")
    .replace(/\/?$/, "/");
}

async function main() {
  validateFoodProviders(
    FOOD_PROVIDERS,
    cities.map((city) => city.id),
  );

  const foods = FOOD_PROVIDERS.flatMap((provider) =>
    Object.values(provider.regions).flat(),
  );
  const titles = foods.map((food) => titleFromUrl(food.source.url));
  const apiUrl = new URL("https://commons.wikimedia.org/w/api.php");
  apiUrl.search = new URLSearchParams({
    action: "query",
    format: "json",
    titles: titles.join("|"),
    prop: "imageinfo",
    iiprop: "url|extmetadata",
  }).toString();

  const response = await fetch(apiUrl, {
    headers: {
      "User-Agent":
        "LunchPickerFoodCatalogVerifier/0.1 (non-production asset audit)",
    },
  });
  if (!response.ok) {
    throw new Error(`Wikimedia Commons API returned ${response.status}`);
  }
  const payload = await response.json();
  const pages = new Map(
    Object.values(payload.query.pages).map((page) => [page.title, page]),
  );

  const records = [];
  const mismatches = [];

  for (const food of foods) {
    const title = titleFromUrl(food.source.url);
    const page = pages.get(title);
    const metadata = page && page.imageinfo && page.imageinfo[0]?.extmetadata;
    if (!page || page.missing !== undefined || !metadata) {
      mismatches.push(`${food.foodId}: Commons source page not resolved`);
      continue;
    }

    const actual = {
      author: cleanAuthor(metadata.Artist?.value),
      license: String(metadata.LicenseShortName?.value || ""),
      licenseUrl: canonicalLicenseUrl(metadata.LicenseUrl?.value),
    };
    const expected = {
      author: food.source.author,
      license: food.source.license,
      licenseUrl: canonicalLicenseUrl(food.source.licenseUrl),
    };
    const match =
      actual.author === expected.author &&
      actual.license === expected.license &&
      actual.licenseUrl === expected.licenseUrl;
    if (!match) {
      mismatches.push(`${food.foodId}: source metadata mismatch`);
    }
    records.push({
      regionId: food.regionId,
      foodId: food.foodId,
      sourceUrl: food.source.url,
      commonsTitle: title,
      expected,
      actual,
      match,
    });
  }

  const report = {
    schemaVersion: 1,
    checkedAt: new Date().toISOString(),
    provider: "Wikimedia Commons API",
    checked: records.length,
    mismatches,
    records,
  };
  const outputPath = path.join(
    __dirname,
    "..",
    "test-results",
    "food-source-verification.json",
  );
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(
    `food source verification: ${report.checked} checked, ` +
      `${mismatches.length} mismatches -> ${outputPath}\n`,
  );
  if (mismatches.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
