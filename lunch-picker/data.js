"use strict";

const cities = require("./catalog/cities");
const foodCatalog = require("./catalog/food-images");
const {
  FOOD_PROVIDERS,
  getFoodForRegion,
  getFoodCandidatesForRegion,
  validateFoodProviders,
} = foodCatalog;
const { validateRegions } = require("./catalog/validate");
const { selectSpinCandidate } = require("./spin-selector");

const regions = validateRegions(cities);
validateFoodProviders(FOOD_PROVIDERS, regions.map((region) => region.id));
const regionById = new Map(regions.map((region) => [region.id, region]));

function clone(value) {
  return structuredClone(value);
}

function placeWithFood(region, place) {
  const food = getFoodForRegion(region.id);
  return food ? { ...place, food: clone(food) } : clone(place);
}

function publicRegion(region) {
  return {
    id: region.id,
    name: region.name,
    nameEn: region.nameEn,
    center: clone(region.center),
    source: clone(region.source),
  };
}

function getRegions() {
  return regions.map((region) => ({
    ...publicRegion(region),
    placeCount: region.places.length,
  }));
}

function getRegionById(regionId) {
  const region = regionById.get(regionId);
  return region ? publicRegion(region) : null;
}

function getPlacesByRegionId(regionId) {
  const region = regionById.get(regionId);
  if (!region) {
    return null;
  }

  return {
    region: publicRegion(region),
    places: region.places.map((place) => placeWithFood(region, place)),
  };
}

function spinRegion(regionId, random = Math.random, options = {}) {
  const region = regionById.get(regionId);
  if (!region) {
    return null;
  }

  const foods = getFoodCandidatesForRegion(region.id);
  const candidates = [];
  for (const place of region.places) {
    for (const food of foods) {
      candidates.push({ ...place, food: clone(food) });
    }
  }
  const selected = selectSpinCandidate(
    candidates,
    random,
    options.exclude || [],
  );

  return {
    region: publicRegion(region),
    place: selected.place ? clone(selected.place) : null,
    selection: selected.selection,
  };
}

function getExplorePlaces(bounds, limit) {
  const matches = [];

  for (const region of regions) {
    for (const place of region.places) {
      if (
        place.lng >= bounds.west &&
        place.lng <= bounds.east &&
        place.lat >= bounds.south &&
        place.lat <= bounds.north
      ) {
        matches.push({
          id: place.id,
          name: place.name,
          cityId: region.id,
          cityName: region.name,
          lat: place.lat,
          lng: place.lng,
          cuisine: place.cuisine,
          address: place.address,
          source: clone(place.source),
        });
      }
    }
  }

  matches.sort((left, right) => {
    if (left.id < right.id) {
      return -1;
    }
    if (left.id > right.id) {
      return 1;
    }
    return 0;
  });

  const total = matches.length;
  const places = matches.slice(0, limit);

  return {
    total,
    returned: places.length,
    truncated: total > places.length,
    places,
  };
}

module.exports = {
  getRegions,
  getRegionById,
  getPlacesByRegionId,
  spinRegion,
  getExplorePlaces,
};
