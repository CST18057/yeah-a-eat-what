"use strict";

const MAX_EXCLUDE_ITEMS = 100;

function normalizeExclude(exclude) {
  if (exclude === undefined || exclude === null) {
    return [];
  }

  const values = Array.isArray(exclude) ? exclude : [exclude];
  if (values.length > MAX_EXCLUDE_ITEMS) {
    throw new TypeError(`exclude must contain at most ${MAX_EXCLUDE_ITEMS} items`);
  }

  const seen = new Set();
  return values.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new TypeError("exclude entries must be objects");
    }

    const normalized = {};
    for (const field of ["placeId", "foodId", "dish", "image"]) {
      if (entry[field] === undefined || entry[field] === null) {
        continue;
      }
      if (typeof entry[field] !== "string" || entry[field].trim() === "") {
        throw new TypeError(`exclude.${field} must be a non-empty string`);
      }
      normalized[field] = entry[field].trim();
    }

    if (Object.keys(normalized).length === 0) {
      throw new TypeError("exclude entries must contain placeId or food identity");
    }

    const key = [
      normalized.placeId || "",
      normalized.foodId || "",
      normalized.dish || "",
      normalized.image || "",
    ].join("\u0000");
    if (!seen.has(key)) {
      seen.add(key);
      return normalized;
    }
    return null;
  }).filter(Boolean);
}

function foodMatchesExclude(food, exclude) {
  if (!food) {
    return false;
  }
  return Boolean(
    (exclude.foodId && food.foodId === exclude.foodId) ||
      (exclude.dish && food.dish === exclude.dish) ||
      (exclude.image && food.image === exclude.image),
  );
}

function placeMatchesExclude(place, exclude) {
  if (exclude.placeId && place.id === exclude.placeId) {
    return true;
  }
  return foodMatchesExclude(place.food, exclude);
}

function selectSpinCandidate(places, random = Math.random, excludeInput = []) {
  const excludes = normalizeExclude(excludeInput);
  if (!Array.isArray(places) || places.length === 0) {
    return {
      place: null,
      selection: {
        repeated: false,
        repeatReason: null,
        totalCandidates: 0,
        eligibleCandidates: 0,
        excludedCandidates: 0,
      },
    };
  }

  const eligible = places.filter(
    (place) => !excludes.some((exclude) => placeMatchesExclude(place, exclude)),
  );
  const pool = eligible.length > 0 ? eligible : places;
  const sample = Number(random());
  const normalized = Number.isFinite(sample)
    ? Math.min(Math.max(sample, 0), 1)
    : 0;
  const index = Math.min(
    Math.floor(normalized * pool.length),
    pool.length - 1,
  );
  const repeated = eligible.length === 0;

  return {
    place: pool[index],
    selection: {
      repeated,
      repeatReason: repeated
        ? places.length === 1
          ? "SINGLE_CANDIDATE"
          : "ALL_CANDIDATES_EXCLUDED"
        : null,
      totalCandidates: places.length,
      eligibleCandidates: eligible.length,
      excludedCandidates: places.length - eligible.length,
    },
  };
}

module.exports = {
  MAX_EXCLUDE_ITEMS,
  normalizeExclude,
  selectSpinCandidate,
};
