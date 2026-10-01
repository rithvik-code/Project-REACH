/**
 * Basemap API key for CARTO premium layers (higher-zoom roads, clean labels,
 * better icon tiles). Leave this file's value empty if you do not have a key —
 * REACH falls back to CARTO's free public basemaps and Esri satellite imagery,
 * which need no registration.
 *
 * Set it once here (it is gitignored) and both the district map and the global
 * map pick it up automatically.
 */
export const CARTO_API_KEY = 'd6e6f238c8b75d4c4e7d26e0619d8f3a';

/** Shared key source so one setting unlocks all CARTO basemaps. */
export function cartoKey(): string {
  return CARTO_API_KEY.trim();
}
