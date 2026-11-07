# yeah-a-eat-what

是啊，吃什么。一个支持城市切换、地图浏览和随机午餐推荐的网页应用。

## Repository Layout

- `lunch-picker/`: application source, tests, and deployment notes.
- `.github/workflows/ci.yml`: required pull-request checks.

## Local Development

```bash
cd lunch-picker
npm ci
npm start
```

The app listens on `http://127.0.0.1:4173` by default.

## Verification

```bash
cd lunch-picker
npm test
npm run test:browser
git diff --check
```

The browser suite must cover the core desktop and mobile flows, stale marker and
popup cleanup after a places request failure, and out-of-order city responses.
Temporary tunnel URLs belong only in test reports; they are not deployment
addresses.
