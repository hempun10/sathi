/**
 * Optional soft search radius, in meters. It is a hint for URL-free search
 * only: Firecrawl has no exact radius filter, so callers append an approximate
 * query phrase and never claim precise filtering.
 */
export const SEARCH_RADIUS_MIN_METERS = 100;
export const SEARCH_RADIUS_MAX_METERS = 100_000;

export const isSearchRadiusMeters = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value >= SEARCH_RADIUS_MIN_METERS &&
  value <= SEARCH_RADIUS_MAX_METERS;

/** Plain-language hint appended to a search query when a radius is used. */
export const searchRadiusHint = (meters: number) =>
  `within approximately ${meters} meters`;
