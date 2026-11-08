"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

const port = Number(process.env.TEST_PORT || 4420);
const baseUrl = `http://127.0.0.1:${port}`;
const outputDir = path.join(__dirname, "test-results");

async function waitForHttp(url, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Server did not become ready: ${url}`);
}

async function spinOnce(page, requests) {
  const before = requests.length;
  const responsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/spin" &&
      response.request().method() === "POST",
  );
  await page.locator("#spin-button").click();
  const response = await responsePromise;
  assert.equal(response.status(), 200);
  const payload = await response.json();
  const request = requests[before];
  assert.ok(request, "missing spin request log");

  await page.waitForFunction(
    (name) => document.querySelector("#result-name")?.textContent === name,
    payload.place.name,
  );
  await page.waitForFunction(
    (image) => {
      const element = document.querySelector("#result-image");
      return (
        element &&
        new URL(element.src).pathname === image &&
        element.complete &&
        element.naturalWidth > 0
      );
    },
    payload.place.food.image,
  );
  const popupSelector = `[data-place-id="${payload.place.id}"]`;
  await page.waitForSelector(`${popupSelector} .popup-name`, {
    state: "visible",
  });

  assert.equal(
    await page.locator("#result-card").getAttribute("data-place-id"),
    payload.place.id,
  );
  assert.equal(
    await page.locator(`${popupSelector} .popup-name`).textContent(),
    payload.place.name,
  );
  assert.equal(
    await page.locator(`${popupSelector} .popup-food`).evaluate((media) =>
      media.closest("[data-place-id]")?.dataset.placeId,
    ),
    payload.place.id,
  );

  return {
    placeId: payload.place.id,
    foodId: payload.place.food.foodId,
    dish: payload.place.food.dish,
    image: payload.place.food.image,
    selection: payload.selection,
    excludeCount: request.body.exclude?.length || 0,
  };
}

async function runViewport(page, label) {
  const requests = [];
  const handler = (request) => {
    if (new URL(request.url()).pathname === "/api/spin") {
      requests.push({
        body: request.postDataJSON(),
      });
    }
  };
  page.on("request", handler);

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#city-select:not([disabled])");
  await page.waitForFunction(
    () => document.querySelectorAll(".place-marker-icon").length === 5,
  );

  const results = [];
  for (let index = 0; index < 3; index += 1) {
    results.push(await spinOnce(page, requests));
  }

  assert.deepEqual(
    results.map((result) => result.excludeCount),
    [0, 1, 2],
  );
  assert.equal(new Set(results.map((result) => result.placeId)).size, 3);
  assert.equal(new Set(results.map((result) => result.foodId)).size, 3);
  assert.equal(new Set(results.map((result) => result.dish)).size, 3);
  assert.equal(new Set(results.map((result) => result.image)).size, 3);
  assert.ok(results.every((result) => result.selection.repeated === false));

  await page.screenshot({
    path: path.join(outputDir, `spin-real-${label}.png`),
    fullPage: true,
  });
  page.off("request", handler);
  return results;
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });
  const server = spawn(process.execPath, ["server.js"], {
    cwd: __dirname,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let browser;
  const report = {};
  try {
    await waitForHttp(`${baseUrl}/api/regions`);
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--single-process",
        "--no-zygote",
      ],
    });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    report.desktop = await runViewport(page, "desktop");

    await page.setViewportSize({ width: 390, height: 844 });
    report.mobile = await runViewport(page, "mobile");
    await context.close();

    await fs.writeFile(
      path.join(outputDir, "spin-real-report.json"),
      `${JSON.stringify(report, null, 2)}\n`,
    );
    console.log(JSON.stringify(report, null, 2));
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.kill("SIGTERM");
    await new Promise((resolve) => {
      if (server.exitCode !== null) return resolve();
      server.once("exit", resolve);
      setTimeout(resolve, 1500);
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
