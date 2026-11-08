"use strict";

process.env.TEST_PORT =
  process.env.CROSS_FEATURE_PORT || process.env.TEST_PORT || "4318";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");
const {
  assertNoOverflow,
  baseUrl,
  exploreState,
  mapState,
  openPage,
  outputDir,
  startServer,
  waitForCityReady,
  waitForHttp,
  zoomWorldMapWithControls,
  zoomWorldMapWithWheel,
} = require("./browser-check");
const evidenceSuffix = process.env.EVIDENCE_SUFFIX
  ? `-${process.env.EVIDENCE_SUFFIX.replace(/[^a-z0-9-]/gi, "")}`
  : "";

async function lunchState(page) {
  return {
    cityId: await page.locator("#city-select").inputValue(),
    placesText: await page.locator("#places-list").textContent(),
    resultName: await page.locator("#result-name").textContent(),
    resultMeta: await page.locator("#result-meta").textContent(),
    resultPlaceId: await page
      .locator("#result-card")
      .getAttribute("data-place-id"),
    resultImage: await page
      .locator("#result-card")
      .getAttribute("data-food-image"),
    placeMarkers: await page.locator(".place-marker-icon").count(),
    cityMarkers: await page.locator(".city-marker").count(),
  };
}

async function spinBeijing(page) {
  await page.locator("#spin-button").click();
  await page.waitForFunction(
    () => document.querySelector("#result-name")?.textContent === "北京烤鸭",
  );
  await page.waitForFunction(() => {
    const image = document.querySelector("#result-image");
    return image && !image.hidden && image.complete && image.naturalWidth > 0;
  });
}

async function fillCitySearch(page, value) {
  const input = page.locator("#city-search");
  await input.focus();
  await input.fill(value);
  if ((await input.inputValue()) !== value) {
    await input.evaluate((element, nextValue) => {
      element.value = nextValue;
      element.dispatchEvent(new Event("input", { bubbles: true }));
    }, value);
  }
}

async function openTokyoCandidate(page) {
  await fillCitySearch(page, "tok");
  await page.waitForFunction(
    () =>
      document.querySelector(".search-result-button")?.dataset.cityId ===
      "tokyo",
  );
  await page.locator('.search-result-button[data-city-id="tokyo"]').click();
  await page.waitForFunction(
    () => !document.querySelector("#candidate-preview")?.hidden,
  );
}

const tests = [
  {
    name: "exploration is isolated from lunch state and candidate preview clears it",
    async run(browser) {
      const { context, page, pageErrors, apiRequests } = await openPage(
        browser,
        { width: 1280, height: 900 },
        {},
      );
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await waitForCityReady(page);
      await spinBeijing(page);
      await page.waitForSelector(".leaflet-popup-close-button");
      await page.locator(".leaflet-popup-close-button").click();

      const baseline = await lunchState(page);
      apiRequests.length = 0;
      await page.locator("#world-view-button").click();
      await zoomWorldMapWithWheel(page, 4);
      await page.locator("#explore-button").click();
      await page.waitForFunction(
        () =>
          document.querySelector("#explore-toolbar")?.dataset.status ===
          "ready",
      );

      const ready = await exploreState(page);
      assert.deepEqual(await lunchState(page), baseline);
      assert.equal(ready.source, "network");
      assert.equal(await page.locator(".explore-marker").count(), 3);
      assert.equal(
        await page.locator("#world-view-button").getAttribute("aria-pressed"),
        "true",
      );
      assert.equal(
        apiRequests.filter(
          (request) => request.pathname === "/api/explore",
        ).length,
        1,
      );
      assert.equal(
        apiRequests.filter((request) =>
          request.pathname.endsWith("/places"),
        ).length,
        0,
      );
      assert.equal(
        apiRequests.filter(
          (request) => request.pathname === "/api/spin",
        ).length,
        0,
      );

      await page.locator(".explore-marker").first().click();
      await page.waitForSelector(".explore-popup-name", { state: "attached" });
      assert.match(
        await page.locator(".explore-popup-source").textContent(),
        /探索地点 · OpenStreetMap/,
      );
      await page.locator(".leaflet-popup-close-button").click();

      const requestsBeforePreview = apiRequests.length;
      await openTokyoCandidate(page);
      assert.equal((await exploreState(page)).status, "idle");
      assert.equal(await page.locator("#explore-toolbar").isVisible(), false);
      assert.equal(await page.locator(".explore-marker").count(), 0);
      assert.equal(
        await page.locator("#world-view-button").getAttribute("aria-pressed"),
        "false",
      );
      assert.equal(
        await page
          .locator("#candidate-preview")
          .getAttribute("data-candidate-id"),
        "tokyo",
      );
      assert.equal(await page.locator("#city-select").inputValue(), "beijing");
      assert.equal(
        await page.locator("#result-name").textContent(),
        "北京烤鸭",
      );
      assert.equal(apiRequests.length, requestsBeforePreview);

      await page.locator("#cancel-city-button").click();
      await page.waitForFunction(
        () => document.querySelector("#candidate-preview")?.hidden === true,
      );
      assert.match(await page.locator("#map-caption").textContent(), /北京/);
      assert.equal(await page.locator(".explore-marker").count(), 0);

      await page.screenshot({
        path: path.join(outputDir, "cross-feature-desktop.png"),
        fullPage: true,
      });
      await fs.writeFile(
        path.join(outputDir, "cross-feature-isolation.json"),
        `${JSON.stringify(
          {
            baseline,
            exploreReady: ready,
            exploreRequests: apiRequests.filter(
              (request) => request.pathname === "/api/explore",
            ),
            candidatePreviewClearedExplore: true,
          },
          null,
          2,
        )}\n`,
      );
      assert.deepEqual(pageErrors, []);
      await context.close();
    },
  },
  {
    name: "candidate preview aborts an in-flight exploration request",
    async run(browser) {
      const { context, page, pageErrors, apiRequests } = await openPage(
        browser,
        { width: 1280, height: 900 },
        { exploreDelay: 1400 },
      );
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await waitForCityReady(page);
      await spinBeijing(page);
      await page.locator(".leaflet-popup-close-button").click();
      const baseline = await lunchState(page);
      apiRequests.length = 0;

      await page.locator("#world-view-button").click();
      await zoomWorldMapWithWheel(page, 4);
      await page.locator("#explore-button").click();
      await page.waitForFunction(
        () =>
          document.querySelector("#explore-toolbar")?.dataset.status ===
          "loading",
      );

      await openTokyoCandidate(page);
      assert.equal((await exploreState(page)).status, "idle");
      assert.equal(await page.locator("#explore-toolbar").isVisible(), false);
      assert.equal(await page.locator(".explore-marker").count(), 0);
      await page.waitForTimeout(1600);
      assert.equal((await exploreState(page)).status, "idle");
      assert.equal(await page.locator(".explore-marker").count(), 0);
      assert.deepEqual(await lunchState(page), baseline);
      assert.equal(
        apiRequests.filter(
          (request) => request.pathname === "/api/explore",
        ).length,
        1,
      );
      assert.equal(
        apiRequests.filter((request) =>
          request.pathname.endsWith("/places"),
        ).length,
        0,
      );

      await fs.writeFile(
        path.join(outputDir, "cross-feature-inflight-abort.json"),
        `${JSON.stringify(
          {
            baseline,
            candidate: "tokyo",
            lateExploreState: await exploreState(page),
            exploreRequests: apiRequests.filter(
              (request) => request.pathname === "/api/explore",
            ),
            placeRequests: apiRequests.filter((request) =>
              request.pathname.endsWith("/places"),
            ),
          },
          null,
          2,
        )}\n`,
      );
      assert.deepEqual(pageErrors, []);
      await context.close();
    },
  },
  {
    name: "confirmation after exploration switches once and resets lunch state",
    async run(browser) {
      const { context, page, pageErrors, apiRequests } = await openPage(
        browser,
        { width: 1280, height: 900 },
        { delayByRegion: { tokyo: 400 } },
      );
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await waitForCityReady(page);
      await spinBeijing(page);
      await page.locator(".leaflet-popup-close-button").click();

      await page.locator("#world-view-button").click();
      await zoomWorldMapWithWheel(page, 4);
      await page.locator("#explore-button").click();
      await page.waitForFunction(
        () =>
          document.querySelector("#explore-toolbar")?.dataset.status ===
          "ready",
      );
      await openTokyoCandidate(page);
      apiRequests.length = 0;

      await page.locator("#confirm-city-button").click();
      await page.waitForFunction(
        () =>
          document.querySelector("#city-select")?.value === "tokyo" &&
          document
            .querySelector("#places-list")
            ?.textContent.includes("築地場外市場"),
      );

      assert.equal((await exploreState(page)).status, "idle");
      assert.equal(await page.locator("#explore-toolbar").isVisible(), false);
      assert.equal(await page.locator("#candidate-preview").isVisible(), false);
      assert.equal(
        await page.locator("#result-name").textContent(),
        "先抽一个地点",
      );
      assert.match(await page.locator("#result-meta").textContent(), /东京/);
      assert.equal(await page.locator(".place-marker-icon").count(), 5);
      assert.deepEqual(
        apiRequests
          .filter((request) => request.pathname.endsWith("/places"))
          .map((request) => request.pathname),
        ["/api/regions/tokyo/places"],
      );
      assert.equal(
        apiRequests.filter(
          (request) => request.pathname === "/api/explore",
        ).length,
        0,
      );

      await page.locator("#spin-button").click();
      await page.waitForFunction(
        () =>
          document.querySelector("#result-name")?.textContent ===
          "築地場外市場",
      );
      assert.equal(
        await page.locator("#result-card").getAttribute("data-food-image"),
        "/food/tokyo-sushi.jpg",
      );
      assert.equal(await page.locator("#result-image").isVisible(), true);
      await page.screenshot({
        path: path.join(outputDir, "cross-feature-confirm.png"),
        fullPage: true,
      });
      await fs.writeFile(
        path.join(outputDir, "cross-feature-confirm.json"),
        `${JSON.stringify(
          {
            finalCity: "tokyo",
            placeRequests: apiRequests.filter((request) =>
              request.pathname.endsWith("/places"),
            ),
            exploreRequestsAfterConfirm: 0,
            finalResult: await page.locator("#result-name").textContent(),
          },
          null,
          2,
        )}\n`,
      );
      assert.deepEqual(pageErrors, []);
      await context.close();
    },
  },
  {
    name: "food image failure stays isolated while exploring",
    async run(browser) {
      const { context, page, pageErrors, apiRequests } = await openPage(
        browser,
        { width: 1280, height: 900 },
        { failFoodImages: true },
      );
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await waitForCityReady(page);
      await page.locator("#spin-button").click();
      await page.waitForFunction(
        () => document.querySelector("#result-name")?.textContent === "北京烤鸭",
      );
      await page.waitForSelector("#result-image-fallback:not([hidden])");
      await page.waitForSelector(".popup-food-fallback:not([hidden])");
      await page.locator(".leaflet-popup-close-button").click();
      const baseline = await lunchState(page);
      apiRequests.length = 0;

      await page.locator("#world-view-button").click();
      await zoomWorldMapWithWheel(page, 4);
      await page.locator("#explore-button").click();
      await page.waitForFunction(
        () =>
          document.querySelector("#explore-toolbar")?.dataset.status ===
          "ready",
      );

      assert.deepEqual(await lunchState(page), baseline);
      assert.equal(await page.locator("#result-image").isVisible(), false);
      assert.equal(
        await page.locator("#result-image-fallback").isVisible(),
        true,
      );
      assert.equal(await page.locator(".explore-marker").count(), 3);
      assert.equal(
        apiRequests.filter(
          (request) => request.pathname === "/api/explore",
        ).length,
        1,
      );

      await page.locator("#explore-clear-button").click();
      await page.waitForFunction(
        () =>
          document.querySelector("#explore-toolbar")?.dataset.status ===
          "idle",
      );
      assert.deepEqual(await lunchState(page), baseline);
      assert.equal(
        await page.locator("#result-image-fallback").isVisible(),
        true,
      );
      await fs.writeFile(
        path.join(outputDir, "cross-feature-image-failure.json"),
        `${JSON.stringify(
          {
            baseline,
            imageFallbackVisible: true,
            exploreClearedWithoutLunchMutation: true,
          },
          null,
          2,
        )}\n`,
      );
      assert.deepEqual(pageErrors, []);
      await context.close();
    },
  },
  {
    name: "320px mobile completes explore, candidate confirm, and spin",
    async run(browser) {
      const { context, page, pageErrors, apiRequests } = await openPage(
        browser,
        { width: 320, height: 568 },
        {},
      );
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await waitForCityReady(page);
      await assertNoOverflow(page);
      apiRequests.length = 0;

      await page.locator("#spin-button").tap();
      await page.waitForFunction(
        () => document.querySelector("#result-name")?.textContent === "北京烤鸭",
      );
      await page.locator(".leaflet-popup-close-button").tap();

      await page.locator("#world-view-button").tap();
      await page.waitForFunction(
        () =>
          document
            .querySelector("#world-view-button")
            ?.getAttribute("aria-pressed") === "true" &&
          Number(document.querySelector("#map").dataset.zoom) <= 3,
      );
      await zoomWorldMapWithControls(page, 4);
      await page.locator("#explore-button").tap();
      await page.waitForFunction(
        () =>
          document.querySelector("#explore-toolbar")?.dataset.status ===
          "ready",
      );
      assert.equal(await page.locator(".explore-marker").count(), 3);
      await assertNoOverflow(page);

      await page.locator("#city-search").tap();
      await fillCitySearch(page, "tok");
      await page.locator('.search-result-button[data-city-id="tokyo"]').tap();
      await page.waitForFunction(
        () => !document.querySelector("#candidate-preview")?.hidden,
      );
      assert.equal((await exploreState(page)).status, "idle");
      assert.equal(await page.locator(".explore-marker").count(), 0);
      await assertNoOverflow(page);

      await page.locator("#confirm-city-button").tap();
      await page.waitForFunction(
        () =>
          document.querySelector("#city-select")?.value === "tokyo" &&
          document
            .querySelector("#places-list")
            ?.textContent.includes("築地場外市場"),
      );
      await page.locator("#spin-button").tap();
      await page.waitForFunction(
        () =>
          document.querySelector("#result-name")?.textContent ===
          "築地場外市場",
      );
      assert.equal(await page.locator("#result-image").isVisible(), true);
      assert.equal(await page.locator(".place-marker-icon").count(), 5);
      await assertNoOverflow(page);

      assert.deepEqual(
        apiRequests
          .filter((request) => request.pathname.endsWith("/places"))
          .map((request) => request.pathname),
        ["/api/regions/tokyo/places"],
      );
      assert.equal(
        apiRequests.filter(
          (request) => request.pathname === "/api/explore",
        ).length,
        1,
      );
      await page.screenshot({
        path: path.join(outputDir, "cross-feature-mobile-320.png"),
        fullPage: true,
      });
      await fs.writeFile(
        path.join(outputDir, "cross-feature-mobile.json"),
        `${JSON.stringify(
          {
            viewport: { width: 320, height: 568 },
            exploreRequests: 1,
            placeRequests: ["/api/regions/tokyo/places"],
            finalCity: "tokyo",
            finalResult: "築地場外市場",
            horizontalOverflow: false,
          },
          null,
          2,
        )}\n`,
      );
      assert.deepEqual(pageErrors, []);
      await context.close();
    },
  },
  {
    name: "keyboard panning invalidates a ready exploration result",
    async run(browser) {
      const { context, page, pageErrors } = await openPage(
        browser,
        { width: 1280, height: 900 },
        {},
      );
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await waitForCityReady(page);
      await page.locator("#world-view-button").click();
      await page.waitForFunction(
        () => !document.querySelector("#explore-toolbar")?.hidden,
      );
      await page.waitForTimeout(250);
      assert.equal((await exploreState(page)).status, "idle");

      await zoomWorldMapWithControls(page, 5);
      await page.locator("#explore-button").click();
      await page.waitForFunction(
        () =>
          document.querySelector("#explore-toolbar")?.dataset.status ===
          "ready",
      );
      const before = {
        map: await mapState(page),
        explore: await exploreState(page),
        markerCount: await page.locator(".explore-marker").count(),
      };

      await page.locator("#map").focus();
      await page.keyboard.press("ArrowRight");
      await page.waitForFunction(
        (previousLng) =>
          Number(document.querySelector("#map").dataset.centerLng) !==
          previousLng,
        before.map.lng,
      );
      await page.waitForTimeout(250);
      const after = {
        map: await mapState(page),
        explore: await exploreState(page),
        markerCount: await page.locator(".explore-marker").count(),
      };
      await fs.writeFile(
        path.join(
          outputDir,
          `cross-feature-keyboard-ready${evidenceSuffix}.json`,
        ),
        `${JSON.stringify({ before, after, pageErrors }, null, 2)}\n`,
      );

      assert.equal(after.explore.status, "dirty");
      assert.equal(after.markerCount, 0);
      assert.notEqual(after.map.lng, before.map.lng);
      assert.deepEqual(pageErrors, []);
      await context.close();
    },
  },
  {
    name: "keyboard panning invalidates an in-flight exploration request",
    async run(browser) {
      const { context, page, pageErrors, apiRequests } = await openPage(
        browser,
        { width: 1280, height: 900 },
        { exploreDelay: 1200 },
      );
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await waitForCityReady(page);
      await page.locator("#world-view-button").click();
      await zoomWorldMapWithControls(page, 5);
      apiRequests.length = 0;

      await page.locator("#explore-button").click();
      await page.waitForFunction(
        () =>
          document.querySelector("#explore-toolbar")?.dataset.status ===
          "loading",
      );
      const beforeMap = await mapState(page);
      await page.locator("#map").focus();
      await page.keyboard.press("ArrowRight");
      await page.waitForFunction(
        (previousLng) =>
          Number(document.querySelector("#map").dataset.centerLng) !==
          previousLng,
        beforeMap.lng,
      );
      await page.waitForTimeout(1500);
      const after = {
        map: await mapState(page),
        explore: await exploreState(page),
        markerCount: await page.locator(".explore-marker").count(),
        exploreRequests: apiRequests.filter(
          (request) => request.pathname === "/api/explore",
        ),
      };
      await fs.writeFile(
        path.join(
          outputDir,
          `cross-feature-keyboard-inflight${evidenceSuffix}.json`,
        ),
        `${JSON.stringify({ beforeMap, after, pageErrors }, null, 2)}\n`,
      );

      assert.equal(after.explore.status, "dirty");
      assert.equal(after.markerCount, 0);
      assert.equal(after.exploreRequests.length, 1);
      assert.notEqual(after.map.lng, beforeMap.lng);
      assert.deepEqual(pageErrors, []);
      await context.close();
    },
  },
];

function selectTests(filter, availableTests = tests) {
  if (!filter) {
    return availableTests;
  }
  return availableTests.filter((test) => test.name.includes(filter));
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });
  const selectedTests = selectTests(process.env.TEST_NAME_FILTER);
  if (selectedTests.length === 0) {
    console.error(
      `No cross-feature tests matched TEST_NAME_FILTER="${process.env.TEST_NAME_FILTER}"`,
    );
    process.exitCode = 2;
    return;
  }

  const server = startServer();
  let browser;
  const report = [];

  try {
    await waitForHttp(`${baseUrl}/api/regions`);
    browser = await chromium.launch({ headless: true });

    for (const test of selectedTests) {
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
        console.error(error);
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
      path.join(outputDir, "cross-feature-report.json"),
      `${JSON.stringify(report, null, 2)}\n`,
    );
  }

  const passed = report.filter((item) => item.status === "passed").length;
  console.log(
    `Cross-feature checks passed: ${passed}/${selectedTests.length}`,
  );
  if (passed !== selectedTests.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
