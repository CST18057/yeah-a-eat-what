"use strict";

const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const cities = require("./catalog/cities");
const {
  FOOD_PROVIDERS,
  getFoodCandidatesForRegion,
  getFoodForRegion,
  getFoodProvider,
  validateFoodProviders,
} = require("./catalog/food-images");
const { validateRegions } = require("./catalog/validate");
const { spinRegion } = require("./data");
const { createServer } = require("./server");

let server;
let baseUrl;

async function startServer(options) {
  const instance = createServer(options);
  await new Promise((resolve, reject) => {
    instance.once("error", reject);
    instance.listen(0, "127.0.0.1", resolve);
  });
  return {
    server: instance,
    baseUrl: `http://127.0.0.1:${instance.address().port}`,
  };
}

async function stopServer(instance) {
  await new Promise((resolve, reject) => {
    instance.close((error) => (error ? reject(error) : resolve()));
  });
}

before(async () => {
  ({ server, baseUrl } = await startServer());
});

after(async () => {
  await stopServer(server);
});

async function jsonRequest(pathname, options, requestBaseUrl = baseUrl) {
  const response = await fetch(`${requestBaseUrl}${pathname}`, options);
  const body = await response.json();
  return { response, body };
}

test("catalog contains nine cities and forty-three traceable places", () => {
  validateRegions(cities);
  assert.equal(cities.length, 9);
  assert.deepEqual(
    cities.map((city) => city.id),
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

  const places = cities.flatMap((city) => city.places);
  assert.equal(places.length, 43);
  assert.equal(new Set(places.map((place) => place.id)).size, places.length);

  const expectedCounts = new Map([
    ["beijing", 5],
    ["shanghai", 5],
    ["guangzhou", 5],
    ["chengdu", 5],
    ["xian", 5],
    ["tokyo", 5],
    ["singapore", 4],
    ["berlin", 4],
    ["new-york", 5],
  ]);

  for (const city of cities) {
    assert.equal(city.places.length, expectedCounts.get(city.id));
    assert.equal(city.source.provider, "OpenStreetMap");
    for (const place of city.places) {
      assert.equal(place.source.provider, "OpenStreetMap");
      assert.ok(place.source.url.startsWith("https://www.openstreetmap.org/"));
      assert.ok(place.lat >= -90 && place.lat <= 90);
      assert.ok(place.lng >= -180 && place.lng <= 180);
    }
  }
});

test("catalog validation rejects an empty city", () => {
  assert.throws(
    () => validateRegions([{ ...cities[0], places: [] }]),
    /places must not be empty/,
  );
});

test("food catalog uses normalized provider arrays", () => {
  assert.equal(FOOD_PROVIDERS.length, 1);

  const provider = getFoodProvider("wikimedia-commons");
  assert.ok(provider);
  assert.equal(provider.name, "Wikimedia Commons");

  const allFoods = [];
  const beijingFoods = getFoodCandidatesForRegion("beijing");
  assert.equal(beijingFoods.length, 3);
  assert.equal(new Set(beijingFoods.map((food) => food.foodId)).size, 3);
  assert.equal(new Set(beijingFoods.map((food) => food.dish)).size, 3);
  assert.equal(new Set(beijingFoods.map((food) => food.image)).size, 3);
  assert.equal(getFoodForRegion("beijing"), beijingFoods[0]);
  assert.ok(Object.isFrozen(beijingFoods));

  for (const city of cities) {
    const foods = getFoodCandidatesForRegion(city.id);
    assert.equal(foods.length, 3, `${city.id} must have three food candidates`);
    assert.equal(new Set(foods.map((food) => food.foodId)).size, 3);
    assert.equal(new Set(foods.map((food) => food.dish)).size, 3);
    assert.equal(new Set(foods.map((food) => food.image)).size, 3);

    for (const food of foods) {
      allFoods.push(food);
      assert.match(food.foodId, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      assert.equal(food.regionId, city.id);
      assert.equal(food.providerId, provider.id);
      assert.equal(food.source.providerId, provider.id);
      assert.equal(food.source.provider, provider.name);
      assert.ok(food.dish.length > 0);
      assert.ok(food.alt.length > 0);
      assert.ok(food.credit.includes("resized"));
      assert.match(food.image, /^\/food\/[a-z0-9-]+\.jpg$/);
      assert.ok(
        food.source.url.startsWith("https://commons.wikimedia.org/wiki/File:"),
      );
      assert.match(
        food.source.licenseUrl,
        /^https:\/\/creativecommons\.org\/(licenses|publicdomain)\//,
      );
    }
  }

  assert.equal(allFoods.length, 27);
  assert.equal(new Set(allFoods.map((food) => food.foodId)).size, 27);
  assert.equal(new Set(allFoods.map((food) => food.image)).size, 27);
  assert.equal(
    validateFoodProviders(
      FOOD_PROVIDERS,
      cities.map((city) => city.id),
    ),
    FOOD_PROVIDERS,
  );
});

test("food catalog validation rejects duplicated or incomplete candidates", () => {
  const provider = getFoodProvider("wikimedia-commons");
  const beijingFoods = getFoodCandidatesForRegion("beijing");
  const duplicateImage = [
    {
      ...provider,
      regions: {
        ...provider.regions,
        beijing: [beijingFoods[0], beijingFoods[1], { ...beijingFoods[2], image: beijingFoods[1].image }],
      },
    },
  ];
  assert.throws(
    () => validateFoodProviders(duplicateImage),
    /image must be unique within a region/,
  );

  const incomplete = [
    {
      ...provider,
      regions: {
        ...provider.regions,
        beijing: beijingFoods.slice(0, 2),
      },
    },
  ];
  assert.throws(
    () => validateFoodProviders(incomplete),
    /must contain at least three foods/,
  );
});

test("every bundled food example has a licensed local image", async () => {
  for (const city of cities) {
    for (const food of getFoodCandidatesForRegion(city.id)) {
      const image = await fetch(`${baseUrl}${food.image}`);
      assert.equal(image.status, 200);
      assert.equal(image.headers.get("content-type"), "image/jpeg");
      assert.ok(Number(image.headers.get("content-length")) > 10000);
    }
  }
});

test("GET /api/regions returns the nine-city contract", async () => {
  const { response, body } = await jsonRequest("/api/regions");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
  assert.equal(body.regions.length, 9);
  assert.deepEqual(body.regions[0], {
    id: "beijing",
    name: "北京",
    nameEn: "Beijing",
    center: { lat: 39.9057136, lng: 116.3912972 },
    placeCount: 5,
    source: {
      provider: "OpenStreetMap",
      type: "relation",
      id: 912940,
      url: "https://www.openstreetmap.org/relation/912940",
    },
  });
});

test("new city endpoints expose the required place counts", async () => {
  const expectedCounts = new Map([
    ["tokyo", 5],
    ["singapore", 4],
    ["berlin", 4],
    ["new-york", 5],
  ]);

  for (const [regionId, count] of expectedCounts) {
    const { response, body } = await jsonRequest(`/api/regions/${regionId}/places`);
    assert.equal(response.status, 200);
    assert.equal(body.region.id, regionId);
    assert.equal(body.places.length, count);
    assert.equal(new Set(body.places.map((place) => place.id)).size, count);
    assert.ok(body.places.every((place) => place.source.provider === "OpenStreetMap"));
    assert.ok(
      body.places.every(
        (place) =>
          place.food.image.startsWith("/food/") &&
          place.food.source.license.length > 0 &&
          place.food.source.licenseUrl.startsWith("https://creativecommons.org/"),
      ),
    );
  }
});

test("repeated place requests are stable and return isolated data", async () => {
  const first = await jsonRequest("/api/regions/tokyo/places");
  const second = await jsonRequest("/api/regions/tokyo/places");
  assert.deepEqual(first.body, second.body);

  first.body.places[0].name = "mutated";
  const third = await jsonRequest("/api/regions/tokyo/places");
  assert.equal(third.body.places[0].name, "築地場外市場");
});

test("GET /api/regions/:id/places returns the selected city and places", async () => {
  const { response, body } = await jsonRequest("/api/regions/chengdu/places");
  assert.equal(response.status, 200);
  assert.equal(body.region.id, "chengdu");
  assert.equal(body.region.name, "成都");
  assert.equal(body.places.length, 5);
  assert.equal(body.places[0].id, "chengdu-kuanzhai");
  assert.equal(body.places[0].source.provider, "OpenStreetMap");
});

test("unknown cities return a structured 404", async () => {
  const { response, body } = await jsonRequest("/api/regions/seoul/places");
  assert.equal(response.status, 404);
  assert.deepEqual(body.error, {
    code: "REGION_NOT_FOUND",
    message: "Unknown region: seoul",
  });
});

test("Leaflet assets are served from the installed package", async () => {
  const script = await fetch(`${baseUrl}/vendor/leaflet/leaflet.js`);
  assert.equal(script.status, 200);
  assert.equal(script.headers.get("content-type"), "text/javascript; charset=utf-8");
  assert.match(await script.text(), /Leaflet/);

  const stylesheet = await fetch(`${baseUrl}/vendor/leaflet/leaflet.css`);
  assert.equal(stylesheet.status, 200);
  assert.equal(stylesheet.headers.get("content-type"), "text/css; charset=utf-8");
});

test("POST /api/spin returns a place from the requested city", async () => {
  const { response, body } = await jsonRequest("/api/spin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ regionId: "xian" }),
  });

  assert.equal(response.status, 200);
  assert.equal(body.region.id, "xian");
  assert.equal(body.region.name, "西安");
  assert.ok(body.place.id.startsWith("xian-"));
  assert.equal(body.place.source.provider, "OpenStreetMap");
  assert.equal(body.place.food.dish, "肉夹馍");
  assert.equal(body.place.food.image, "/food/xian-roujiamo.jpg");
  assert.equal(body.place.food.source.provider, "Wikimedia Commons");
});

test("spin selection is deterministic for an injected random source", () => {
  assert.equal(spinRegion("beijing", () => 0).place.id, "beijing-guijie");
  assert.equal(spinRegion("beijing", () => 0.999).place.id, "beijing-niujie");
  assert.equal(spinRegion("tokyo", () => 0).place.id, "tokyo-tsukiji-outer-market");
  assert.equal(spinRegion("new-york", () => 0.999).place.id, "new-york-brooklyn-borough-hall-greenmarket");
  assert.equal(spinRegion("missing"), null);
});

test("POST /api/spin validates its JSON body", async () => {
  const malformed = await jsonRequest("/api/spin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  });
  assert.equal(malformed.response.status, 400);
  assert.equal(malformed.body.error.code, "INVALID_JSON");

  const missingRegion = await jsonRequest("/api/spin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(missingRegion.response.status, 400);
  assert.equal(missingRegion.body.error.code, "REGION_ID_REQUIRED");
});

test("POST /api/spin rejects oversized JSON bodies", async () => {
  const oversized = await jsonRequest("/api/spin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ regionId: "beijing", padding: "x".repeat(17 * 1024) }),
  });
  assert.equal(oversized.response.status, 413);
  assert.equal(oversized.body.error.code, "BODY_TOO_LARGE");
});

test("API methods and routes fail predictably", async () => {
  const wrongMethod = await jsonRequest("/api/regions", { method: "POST" });
  assert.equal(wrongMethod.response.status, 405);
  assert.equal(wrongMethod.response.headers.get("allow"), "GET");

  const unknownApi = await jsonRequest("/api/missing");
  assert.equal(unknownApi.response.status, 404);
  assert.equal(unknownApi.body.error.code, "API_NOT_FOUND");
});

function explorePath(bounds, limit) {
  const search = new URLSearchParams({
    west: String(bounds.west),
    south: String(bounds.south),
    east: String(bounds.east),
    north: String(bounds.north),
  });
  if (limit !== undefined) {
    search.set("limit", String(limit));
  }
  return `/api/explore?${search}`;
}

test("GET /api/explore returns stable city-attributed places", async () => {
  const bounds = { west: 139.6, south: 35.6, east: 139.85, north: 35.8 };
  const { response, body } = await jsonRequest(explorePath(bounds));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
  assert.equal(body.version, "0.5.0");
  assert.deepEqual(body.bounds, bounds);
  assert.equal(body.limit, 40);
  assert.equal(body.total, 5);
  assert.equal(body.returned, 5);
  assert.equal(body.truncated, false);
  assert.deepEqual(
    body.places.map((place) => place.id),
    [
      "tokyo-ameyoko",
      "tokyo-golden-gai",
      "tokyo-omoide-yokocho",
      "tokyo-shibuya",
      "tokyo-tsukiji-outer-market",
    ],
  );
  assert.deepEqual(body.places[4], {
    id: "tokyo-tsukiji-outer-market",
    name: "築地場外市場",
    cityId: "tokyo",
    cityName: "东京",
    lat: 35.6653884,
    lng: 139.7704732,
    cuisine: "海鲜小吃",
    address: "中央区築地",
    source: {
      provider: "OpenStreetMap",
      type: "way",
      id: 606978548,
      url: "https://www.openstreetmap.org/way/606978548",
    },
  });
});

test("GET /api/explore handles empty regions and truncation", async () => {
  const empty = await jsonRequest(
    explorePath({ west: 0, south: 0, east: 1, north: 1 }),
  );
  assert.equal(empty.response.status, 200);
  assert.equal(empty.body.total, 0);
  assert.equal(empty.body.returned, 0);
  assert.equal(empty.body.truncated, false);
  assert.deepEqual(empty.body.places, []);

  const truncated = await jsonRequest(
    explorePath({ west: 139.6, south: 35.6, east: 139.85, north: 35.8 }, 1),
  );
  assert.equal(truncated.response.status, 200);
  assert.equal(truncated.body.total, 5);
  assert.equal(truncated.body.returned, 1);
  assert.equal(truncated.body.truncated, true);
  assert.equal(truncated.body.places[0].id, "tokyo-ameyoko");
});

test("GET /api/explore includes places on the bounds", async () => {
  const { response, body } = await jsonRequest(
    explorePath({
      west: 139.7704732,
      south: 35.6653884,
      east: 139.7804732,
      north: 35.6753884,
    }),
  );
  assert.equal(response.status, 200);
  assert.equal(body.total, 1);
  assert.equal(body.places[0].id, "tokyo-tsukiji-outer-market");
});

test("GET /api/explore enforces default and maximum limits", async () => {
  const tokyo = { west: 139.6, south: 35.6, east: 139.85, north: 35.8 };
  const defaultLimit = await jsonRequest(explorePath(tokyo));
  assert.equal(defaultLimit.response.status, 200);
  assert.equal(defaultLimit.body.limit, 40);
  assert.equal(defaultLimit.body.total, 5);
  assert.equal(defaultLimit.body.returned, 5);
  assert.equal(defaultLimit.body.truncated, false);

  const maxLimit = await jsonRequest(explorePath(tokyo, 100));
  assert.equal(maxLimit.response.status, 200);
  assert.equal(maxLimit.body.limit, 100);
  assert.equal(maxLimit.body.total, 5);
  assert.equal(maxLimit.body.returned, 5);
  assert.equal(maxLimit.body.truncated, false);
});

test("GET /api/explore rejects invalid bounds and limits", async () => {
  const cases = [
    ["/api/explore?south=0&east=1&north=1", "INVALID_BOUNDS"],
    ["/api/explore?west=0&west=1&south=0&east=1&north=1", "INVALID_BOUNDS"],
    ["/api/explore?west=Infinity&south=0&east=1&north=1", "INVALID_BOUNDS"],
    ["/api/explore?west=1&south=0&east=1&north=1", "INVALID_BOUNDS"],
    ["/api/explore?west=1&south=0&east=0&north=1", "INVALID_BOUNDS"],
    ["/api/explore?west=-181&south=0&east=1&north=1", "INVALID_BOUNDS"],
    ["/api/explore?west=-30&south=0&east=31&north=1", "REGION_TOO_LARGE"],
    ["/api/explore?west=0&south=0&east=1&north=31", "REGION_TOO_LARGE"],
    [explorePath({ west: 0, south: 0, east: 1, north: 1 }, 0), "INVALID_LIMIT"],
    [explorePath({ west: 0, south: 0, east: 1, north: 1 }, 101), "INVALID_LIMIT"],
    [explorePath({ west: 0, south: 0, east: 1, north: 1 }, 1.5), "INVALID_LIMIT"],
    [
      "/api/explore?west=0&south=0&east=1&north=1&limit=1&limit=2",
      "INVALID_LIMIT",
    ],
  ];

  for (const [pathname, expectedCode] of cases) {
    const { response, body } = await jsonRequest(pathname);
    assert.equal(response.status, 400, pathname);
    assert.equal(body.error.code, expectedCode, pathname);
  }
});

test("GET /api/explore is stable and returns isolated data", async () => {
  const pathname = explorePath({ west: 139.6, south: 35.6, east: 139.85, north: 35.8 });
  const firstResponse = await fetch(`${baseUrl}${pathname}`);
  const firstText = await firstResponse.text();
  const secondResponse = await fetch(`${baseUrl}${pathname}`);
  const secondText = await secondResponse.text();
  assert.equal(firstText, secondText);

  const first = { response: firstResponse, body: JSON.parse(firstText) };

  first.body.places[0].name = "mutated";
  const third = await jsonRequest(pathname);
  assert.equal(third.body.places[0].name, "アメ横");
});

test("GET /api/explore rate limits the 31st request in a fixed window", async () => {
  let currentTime = 0;
  const limited = await startServer({
    exploreRateLimit: {
      max: 30,
      windowMs: 60000,
      now: () => currentTime,
    },
  });

  try {
    const pathname = explorePath({ west: 0, south: 0, east: 1, north: 1 });
    for (let index = 0; index < 30; index += 1) {
      const allowed = await jsonRequest(pathname, undefined, limited.baseUrl);
      assert.equal(allowed.response.status, 200);
    }

    const blocked = await jsonRequest(pathname, undefined, limited.baseUrl);
    assert.equal(blocked.response.status, 429);
    assert.equal(blocked.body.error.code, "RATE_LIMITED");
    assert.equal(blocked.body.retryAfterSeconds, 60);
    assert.equal(blocked.response.headers.get("retry-after"), "60");

    currentTime = 60000;
    const reset = await jsonRequest(pathname, undefined, limited.baseUrl);
    assert.equal(reset.response.status, 200);
  } finally {
    await stopServer(limited.server);
  }
});

test("GET /api/explore uses client IPs from trusted proxies only", async () => {
  const limited = await startServer({
    exploreRateLimit: {
      max: 2,
      windowMs: 60000,
      now: () => 0,
    },
    trustedProxyCidrs: ["127.0.0.1/32"],
  });

  try {
    const pathname = explorePath({ west: 0, south: 0, east: 1, north: 1 });
    const requestAs = (clientIp) =>
      jsonRequest(pathname, { headers: { "CF-Connecting-IP": clientIp } }, limited.baseUrl);

    assert.equal((await requestAs("203.0.113.10")).response.status, 200);
    assert.equal((await requestAs("203.0.113.10")).response.status, 200);
    assert.equal((await requestAs("203.0.113.10")).response.status, 429);
    assert.equal((await requestAs("203.0.113.11")).response.status, 200);
  } finally {
    await stopServer(limited.server);
  }
});

test("GET /api/explore ignores forwarding headers from untrusted peers", async () => {
  const limited = await startServer({
    exploreRateLimit: {
      max: 1,
      windowMs: 60000,
      now: () => 0,
    },
  });

  try {
    const pathname = explorePath({ west: 0, south: 0, east: 1, north: 1 });
    const first = await jsonRequest(
      pathname,
      { headers: { "CF-Connecting-IP": "203.0.113.20" } },
      limited.baseUrl,
    );
    const second = await jsonRequest(
      pathname,
      { headers: { "CF-Connecting-IP": "203.0.113.21" } },
      limited.baseUrl,
    );

    assert.equal(first.response.status, 200);
    assert.equal(second.response.status, 429);
  } finally {
    await stopServer(limited.server);
  }
});

test("GET /api/explore returns 504 after the internal deadline", async () => {
  const timed = await startServer({
    exploreProcessingDelayMs: 25,
    exploreTimeoutMs: 5,
  });

  try {
    const { response, body } = await jsonRequest(
      explorePath({ west: 0, south: 0, east: 1, north: 1 }),
      undefined,
      timed.baseUrl,
    );
    assert.equal(response.status, 504);
    assert.equal(body.error.code, "EXPLORE_TIMEOUT");
  } finally {
    await stopServer(timed.server);
  }
});
