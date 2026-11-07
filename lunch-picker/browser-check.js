"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

const root = __dirname;
const port = Number(process.env.TEST_PORT || 4317);
const baseUrl = `http://127.0.0.1:${port}`;
const outputDir = path.join(root, "test-results");
const transparentPixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

const regionFixtures = [
  { id: "beijing", name: "北京", nameEn: "Beijing", center: { lat: 39.9042, lng: 116.4074 }, placeCount: 5 },
  { id: "shanghai", name: "上海", nameEn: "Shanghai", center: { lat: 31.2304, lng: 121.4737 }, placeCount: 5 },
  { id: "chengdu", name: "成都", nameEn: "Chengdu", center: { lat: 30.5728, lng: 104.0668 }, placeCount: 5 },
  { id: "xian", name: "西安", nameEn: "Xi'an", center: { lat: 34.3416, lng: 108.9398 }, placeCount: 5 },
  { id: "guangzhou", name: "广州", nameEn: "Guangzhou", center: { lat: 23.1291, lng: 113.2644 }, placeCount: 5 },
];

const namesByRegion = {
  beijing: ["北京烤鸭", "炸酱面馆", "铜锅涮肉", "宫廷点心", "胡同小馆"],
  shanghai: ["生煎铺", "本帮菜馆", "葱油面店", "小笼餐厅", "弄堂食堂"],
  chengdu: ["陈麻婆豆腐", "钟水饺", "龙抄手", "川味小馆", "茶馆饭铺"],
  xian: ["西安肉夹馍", "羊肉泡馍", "凉皮小馆", "biangbiang 面", "城墙面馆"],
  guangzhou: ["广州早茶", "烧腊饭店", "肠粉铺", "煲仔饭", "糖水小馆"],
};

function placesFor(regionId) {
  const region = regionFixtures.find((item) => item.id === regionId);
  return namesByRegion[regionId].map((name, index) => ({
    id: `${regionId}-${index + 1}`,
    name,
    cuisine: index % 2 === 0 ? "地方菜" : "小吃",
    lat: region.center.lat + (index - 2) * 0.006,
    lng: region.center.lng + (index - 2) * 0.006,
    address: `${region.name}示例路 ${index + 1} 号`,
    source: "OpenStreetMap",
  }));
}

async function routeJson(route, status, payload) {
  await route.fulfill({
    status,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(payload),
  });
}

async function installApiRoutes(page, options = {}) {
  await page.route("**/api/regions", (route) =>
    routeJson(route, 200, { regions: regionFixtures }),
  );

  await page.route(/\/api\/regions\/[^/]+\/places$/, async (route) => {
    const id = new URL(route.request().url()).pathname.split("/").at(-2);
    if (options.delayByRegion?.[id]) {
      await new Promise((resolve) =>
        setTimeout(resolve, options.delayByRegion[id]),
      );
    }

    if (options.failPlaces?.includes(id)) {
      await routeJson(route, 500, {
        error: { code: "PLACES_UNAVAILABLE", message: "Test failure" },
      });
      return;
    }

    const region = regionFixtures.find((item) => item.id === id);
    await routeJson(route, 200, {
      region,
      places: placesFor(id),
    });
  });

  await page.route("**/api/spin", async (route) => {
    const body = route.request().postDataJSON();
    const id = body.regionId;
    if (options.delaySpin) {
      await new Promise((resolve) => setTimeout(resolve, options.delaySpin));
    }
    const region = regionFixtures.find((item) => item.id === id);
    const places = placesFor(id);
    await routeJson(route, 200, {
      region,
      place: places[0],
    });
  });

  if (options.failTiles) {
    await page.route(/appmaptile/, (route) => route.abort());
  } else {
    await page.route(/appmaptile/, (route) =>
      route.fulfill({
        status: 200,
        contentType: "image/png",
        body: transparentPixel,
      }),
    );
  }
}

async function waitForHttp(url, timeoutMs = 20000) {
  const started = Date.now();
  let lastError;

  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(`Server did not become ready: ${lastError?.message || "timeout"}`);
}

function startServer() {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.getOutput = () => output;
  return child;
}

async function openPage(browser, viewport, options) {
  const context = await browser.newContext({
    viewport,
    reducedMotion: "reduce",
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await installApiRoutes(page, options);
  return { context, page, pageErrors };
}

async function waitForCityReady(page) {
  await page.waitForSelector("#city-select:not([disabled])");
  await page.waitForFunction(
    () => document.querySelectorAll("#city-select option").length === 5,
  );
}

async function waitForMarkers(page, count = 5) {
  await page.waitForFunction(
    (expected) =>
      document.querySelectorAll(".leaflet-marker-icon").length === expected,
    count,
  );
}

async function assertNoOverflow(page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  assert.ok(overflow <= 1, `Page overflows horizontally by ${overflow}px`);
}

const tests = [
  {
    name: "desktop core flow",
    async run(browser) {
      const { context, page, pageErrors } = await openPage(
        browser,
        { width: 1440, height: 1000 },
        {},
      );
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await waitForCityReady(page);
      await waitForMarkers(page);

      assert.equal(await page.locator("#city-select option").count(), 5);
      assert.equal(await page.locator(".place-button").count(), 5);
      assert.match(await page.locator("#city-count").textContent(), /5 城/);
      assert.match(await page.locator("#place-count").textContent(), /5 处/);
      await assertNoOverflow(page);

      await page.locator("#spin-button").click();
      await page.waitForFunction(
        () => document.querySelector("#result-name")?.textContent === "北京烤鸭",
      );
      assert.match(await page.locator("#global-status").textContent(), /北京烤鸭/);
      await page.waitForSelector(".popup-name");
      assert.equal(await page.locator(".popup-name").textContent(), "北京烤鸭");
      await page.screenshot({
        path: path.join(outputDir, "desktop-core.png"),
        fullPage: true,
      });
      assert.deepEqual(pageErrors, []);
      await context.close();
    },
  },
  {
    name: "mobile core flow",
    async run(browser) {
      const { context, page, pageErrors } = await openPage(
        browser,
        { width: 390, height: 844 },
        {},
      );
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await waitForCityReady(page);
      await waitForMarkers(page);
      await assertNoOverflow(page);
      assert.ok(
        (await page.locator("#map").boundingBox()).height >= 380,
        "Mobile map is too short",
      );

      await page.locator("#spin-button").click();
      await page.waitForFunction(
        () => document.querySelector("#result-name")?.textContent === "北京烤鸭",
      );
      await page.waitForSelector(".popup-name");
      assert.equal(await page.locator(".popup-name").textContent(), "北京烤鸭");
      await page.screenshot({
        path: path.join(outputDir, "mobile-core.png"),
        fullPage: true,
      });
      assert.deepEqual(pageErrors, []);
      await context.close();
    },
  },
  {
    name: "places failure clears stale marker and popup",
    async run(browser) {
      const { context, page, pageErrors } = await openPage(
        browser,
        { width: 1280, height: 900 },
        { failPlaces: ["chengdu"] },
      );
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await waitForCityReady(page);
      await waitForMarkers(page);

      await page.locator(".place-button").first().click();
      await page.waitForSelector(".leaflet-popup");

      await page.selectOption("#city-select", "chengdu");
      await page.waitForFunction(() =>
        document
          .querySelector("#place-status")
          ?.textContent.includes("地点加载失败"),
      );
      assert.equal(await page.locator(".leaflet-marker-icon").count(), 0);
      assert.equal(await page.locator(".leaflet-popup").count(), 0);
      assert.equal(await page.locator("#map-fallback").isVisible(), true);
      assert.equal(await page.locator("#city-select").inputValue(), "chengdu");
      assert.equal(await page.locator("#spin-button").isEnabled(), true);

      await page.locator("#spin-button").click();
      await page.waitForFunction(
        () =>
          document.querySelector("#result-name")?.textContent ===
          "陈麻婆豆腐",
      );
      assert.match(await page.locator("#result-meta").textContent(), /成都/);
      await page.screenshot({
        path: path.join(outputDir, "places-failure.png"),
        fullPage: true,
      });
      assert.deepEqual(pageErrors, []);
      await context.close();
    },
  },
  {
    name: "out-of-order city responses keep the latest city",
    async run(browser) {
      const { context, page, pageErrors } = await openPage(
        browser,
        { width: 1280, height: 900 },
        { delayByRegion: { chengdu: 700, xian: 100 } },
      );
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await waitForCityReady(page);
      await waitForMarkers(page);

      await page.selectOption("#city-select", "chengdu");
      await page.waitForTimeout(30);
      await page.selectOption("#city-select", "xian");
      await page.waitForFunction(() =>
        document.querySelector("#places-list")?.textContent.includes("西安肉夹馍"),
      );
      await page.waitForTimeout(900);

      const names = await page.locator("#places-list").textContent();
      assert.match(names, /西安肉夹馍/);
      assert.doesNotMatch(names, /陈麻婆豆腐/);
      assert.equal(await page.locator("#city-select").inputValue(), "xian");
      assert.match(await page.locator("#map-caption").textContent(), /西安/);
      assert.deepEqual(pageErrors, []);
      await context.close();
    },
  },
  {
    name: "pending spin is discarded after city switch",
    async run(browser) {
      const { context, page, pageErrors } = await openPage(
        browser,
        { width: 1280, height: 900 },
        { delaySpin: 650 },
      );
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await waitForCityReady(page);
      await waitForMarkers(page);

      await page.locator("#spin-button").click();
      await page.selectOption("#city-select", "shanghai");
      await page.waitForFunction(() =>
        document.querySelector("#places-list")?.textContent.includes("生煎铺"),
      );
      await page.waitForTimeout(800);

      assert.doesNotMatch(
        await page.locator("#result-name").textContent(),
        /北京烤鸭/,
      );
      assert.match(
        await page.locator("#result-meta").textContent(),
        /上海/,
      );
      assert.equal(await page.locator("#spin-button").isEnabled(), true);
      assert.deepEqual(pageErrors, []);
      await context.close();
    },
  },
  {
    name: "tile failure keeps markers and explains fallback",
    async run(browser) {
      const { context, page, pageErrors } = await openPage(
        browser,
        { width: 1280, height: 900 },
        { failTiles: true },
      );
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await waitForCityReady(page);
      await waitForMarkers(page);
      await page.waitForFunction(
        () => !document.querySelector("#map-fallback")?.hidden,
        null,
        { timeout: 8000 },
      );

      assert.match(
        await page.locator("#map-fallback-detail").textContent(),
        /底图暂时不可用/,
      );
      assert.equal(await page.locator(".leaflet-marker-icon").count(), 5);
      assert.deepEqual(pageErrors, []);
      await context.close();
    },
  },
];

async function main() {
  await fs.mkdir(outputDir, { recursive: true });
  const server = startServer();
  let browser;
  const report = [];

  try {
    await waitForHttp(`${baseUrl}/api/regions`);
    browser = await chromium.launch({ headless: true });

    for (const test of tests) {
      const started = Date.now();
      try {
        await test.run(browser);
        report.push({
          name: test.name,
          status: "passed",
          durationMs: Date.now() - started,
        });
        console.log(`PASS ${test.name}`);
      } catch (error) {
        report.push({
          name: test.name,
          status: "failed",
          durationMs: Date.now() - started,
          error: error.stack,
          serverOutput: server.getOutput(),
        });
        console.error(`FAIL ${test.name}`);
        throw error;
      }
    }
  } finally {
    if (browser) {
      await browser.close();
    }
    server.kill("SIGTERM");
    await new Promise((resolve) => {
      if (server.exitCode !== null) {
        resolve();
        return;
      }
      server.once("exit", resolve);
      setTimeout(resolve, 2000);
    });
    await fs.writeFile(
      path.join(outputDir, "browser-report.json"),
      `${JSON.stringify(report, null, 2)}\n`,
    );
  }

  console.log(`Browser checks passed: ${report.length}/${tests.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
