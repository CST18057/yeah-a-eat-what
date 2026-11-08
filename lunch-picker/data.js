"use strict";

const cities = require("./catalog/cities");
const {
  FOOD_PROVIDERS,
  getFoodForRegion,
  validateFoodProviders,
} = require("./catalog/food-images");
const { validateRegions } = require("./catalog/validate");

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

function spinRegion(regionId, random = Math.random) {
  const region = regionById.get(regionId);
  if (!region) {
    return null;
  }

  const sample = Number(random());
  const normalized = Number.isFinite(sample) ? Math.min(Math.max(sample, 0), 1) : 0;
  const index = Math.min(Math.floor(normalized * region.places.length), region.places.length - 1);

  return {
    region: publicRegion(region),
    place: placeWithFood(region, region.places[index]),
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
