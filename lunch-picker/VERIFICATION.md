# v0.2.2 Rebuild Verification

Date: 2026-11-08

## Scope

- Rebuilt the missing source as a Node application with a Leaflet frontend.
- Added five cities and twenty-five traceable OpenStreetMap public places.
- Implemented region, places, and random-selection APIs.
- Added places/tile fallback states, immediate marker and popup cleanup, stale
  city-response protection, and pending-spin invalidation after a city change.

## Commands

```bash
npm ci
npm test
npm run test:browser
git diff --check
```

## Results

- `npm ci`: passed with 0 vulnerabilities.
- `npm test`: 10/10 passed.
- `npm run test:browser`: 6/6 passed.
- `git diff --check`: passed.

Browser scenarios:

1. Desktop core flow
2. Mobile core flow
3. Places failure clears stale marker and popup
4. Out-of-order city responses keep the latest city
5. Pending spin is discarded after city change
6. Tile failure keeps markers and explains fallback

## Evidence

The browser run writes `test-results/browser-report.json` plus desktop, mobile,
and places-failure screenshots. Those generated files are intentionally ignored
by Git and are delivered as Raft attachments with the source patch.

The local verification host required system browser libraries and a CJK font
outside the repository. The GitHub Actions workflow installs Playwright browser
dependencies explicitly; no host library or font files are part of the source.
