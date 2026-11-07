# Lunch Picker

清空缺失源码后重建的 v0.2.2 基线。应用提供 5 个城市、25 个
OpenStreetMap 公开地点、Leaflet 点位地图、地点清单和随机午餐抽签。

## Run

```bash
npm ci
npm start
```

The server listens on `http://127.0.0.1:4173` by default. Override `PORT` or
`HOST` when needed.

## Verify

```bash
npm test
npm run test:browser
git diff --check
```

`npm test` covers the catalog, API contract, static assets, invalid requests,
and deterministic random selection. The browser suite covers desktop and mobile
flows, places failure cleanup, stale city responses, a pending spin followed by
a city change, and map tile fallback.

Playwright downloads Chromium during `npm ci`. On a minimal Linux host, install
the browser's system libraries once with:

```bash
npx playwright install-deps chromium
```

## API

- `GET /api/regions` returns `{ regions: [...] }`.
- `GET /api/regions/:id/places` returns `{ region, places }`.
- `POST /api/spin` with `{ "regionId": "beijing" }` returns `{ region, place }`.

Unknown cities return HTTP 404 with `error.code = "REGION_NOT_FOUND"`. Invalid
JSON returns HTTP 400, and request bodies are limited to 16 KiB.

Leaflet assets are served from `/vendor/leaflet/*`, mapped directly to the
installed `node_modules/leaflet/dist/*` files.

## Data

The catalog contains five cities and five public places per city. Coordinates,
OpenStreetMap identifiers, and source URLs are stored with every city and place.
These entries are public examples for inspiration; they are not merchant
listings or a real-time availability feed.

## Failure Behavior

- If places fail to load, the current city remains selected, all old markers and
  popups are removed immediately, and the map and list show a clear fallback.
- Region switching and random selection stay available when places are missing.
- Only the latest city response can update the interface.
- A pending spin is discarded if the user changes city before it returns.
- If map tiles fail, markers and selection remain usable with a visible notice.
