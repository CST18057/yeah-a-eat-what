"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const cities = require("./cities");
const {
  FOOD_PROVIDERS,
  validateFoodProviders,
} = require("./food-images");

validateFoodProviders(
  FOOD_PROVIDERS,
  cities.map((city) => city.id),
);

const foods = FOOD_PROVIDERS.flatMap((provider) =>
  Object.values(provider.regions).flat(),
);
const licenseCounts = {};
const regions = {};
const images = [];

for (const food of foods) {
  const filename = path.basename(food.image);
  const filePath = path.join(__dirname, "..", "public", "food", filename);
  const bytes = fs.readFileSync(filePath);
  const record = {
    regionId: food.regionId,
    foodId: food.foodId,
    dish: food.dish,
    image: food.image,
    bytes: bytes.length,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    author: food.source.author,
    license: food.source.license,
    licenseUrl: food.source.licenseUrl,
    sourceUrl: food.source.url,
  };
  images.push(record);

  regions[food.regionId] ||= {
    candidates: 0,
    uniqueDishes: new Set(),
    uniqueImages: new Set(),
  };
  regions[food.regionId].candidates += 1;
  regions[food.regionId].uniqueDishes.add(food.dish);
  regions[food.regionId].uniqueImages.add(food.image);
  licenseCounts[food.source.license] =
    (licenseCounts[food.source.license] || 0) + 1;
}

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  providers: FOOD_PROVIDERS.map((provider) => ({
    id: provider.id,
    name: provider.name,
  })),
  totals: {
    regions: Object.keys(regions).length,
    foodCandidates: foods.length,
    uniqueFoodIds: new Set(foods.map((food) => food.foodId)).size,
    uniqueImages: new Set(foods.map((food) => food.image)).size,
    imageBytes: images.reduce((sum, image) => sum + image.bytes, 0),
  },
  licenseCounts,
  regions: Object.fromEntries(
    Object.entries(regions).map(([regionId, value]) => [
      regionId,
      {
        candidates: value.candidates,
        uniqueDishes: value.uniqueDishes.size,
        uniqueImages: value.uniqueImages.size,
      },
    ]),
  ),
  images,
};

const outputPath = path.join(
  __dirname,
  "..",
  "test-results",
  "food-catalog-audit.json",
);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(
  `food catalog audit: ${report.totals.regions} regions, ` +
    `${report.totals.foodCandidates} candidates -> ${outputPath}\n`,
);
