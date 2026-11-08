# v0.5.0 Region Exploration Verification

Date: 2026-11-08

## Baseline

- Parent: `main@e419833e236e53c85b35e569d438f7426d138197` (v0.4.1).

## Scope

- Added `GET /api/explore` over the existing 43 public places.
- Added a world-view-only `探索此区域` action with outward 0.01° boundary
  quantization.
- Added a 5-second client timeout, abortable requests, last-request-wins
  sequencing, and a 50-entry/30-second in-memory cache.
- Added an independent exploration marker layer and popup source labels.
- Added loading, dirty, ready, empty, truncated, too-large, rate-limited,
  timeout, and error states with retry and clear actions.
- Keyboard map navigation now invalidates committed and in-flight exploration
  results without treating programmatic world-view changes as user movement.
- Added visible OpenStreetMap contributor and ODbL attribution with license
  links, plus food-image source and Creative Commons license links.
- Removed the development-only browser download from production `postinstall`;
  browser installation is now an explicit test step.
- Preserved city search, candidate preview, lunch selection, places, map
  gestures, request ordering, and failure behavior.

## Commands

```bash
npm ci
npm ci --omit=dev
npm test
npm run install:browser
npm run test:browser
npm run test:cross-feature
git diff --check
```

## Results

- `npm ci`: passed with 0 vulnerabilities.
- `npm ci --omit=dev`: passed without invoking Playwright.
- `npm test`: 24/24 passed.
- `npm run test:browser`: 31/31 passed.
- `npm run test:cross-feature`: 7/7 passed.
- `git diff --check`: passed.

Browser scenarios:

1. Desktop core flow
2. Mobile core flow
3. Desktop world browsing does not change lunch state
4. Mobile world browsing supports pinch and return
5. Four new cities switch map and places coherently
6. Delayed places responses preserve the world view
7. City search follows normalization rules without side effects
8. Candidate preview stays local across cancel, escape, and return
9. Candidate confirmation switches once and resets lunch state
10. Rapid confirms keep the latest city only
11. World view survives a pending candidate confirmation
12. Candidate confirmation failure keeps the new city and remains usable
13. Delayed current places response does not close a candidate preview
14. Tile failure keeps city discovery usable
15. Mobile city discovery supports cancel and confirm
16. Explicit exploration is dirty-gated and cached
17. Keyboard map navigation invalidates exploration
18. Explore cache expires after thirty seconds
19. Explore empty and truncated states stay separate from lunch data
20. Explore rejects oversized regions without a request
21. Explore rate limit shows retry countdown
22. Explore timeout and error states can retry
23. Explore client timeout aborts and can retry
24. Explore keeps the latest request and clears on city exit
25. Mobile exploration supports touch drag, zoom, clear, and return
26. Exploration controls fit the 320px mobile viewport
27. Places failure clears stale marker and popup
28. Out-of-order city responses keep the latest city
29. Pending spin is discarded after city change
30. Food image failures keep the selected result and map binding
31. Tile failure popup stays unobstructed on desktop and mobile

Cross-feature fixture scenarios:

1. Exploration keeps the lunch city, result, place list, and markers unchanged;
   opening a candidate preview clears the exploration state.
2. Opening a candidate preview aborts an in-flight exploration request and
   prevents a late result from appearing.
3. Confirming a candidate after exploration switches city once, refreshes
   places once, resets the lunch result, and sends no extra explore request.
4. Food-image fallback remains isolated while exploration loads and clears.
5. A 320px mobile run completes spin, explore, candidate confirmation, and a
   second spin without horizontal overflow.
6. Keyboard panning invalidates a ready exploration result and removes stale
   markers.
7. Keyboard panning during an in-flight explore request keeps the state dirty
   and prevents the late response from rendering.

## Evidence

The browser run writes `test-results/browser-report.json` plus exploration
screenshots `explore-ready.png`, `explore-too-large.png`, and
`mobile-explore.png`. Network assertions capture initial page requests and
verify that dragging, zooming, and world-view entry make zero `/api/explore`
requests until the explicit button action.

A live non-mocked browser run against the real server returned HTTP 200 for a
quantized South-East Asia region, rendered four public-place markers, and
recorded the evidence in `live-explore-check.json` and
`live-explore-ready.png`.

Exploration state/network evidence is stored in `explore-explicit.json`,
`explore-cache.json`, `explore-rate-limit.json`, `explore-timeout-error.json`,
`explore-client-timeout.json`, and `explore-last-write.json`.
Keyboard invalidation evidence is stored in `explore-keyboard.json`.

The state dataset on `#explore-toolbar` records status, request ID, source,
limit, totals, truncation, error code, retry seconds, quantized bounds, cache
key, and update time for reproducible inspection.

The local verification host required system browser libraries and a CJK font
outside the repository. The GitHub Actions workflow installs Playwright browser
dependencies explicitly; no host library or font files are part of the source.
