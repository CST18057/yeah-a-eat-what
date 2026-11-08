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

const foodByRegion = {
  beijing: {
    dish: "北京烤鸭",
    image: "/food/beijing-peking-duck.jpg",
    alt: "盘中片好的北京烤鸭示例图片",
    credit: "Wikimedia Commons · CC BY-SA 4.0 · Mcyjerry",
  },
  shanghai: {
    dish: "小笼包",
    image: "/food/shanghai-xiaolongbao.jpg",
    alt: "蒸笼里的小笼包示例图片",
    credit: "Wikimedia Commons · CC BY 2.0 · Junhao!",
  },
  guangzhou: {
    dish: "广式点心",
    image: "/food/guangzhou-dim-sum.jpg",
    alt: "摆满蒸笼的广式点心示例图片",
    credit: "Wikimedia Commons · CC0 · afterdog",
  },
  chengdu: {
    dish: "四川火锅",
    image: "/food/chengdu-hotpot.jpg",
    alt: "红汤四川火锅与配菜示例图片",
    credit: "Wikimedia Commons · CC0 · Fumikas Sagisavas",
  },
  xian: {
    dish: "肉夹馍",
    image: "/food/xian-roujiamo.jpg",
    alt: "肉夹馍与豆腐汤示例图片",
    credit: "Wikimedia Commons · CC0 · Suginami",
  },
  tokyo: {
    dish: "寿司",
    image: "/food/tokyo-sushi.jpg",
    alt: "黑色餐盘上的寿司拼盘示例图片",
    credit: "Wikimedia Commons · CC0 · Mojmir Churavy",
  },
  singapore: {
    dish: "叻沙",
    image: "/food/singapore-laksa.jpg",
    alt: "一碗叻沙汤面示例图片",
    credit: "Wikimedia Commons · CC0 · Andy Li",
  },
  berlin: {
    dish: "咖喱肠",
    image: "/food/berlin-currywurst.jpg",
    alt: "咖喱肠配薯条示例图片",
    credit: "Wikimedia Commons · CC0 · Jrcraft Yt",
  },
  "new-york": {
    dish: "贝果",
    image: "/food/new-york-bagel.jpg",
    alt: "夹烟熏三文鱼的芝麻贝果示例图片",
    credit: "Wikimedia Commons · CC0 · Funknendai",
  },
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
    food: foodByRegion[regionId],
  }));
}

function explorePlacesForBounds(bounds, count = 3, batch = 1) {
  return Array.from({ length: count }, (_, index) => ({
    id: `explore-${batch}-${index + 1}`,
    name: `探索地点 ${batch}-${index + 1}`,
    cityId: "beijing",
    cityName: "北京",
    lat:
      bounds.south +
      ((index + 1) / (count + 1)) * (bounds.north - bounds.south),
    lng:
      bounds.west +
      ((index + 1) / (count + 1)) * (bounds.east - bounds.west),
    cuisine: "公开示例",
    address: "探索区域示例地址",
    source: {
      provider: "OpenStreetMap",
      type: "node",
      id: 9000 + index,
      url: `https://www.openstreetmap.org/node/${9000 + index}`,
    },
  }));
}

async function routeJson(route, status, payload, headers = {}) {
  await route.fulfill({
    status,
    contentType: "application/json; charset=utf-8",
    headers,
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

  let exploreCallCount = 0;
  await page.route(/\/api\/explore(?:\?.*)?$/, async (route) => {
    exploreCallCount += 1;
    const modes = options.exploreModes || [];
    const mode =
      modes[Math.min(exploreCallCount - 1, modes.length - 1)] ||
      options.exploreMode ||
      "success";
    const configuredDelay =
      options.exploreDelayByCall?.[exploreCallCount - 1] ??
      options.exploreDelay ??
      0;
    if (configuredDelay || mode === "network_timeout") {
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          mode === "network_timeout" ? 6000 : configuredDelay,
        ),
      );
    }
    if (mode === "network_timeout") {
      try {
        await route.abort("timedout");
      } catch {}
      return;
    }

    const url = new URL(route.request().url());
    const bounds = {
      west: Number(url.searchParams.get("west")),
      south: Number(url.searchParams.get("south")),
      east: Number(url.searchParams.get("east")),
      north: Number(url.searchParams.get("north")),
    };
    const limit = Number(url.searchParams.get("limit") || 40);

    if (mode === "empty") {
      await routeJson(route, 200, {
        version: "0.5.0",
        bounds,
        limit,
        total: 0,
        returned: 0,
        truncated: false,
        places: [],
      });
      return;
    }
    if (mode === "truncated") {
      const places = explorePlacesForBounds(bounds, 2, exploreCallCount);
      await routeJson(route, 200, {
        version: "0.5.0",
        bounds,
        limit,
        total: 7,
        returned: places.length,
        truncated: true,
        places,
      });
      return;
    }
    if (mode === "too_large") {
      await routeJson(route, 400, {
        error: {
          code: "REGION_TOO_LARGE",
          message: "Region is too large",
        },
      });
      return;
    }
    if (mode === "rate_limited") {
      await routeJson(
        route,
        429,
        {
          error: {
            code: "RATE_LIMITED",
            message: "Too many explore requests",
          },
          retryAfterSeconds: 2,
        },
        { "Retry-After": "2" },
      );
      return;
    }
    if (mode === "server_timeout") {
      await routeJson(route, 504, {
        error: {
          code: "EXPLORE_TIMEOUT",
          message: "Explore request timed out",
        },
      });
      return;
    }
    if (mode === "error") {
      await routeJson(route, 500, {
        error: {
          code: "INTERNAL_ERROR",
          message: "Explore request failed",
        },
      });
      return;
    }

    const places = explorePlacesForBounds(bounds, 3, exploreCallCount);
    try {
      await routeJson(route, 200, {
        version: "0.5.0",
        bounds,
        limit,
        total: places.length,
        returned: places.length,
        truncated: false,
        places,
      });
    } catch (error) {
      if (
        !/Route is already handled|Target page, context or browser has been closed/.test(
          error.message,
        )
      ) {
        throw error;
      }
    }
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

  if (options.failFoodImages) {
    await page.route("**/food/**", (route) => route.abort());
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
        url: request.url(),
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

async function exploreState(page) {
  return page.locator("#explore-toolbar").evaluate((element) => ({
    hidden: element.hidden,
    status: element.dataset.status,
    requestId: element.dataset.requestId,
    source: element.dataset.source,
    limit: Number(element.dataset.limit),
    total: Number(element.dataset.total),
    returned: Number(element.dataset.returned),
    truncated: element.dataset.truncated === "true",
    errorCode: element.dataset.errorCode,
    retryAfterSeconds:
      element.dataset.retryAfterSeconds === ""
        ? null
        : Number(element.dataset.retryAfterSeconds),
    bounds: element.dataset.bounds ? JSON.parse(element.dataset.bounds) : null,
    cacheKey: element.dataset.cacheKey,
    updatedAt: Number(element.dataset.updatedAt),
  }));
}

async function zoomWorldMapWithWheel(page, targetZoom = 4) {
  await page.locator("#map").hover();
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const zoom = Number(
      await page.locator("#map").getAttribute("data-zoom"),
    );
    if (zoom >= targetZoom) {
      return;
    }
    await page.mouse.wheel(0, -700);
    await page.waitForTimeout(120);
  }
  throw new Error(`Map did not reach zoom ${targetZoom}`);
}

async function zoomWorldMapWithTouch(context, page, targetZoom = 4) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const zoom = Number(
      await page.locator("#map").getAttribute("data-zoom"),
    );
    if (zoom >= targetZoom) {
      return;
    }
    await pinchToZoom(context, page);
    await page.waitForTimeout(150);
  }
  throw new Error(`Touch map did not reach zoom ${targetZoom}`);
}

async function zoomWorldMapWithControls(page, targetZoom = 4) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const zoom = Number(
      await page.locator("#map").getAttribute("data-zoom"),
    );
    if (zoom >= targetZoom) {
      return;
    }
    await page.locator(".leaflet-control-zoom-in").click();
    await page.waitForTimeout(150);
  }
  throw new Error(`Map controls did not reach zoom ${targetZoom}`);
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
      assert.equal(await page.locator("#result-media").isVisible(), true);
      assert.equal(await page.locator("#result-image").isVisible(), true);
      assert.equal(
        await page.locator("#result-image").evaluate((image) => image.naturalWidth > 0),
        true,
      );
      assert.match(await page.locator("#result-image").getAttribute("alt"), /示例图片/);
      assert.match(
        await page.locator("#result-image-credit").textContent(),
        /Wikimedia Commons.*Mcyjerry/,
      );
      const desktopResultCard = await page.locator("#result-card").boundingBox();
      const desktopResultMedia = await page.locator("#result-media").boundingBox();
      assert.ok(
        desktopResultMedia.x >= desktopResultCard.x &&
          desktopResultMedia.x + desktopResultMedia.width <=
            desktopResultCard.x + desktopResultCard.width,
        "Desktop food image exceeds the result card",
      );
      await page.waitForSelector(".popup-name");
      assert.equal(await page.locator(".popup-name").textContent(), "北京烤鸭");
      await page.waitForFunction(() => {
        const popup = document.querySelector(".leaflet-popup");
        const image = document.querySelector(".popup-food-image");
        return (
          popup &&
          getComputedStyle(popup).opacity === "1" &&
          image &&
          image.complete &&
          image.naturalWidth > 0
        );
      });
      await page.locator(".popup-food-image").scrollIntoViewIfNeeded();
      assert.equal(await page.locator(".popup-food-image").isVisible(), true);
      assert.equal(
        await page
          .locator(".popup-food-image")
          .evaluate((image) => image.naturalWidth > 0),
        true,
      );
      assert.equal(
        await page.locator(".popup-food").evaluate((media) =>
          media.closest("[data-place-id]")?.dataset.placeId,
        ),
        await page.locator("#result-card").getAttribute("data-place-id"),
      );
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
      assert.equal(await page.locator("#result-media").isVisible(), true);
      assert.equal(await page.locator("#result-image").isVisible(), true);
      const mobileResultCard = await page.locator("#result-card").boundingBox();
      const mobileResultMedia = await page.locator("#result-media").boundingBox();
      assert.ok(
        mobileResultMedia.x >= mobileResultCard.x &&
          mobileResultMedia.x + mobileResultMedia.width <=
            mobileResultCard.x + mobileResultCard.width,
        "Mobile food image exceeds the result card",
      );
      await page.waitForSelector(".popup-name");
      assert.equal(await page.locator(".popup-name").textContent(), "北京烤鸭");
      await page.waitForFunction(() => {
        const popup = document.querySelector(".leaflet-popup");
        const image = document.querySelector(".popup-food-image");
        return (
          popup &&
          getComputedStyle(popup).opacity === "1" &&
          image &&
          image.complete &&
          image.naturalWidth > 0
        );
      });
      await page.locator(".popup-food-image").scrollIntoViewIfNeeded();
      assert.equal(await page.locator(".popup-food-image").isVisible(), true);
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
    name: "explicit exploration is dirty-gated and cached",
    async run(browser) {
      const { context, page, pageErrors, apiRequests } = await openPage(
        browser,
        { width: 1280, height: 900 },
        { exploreDelay: 200 },
      );
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await waitForCityReady(page);
      await waitForMarkers(page);
      await waitForCityMarkers(page);

      const selectedCity = await page.locator("#city-select").inputValue();
      const placesText = await page.locator("#places-list").textContent();
      const resultText = await page.locator("#result-name").textContent();
      assert.equal(await page.locator("#explore-toolbar").isVisible(), false);
      apiRequests.length = 0;

      await page.locator("#world-view-button").click();
      await page.waitForFunction(
        () => !document.querySelector("#explore-toolbar")?.hidden,
      );
      assert.equal((await exploreState(page)).status, "idle");
      assert.equal(
        apiRequests.filter((request) => request.pathname === "/api/explore")
          .length,
        0,
      );

      await dragMapWithMouse(page, 80, 40);
      await page.waitForFunction(
        () =>
          document.querySelector("#explore-toolbar")?.dataset.status ===
          "dirty",
      );
      assert.equal(await page.locator(".explore-marker").count(), 0);
      await zoomWorldMapWithWheel(page, 4);
      await page.waitForFunction(
        () =>
          document.querySelector("#explore-toolbar")?.dataset.status ===
          "dirty",
      );
      assert.equal(
        apiRequests.filter((request) => request.pathname === "/api/explore")
          .length,
        0,
      );

      await page.locator("#explore-button").click();
      await page.waitForFunction(
        () =>
          document.querySelector("#explore-toolbar")?.dataset.status ===
          "loading",
      );
      assert.equal(
        await page.locator("#explore-button").getAttribute("aria-busy"),
        "true",
      );
      await page.waitForFunction(
        () =>
          document.querySelector("#explore-toolbar")?.dataset.status ===
          "ready",
      );

      const readyState = await exploreState(page);
      assert.equal(readyState.source, "network");
      assert.equal(readyState.total, 3);
      assert.equal(readyState.returned, 3);
      assert.equal(readyState.limit, 40);
      assert.equal(await page.locator(".explore-marker").count(), 3);
      assert.equal(await page.locator(".place-marker-icon").count(), 5);
      assert.equal(await page.locator(".city-marker").count(), 9);
      assert.equal(await page.locator("#city-select").inputValue(), selectedCity);
      assert.equal(await page.locator("#places-list").textContent(), placesText);
      assert.equal(await page.locator("#result-name").textContent(), resultText);
      assert.equal(
        await page
          .locator("#world-view-button")
          .getAttribute("aria-pressed"),
        "true",
      );

      const exploreRequests = apiRequests.filter(
        (request) => request.pathname === "/api/explore",
      );
      assert.equal(exploreRequests.length, 1);
      const requestUrl = new URL(exploreRequests[0].url);
      for (const name of ["west", "south", "east", "north"]) {
        assert.match(requestUrl.searchParams.get(name), /^-?\d+\.\d{2}$/);
      }
      assert.equal(requestUrl.searchParams.get("limit"), "40");
      await page.screenshot({
        path: path.join(outputDir, "explore-ready.png"),
        fullPage: true,
      });
      await page.locator(".explore-marker").first().click();
      await page.waitForSelector(".explore-popup-name");
      assert.match(
        await page.locator(".explore-popup-source").textContent(),
        /探索地点 · OpenStreetMap/,
      );
      await page.locator(".leaflet-popup-close-button").click();

      await page.locator("#explore-button").click();
      await page.waitForFunction(
        () =>
          document.querySelector("#explore-toolbar")?.dataset.source ===
          "cache",
      );
      const cacheState = await exploreState(page);
      assert.equal(
        apiRequests.filter((request) => request.pathname === "/api/explore")
          .length,
        1,
      );

      await page.locator("#explore-clear-button").click();
      await page.waitForFunction(
        () =>
          document.querySelector("#explore-toolbar")?.dataset.status ===
          "idle",
      );
      assert.equal(await page.locator(".explore-marker").count(), 0);
      await page.locator("#return-city-button").click();
      assert.equal(await page.locator("#explore-toolbar").isVisible(), false);
      await fs.writeFile(
        path.join(outputDir, "explore-explicit.json"),
        `${JSON.stringify(
          {
            selectedCity,
            automaticExploreRequestsBeforeClick: 0,
            networkState: readyState,
            cacheState,
            exploreRequests,
            clearResetStatus: "idle",
            currentCityExitHidden: true,
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
    name: "explore cache expires after thirty seconds",
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

      await page.locator("#world-view-button").click();
      await zoomWorldMapWithWheel(page, 4);
      await page.locator("#explore-button").click();
      await page.waitForFunction(
        () =>
          document.querySelector("#explore-toolbar")?.dataset.status ===
          "ready",
      );
      await page.locator("#explore-button").click();
      await page.waitForFunction(
        () =>
          document.querySelector("#explore-toolbar")?.dataset.source ===
          "cache",
      );
      assert.equal(
        apiRequests.filter((request) => request.pathname === "/api/explore")
          .length,
        1,
      );

      await page.evaluate(() => {
        window.__realDateNow = Date.now;
        const base = Date.now();
        Date.now = () => base + 31000;
      });
      await page.locator("#explore-button").click();
      await page.waitForFunction(
        () =>
          document.querySelector("#explore-toolbar")?.dataset.source ===
          "network",
      );
      assert.equal(
        apiRequests.filter((request) => request.pathname === "/api/explore")
          .length,
        2,
      );
      assert.deepEqual(
        await page
          .locator(".explore-marker")
          .evaluateAll((markers) =>
            markers.map((marker) => marker.dataset.exploreId),
          ),
        ["explore-2-1", "explore-2-2", "explore-2-3"],
      );
      await fs.writeFile(
        path.join(outputDir, "explore-cache.json"),
        `${JSON.stringify(
          {
            ttlSeconds: 30,
            requestsBeforeExpiry: 1,
            requestsAfterExpiry: 2,
            finalState: await exploreState(page),
          },
          null,
          2,
        )}\n`,
      );
      await page.evaluate(() => {
        Date.now = window.__realDateNow;
        delete window.__realDateNow;
      });
      assert.deepEqual(pageErrors, []);
      await context.close();
    },
  },
  {
    name: "explore empty and truncated states stay separate from lunch data",
    async run(browser) {
      const scenarios = [
        {
          mode: "empty",
          status: "empty",
          returned: 0,
          total: 0,
          markers: 0,
          text: "当前区域没有公开地点",
        },
        {
          mode: "truncated",
          status: "truncated",
          returned: 2,
          total: 7,
          markers: 2,
          text: "显示前 2 个，共 7 个",
        },
      ];

      for (const scenario of scenarios) {
        const { context, page, pageErrors } = await openPage(
          browser,
          { width: 1280, height: 900 },
          { exploreMode: scenario.mode },
        );
        await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
        await waitForCityReady(page);
        await waitForMarkers(page);
        await waitForCityMarkers(page);
        const selectedCity = await page.locator("#city-select").inputValue();
        const placesText = await page.locator("#places-list").textContent();

        await page.locator("#world-view-button").click();
        await zoomWorldMapWithWheel(page, 4);
        await page.locator("#explore-button").click();
        await page.waitForFunction(
          (expectedStatus) =>
            document.querySelector("#explore-toolbar")?.dataset.status ===
            expectedStatus,
          scenario.status,
        );
        const current = await exploreState(page);
        assert.equal(current.total, scenario.total);
        assert.equal(current.returned, scenario.returned);
        assert.equal(current.truncated, scenario.status === "truncated");
        assert.equal(await page.locator(".explore-marker").count(), scenario.markers);
        assert.match(
          await page.locator("#explore-status").textContent(),
          new RegExp(scenario.text),
        );
        assert.equal(await page.locator("#city-select").inputValue(), selectedCity);
        assert.equal(await page.locator("#places-list").textContent(), placesText);
        assert.deepEqual(pageErrors, []);
        await context.close();
      }
    },
  },
  {
    name: "explore rejects oversized regions without a request",
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

      await page.locator("#world-view-button").click();
      await page.locator("#explore-button").click();
      await page.waitForFunction(
        () =>
          document.querySelector("#explore-toolbar")?.dataset.status ===
          "too_large",
      );
      assert.match(
        await page.locator("#explore-status").textContent(),
        /区域过大，请放大地图后重试/,
      );
      assert.equal(
        apiRequests.filter((request) => request.pathname === "/api/explore")
          .length,
        0,
      );
      assert.equal(await page.locator(".explore-marker").count(), 0);
      await page.screenshot({
        path: path.join(outputDir, "explore-too-large.png"),
        fullPage: true,
      });

      await zoomWorldMapWithWheel(page, 4);
      await page.waitForFunction(
        () =>
          document.querySelector("#explore-toolbar")?.dataset.status ===
          "dirty",
      );
      await page.locator("#explore-button").click();
      await page.waitForFunction(
        () =>
          document.querySelector("#explore-toolbar")?.dataset.status ===
          "ready",
      );
      assert.equal(await page.locator(".explore-marker").count(), 3);
      assert.deepEqual(pageErrors, []);
      await context.close();
    },
  },
  {
    name: "explore rate limit shows retry countdown",
    async run(browser) {
      const { context, page, pageErrors, apiRequests } = await openPage(
        browser,
        { width: 1280, height: 900 },
        { exploreModes: ["rate_limited", "success"] },
      );
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await waitForCityReady(page);
      await waitForMarkers(page);
      await waitForCityMarkers(page);
      apiRequests.length = 0;

      await page.locator("#world-view-button").click();
      await zoomWorldMapWithWheel(page, 4);
      await page.locator("#explore-button").click();
      await page.waitForFunction(
        () =>
          document.querySelector("#explore-toolbar")?.dataset.status ===
          "rate_limited",
      );
      const limited = await exploreState(page);
      assert.ok(limited.retryAfterSeconds > 0);
      assert.match(
        await page.locator("#explore-status").textContent(),
        /请求过于频繁，请在 \d+ 秒后重试/,
      );
      assert.equal(await page.locator("#explore-retry-button").isVisible(), true);
      assert.equal(await page.locator("#explore-retry-button").isDisabled(), true);
      assert.equal(await page.locator(".explore-marker").count(), 0);

      await page.waitForFunction(
        () =>
          Number(
            document.querySelector("#explore-toolbar")?.dataset
              .retryAfterSeconds,
          ) === 0,
        null,
        { timeout: 5000 },
      );
      assert.equal(
        await page.locator("#explore-retry-button").isDisabled(),
        false,
      );
      await page.locator("#explore-retry-button").click();
      await page.waitForFunction(
        () =>
          document.querySelector("#explore-toolbar")?.dataset.status ===
          "ready",
      );
      assert.equal(await page.locator(".explore-marker").count(), 3);
      assert.equal(
        apiRequests.filter((request) => request.pathname === "/api/explore")
          .length,
        2,
      );
      await fs.writeFile(
        path.join(outputDir, "explore-rate-limit.json"),
        `${JSON.stringify(
          {
            limitedState: limited,
            finalState: await exploreState(page),
            exploreRequests: apiRequests.filter(
              (request) => request.pathname === "/api/explore",
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
    name: "explore timeout and error states can retry",
    async run(browser) {
      const { context, page, pageErrors, apiRequests } = await openPage(
        browser,
        { width: 1280, height: 900 },
        { exploreModes: ["server_timeout", "error", "success"] },
      );
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await waitForCityReady(page);
      await waitForMarkers(page);
      await waitForCityMarkers(page);

      await page.locator("#world-view-button").click();
      await zoomWorldMapWithWheel(page, 4);
      await page.locator("#explore-button").click();
      await page.waitForFunction(
        () =>
          document.querySelector("#explore-toolbar")?.dataset.status ===
          "timeout",
      );
      const timeoutState = await exploreState(page);
      assert.equal(await page.locator("#explore-retry-button").isVisible(), true);
      await page.locator("#explore-retry-button").click();
      await page.waitForFunction(
        () =>
          document.querySelector("#explore-toolbar")?.dataset.status ===
          "error",
      );
      const errorState = await exploreState(page);
      await page.locator("#explore-retry-button").click();
      await page.waitForFunction(
        () =>
          document.querySelector("#explore-toolbar")?.dataset.status ===
          "ready",
      );
      assert.equal(
        apiRequests.filter((request) => request.pathname === "/api/explore")
          .length,
        3,
      );
      await fs.writeFile(
        path.join(outputDir, "explore-timeout-error.json"),
        `${JSON.stringify(
          {
            timeoutState,
            errorState,
            finalState: await exploreState(page),
            exploreRequests: apiRequests.filter(
              (request) => request.pathname === "/api/explore",
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
    name: "explore client timeout aborts and can retry",
    async run(browser) {
      const { context, page, pageErrors } = await openPage(
        browser,
        { width: 1280, height: 900 },
        { exploreModes: ["network_timeout", "success"] },
      );
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await waitForCityReady(page);
      await waitForMarkers(page);
      await waitForCityMarkers(page);

      await page.locator("#world-view-button").click();
      await zoomWorldMapWithWheel(page, 4);
      await page.locator("#explore-button").click();
      await page.waitForFunction(
        () =>
          document.querySelector("#explore-toolbar")?.dataset.status ===
          "timeout",
        null,
        { timeout: 8000 },
      );
      const timeoutState = await exploreState(page);
      assert.equal(await page.locator("#explore-retry-button").isVisible(), true);
      await page.locator("#explore-retry-button").click();
      await page.waitForFunction(
        () =>
          document.querySelector("#explore-toolbar")?.dataset.status ===
          "ready",
      );
      assert.equal(await page.locator(".explore-marker").count(), 3);
      await fs.writeFile(
        path.join(outputDir, "explore-client-timeout.json"),
        `${JSON.stringify(
          {
            timeoutState,
            finalState: await exploreState(page),
            clientTimeoutMs: 5000,
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
    name: "explore keeps the latest request and clears on city exit",
    async run(browser) {
      const { context, page, pageErrors, apiRequests } = await openPage(
        browser,
        { width: 1280, height: 900 },
        { exploreDelayByCall: [700, 100] },
      );
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await waitForCityReady(page);
      await waitForMarkers(page);
      await waitForCityMarkers(page);
      const selectedCity = await page.locator("#city-select").inputValue();
      const placesText = await page.locator("#places-list").textContent();
      apiRequests.length = 0;

      await page.locator("#world-view-button").click();
      await zoomWorldMapWithWheel(page, 4);
      await page.locator("#explore-button").click();
      await page.waitForFunction(
        () =>
          document.querySelector("#explore-toolbar")?.dataset.status ===
          "loading",
      );
      await dragMapWithMouse(page, 60, 30);
      await page.locator("#explore-button").click();
      await page.waitForFunction(
        () =>
          document.querySelector("#explore-toolbar")?.dataset.status ===
          "ready",
      );
      assert.deepEqual(
        await page
          .locator(".explore-marker")
          .evaluateAll((markers) =>
            markers.map((marker) => marker.dataset.exploreId),
          ),
        ["explore-2-1", "explore-2-2", "explore-2-3"],
      );
      assert.equal(await page.locator("#city-select").inputValue(), selectedCity);
      assert.equal(await page.locator("#places-list").textContent(), placesText);
      assert.equal(
        apiRequests.filter((request) => request.pathname === "/api/explore")
          .length,
        2,
      );

      await page.locator("#return-city-button").click();
      await page.waitForFunction(
        () => document.querySelector("#explore-toolbar")?.hidden === true,
      );
      assert.equal(await page.locator(".explore-marker").count(), 0);

      await page.locator("#world-view-button").click();
      await zoomWorldMapWithWheel(page, 4);
      await page.locator("#explore-button").click();
      await page.waitForFunction(
        () =>
          document.querySelector("#explore-toolbar")?.dataset.status ===
          "ready",
      );
      await page.selectOption("#city-select", "shanghai");
      await page.waitForFunction(
        () =>
          document.querySelector("#explore-toolbar")?.hidden === true &&
          document.querySelector("#city-select")?.value === "shanghai",
      );
      assert.equal(await page.locator(".explore-marker").count(), 0);
      await fs.writeFile(
        path.join(outputDir, "explore-last-write.json"),
        `${JSON.stringify(
          {
            selectedCityBefore: selectedCity,
            latestMarkerIds: [
              "explore-2-1",
              "explore-2-2",
              "explore-2-3",
            ],
            exploreRequests: apiRequests.filter(
              (request) => request.pathname === "/api/explore",
            ),
            cityAfterSwitch: "shanghai",
            layerCleared: true,
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
    name: "mobile exploration supports touch drag, zoom, clear, and return",
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

      await page.locator("#world-view-button").tap();
      await page.waitForFunction(
        () => !document.querySelector("#explore-toolbar")?.hidden,
      );
      await zoomWorldMapWithTouch(context, page, 4);
      await dragMapWithTouch(context, page, 45, 20);
      await page.waitForFunction(
        () =>
          document.querySelector("#explore-toolbar")?.dataset.status ===
          "dirty",
      );
      assert.equal(await page.locator(".explore-marker").count(), 0);
      await assertNoOverflow(page);

      await page.locator("#explore-button").tap();
      await page.waitForFunction(
        () =>
          document.querySelector("#explore-toolbar")?.dataset.status ===
          "ready",
      );
      assert.equal(await page.locator(".explore-marker").count(), 3);
      await assertNoOverflow(page);
      await page.screenshot({
        path: path.join(outputDir, "mobile-explore.png"),
        fullPage: true,
      });

      await page.locator("#explore-clear-button").tap();
      await page.waitForFunction(
        () =>
          document.querySelector("#explore-toolbar")?.dataset.status ===
          "idle",
      );
      assert.equal(await page.locator(".explore-marker").count(), 0);
      await page.locator("#return-city-button").tap();
      assert.equal(await page.locator("#explore-toolbar").isVisible(), false);
      assert.deepEqual(pageErrors, []);
      await context.close();
    },
  },
  {
    name: "exploration controls fit the 320px mobile viewport",
    async run(browser) {
      const { context, page, pageErrors } = await openPage(
        browser,
        { width: 320, height: 568 },
        {},
      );
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await waitForCityReady(page);
      await waitForMarkers(page);
      await waitForCityMarkers(page);

      await page.locator("#world-view-button").tap();
      await page.waitForFunction(
        () => !document.querySelector("#explore-toolbar")?.hidden,
      );
      await assertNoOverflow(page);
      await zoomWorldMapWithControls(page, 4);
      await page.locator("#explore-button").tap();
      await page.waitForFunction(
        () =>
          document.querySelector("#explore-toolbar")?.dataset.status ===
          "ready",
      );
      await assertNoOverflow(page);
      assert.equal(await page.locator(".explore-marker").count(), 3);
      await page.locator("#explore-clear-button").tap();
      await page.locator("#return-city-button").tap();
      await assertNoOverflow(page);
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
    name: "food image failures keep the selected result and map binding",
    async run(browser) {
      const viewports = [
        { width: 1280, height: 900, suffix: "desktop" },
        { width: 390, height: 844, suffix: "mobile" },
      ];

      for (const viewport of viewports) {
        const { context, page, pageErrors } = await openPage(
          browser,
          { width: viewport.width, height: viewport.height },
          { failFoodImages: true },
        );
        await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
        await waitForCityReady(page);
        await waitForMarkers(page);

        await page.locator("#spin-button").click();
        await page.waitForFunction(
          () => document.querySelector("#result-name")?.textContent === "北京烤鸭",
        );
        await page.waitForSelector("#result-image-fallback:not([hidden])");
        await page.waitForSelector(".popup-food-fallback:not([hidden])");

        assert.equal(await page.locator("#result-media").isVisible(), true);
        assert.equal(await page.locator("#result-image").isVisible(), false);
        assert.equal(
          (await page.locator("#result-image-fallback").textContent()).trim(),
          "美食图片暂不可用",
        );
        assert.match(
          await page.locator("#result-image-credit").textContent(),
          /Wikimedia Commons/,
        );
        assert.equal(
          await page.locator("#result-card").getAttribute("data-place-id"),
          "beijing-1",
        );
        assert.equal(
          await page.locator(".popup-food").evaluate((media) =>
            media.closest("[data-place-id]")?.dataset.placeId,
          ),
          "beijing-1",
        );
        assert.equal(await page.locator(".popup-food-image").isVisible(), false);
        assert.equal(
          (await page.locator(".popup-food-fallback").textContent()).trim(),
          "美食图片暂不可用",
        );
        assert.equal(await page.locator(".popup-name").textContent(), "北京烤鸭");
        await assertNoOverflow(page);

        await page.screenshot({
          path: path.join(
            outputDir,
            `food-image-failure-${viewport.suffix}.png`,
          ),
          fullPage: true,
        });
        assert.deepEqual(pageErrors, []);
        await context.close();
      }
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

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  assertNoOverflow,
  baseUrl,
  dragMapWithMouse,
  exploreState,
  installApiRoutes,
  mapState,
  openPage,
  outputDir,
  regionFixtures,
  startServer,
  waitForCityReady,
  waitForHttp,
  zoomWorldMapWithControls,
  zoomWorldMapWithWheel,
};
