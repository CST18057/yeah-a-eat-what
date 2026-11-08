# v0.4.1 City Discovery Verification

Date: 2026-11-08

## Baseline

- Parent: `main@55e0ecc793d67b8dcfa1ab11a9b5c9235085c780` (v0.4.0).

## Tile Hotfix

- Replaced the retired Gaode request that returned HTTP 404 with the current
  `/appmaptile?lang=zh_cn&size=1&scale=1&style=8` endpoint.
- Live checks against `webrd01` through `webrd04` returned HTTP 200,
  `image/png`, and non-empty tile bodies.
- Browser coverage asserts the generated tile URL contains the required
  parameters; the existing failure-injection test still verifies map fallback.
- Live browser evidence is stored in `test-results/live-tile-check.json`,
  `live-tile-desktop.png`, `live-tile-mobile.png`, and `tile-source.json`.
  Desktop loaded 12 tiles and mobile loaded 4 tiles with the fallback hidden.

## Scope

- Added local city search across Chinese `name` and English `nameEn`.
- Added NFKC, trim, case-insensitive English, and continuous Chinese substring
  matching without a remote search request.
- Added candidate preview from search results and city markers.
- Added explicit confirm, cancel, close, Escape, and return behavior.
- Confirmed city changes request places exactly once; same-city confirmation only
  closes the preview.
- Preserved map browsing, request ordering, delayed-response handling, failure
  cleanup, and pending-spin invalidation from v0.2.2 and v0.3.0.

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
- `npm run test:browser`: 19/19 passed.
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
16. Places failure clears stale marker and popup
17. Out-of-order city responses keep the latest city
18. Pending spin is discarded after city change
19. Tile failure popup stays unobstructed on desktop and mobile

## Evidence

The browser run writes `test-results/browser-report.json`,
`network-world-browse.json`, `network-mobile-world.json`, and
`network-city-switch.json`, plus desktop world, mobile world, New York,
places-failure, and tile-failure popup screenshots. Generated screenshots are
delivered as Raft attachments with the source patch.

The delayed-view race evidence is stored in
`test-results/delayed-world-view-race.json`; it covers both successful and
failed places responses arriving after the user enters world view.

City discovery screenshots include `city-search.png`, `candidate-preview.png`,
`candidate-confirm.png`, `candidate-confirm-failure.png`,
`world-view-pending-confirm.png`,
`tile-failure-city-discovery.png`, `mobile-candidate-preview.png`, and
`mobile-city-discovery.png`. Browser request logs include
`city-search-results.json`, `candidate-preview-network.json`,
`candidate-confirm-network.json`, `candidate-confirm-race.json`,
`candidate-confirm-failure.json`, `candidate-confirm-world-view.json`, and
`candidate-delayed-current-network.json`. The logs include spin request bodies
so preview-time spin selection can be checked against the current city.

The local verification host required system browser libraries and a CJK font
outside the repository. The GitHub Actions workflow installs Playwright browser
dependencies explicitly; no host library or font files are part of the source.
