# v0.3.0 Global Map Verification

Date: 2026-11-08

## Baseline

- v0.3.0 parent: `5e9318b` (`2c74edc` plus tile-failure popup fix `aeffa13`).
- Nine-city data delivery: `ede28d41129e2161f952d1d04c55d3f01e16f77f`.

## Scope

- Added Tokyo, Singapore, Berlin, and New York, reaching nine cities and 43
  traceable OpenStreetMap public places.
- Added a world view with nine city markers and a return-to-current-city action.
- Added desktop wheel zoom and mobile pinch zoom without changing lunch state.
- Preserved immediate marker/popup cleanup, stale city-response protection,
  pending-spin invalidation, and places failure behavior.
- Moved the tile-failure notice outside the map viewport so it cannot overlap a
  visible place popup on desktop or mobile.

## Commands

```bash
npm ci
npm test
npm run test:browser
git diff --check
```

## Results

- `npm ci`: passed with 0 vulnerabilities.
- `npm test`: 13/13 passed.
- `npm run test:browser`: 9/9 passed.
- `git diff --check`: passed.

Browser scenarios:

1. Desktop core flow
2. Mobile core flow
3. Desktop world browsing does not change lunch state
4. Mobile world browsing supports pinch and return
5. Four new cities switch map and places coherently
6. Places failure clears stale marker and popup
7. Out-of-order city responses keep the latest city
8. Pending spin is discarded after city change
9. Tile failure popup stays unobstructed on desktop and mobile

## Evidence

The browser run writes `test-results/browser-report.json`,
`network-world-browse.json`, `network-mobile-world.json`, and
`network-city-switch.json`, plus desktop world, mobile world, New York,
places-failure, and tile-failure popup screenshots. Generated screenshots are
delivered as Raft attachments with the source patch.

The local verification host required system browser libraries and a CJK font
outside the repository. The GitHub Actions workflow installs Playwright browser
dependencies explicitly; no host library or font files are part of the source.
