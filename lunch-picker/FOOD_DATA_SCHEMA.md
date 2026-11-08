# Food Provider Data Contract

The food catalog is normalized around providers and per-region candidate
arrays. A cookie-cutter region can later be added without changing the runtime
shape, and a future authorized source can be added as another provider.

## Provider

```js
{
  id: "wikimedia-commons",
  name: "Wikimedia Commons",
  regions: {
    beijing: [/* food candidates */],
    shanghai: [/* food candidates */],
  },
}
```

Providers are exposed as the frozen `FOOD_PROVIDERS` array. A region may have
candidates from more than one provider; `getFoodCandidatesForRegion(regionId)`
flattens them into one frozen candidate array.

## Food candidate

```js
{
  foodId: "beijing-zhajiangmian",
  regionId: "beijing",
  providerId: "wikimedia-commons",
  dish: "炸酱面",
  image: "/food/beijing-zhajiangmian.jpg",
  alt: "拌有黄瓜丝和肉酱的炸酱面示例图片",
  credit: "Wikimedia Commons · CC BY-SA 4.0 · N509FZ · resized",
  source: {
    providerId: "wikimedia-commons",
    provider: "Wikimedia Commons",
    title: "Noodles with diced meat soybean paste before stirring",
    author: "N509FZ",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    url: "https://commons.wikimedia.org/wiki/File:Noodles_with_diced_meat_soybean_paste_before_stirring_(20210102181759).jpg",
  },
}
```

Rules:

- `foodId` is globally unique and stable.
- `regionId` maps to the existing city/region id and can later be replaced by a
  global city id without changing the nested shape.
- `image` is a local bundled path; runtime rendering never hotlinks the source.
- `alt`, `author`, `license`, `licenseUrl`, and the source page are mandatory.
- The source page records where the asset came from; `credit` is display text
  derived from the normalized record and includes a resize disclosure.
- Random selection must build the server-side **place x city food candidates**
  set from `region.places` and `getFoodCandidatesForRegion(regionId)`. It must
  not parse `credit` or invent candidate data in the browser.
- Each combined candidate must carry the same `placeId` with a distinct
  `foodId`, `dish`, and `image`; excluding the previous result excludes the
  complete `placeId + foodId/dish/image` tuple.
- `getFoodForRegion(regionId)` is a places-preview compatibility accessor that
  returns the first candidate. `/api/spin` must not call it, otherwise every
  place would receive the same dish and the expanded catalog would be ignored.
