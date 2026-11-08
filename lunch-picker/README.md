# Lunch Picker

v0.4.1 的城市发现版本，包含高德底图地址热修复。应用提供 9 个城市、43 个
OpenStreetMap 公开地点、
Leaflet 世界地图、城市搜索与候选预览、地点清单和随机午餐抽签。

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
suite covers desktop and mobile flows, cross-continent map browsing, city search
normalization, candidate preview/confirm/cancel, request ordering, places
failure cleanup, pending-spin invalidation, and tile-failure fallbacks.

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
- City search filters the local nine-city catalog by Chinese `name` or English
  `nameEn`. Queries are trimmed and NFKC-normalized; English matching is
  case-insensitive. Empty queries show the complete catalog in source order.
- Clicking a search result or city marker opens a candidate preview. The current
  city and candidate are labeled and marked separately.
- Preview, cancel, close, Escape, and return do not change the city, place list,
  or spin result and do not request `/places` or `/api/spin`.
- Only `确认切换` commits a different candidate and requests its places exactly
  once. Confirming the current city only closes the preview.
- If a city's places response arrives after the user opens world view, markers
  and list state update without moving the map or replacing the world-view
  caption.
- A pending places response cannot close a candidate preview or overwrite its
  map caption.

## Failure Behavior

- If places fail to load, the current city remains selected, all old markers and
  popups are removed immediately, and the map and list show a clear fallback.
- Search and preview remain available when places or map tiles fail.
- If search normalization/filtering fails, the UI reports `城市搜索暂不可用`
  without disabling the current city, places, return action, or spin.
- Region switching and random selection stay available when places are missing.
- Only the latest city response can update the interface.
- A pending spin is discarded if the user changes city before it returns.
- If map tiles fail, the fallback notice sits outside the map viewport so it
  cannot cover a place popup; markers and selection remain usable.
