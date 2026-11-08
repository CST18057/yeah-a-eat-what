# Lunch Picker

v0.5.0 的按区域探索版本，包含城市发现、抽签结果美食示例和显式区域探索。
应用提供 9 个城市、43 个 OpenStreetMap 公开地点、Leaflet 世界地图、
城市搜索与候选预览、区域探索、地点清单和随机午餐抽签。

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
npm run test:cross-feature
git diff --check
```

`npm test` covers the nine-city catalog, API contract, static assets, invalid
requests, repeated requests, and deterministic random selection. The browser
suite covers desktop and mobile flows, cross-continent map browsing, city search
normalization, candidate preview/confirm/cancel, request ordering, places
failure cleanup, explicit region exploration, cache/error states,
pending-spin invalidation, and tile-failure fallbacks.

`npm run test:cross-feature` reuses the browser fixtures and focuses on
cross-feature state boundaries: exploration versus lunch state, candidate
preview cancellation of in-flight exploration, confirmation after exploration,
food-image fallback isolation, and a complete 320px mobile path.

Playwright downloads Chromium during `npm ci`. On a minimal Linux host, install
the browser's system libraries once with:

```bash
npx playwright install-deps chromium
```

## API

- `GET /api/regions` returns `{ regions: [...] }`.
- `GET /api/regions/:id/places` returns `{ region, places }`.
- `POST /api/spin` with `{ "regionId": "beijing" }` returns `{ region, place }`.
- `GET /api/explore?west=&south=&east=&north=&limit=` returns the public places
  inside a bounded region.

Each place includes a `food` object with a display dish, local image path,
descriptive alt text, credit text, and Wikimedia Commons source metadata.

Unknown cities return HTTP 404 with `error.code = "REGION_NOT_FOUND"`. Invalid
JSON returns HTTP 400, and request bodies are limited to 16 KiB.

Region exploration is limited to 30 requests per fixed 60-second window per
client. By default the client key is the direct socket address. When the service
is behind a trusted reverse proxy, set `TRUSTED_PROXY_CIDRS` (for example
`127.0.0.1/32,::1/128`) before forwarding `CF-Connecting-IP` or
`X-Forwarded-For`; forwarding headers are ignored from untrusted peers.

Leaflet assets are served from `/vendor/leaflet/*`, mapped directly to the
installed `node_modules/leaflet/dist/*` files.

## Data

The catalog contains nine cities and 43 public places: Tokyo has 5, Singapore 4,
Berlin 4, and New York 5, alongside the original Chinese cities. Coordinates,
OpenStreetMap identifiers, and source URLs are stored with every city and place.
These entries are public examples for inspiration; they are not merchant
listings or a real-time availability feed.

The nine bundled food images are example photography, not photos of the
selected public place or claims about a real merchant. Source and license
details are recorded in `FOOD_IMAGES.md` and returned in each place's `food`
metadata.

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
- `探索此区域` is available only in world view. The map must be moved or zoomed
  before the action becomes meaningful, and those gestures never request data.
- Exploration uses a quantized 0.01° map boundary, a 5-second client timeout,
  last-request-wins sequencing, and a 30-second in-memory cache capped at 50
  entries.
- Exploration markers use an independent map layer and do not change the lunch
  city, result, place list, or lunch markers.
- Leaving world view, opening a candidate, or switching city aborts exploration
  and clears the exploration layer.

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
- After a spin, the result card shows the selected place with its example food
  image and credit. The map opens on the same selected place, and its popup
  shows the same image. If the image cannot load, both surfaces keep the place,
  dish name, and accessible fallback text.
- Exploration reports loading, empty, truncated, too-large, rate-limited,
  timeout, and error states. Oversized regions require zooming in instead of
  sending a request.
