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
