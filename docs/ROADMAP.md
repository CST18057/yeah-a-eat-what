# Lunch Picker Roadmap

This roadmap keeps map browsing separate from lunch selection. Every stage must
start from a reproducible commit, ship with tests and evidence, and preserve the
previous stage's behavior.

## Product Rules

- Moving or zooming the map must not silently change the selected lunch city.
- City and place data must identify its public source.
- Public place examples must not be described as real-time merchant data.
- A stage starts only after the previous stage has a reproducible green build.

## Completed

### v0.3.0: Global Map Browsing

- Keep the current city and place selection when entering world view.
- Fit the map to the supported city centers.
- Support desktop wheel zoom, touch pinch zoom, and cross-continent panning.
- Provide a control that returns to the selected lunch city.
- Browsing must not request `/places`, spin, or change the selected city.
- Keep city/place/map state consistent and discard stale city responses.
- Preserve marker/popup cleanup and tile/place failure fallbacks.

### v0.4.0: City Discovery

- Show the supported cities on the world map.
- Search those cities by Chinese or English name.
- Clicking a city opens a preview without changing the selected city.
- Change city only after explicit confirmation; cancel keeps all current state.
- Provide one action to return to the selected lunch city.
- Search and browsing remain available when map tiles fail.

### v0.4.1: Tile Recovery

- Use a supported tile endpoint with attribution and retain visible failure
  fallback behavior.

## Planned

### v0.5.0: Explicit Regional Exploration

- Add bounded `GET /api/explore` queries over the current traceable public place
  catalog.
- A user must explicitly select "Explore this area"; panning and zooming never
  issue requests.
- Keep exploration markers separate from city and lunch-place markers.
- Do not change the selected lunch city, result, or place list.
- Cover loading, empty, too-large region, rate limit, timeout, cache, retry,
  cancellation, stale responses, and mobile layout.

### v0.6.0: IP City Recommendation

- Resolve the client IP server-side from trusted proxy chains only; never return
  or persist the raw IP.
- Prefer a local GeoIP MMDB adapter, map coordinates to the supported city
  centers with a 300 km reliability threshold, and fall back on ambiguity.
- On first visit, select and load the recommended city once, label it as an IP
  recommendation, allow immediate override, and never auto-spin.
- Late recommendations must not override a default or user selection.

### v0.7.0: Price Filtering

- Add `priceLevel`, `priceNote`, and `priceSource` with `sample`, `estimate`, or
  `merchant` provenance.
- The current public catalog may use explicitly labelled sample tiers; it must
  not fabricate real merchant prices.
- Filter existing city and exploration places client-side without additional
  place requests.
- Price-aware selection must draw only from eligible places and preserve state
  when no place matches.

### v0.8.0: Authorized Merchant Data

- Integrate Meituan or another merchant provider only through official,
  owner-approved credentials, contracts, fields, and quotas.
- Keep credentials server-side; implement caching, single-flight, rate limits,
  provider timeouts, and circuit-breaking.
- Never scrape or call undocumented endpoints, and never label public sample
  data as live merchant data.
- On missing authorization or provider failure, retain public-place behavior.

### Later: Global Coverage

- Add on-demand global city search, pagination, and multilingual names.
- Support multiple data sources with explicit provenance and attribution.
- Separate public places, merchant indexes, and live availability.

## Required Evidence

Each stage records its parent commit, release commit, CI result, automated test
counts, browser viewports, network behavior, failure-injection method, and
remaining data limits. A local path or temporary tunnel alone is not a release
artifact.
