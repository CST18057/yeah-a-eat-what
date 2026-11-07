"use strict";

const OSM_TYPES = new Set(["node", "way", "relation"]);

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Invalid city catalog: ${message}`);
  }
}

function assertText(value, path) {
  assert(typeof value === "string" && value.trim().length > 0, `${path} must be a non-empty string`);
}

function assertCoordinate(value, minimum, maximum, path) {
  assert(
    typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum,
    `${path} must be between ${minimum} and ${maximum}`,
  );
}

function assertSource(source, path) {
  assert(source && typeof source === "object", `${path} is required`);
  assert(source.provider === "OpenStreetMap", `${path}.provider must be OpenStreetMap`);
  assert(OSM_TYPES.has(source.type), `${path}.type must be node, way, or relation`);
  assert(Number.isSafeInteger(source.id) && source.id > 0, `${path}.id must be a positive integer`);
  assertText(source.url, `${path}.url`);
  assert(
    source.url === `https://www.openstreetmap.org/${source.type}/${source.id}`,
    `${path}.url must match its OSM type and id`,
  );
}

function validateRegions(regions) {
  assert(Array.isArray(regions) && regions.length > 0, "at least one city is required");

  const regionIds = new Set();
  const placeIds = new Set();

  for (const [regionIndex, region] of regions.entries()) {
    const regionPath = `regions[${regionIndex}]`;
    assert(region && typeof region === "object", `${regionPath} must be an object`);
    assertText(region.id, `${regionPath}.id`);
    assertText(region.name, `${regionPath}.name`);
    assertText(region.nameEn, `${regionPath}.nameEn`);
    assert(!regionIds.has(region.id), `${regionPath}.id must be unique`);
    regionIds.add(region.id);

    assert(region.center && typeof region.center === "object", `${regionPath}.center is required`);
    assertCoordinate(region.center.lat, -90, 90, `${regionPath}.center.lat`);
    assertCoordinate(region.center.lng, -180, 180, `${regionPath}.center.lng`);
    assertSource(region.source, `${regionPath}.source`);
    assert(Array.isArray(region.places) && region.places.length > 0, `${regionPath}.places must not be empty`);

    for (const [placeIndex, place] of region.places.entries()) {
      const placePath = `${regionPath}.places[${placeIndex}]`;
      assertText(place.id, `${placePath}.id`);
      assertText(place.name, `${placePath}.name`);
      assertText(place.cuisine, `${placePath}.cuisine`);
      assertText(place.address, `${placePath}.address`);
      assert(!placeIds.has(place.id), `${placePath}.id must be globally unique`);
      placeIds.add(place.id);
      assertCoordinate(place.lat, -90, 90, `${placePath}.lat`);
      assertCoordinate(place.lng, -180, 180, `${placePath}.lng`);
      assertSource(place.source, `${placePath}.source`);
    }
  }

  return regions;
}

module.exports = {
  validateRegions,
};
