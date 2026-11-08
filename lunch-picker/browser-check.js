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
const mapTileFixture =
  '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">' +
  '<rect width="256" height="256" fill="#dceaf0"/></svg>';

const regionFixtures = [
  { id: "beijing", name: "北京", nameEn: "Beijing", center: { lat: 39.9042, lng: 116.4074 }, placeCount: 5 },
  { id: "shanghai", name: "上海", nameEn: "Shanghai", center: { lat: 31.2304, lng: 121.4737 }, placeCount: 5 },
  { id: "guangzhou", name: "广州", nameEn: "Guangzhou", center: { lat: 23.1291, lng: 113.2644 }, placeCount: 5 },
  { id: "chengdu", name: "成都", nameEn: "Chengdu", center: { lat: 30.5728, lng: 104.0668 }, placeCount: 5 },
  { id: "xian", name: "西安", nameEn: "Xi'an", center: { lat: 34.3416, lng: 108.9398 }, placeCount: 5 },
  { id: "tokyo", name: "东京", nameEn: "Tokyo", center: { lat: 35.6762, lng: 139.6503 }, placeCount: 5 },
  { id: "singapore", name: "新加坡", nameEn: "Singapore", center: { lat: 1.3521, lng: 103.8198 }, placeCount: 4 },
  { id: "berlin", name: "柏林", nameEn: "Berlin", center: { lat: 52.52, lng: 13.405 }, placeCount: 4 },
  { id: "new-york", name: "纽约", nameEn: "New York", center: { lat: 40.7128, lng: -74.006 }, placeCount: 5 },
];

const namesByRegion = {
  beijing: ["北京烤鸭", "炸酱面馆", "铜锅涮肉", "宫廷点心", "胡同小馆"],
  shanghai: ["生煎铺", "本帮菜馆", "葱油面店", "小笼餐厅", "弄堂食堂"],
  chengdu: ["陈麻婆豆腐", "钟水饺", "龙抄手", "川味小馆", "茶馆饭铺"],
  xian: ["西安肉夹馍", "羊肉泡馍", "凉皮小馆", "biangbiang 面", "城墙面馆"],
  guangzhou: ["广州早茶", "烧腊饭店", "肠粉铺", "煲仔饭", "糖水小馆"],
  tokyo: ["築地場外市場", "アメ横", "渋谷", "新宿ゴールデン街", "思い出横丁"],
  singapore: ["老巴刹", "竹脚中心", "牛车水大厦", "纽顿熟食中心"],
  berlin: ["Markthalle Neun", "Arminiusmarkthalle", "Marheineke Markthalle", "Dong Xuan Center"],
  "new-york": ["Chelsea Market", "Grand Central Terminal", "Essex Market", "Queens Night Market", "Brooklyn Borough Hall Greenmarket"],
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
        contentType: "image/svg+xml",
        body: mapTileFixture,
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
  const visualMobile = viewport.width <= 520;
  const context = await browser.newContext({
    viewport,
    reducedMotion: "reduce",
    deviceScaleFactor: 1,
    hasTouch: options.hasTouch ?? visualMobile,
    isMobile: options.isMobile ?? visualMobile,
  });
  const page = await context.newPage();
  const pageErrors = [];
  const apiRequests = [];
  const tileRequests = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => {
    const requestUrl = new URL(request.url());
    const pathname = requestUrl.pathname;
    if (requestUrl.href.includes("/appmaptile")) {
      tileRequests.push(requestUrl.href);
    }
    if (pathname.startsWith("/api/")) {
      apiRequests.push({
        method: request.method(),
        pathname,
        body: request.postData() || "",
      });
    }
  });
  await installApiRoutes(page, options);
  return { context, page, pageErrors, apiRequests, tileRequests };
}

async function waitForCityReady(page) {
  await page.waitForSelector("#city-select:not([disabled])");
  await page.waitForFunction(
    () => document.querySelectorAll("#city-select option").length === 9,
  );
}

async function waitForMarkers(page, count = 5) {
  await page.waitForFunction(
    (expected) =>
      document.querySelectorAll(".place-marker-icon").length === expected,
    count,
  );
}

async function waitForCityMarkers(page, count = 9) {
  await page.waitForFunction(
    (expected) =>
      document.querySelectorAll(".city-marker").length === expected,
    count,
  );
}

async function mapState(page) {
  return page.evaluate(() => {
    const map = document.querySelector("#map");
    return {
      zoom: Number(map.dataset.zoom),
      lat: Number(map.dataset.centerLat),
      lng: Number(map.dataset.centerLng),
    };
  });
}

function intersectionArea(first, second) {
  if (!first || !second) {
    return 0;
  }
  const width = Math.max(
    0,
    Math.min(first.x + first.width, second.x + second.width) -
      Math.max(first.x, second.x),
  );
  const height = Math.max(
    0,
    Math.min(first.y + first.height, second.y + second.height) -
      Math.max(first.y, second.y),
  );
  return width * height;
}

async function pinchToZoom(context, page) {
  const mapBox = await page.locator("#map").boundingBox();
  const centerX = mapBox.x + mapBox.width / 2;
  const centerY = mapBox.y + mapBox.height / 2;
  const client = await context.newCDPSession(page);
  const points = (distance) => [
    { x: centerX - distance, y: centerY, id: 1 },
    { x: centerX + distance, y: centerY, id: 2 },
  ];

  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: points(30),
  });
  for (const distance of [42, 56, 72, 90]) {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: points(distance),
    });
    await page.waitForTimeout(40);
  }
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await client.detach();
}

async function dragMapWithMouse(page, deltaX, deltaY) {
  const mapBox = await page.locator("#map").boundingBox();
  const startX = mapBox.x + mapBox.width / 2;
  const startY = mapBox.y + mapBox.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  for (let step = 1; step <= 10; step += 1) {
    await page.mouse.move(
      startX + (deltaX * step) / 10,
      startY + (deltaY * step) / 10,
    );
    await page.waitForTimeout(20);
  }
  await page.mouse.up();
  await page.waitForTimeout(400);
}

async function dragMapWithTouch(context, page, deltaX, deltaY) {
  const mapBox = await page.locator("#map").boundingBox();
  const startX = mapBox.x + mapBox.width / 2;
  const startY = mapBox.y + mapBox.height / 2;
  const client = await context.newCDPSession(page);

  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: startX, y: startY, id: 1 }],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: startX + deltaX, y: startY + deltaY, id: 1 }],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await client.detach();
  await page.waitForTimeout(250);
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
      const { context, page, pageErrors, tileRequests } = await openPage(
        browser,
        { width: 1440, height: 1000 },
        {},
      );
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await waitForCityReady(page);
      await waitForMarkers(page);
      await waitForCityMarkers(page);
      await page.waitForFunction(
        () => document.querySelectorAll("img.leaflet-tile").length > 0,
      );

      assert.ok(tileRequests.length > 0, "No map tile request was made");
      const tileUrl = new URL(tileRequests[0]);
      assert.equal(tileUrl.pathname, "/appmaptile");
      assert.equal(tileUrl.searchParams.get("lang"), "zh_cn");
      assert.equal(tileUrl.searchParams.get("size"), "1");
      assert.equal(tileUrl.searchParams.get("scale"), "1");
      assert.equal(tileUrl.searchParams.get("style"), "8");

      assert.equal(await page.locator("#city-select option").count(), 9);
      assert.equal(await page.locator(".place-button").count(), 5);
      assert.match(await page.locator("#city-count").textContent(), /9 城/);
      assert.match(await page.locator("#place-count").textContent(), /5 处/);
      assert.match(await page.locator("#map-caption").textContent(), /北京/);
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
      await fs.writeFile(
        path.join(outputDir, "tile-source.json"),
        `${JSON.stringify(
          {
            sampleRequests: tileRequests.slice(0, 5),
            expected: {
              lang: "zh_cn",
              size: "1",
              scale: "1",
              style: "8",
            },
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
      await waitForCityMarkers(page);
      assert.equal(await page.locator("#city-select option").count(), 9);
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
    name: "desktop world browsing does not change lunch state",
    async run(browser) {
      const { context, page, pageErrors, apiRequests } = await openPage(
        browser,
        { width: 1440, height: 1000 },
        {},
      );
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await waitForCityReady(page);
      await waitForMarkers(page);
      await waitForCityMarkers(page);

      await page.locator("#spin-button").click();
      await page.waitForFunction(
        () => document.querySelector("#result-name")?.textContent === "北京烤鸭",
      );
      await page.waitForSelector(".leaflet-popup-close-button");
      await page.locator(".leaflet-popup-close-button").click();

      const selectedCity = await page.locator("#city-select").inputValue();
      const placesText = await page.locator("#places-list").textContent();
      apiRequests.length = 0;

      await page.locator("#world-view-button").click();
      await page.waitForFunction(
        () =>
          document
            .querySelector("#world-view-button")
            ?.getAttribute("aria-pressed") === "true",
      );
      await page.waitForFunction(
        () => Number(document.querySelector("#map").dataset.zoom) <= 3,
      );
      const worldState = await mapState(page);

      assert.equal(await page.locator(".city-marker").count(), 9);
      assert.equal(await page.locator(".city-marker-current").count(), 1);
      assert.equal(await page.locator("#city-select").inputValue(), selectedCity);
      assert.equal(await page.locator("#places-list").textContent(), placesText);
      assert.equal(await page.locator("#result-name").textContent(), "北京烤鸭");
      assert.equal(apiRequests.length, 0);
      assert.match(await page.locator("#map-caption").textContent(), /北京/);
      await page.screenshot({
        path: path.join(outputDir, "desktop-world.png"),
        fullPage: true,
      });

      await dragMapWithMouse(page, 130, 70);
      const draggedState = await mapState(page);
      assert.ok(
        Math.abs(draggedState.lat - worldState.lat) > 0.1 ||
          Math.abs(draggedState.lng - worldState.lng) > 0.1,
        "Mouse drag did not move the world map",
      );
      assert.equal(apiRequests.length, 0);

      await page.locator("#map").hover();
      await page.mouse.wheel(0, -700);
      await page.waitForFunction(
        (previousZoom) =>
          Number(document.querySelector("#map").dataset.zoom) > previousZoom,
        draggedState.zoom,
      );
      await page.waitForTimeout(250);
      assert.equal(apiRequests.length, 0);

      await page.locator("#return-city-button").click();
      await page.waitForFunction(
        () => document.querySelector("#map-caption")?.textContent.includes("北京"),
      );
      const returnedState = await mapState(page);
      assert.ok(returnedState.zoom > worldState.zoom);
      assert.equal(await page.locator("#city-select").inputValue(), selectedCity);
      assert.equal(await page.locator("#places-list").textContent(), placesText);
      assert.equal(await page.locator("#result-name").textContent(), "北京烤鸭");
      assert.equal(apiRequests.length, 0);
      await fs.writeFile(
        path.join(outputDir, "network-world-browse.json"),
        `${JSON.stringify(
          {
            selectedCity,
            result: "北京烤鸭",
            actions: [
              "open-world-view",
              "desktop-drag",
              "desktop-wheel-zoom",
              "return-to-current-city",
            ],
            apiRequestsDuringBrowse: apiRequests,
            worldView: worldState,
            draggedView: draggedState,
            currentCityView: returnedState,
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
    name: "mobile world browsing supports pinch and return",
    async run(browser) {
      const { context, page, pageErrors, apiRequests } = await openPage(
        browser,
        { width: 390, height: 844 },
        {},
      );
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await waitForCityReady(page);
      await waitForMarkers(page);
      await waitForCityMarkers(page);
      await assertNoOverflow(page);

      const selectedCity = await page.locator("#city-select").inputValue();
      const placesText = await page.locator("#places-list").textContent();
      apiRequests.length = 0;

      await page.locator("#world-view-button").click();
      await page.waitForFunction(
        () => Number(document.querySelector("#map").dataset.zoom) <= 2,
      );
      const worldState = await mapState(page);
      await page.screenshot({
        path: path.join(outputDir, "mobile-world.png"),
        fullPage: true,
      });

      await dragMapWithTouch(context, page, 100, 55);
      const draggedState = await mapState(page);
      assert.ok(
        Math.abs(draggedState.lat - worldState.lat) > 0.05 ||
          Math.abs(draggedState.lng - worldState.lng) > 0.05,
        "Touch drag did not move the world map",
      );
      await pinchToZoom(context, page);
      await page.waitForFunction(
        (previousZoom) =>
          Number(document.querySelector("#map").dataset.zoom) > previousZoom,
        draggedState.zoom,
      );
      await page.waitForTimeout(250);
      assert.equal(apiRequests.length, 0);
      assert.equal(await page.locator("#city-select").inputValue(), selectedCity);
      assert.equal(await page.locator("#places-list").textContent(), placesText);

      await page.locator("#return-city-button").click();
      await page.waitForFunction(
        () =>
          Number(document.querySelector("#map").dataset.zoom) > 2 &&
          document.querySelector("#map-caption")?.textContent.includes("北京"),
      );
      assert.equal(await page.locator(".place-marker-icon").count(), 5);
      assert.equal(apiRequests.length, 0);
      await fs.writeFile(
        path.join(outputDir, "network-mobile-world.json"),
        `${JSON.stringify(
          {
            selectedCity,
            actions: [
              "open-world-view",
              "mobile-drag",
              "mobile-pinch-zoom",
              "return-to-current-city",
            ],
            apiRequestsDuringBrowse: apiRequests,
            worldView: worldState,
            draggedView: draggedState,
            finalMap: await mapState(page),
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
    name: "four new cities switch map and places coherently",
    async run(browser) {
      const { context, page, pageErrors, apiRequests } = await openPage(
        browser,
        { width: 1280, height: 900 },
        {},
      );
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await waitForCityReady(page);
      await waitForMarkers(page);
      await waitForCityMarkers(page);
      apiRequests.length = 0;

      const expected = [
        ["tokyo", "东京", 5, "築地場外市場"],
        ["singapore", "新加坡", 4, "老巴刹"],
        ["berlin", "柏林", 4, "Markthalle Neun"],
        ["new-york", "纽约", 5, "Chelsea Market"],
      ];

      for (const [id, name, count, sample] of expected) {
        await page.selectOption("#city-select", id);
        await page.waitForFunction(
          ({ regionName, placeName }) => {
            const caption =
              document.querySelector("#map-caption")?.textContent || "";
            const list =
              document.querySelector("#places-list")?.textContent || "";
            return (
              caption.includes(regionName) &&
              list.includes(placeName)
            );
          },
          { regionName: name, placeName: sample },
        );
        await waitForMarkers(page, count);
        assert.equal(await page.locator("#city-select").inputValue(), id);
        assert.match(
          await page.locator("#place-count").textContent(),
          new RegExp(`${count} 处`),
        );
        assert.match(
          await page.locator("#places-list").textContent(),
          new RegExp(sample.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
        );
        const state = await mapState(page);
        const region = regionFixtures.find((item) => item.id === id);
        assert.ok(Math.abs(state.lat - region.center.lat) < 1);
        assert.ok(Math.abs(state.lng - region.center.lng) < 1);
      }

      const placeRequests = apiRequests
        .filter((request) => request.pathname.endsWith("/places"))
        .map((request) => request.pathname);
      assert.deepEqual(
        placeRequests,
        expected.map(([id]) => `/api/regions/${id}/places`),
      );
      await page.waitForTimeout(500);
      await fs.writeFile(
        path.join(outputDir, "network-city-switch.json"),
        `${JSON.stringify(
          {
            switchedCities: expected.map(([id, name]) => ({ id, name })),
            placeRequests,
            spinRequests: apiRequests
              .filter((request) => request.pathname === "/api/spin")
              .map((request) => request.pathname),
            finalMap: await mapState(page),
          },
          null,
          2,
        )}\n`,
      );
      await page.screenshot({
        path: path.join(outputDir, "new-york.png"),
        fullPage: true,
      });
      assert.deepEqual(pageErrors, []);
      await context.close();
    },
  },
  {
    name: "delayed places responses preserve the world view",
    async run(browser) {
      const scenarios = [
        {
          name: "success",
          failPlaces: [],
          expectedPlaces: 5,
          expectedStatus: "已加载 5 个公开地点",
          expectedFallback: false,
        },
        {
          name: "failure",
          failPlaces: ["beijing"],
          expectedPlaces: 0,
          expectedStatus: "地点加载失败",
          expectedFallback: true,
        },
      ];
      const evidence = [];

      for (const scenario of scenarios) {
        const { context, page, pageErrors, apiRequests } = await openPage(
          browser,
          { width: 1280, height: 900 },
          {
            delayByRegion: { beijing: 1200 },
            failPlaces: scenario.failPlaces,
          },
        );
        await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
        await waitForCityReady(page);
        await page.waitForSelector("#world-view-button:not([disabled])");

        await page.locator("#world-view-button").click();
        await page.waitForFunction(
          () =>
            document
              .querySelector("#world-view-button")
              ?.getAttribute("aria-pressed") === "true",
        );
        await page.waitForFunction(
          () => Number(document.querySelector("#map").dataset.zoom) <= 3,
        );
        const beforeResponse = await mapState(page);
        assert.equal(
          await page.locator("#place-count").textContent(),
          "-- 处",
        );

        await page.waitForFunction(
          (statusText) =>
            document
              .querySelector("#place-status")
              ?.textContent.includes(statusText),
          scenario.expectedStatus,
        );
        const afterResponse = await mapState(page);

        assert.ok(afterResponse.zoom <= 3);
        assert.equal(
          await page
            .locator("#world-view-button")
            .getAttribute("aria-pressed"),
          "true",
        );
        assert.match(
          await page.locator("#map-caption").textContent(),
          /世界视图 · 抽签城市：北京/,
        );
        assert.equal(
          await page.locator(".place-marker-icon").count(),
          scenario.expectedPlaces,
        );
        assert.equal(
          await page.locator("#map-fallback").isVisible(),
          scenario.expectedFallback,
        );

        await page.screenshot({
          path: path.join(
            outputDir,
            `world-view-delayed-${scenario.name}.png`,
          ),
          fullPage: true,
        });

        const requestsBeforeReturn = apiRequests.length;
        await page.locator("#return-city-button").click();
        await page.waitForFunction(() =>
          document.querySelector("#map-caption")?.textContent.includes("北京"),
        );
        assert.ok((await mapState(page)).zoom > 3);
        assert.equal(apiRequests.length, requestsBeforeReturn);

        await page.locator("#spin-button").click();
        await page.waitForFunction(
          () => document.querySelector("#result-name")?.textContent === "北京烤鸭",
        );
        assert.deepEqual(pageErrors, []);

        evidence.push({
          scenario: scenario.name,
          beforeResponse,
          afterResponse,
          requests: apiRequests,
        });
        await context.close();
      }

      await fs.writeFile(
        path.join(outputDir, "delayed-world-view-race.json"),
        `${JSON.stringify(evidence, null, 2)}\n`,
      );
    },
  },
  {
    name: "city search follows normalization rules without side effects",
    async run(browser) {
      const { context, page, pageErrors, apiRequests } = await openPage(
        browser,
        { width: 1440, height: 1000 },
        {},
      );
      const searchExamples = [];
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await waitForCityReady(page);
      await waitForMarkers(page);
      await waitForCityMarkers(page);
      await page.waitForSelector("#city-search:not([disabled])");

      await page.locator("#spin-button").click();
      await page.waitForFunction(
        () => document.querySelector("#result-name")?.textContent === "北京烤鸭",
      );
      await page.waitForSelector(".leaflet-popup-close-button");
      await page.locator(".leaflet-popup-close-button").click();

      const selectedCity = await page.locator("#city-select").inputValue();
      const placesText = await page.locator("#places-list").textContent();
      apiRequests.length = 0;

      await page.locator("#city-search").focus();
      await page.waitForFunction(
        () => document.querySelectorAll(".search-result-button").length === 9,
      );
      assert.deepEqual(
        await page
          .locator(".search-result-button")
          .evaluateAll((buttons) => buttons.map((button) => button.dataset.cityId)),
        [
          "beijing",
          "shanghai",
          "guangzhou",
          "chengdu",
          "xian",
          "tokyo",
          "singapore",
          "berlin",
          "new-york",
        ],
      );

      await page.locator("#city-search").fill(" 东 ");
      await page.waitForFunction(
        () => document.querySelectorAll(".search-result-button").length === 1,
      );
      assert.match(
        await page.locator(".search-result-button").textContent(),
        /东京.*Tokyo/,
      );
      searchExamples.push({
        query: " 东 ",
        resultIds: await page
          .locator(".search-result-button")
          .evaluateAll((buttons) => buttons.map((button) => button.dataset.cityId)),
      });

      await page.locator("#city-search").fill("tok");
      await page.waitForFunction(
        () => document.querySelectorAll(".search-result-button").length === 1,
      );
      assert.equal(
        await page.locator(".search-result-button").getAttribute("data-city-id"),
        "tokyo",
      );
      searchExamples.push({
        query: "tok",
        resultIds: await page
          .locator(".search-result-button")
          .evaluateAll((buttons) => buttons.map((button) => button.dataset.cityId)),
      });
      await page.screenshot({
        path: path.join(outputDir, "city-search.png"),
        fullPage: true,
      });

      await page.locator("#city-search").fill("NEW");
      await page.waitForFunction(
        () =>
          document.querySelector(".search-result-button")?.dataset.cityId ===
          "new-york",
      );
      searchExamples.push({ query: "NEW", resultIds: ["new-york"] });
      await page.locator("#city-search").fill("york");
      await page.waitForFunction(
        () =>
          document.querySelector(".search-result-button")?.dataset.cityId ===
          "new-york",
      );
      searchExamples.push({ query: "york", resultIds: ["new-york"] });
      await page.locator("#city-search").fill("ｔｏｋ");
      await page.waitForFunction(
        () =>
          document.querySelector(".search-result-button")?.dataset.cityId ===
          "tokyo",
      );
      searchExamples.push({ query: "ｔｏｋ", resultIds: ["tokyo"] });

      await page.locator("#city-search").fill("no-such-city");
      await page.waitForFunction(
        () =>
          document
            .querySelector("#search-status")
            ?.textContent.includes("没有匹配的城市"),
      );
      assert.equal(await page.locator("#city-search-results").isVisible(), false);
      assert.equal(await page.locator("#city-select").inputValue(), selectedCity);
      assert.equal(await page.locator("#places-list").textContent(), placesText);
      assert.equal(await page.locator("#result-name").textContent(), "北京烤鸭");
      assert.equal(apiRequests.length, 0);

      await page.evaluate(() => {
        window.__normalize = String.prototype.normalize;
        String.prototype.normalize = () => {
          throw new Error("search index unavailable");
        };
      });
      await page.locator("#city-search").fill("tok");
      await page.waitForFunction(
        () =>
          document
            .querySelector("#search-status")
            ?.textContent.includes("城市搜索暂不可用"),
      );
      assert.equal(await page.locator("#city-search-results").isVisible(), false);
      assert.equal(await page.locator("#spin-button").isEnabled(), true);
      assert.equal(apiRequests.length, 0);

      await page.evaluate(() => {
        String.prototype.normalize = window.__normalize;
        delete window.__normalize;
      });
      await page.locator("#city-search").fill("");
      await page.locator("#city-search").fill("tok");
      await page.waitForFunction(
        () =>
          document.querySelector(".search-result-button")?.dataset.cityId ===
          "tokyo",
      );
      await fs.writeFile(
        path.join(outputDir, "city-search-results.json"),
        `${JSON.stringify(
          {
            examples: searchExamples,
            noMatch: "no-such-city",
            searchIndexFailure: "城市搜索暂不可用",
            apiRequests,
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
    name: "candidate preview stays local across cancel, escape, and return",
    async run(browser) {
      const { context, page, pageErrors, apiRequests } = await openPage(
        browser,
        { width: 1440, height: 1000 },
        {},
      );
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await waitForCityReady(page);
      await waitForMarkers(page);
      await waitForCityMarkers(page);
      await page.waitForSelector("#city-search:not([disabled])");

      const selectedCity = await page.locator("#city-select").inputValue();
      const placesText = await page.locator("#places-list").textContent();
      const resultBefore = await page.locator("#result-name").textContent();
      apiRequests.length = 0;

      await page.locator("#city-search").focus();
      await page.locator("#city-search").fill("tok");
      await page.waitForFunction(
        () =>
          document.querySelector(".search-result-button")?.dataset.cityId ===
          "tokyo",
      );
      await page.locator('.search-result-button[data-city-id="tokyo"]').click();
      await page.waitForFunction(
        () => !document.querySelector("#candidate-preview")?.hidden,
      );

      assert.equal(
        await page.locator("#candidate-preview").getAttribute("data-candidate-id"),
        "tokyo",
      );
      assert.equal(
        await page.locator("#current-city-label").textContent(),
        "北京",
      );
      assert.equal(
        await page.locator("#candidate-city-label").textContent(),
        "东京",
      );
      assert.match(
        await page.locator("#map-caption").textContent(),
        /候选预览：东京/,
      );
      assert.equal(await page.locator("#city-select").inputValue(), selectedCity);
      assert.equal(await page.locator("#places-list").textContent(), placesText);
      assert.equal(await page.locator("#result-name").textContent(), resultBefore);
      assert.equal(await page.locator(".city-marker-current").count(), 1);
      assert.equal(await page.locator(".city-marker-candidate").count(), 1);
      assert.equal(apiRequests.length, 0);
      await page.screenshot({
        path: path.join(outputDir, "candidate-preview.png"),
        fullPage: true,
      });

      await page.locator("#spin-button").click();
      await page.waitForFunction(
        () => document.querySelector("#result-name")?.textContent === "北京烤鸭",
      );
      const spinRequest = apiRequests.find(
        (request) => request.pathname === "/api/spin",
      );
      assert.equal(JSON.parse(spinRequest.body).regionId, "beijing");
      await page.waitForSelector(".leaflet-popup-close-button");
      await page.locator(".leaflet-popup-close-button").click();

      const requestsBeforeCancel = apiRequests.length;
      await page.locator("#cancel-city-button").click();
      await page.waitForFunction(
        () => document.querySelector("#candidate-preview")?.hidden === true,
      );
      assert.equal(await page.locator("#city-select").inputValue(), selectedCity);
      assert.equal(await page.locator("#places-list").textContent(), placesText);
      assert.equal(apiRequests.length, requestsBeforeCancel);
      assert.match(await page.locator("#map-caption").textContent(), /北京/);

      await page.locator("#world-view-button").click();
      await page.waitForFunction(
        () => Number(document.querySelector("#map").dataset.zoom) <= 3,
      );
      await page.locator(".city-marker").nth(5).click();
      await page.waitForFunction(
        () =>
          document.querySelector("#candidate-preview")?.dataset.candidateId ===
          "tokyo",
      );
      assert.equal(await page.locator("#city-select").inputValue(), selectedCity);
      await page.keyboard.press("Escape");
      await page.waitForFunction(
        () => document.querySelector("#candidate-preview")?.hidden === true,
      );
      assert.match(await page.locator("#map-caption").textContent(), /北京/);

      await page.locator("#city-search").fill("tok");
      await page.locator('.search-result-button[data-city-id="tokyo"]').click();
      await page.waitForFunction(
        () => !document.querySelector("#candidate-preview")?.hidden,
      );
      const requestsBeforeClose = apiRequests.length;
      await page.locator("#close-candidate-button").click();
      await page.waitForFunction(
        () => document.querySelector("#candidate-preview")?.hidden === true,
      );
      assert.equal(apiRequests.length, requestsBeforeClose);

      await page.locator("#city-search").fill("tok");
      await page.locator('.search-result-button[data-city-id="tokyo"]').click();
      await page.waitForFunction(
        () => !document.querySelector("#candidate-preview")?.hidden,
      );
      const requestsBeforeReturn = apiRequests.length;
      await page.locator("#return-city-button").click();
      await page.waitForFunction(
        () => document.querySelector("#candidate-preview")?.hidden === true,
      );
      assert.equal(await page.locator("#city-select").inputValue(), selectedCity);
      assert.equal(await page.locator("#places-list").textContent(), placesText);
      assert.equal(await page.locator("#result-name").textContent(), "北京烤鸭");
      assert.equal(apiRequests.length, requestsBeforeReturn);
      await fs.writeFile(
        path.join(outputDir, "candidate-preview-network.json"),
        `${JSON.stringify(
          {
            selectedCity,
            actions: [
              "open-from-search",
              "spin-current-city",
              "cancel",
              "open-from-city-marker",
              "escape",
              "close",
              "reopen",
              "return-to-current-city",
            ],
            apiRequests,
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
    name: "candidate confirmation switches once and resets lunch state",
    async run(browser) {
      const { context, page, pageErrors, apiRequests } = await openPage(
        browser,
        { width: 1280, height: 900 },
        {},
      );
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await waitForCityReady(page);
      await waitForMarkers(page);
      await waitForCityMarkers(page);
      await page.waitForSelector("#city-search:not([disabled])");

      await page.locator("#spin-button").click();
      await page.waitForFunction(
        () => document.querySelector("#result-name")?.textContent === "北京烤鸭",
      );
      await page.waitForSelector(".leaflet-popup-close-button");
      await page.locator(".leaflet-popup-close-button").click();
      apiRequests.length = 0;

      await page.locator("#city-search").focus();
      await page.locator("#city-search").fill("tok");
      await page.locator('.search-result-button[data-city-id="tokyo"]').click();
      await page.waitForFunction(
        () => !document.querySelector("#candidate-preview")?.hidden,
      );
      assert.equal(apiRequests.length, 0);
      await page.locator("#confirm-city-button").click();
      await page.waitForFunction(
        () =>
          document.querySelector("#city-select")?.value === "tokyo" &&
          document.querySelector("#places-list")?.textContent.includes("築地場外市場"),
      );

      assert.equal(await page.locator("#candidate-preview").isVisible(), false);
      assert.equal(
        await page.locator("#result-name").textContent(),
        "先抽一个地点",
      );
      assert.match(
        await page.locator("#result-meta").textContent(),
        /当前城市：东京/,
      );
      assert.equal(await page.locator(".place-marker-icon").count(), 5);
      assert.equal(await page.locator(".city-marker-current").count(), 1);
      assert.equal(await page.locator(".city-marker-candidate").count(), 0);
      assert.deepEqual(
        apiRequests
          .filter((request) => request.pathname.endsWith("/places"))
          .map((request) => request.pathname),
        ["/api/regions/tokyo/places"],
      );

      const requestCountBeforeSameCity = apiRequests.length;
      await page.locator("#city-search").fill("tok");
      await page.locator('.search-result-button[data-city-id="tokyo"]').click();
      await page.waitForFunction(
        () => !document.querySelector("#candidate-preview")?.hidden,
      );
      await page.locator("#confirm-city-button").click();
      await page.waitForFunction(
        () => document.querySelector("#candidate-preview")?.hidden === true,
      );
      assert.equal(await page.locator("#city-select").inputValue(), "tokyo");
      assert.equal(apiRequests.length, requestCountBeforeSameCity);
      await fs.writeFile(
        path.join(outputDir, "candidate-confirm-network.json"),
        `${JSON.stringify(
          {
            confirmedCity: "tokyo",
            sameCityConfirmation: "no-op",
            placeRequests: apiRequests.filter((request) =>
              request.pathname.endsWith("/places"),
            ),
            requestsAfterSameCityConfirmation:
              apiRequests.length - requestCountBeforeSameCity,
          },
          null,
          2,
        )}\n`,
      );
      await page.screenshot({
        path: path.join(outputDir, "candidate-confirm.png"),
        fullPage: true,
      });
      assert.deepEqual(pageErrors, []);
      await context.close();
    },
  },
  {
    name: "rapid confirms keep the latest city only",
    async run(browser) {
      const { context, page, pageErrors, apiRequests } = await openPage(
        browser,
        { width: 1280, height: 900 },
        { delayByRegion: { tokyo: 800, singapore: 100 } },
      );
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await waitForCityReady(page);
      await waitForMarkers(page);
      await waitForCityMarkers(page);
      await page.waitForSelector("#city-search:not([disabled])");
      apiRequests.length = 0;

      await page.locator("#city-search").focus();
      await page.locator("#city-search").fill("tok");
      await page.locator('.search-result-button[data-city-id="tokyo"]').click();
      await page.locator("#confirm-city-button").click();
      await page.locator("#city-search").fill("sing");
      await page.locator('.search-result-button[data-city-id="singapore"]').click();
      await page.locator("#confirm-city-button").click();

      await page.waitForFunction(
        () =>
          document.querySelector("#city-select")?.value === "singapore" &&
          document.querySelector("#places-list")?.textContent.includes("老巴刹"),
      );
      await page.waitForTimeout(900);

      assert.equal(await page.locator("#city-select").inputValue(), "singapore");
      assert.match(await page.locator("#map-caption").textContent(), /新加坡/);
      assert.doesNotMatch(
        await page.locator("#places-list").textContent(),
        /築地場外市場/,
      );
      assert.deepEqual(
        apiRequests
          .filter((request) => request.pathname.endsWith("/places"))
          .map((request) => request.pathname),
        [
          "/api/regions/tokyo/places",
          "/api/regions/singapore/places",
        ],
      );
      await fs.writeFile(
        path.join(outputDir, "candidate-confirm-race.json"),
        `${JSON.stringify(
          {
            confirmOrder: ["tokyo", "singapore"],
            finalCity: "singapore",
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
    name: "world view survives a pending candidate confirmation",
    async run(browser) {
      const { context, page, pageErrors, apiRequests } = await openPage(
        browser,
        { width: 1280, height: 900 },
        { delayByRegion: { tokyo: 900 } },
      );
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await waitForCityReady(page);
      await waitForMarkers(page);
      await waitForCityMarkers(page);
      await page.waitForSelector("#city-search:not([disabled])");

      await page.locator("#city-search").focus();
      await page.locator("#city-search").fill("tok");
      await page.locator('.search-result-button[data-city-id="tokyo"]').click();
      await page.locator("#confirm-city-button").click();
      await page.locator("#world-view-button").click();
      await page.waitForFunction(
        () =>
          document
            .querySelector("#world-view-button")
            ?.getAttribute("aria-pressed") === "true" &&
          Number(document.querySelector("#map").dataset.zoom) <= 3,
      );

      await page.waitForFunction(
        () =>
          document
            .querySelector("#place-status")
            ?.textContent.includes("已加载 5 个公开地点"),
      );
      assert.equal(await page.locator("#city-select").inputValue(), "tokyo");
      assert.equal(
        await page
          .locator("#world-view-button")
          .getAttribute("aria-pressed"),
        "true",
      );
      assert.ok((await mapState(page)).zoom <= 3);
      assert.match(
        await page.locator("#map-caption").textContent(),
        /世界视图 · 抽签城市：东京/,
      );
      assert.match(
        await page.locator("#places-list").textContent(),
        /築地場外市場/,
      );
      await fs.writeFile(
        path.join(outputDir, "candidate-confirm-world-view.json"),
        `${JSON.stringify(
          {
            confirmedCity: "tokyo",
            finalMap: await mapState(page),
            worldViewActive:
              await page
                .locator("#world-view-button")
                .getAttribute("aria-pressed"),
            apiRequests,
          },
          null,
          2,
        )}\n`,
      );
      await page.screenshot({
        path: path.join(outputDir, "world-view-pending-confirm.png"),
        fullPage: true,
      });
      assert.deepEqual(pageErrors, []);
      await context.close();
    },
  },
  {
    name: "candidate confirmation failure keeps the new city and remains usable",
    async run(browser) {
      const { context, page, pageErrors, apiRequests } = await openPage(
        browser,
        { width: 1280, height: 900 },
        { failPlaces: ["tokyo"] },
      );
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await waitForCityReady(page);
      await waitForMarkers(page);
      await waitForCityMarkers(page);
      await page.waitForSelector("#city-search:not([disabled])");

      await page.locator(".place-button").first().click();
      await page.waitForSelector(".leaflet-popup");
      apiRequests.length = 0;

      await page.locator("#city-search").focus();
      await page.locator("#city-search").fill("tok");
      await page.locator('.search-result-button[data-city-id="tokyo"]').click();
      await page.locator("#confirm-city-button").click();
      await page.waitForFunction(
        () =>
          document
            .querySelector("#place-status")
            ?.textContent.includes("地点加载失败"),
      );

      assert.equal(await page.locator("#city-select").inputValue(), "tokyo");
      assert.equal(await page.locator("#candidate-preview").isVisible(), false);
      assert.equal(await page.locator(".place-marker-icon").count(), 0);
      assert.equal(await page.locator(".city-marker-current").count(), 1);
      assert.equal(await page.locator(".leaflet-popup").count(), 0);
      assert.equal(await page.locator("#map-fallback").isVisible(), true);
      assert.equal(await page.locator("#spin-button").isEnabled(), true);

      await page.locator("#spin-button").click();
      await page.waitForFunction(
        () => document.querySelector("#result-name")?.textContent === "築地場外市場",
      );
      const spinRequest = apiRequests.find(
        (request) => request.pathname === "/api/spin",
      );
      assert.equal(JSON.parse(spinRequest.body).regionId, "tokyo");
      assert.equal(await page.locator("#city-search").isEnabled(), true);
      await fs.writeFile(
        path.join(outputDir, "candidate-confirm-failure.json"),
        `${JSON.stringify(
          {
            confirmedCity: "tokyo",
            placesFailed: true,
            spinRequest: JSON.parse(spinRequest.body),
            apiRequests,
          },
          null,
          2,
        )}\n`,
      );
      await page.screenshot({
        path: path.join(outputDir, "candidate-confirm-failure.png"),
        fullPage: true,
      });
      assert.deepEqual(pageErrors, []);
      await context.close();
    },
  },
  {
    name: "delayed current places response does not close a candidate preview",
    async run(browser) {
      const { context, page, pageErrors, apiRequests } = await openPage(
        browser,
        { width: 1280, height: 900 },
        { delayByRegion: { beijing: 1200 } },
      );
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await waitForCityReady(page);
      await page.waitForSelector("#city-search:not([disabled])");

      await page.locator("#city-search").focus();
      await page.locator("#city-search").fill("tok");
      await page.locator('.search-result-button[data-city-id="tokyo"]').click();
      await page.waitForFunction(
        () => !document.querySelector("#candidate-preview")?.hidden,
      );
      const previewState = await mapState(page);
      assert.equal(await page.locator(".city-marker-current").count(), 1);
      assert.equal(await page.locator(".city-marker-candidate").count(), 1);

      await page.waitForFunction(
        () =>
          document
            .querySelector("#place-status")
            ?.textContent.includes("已加载 5 个公开地点"),
      );
      assert.equal(
        await page.locator("#candidate-preview").getAttribute("data-candidate-id"),
        "tokyo",
      );
      assert.equal(await page.locator("#city-select").inputValue(), "beijing");
      assert.match(
        await page.locator("#map-caption").textContent(),
        /候选预览：东京 · 当前抽签城市：北京/,
      );
      const previewAfterResponse = await mapState(page);
      assert.ok(Math.abs(previewAfterResponse.lat - previewState.lat) < 0.01);
      assert.ok(Math.abs(previewAfterResponse.lng - previewState.lng) < 0.01);
      assert.equal(previewAfterResponse.zoom, previewState.zoom);
      assert.equal(
        apiRequests.some((request) =>
          request.pathname.includes("/regions/tokyo/places"),
        ),
        false,
      );
      await fs.writeFile(
        path.join(outputDir, "candidate-delayed-current-network.json"),
        `${JSON.stringify(
          {
            candidate: "tokyo",
            currentCity: "beijing",
            previewState,
            previewAfterPlacesResponse: previewAfterResponse,
            apiRequests,
          },
          null,
          2,
        )}\n`,
      );

      await page.locator("#cancel-city-button").click();
      await page.waitForFunction(
        () => document.querySelector("#candidate-preview")?.hidden === true,
      );
      const returnedState = await mapState(page);
      assert.ok(Math.abs(returnedState.lat - 39.9042) < 1);
      assert.ok(Math.abs(returnedState.lng - 116.4074) < 1);
      assert.deepEqual(pageErrors, []);
      await context.close();
    },
  },
  {
    name: "tile failure keeps city discovery usable",
    async run(browser) {
      const { context, page, pageErrors, apiRequests } = await openPage(
        browser,
        { width: 1280, height: 900 },
        { failTiles: true },
      );
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await waitForCityReady(page);
      await waitForMarkers(page);
      await waitForCityMarkers(page);
      await page.waitForSelector("#city-search:not([disabled])");
      await page.waitForFunction(
        () => !document.querySelector("#map-fallback")?.hidden,
      );
      apiRequests.length = 0;

      await page.locator("#city-search").focus();
      await page.locator("#city-search").fill("tok");
      await page.locator('.search-result-button[data-city-id="tokyo"]').click();
      assert.equal(await page.locator("#candidate-preview").isVisible(), true);
      assert.equal(
        intersectionArea(
          await page.locator("#candidate-preview").boundingBox(),
          await page.locator("#map-fallback").boundingBox(),
        ),
        0,
      );
      assert.equal(apiRequests.length, 0);
      await page.locator("#cancel-city-button").click();

      await page.locator("#spin-button").click();
      await page.waitForFunction(
        () => document.querySelector("#result-name")?.textContent === "北京烤鸭",
      );
      await page.waitForSelector(".leaflet-popup-close-button");
      await page.locator(".leaflet-popup-close-button").click();

      await page.locator("#city-search").fill("tok");
      await page.locator('.search-result-button[data-city-id="tokyo"]').click();
      await page.locator("#confirm-city-button").click();
      await page.waitForFunction(
        () =>
          document.querySelector("#city-select")?.value === "tokyo" &&
          document.querySelector("#places-list")?.textContent.includes("築地場外市場"),
      );
      assert.equal(await page.locator("#map-fallback").isVisible(), true);
      assert.equal(await page.locator("#city-search").isEnabled(), true);
      assert.equal(await page.locator("#spin-button").isEnabled(), true);
      await page.screenshot({
        path: path.join(outputDir, "tile-failure-city-discovery.png"),
        fullPage: true,
      });
      assert.deepEqual(pageErrors, []);
      await context.close();
    },
  },
  {
    name: "mobile city discovery supports cancel and confirm",
    async run(browser) {
      const { context, page, pageErrors, apiRequests } = await openPage(
        browser,
        { width: 390, height: 844 },
        {},
      );
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await waitForCityReady(page);
      await waitForMarkers(page);
      await waitForCityMarkers(page);
      await page.waitForSelector("#city-search:not([disabled])");
      await assertNoOverflow(page);
      apiRequests.length = 0;

      await page.locator("#city-search").tap();
      await page.locator("#city-search").fill("tok");
      await page.locator('.search-result-button[data-city-id="tokyo"]').tap();
      await page.waitForFunction(
        () => !document.querySelector("#candidate-preview")?.hidden,
      );
      await assertNoOverflow(page);
      await page.screenshot({
        path: path.join(outputDir, "mobile-candidate-preview.png"),
        fullPage: true,
      });
      assert.equal(await page.locator("#city-select").inputValue(), "beijing");
      assert.equal(apiRequests.length, 0);
      await page.locator("#cancel-city-button").tap();
      await page.waitForFunction(
        () => document.querySelector("#candidate-preview")?.hidden === true,
      );
      assert.equal(await page.locator("#city-select").inputValue(), "beijing");

      await page.locator("#city-search").fill("tok");
      await page.locator('.search-result-button[data-city-id="tokyo"]').tap();
      await page.locator("#confirm-city-button").tap();
      await page.waitForFunction(
        () =>
          document.querySelector("#city-select")?.value === "tokyo" &&
          document.querySelector("#places-list")?.textContent.includes("築地場外市場"),
      );
      await page.locator("#return-city-button").tap();
      await assertNoOverflow(page);
      await page.screenshot({
        path: path.join(outputDir, "mobile-city-discovery.png"),
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
      assert.equal(await page.locator(".place-marker-icon").count(), 0);
      assert.equal(await page.locator(".city-marker").count(), 9);
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
    name: "tile failure popup stays unobstructed on desktop and mobile",
    async run(browser) {
      const viewports = [
        { width: 1280, height: 900, suffix: "desktop" },
        { width: 390, height: 844, suffix: "mobile" },
      ];

      for (const viewport of viewports) {
        const { context, page, pageErrors } = await openPage(
          browser,
          { width: viewport.width, height: viewport.height },
          { failTiles: true },
        );
        await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
        await waitForCityReady(page);
        await waitForMarkers(page);
        await waitForCityMarkers(page);
        await page.waitForFunction(
          () => !document.querySelector("#map-fallback")?.hidden,
          null,
          { timeout: 8000 },
        );

        assert.match(
          await page.locator("#map-fallback-detail").textContent(),
          /底图暂时不可用/,
        );
        assert.equal(await page.locator(".place-marker-icon").count(), 5);

        await page.locator("#spin-button").click();
        await page.waitForFunction(
          () => document.querySelector("#result-name")?.textContent === "北京烤鸭",
        );
        await page.waitForFunction(() => {
          const popup = document.querySelector(".leaflet-popup");
          return popup && getComputedStyle(popup).opacity === "1";
        });
        await page.waitForSelector(".popup-name");
        await page.waitForTimeout(550);

        const fallbackBox = await page.locator("#map-fallback").boundingBox();
        const popupBox = await page.locator(".leaflet-popup").boundingBox();
        assert.equal(
          intersectionArea(fallbackBox, popupBox),
          0,
          "Map fallback overlaps the visible place popup",
        );
        assert.equal(
          await page.locator(".popup-name").textContent(),
          "北京烤鸭",
        );
        await page.screenshot({
          path: path.join(
            outputDir,
            `tile-failure-popup-${viewport.suffix}.png`,
          ),
          fullPage: true,
        });
        assert.deepEqual(pageErrors, []);
        await context.close();
      }
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
