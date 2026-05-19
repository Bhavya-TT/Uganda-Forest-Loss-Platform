/**
 * config.js — Central configuration for the Uganda Forest Loss and Land Use
 * Change Mapping Platform frontend.
 *
 * Fully serverless — no GeoServer or WMS dependencies.
 * All data is served as static files from this repository.
 */

const CONFIG = {
  /** Path to the Uganda districts GeoJSON file (relative to index.html) */
  districtsGeoJson: "data/uganda_districts.geojson",

  /** Canonical folder names for PNG image layers */
  layers: {
    forestCover:      "forest_cover",
    urbanExtent:      "urban_extent",
    agriculturalLand: "agricultural_land",
  },

  /** Available years per layer type (must match actual PNG files in images/) */
  availableYears: {
    forestCover:      Array.from({ length: 23 }, (_, i) => 2001 + i), // 2001–2023
    urbanExtent:      [2000, 2005, 2010, 2015, 2020, 2025],
    agriculturalLand: [2017, 2018, 2019, 2020, 2021, 2022, 2023],
  },

  /** Year shown on initial page load. */
  initialYear: 2001,

  /**
   * Milliseconds between automatic year advances during playback.
   */
  playbackIntervalMs: 2500,

  /**
   * Uganda bounding box: [[south, west], [north, east]]
   * Used to position all L.imageOverlay layers and fit the map on load.
   */
  ugandaBounds: [[-1.48, 29.57], [4.22, 35.00]],
};
