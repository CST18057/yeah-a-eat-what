# Lunch Picker

The application source for v0.2.2 belongs in this directory. The release must
remain runnable with:

```bash
npm ci
npm start
```

Required scripts:

- `npm test`: API and server behavior.
- `npm run test:browser`: desktop and mobile browser flows.

The release must include five-city data, random lunch selection, Leaflet map
markers, a clear fallback when places or map tiles fail, stale marker and popup
cleanup, and protection against out-of-order city responses.

## Data And API Contract

The catalog contains five cities and five OpenStreetMap-backed public places per
city. The source URLs and WGS84 coordinates are stored beside each city and
place. The catalog describes public landmarks and food streets; it does not
represent real-time merchant availability.

API responses:

- `GET /api/regions` returns `{ regions: [...] }`.
- `GET /api/regions/:id/places` returns `{ region, places }`.
- `POST /api/spin` with `{ "regionId": "beijing" }` returns `{ region, place }`.

Unknown cities return HTTP 404 with `error.code = "REGION_NOT_FOUND"`. Invalid
JSON returns HTTP 400. Static application files are served from `public/`.
