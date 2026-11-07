"use strict";

const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const cities = require("./catalog/cities");
const { validateRegions } = require("./catalog/validate");
const { spinRegion } = require("./data");
const { createServer } = require("./server");

let server;
let baseUrl;

before(async () => {
  server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

async function jsonRequest(pathname, options) {
  const response = await fetch(`${baseUrl}${pathname}`, options);
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
