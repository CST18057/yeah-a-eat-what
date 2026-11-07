# Lunch Picker

清空缺失源码后重建的 v0.3.0 基线。应用提供 9 个城市、43 个
OpenStreetMap 公开地点、Leaflet 世界地图、地点清单和随机午餐抽签。

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

`npm test` covers the nine-city catalog, API contract, static assets, invalid
requests, repeated requests, and deterministic random selection. The browser
suite covers desktop and mobile flows, cross-continent map browsing, desktop
wheel zoom, mobile pinch zoom, city/location linkage, request ordering, places
failure cleanup, pending-spin invalidation, and unobstructed tile-failure
fallbacks.

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

The catalog contains nine cities and 43 public places: Tokyo has 5, Singapore 4,
Berlin 4, and New York 5, alongside the original Chinese cities. Coordinates,
OpenStreetMap identifiers, and source URLs are stored with every city and place.
These entries are public examples for inspiration; they are not merchant
listings or a real-time availability feed.

## Map Behavior

- The map opens on the current lunch city.
- `世界视图` fits all nine city markers; `回到抽签城市` restores the current city.
- Dragging, wheel zoom, pinch zoom, and city-marker popups only browse the map.
  They do not change the city, place list, or spin result, and they do not request
  `/places` or `/api/spin`.
- If a city's places response arrives after the user opens world view, markers
  and list state update without moving the map or replacing the world-view
  caption.
- Changing the city selector is the explicit action that updates the map center,
  places request, and current lunch city together.

## Failure Behavior

- If places fail to load, the current city remains selected, all old markers and
  popups are removed immediately, and the map and list show a clear fallback.
- Region switching and random selection stay available when places are missing.
- Only the latest city response can update the interface.
- A pending spin is discarded if the user changes city before it returns.
- If map tiles fail, the fallback notice sits outside the map viewport so it
  cannot cover a place popup; markers and selection remain usable.
