# Lunch Picker Roadmap

This roadmap keeps map browsing separate from lunch selection. Every stage must
start from a reproducible commit, ship with tests and evidence, and preserve the
previous stage's behavior.

## Product Rules

- Moving or zooming the map must not silently change the selected lunch city.
- City and place data must identify its public source.
- Public place examples must not be described as real-time merchant data.
- A stage starts only after the previous stage has a reproducible green build.

## v0.3.0: Global Map Browsing

- Keep the current city and place selection when entering world view.
- Fit the map to the supported city centers.
- Support desktop wheel zoom, touch pinch zoom, and cross-continent panning.
- Provide a control that returns to the selected lunch city.
- Browsing must not request `/places`, spin, or change the selected city.
- Keep city/place/map state consistent and discard stale city responses.
- Preserve marker/popup cleanup and tile/place failure fallbacks.

## v0.4.0: City Discovery

- Show the supported cities on the world map.
- Search those cities by Chinese or English name.
- Clicking a city opens a preview without changing the selected city.
- Change city only after explicit confirmation; cancel keeps all current state.
- Provide one action to return to the selected lunch city.
- Search and browsing remain available when map tiles fail.

## v0.5.0: On-Demand Places

- Load public places only after an explicit user action.
- Bound each request by region, result count, timeout, and rate.
- Add caching plus loading, empty, timeout, and failure states.
- Never download a global place index during initial page load.

## v0.6.0: Global Coverage

- Add on-demand global city search, pagination, and multilingual names.
- Support multiple data sources with explicit provenance and attribution.
- Separate public places, merchant indexes, and live availability.
- Do not claim real-time merchant coverage without an authorized data source.

## Required Evidence

Each stage records its parent commit, release commit, CI result, automated test
counts, browser viewports, network behavior, failure-injection method, and
remaining data limits. A local path or temporary tunnel alone is not a release
artifact.
