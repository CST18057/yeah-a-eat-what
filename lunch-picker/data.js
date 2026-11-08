"use strict";

const cities = require("./catalog/cities");
const { getFoodForRegion } = require("./catalog/food-images");
const { validateRegions } = require("./catalog/validate");

const regions = validateRegions(cities);
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

module.exports = {
  getRegions,
  getRegionById,
  getPlacesByRegionId,
  spinRegion,
};
