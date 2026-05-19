/**
 * app.js — Main application logic for the Uganda Forest Loss and Land Use
 * Change Mapping Platform.
 *
 * Fully serverless — no GeoServer, WMS, or WFS dependencies.
 * Boundaries are loaded from a local GeoJSON file.
 * Statistics are loaded from pre-computed static JSON files.
 */

/* global L, CONFIG */

// ---------------------------------------------------------------------------
// Application state
// ---------------------------------------------------------------------------

const state = {
  currentYear: CONFIG.initialYear,
  selectedDistrictName: null,
  visibleLayers: {
    forestCover:      true,
    urbanExtent:      true,
    agriculturalLand: true,
    adminBoundaries:  false,
  },
  isPlaying: false,
  playInterval: null,
};

// ---------------------------------------------------------------------------
// Layer metadata
// ---------------------------------------------------------------------------

const LAYER_META = {
  forestCover: {
    label:       "Forest Cover",
    source:      "Hansen Global Forest Change v1.11",
    swatchClass: "legend-swatch--forest-cover",
  },
  urbanExtent: {
    label:       "Urban Extent",
    source:      "GHSL R2023A",
    swatchClass: "legend-swatch--urban-extent",
  },
  agriculturalLand: {
    label:       "Agricultural Land",
    source:      "ESA WorldCover / MODIS",
    swatchClass: "legend-swatch--agricultural-land",
  },
  adminBoundaries: {
    label:       "Admin Boundaries",
    source:      "GADM",
    swatchClass: "legend-swatch--admin-boundaries",
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getClosestYear(layerKey, year) {
  const years = CONFIG.availableYears[layerKey];
  if (!years || years.length === 0) return null;
  if (years.includes(year)) return year;
  return years.reduce((prev, curr) =>
    Math.abs(curr - year) < Math.abs(prev - year) ? curr : prev
  );
}

function getImageUrl(layerKey, year) {
  const layerName = CONFIG.layers[layerKey];
  const closestYear = getClosestYear(layerKey, year);
  if (!closestYear) return null;
  return `images/${layerName}/${closestYear}.png`;
}

function getAllAvailableYears() {
  const allYears = new Set();
  Object.values(CONFIG.availableYears).forEach(years => years.forEach(y => allYears.add(y)));
  return Array.from(allYears).sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Image overlays
// ---------------------------------------------------------------------------

let map;
const imageOverlays = {};
const UGANDA_BOUNDS = CONFIG.ugandaBounds;

function buildImageOverlay(layerKey) {
  const url = getImageUrl(layerKey, state.currentYear);
  if (!url) return null;
  // Each raster layer has its own pane for deterministic z-ordering:
  // agriPane (410) < forestPane (420) < urbanPane (430) < boundaryPane (450) < reservesPane (460)
  const paneMap = {
    agriculturalLand: "agriPane",
    forestCover:      "forestPane",
    urbanExtent:      "urbanPane",
  };
  return L.imageOverlay(url, UGANDA_BOUNDS, {
    opacity:     0.85,
    pane:        paneMap[layerKey] || "forestPane",
    interactive: false,
  });
}

function updateChangeLayers(year) {
  ["forestCover", "urbanExtent", "agriculturalLand"].forEach(key => {
    const overlay = imageOverlays[key];
    if (!overlay || !state.visibleLayers[key]) return;
    const url = getImageUrl(key, year);
    if (!url) return;
    const img = new Image();
    img.onload = () => overlay.setUrl(url);
    img.src = url;
  });
}

// No-op kept for safety — ordering is handled by custom panes.
function raiseBoundariesToFront() {}

// ---------------------------------------------------------------------------
// Preload images into browser cache for smooth playback
// ---------------------------------------------------------------------------

function preloadAllImages() {
  ["forestCover", "urbanExtent", "agriculturalLand"].forEach(key => {
    getAllAvailableYears().forEach(year => {
      const url = getImageUrl(key, year);
      if (url) { const img = new Image(); img.src = url; }
    });
  });
}

// ---------------------------------------------------------------------------
// Initialise map
// ---------------------------------------------------------------------------

async function initMap() {
  const allYears = getAllAvailableYears();
  const minYear  = CONFIG.initialYear;
  const maxYear  = allYears[allYears.length - 1];

  map = L.map("map", { zoomControl: true });
  map.fitBounds(CONFIG.ugandaBounds);

  // Custom panes — deterministic z-ordering without bringToFront() races
  map.createPane("agriPane");    map.getPane("agriPane").style.zIndex    = 410;
  map.createPane("forestPane");  map.getPane("forestPane").style.zIndex  = 420;
  map.createPane("urbanPane");   map.getPane("urbanPane").style.zIndex   = 430;

  map.createPane("boundaryPane");
  map.getPane("boundaryPane").style.zIndex        = 450;
  map.getPane("boundaryPane").style.pointerEvents = "none";

  map.createPane("reservesPane");
  map.getPane("reservesPane").style.zIndex        = 460;
  map.getPane("reservesPane").style.pointerEvents = "none";

  // Base map
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors | <a href="https://leafletjs.com" target="_blank">Leaflet</a>',
    maxZoom: 19,
  }).addTo(map);

  // Raster overlays
  state.currentYear = CONFIG.initialYear;
  ["agriculturalLand", "forestCover", "urbanExtent"].forEach(key => {
    const overlay = buildImageOverlay(key);
    if (overlay) {
      imageOverlays[key] = overlay;
      if (state.visibleLayers[key]) overlay.addTo(map);
    }
  });

  // District boundaries from local GeoJSON (replaces GeoServer WMS)
  await loadDistrictBoundaries();

  // Layer toggle listeners
  document.getElementById("toggle-forest").addEventListener("change", e => {
    state.visibleLayers.forestCover = e.target.checked;
    if (!e.target.checked && imageOverlays.forestCover) map.removeLayer(imageOverlays.forestCover);
    else if (e.target.checked && imageOverlays.forestCover) imageOverlays.forestCover.addTo(map);
    updateLegend();
  });
  document.getElementById("toggle-urban").addEventListener("change", e => {
    state.visibleLayers.urbanExtent = e.target.checked;
    if (!e.target.checked && imageOverlays.urbanExtent) map.removeLayer(imageOverlays.urbanExtent);
    else if (e.target.checked && imageOverlays.urbanExtent) imageOverlays.urbanExtent.addTo(map);
    updateLegend();
  });
  document.getElementById("toggle-agri").addEventListener("change", e => {
    state.visibleLayers.agriculturalLand = e.target.checked;
    if (!e.target.checked && imageOverlays.agriculturalLand) map.removeLayer(imageOverlays.agriculturalLand);
    else if (e.target.checked && imageOverlays.agriculturalLand) imageOverlays.agriculturalLand.addTo(map);
    updateLegend();
  });
  document.getElementById("toggle-admin").addEventListener("change", e => {
    state.visibleLayers.adminBoundaries = e.target.checked;
    if (districtLayer) {
      if (!e.target.checked) map.removeLayer(districtLayer);
      else districtLayer.addTo(map);
    }
    updateLegend();
  });

  // Time slider
  buildTimeSlider(minYear, maxYear, allYears);

  // Forest reserves from Overpass API
  loadForestReserves();
  document.getElementById("toggle-reserves").addEventListener("change", e => {
    if (!e.target.checked && forestReservesLayer) map.removeLayer(forestReservesLayer);
    else if (e.target.checked && forestReservesLayer) forestReservesLayer.addTo(map);
    updateLegend();
  });

  // Map click → district name popup
  map.on("click", e => handleMapClick(e));

  // Panel collapse toggle
  document.getElementById("panel-toggle").addEventListener("click", () => {
    const panel     = document.getElementById("summary-panel");
    const btn       = document.getElementById("panel-toggle");
    const collapsed = panel.classList.toggle("collapsed");
    btn.setAttribute("aria-expanded", String(!collapsed));
  });

  preloadAllImages();
  updateLegend();
  updateMetadataPanel();
  displayStatistics();
}

// ---------------------------------------------------------------------------
// District boundaries — loaded from local GeoJSON, no GeoServer needed
// ---------------------------------------------------------------------------

let districtLayer = null;

async function loadDistrictBoundaries() {
  try {
    const r = await fetch(CONFIG.districtsGeoJson);
    if (!r.ok) throw new Error("HTTP " + r.status);
    const geojson = await r.json();

    // Single togglable district layer — off by default (matches state.visibleLayers.adminBoundaries)
    districtLayer = L.geoJSON(geojson, {
      style: {
        color:       "#222",
        weight:      1.5,
        fillOpacity: 0,
      },
      pane: "boundaryPane",
      onEachFeature: (feature, layer) => {
        const name = feature.properties?.NAME_1 || feature.properties?.name || "District";
        layer.bindTooltip(name, { sticky: true, opacity: 0.85 });
        layer.on("click", () => {
          state.selectedDistrictName = name;
          displayStatistics();
        });
      },
    });

    // Only add to map if the toggle is on (default is off)
    if (state.visibleLayers.adminBoundaries) districtLayer.addTo(map);
    console.log("[app] District boundaries loaded from GeoJSON");
  } catch (err) {
    console.warn("[app] Could not load district boundaries:", err);
  }
}

// ---------------------------------------------------------------------------
// Forest reserves — Overpass API (unchanged, already external)
// ---------------------------------------------------------------------------

let forestReservesLayer = null;

async function loadForestReserves() {
  const query = `
    [out:json][timeout:60];
    area["name"="Uganda"]["admin_level"="2"]->.uganda;
    (
      way["boundary"="protected_area"](area.uganda);
      relation["boundary"="protected_area"](area.uganda);
      way["leisure"="nature_reserve"](area.uganda);
      relation["leisure"="nature_reserve"](area.uganda);
      way["landuse"="forest"](area.uganda);
      relation["landuse"="forest"](area.uganda);
      way["boundary"="national_park"](area.uganda);
      relation["boundary"="national_park"](area.uganda);
    );
    out geom;
  `;
  try {
    const r = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: "data=" + encodeURIComponent(query),
    });
    if (!r.ok) throw new Error("Overpass HTTP " + r.status);
    const data = await r.json();

    const features = [];
    for (const el of data.elements) {
      if (el.type === "way" && el.geometry) {
        const coords = el.geometry.map(p => [p.lon, p.lat]);
        if (coords.length > 2) {
          features.push({
            type: "Feature",
            properties: { name: el.tags?.name || "Forest Reserve" },
            geometry: { type: "Polygon", coordinates: [coords] },
          });
        }
      }
    }
    if (features.length === 0) { console.warn("[app] No forest reserves returned"); return; }

    forestReservesLayer = L.geoJSON({ type: "FeatureCollection", features }, {
      style: { color: "#1a7a1a", weight: 1.5, fillColor: "#2d9e2d", fillOpacity: 0.25, dashArray: "4 3" },
      pane: "reservesPane",
      onEachFeature: (feature, layer) => {
        if (feature.properties.name) layer.bindTooltip(feature.properties.name, { sticky: true, opacity: 0.85 });
      },
    }).addTo(map);

    updateLegend();
    console.log(`[app] Loaded ${features.length} forest reserve polygons`);
  } catch (err) {
    console.warn("[app] Could not load forest reserves:", err);
  }
}

// ---------------------------------------------------------------------------
// Time slider
// ---------------------------------------------------------------------------

function buildTimeSlider(minYear, maxYear, allYears) {
  const container = document.getElementById("time-dimension-control");
  container.innerHTML = `
    <input type="range" id="year-slider"
      min="${minYear}" max="${maxYear}" value="${CONFIG.initialYear}" step="1"
      aria-label="Select year" style="width:300px;accent-color:#52b788;">
    <button id="play-btn" type="button"
      style="margin-left:8px;padding:4px 10px;background:rgba(255,255,255,.15);
             border:1px solid rgba(255,255,255,.4);color:#fff;border-radius:4px;cursor:pointer;">
      ▶ Play
    </button>
    <span style="margin-left:10px;color:#fff;font-size:12px;">Speed:</span>
    <button id="speed-1x" type="button"
      style="margin-left:4px;padding:3px 8px;background:rgba(255,255,255,.35);
             border:1px solid rgba(255,255,255,.6);color:#fff;border-radius:4px;cursor:pointer;font-size:12px;">1x</button>
    <button id="speed-2x" type="button"
      style="margin-left:4px;padding:3px 8px;background:rgba(255,255,255,.15);
             border:1px solid rgba(255,255,255,.4);color:#fff;border-radius:4px;cursor:pointer;font-size:12px;">2x</button>
    <button id="speed-4x" type="button"
      style="margin-left:4px;padding:3px 8px;background:rgba(255,255,255,.15);
             border:1px solid rgba(255,255,255,.4);color:#fff;border-radius:4px;cursor:pointer;font-size:12px;">4x</button>
  `;

  const slider  = document.getElementById("year-slider");
  const playBtn = document.getElementById("play-btn");
  const btn1x   = document.getElementById("speed-1x");
  const btn2x   = document.getElementById("speed-2x");
  const btn4x   = document.getElementById("speed-4x");
  let speedMultiplier = 1;

  function setSpeed(mult) {
    speedMultiplier = mult;
    [btn1x, btn2x, btn4x].forEach(b => { b.style.background = "rgba(255,255,255,.15)"; b.style.border = "1px solid rgba(255,255,255,.4)"; });
    const active = mult === 1 ? btn1x : mult === 2 ? btn2x : btn4x;
    active.style.background = "rgba(255,255,255,.35)";
    active.style.border = "1px solid rgba(255,255,255,.8)";
    if (state.isPlaying) {
      clearInterval(state.playInterval);
      state.playInterval = setInterval(() => advanceYear(slider, playBtn, maxYear), Math.round(CONFIG.playbackIntervalMs / speedMultiplier));
    }
  }

  btn1x.addEventListener("click", () => setSpeed(1));
  btn2x.addEventListener("click", () => setSpeed(2));
  btn4x.addEventListener("click", () => setSpeed(4));
  slider.addEventListener("input", () => setYear(parseInt(slider.value, 10)));
  playBtn.addEventListener("click", () => {
    if (state.isPlaying) stopPlayback(slider, playBtn);
    else startPlayback(slider, playBtn, maxYear, speedMultiplier);
  });
}

function advanceYear(slider, playBtn, maxYear) {
  const next = parseInt(slider.value, 10) + 1;
  if (next > maxYear) { stopPlayback(slider, playBtn); return; }
  slider.value = next;
  setYear(next, true);
}

function setYear(year, skipStats = false) {
  state.currentYear = year;
  document.getElementById("current-year-label").textContent = year;
  updateChangeLayers(year);
  updateMetadataPanel();
  updateLegend();
  if (!skipStats) displayStatistics();
}

function startPlayback(slider, playBtn, maxYear, speedMultiplier = 1) {
  state.isPlaying = true;
  playBtn.textContent = "⏸ Pause";
  state.playInterval = setInterval(() => advanceYear(slider, playBtn, maxYear), Math.round(CONFIG.playbackIntervalMs / speedMultiplier));
}

function stopPlayback(slider, playBtn) {
  state.isPlaying = false;
  playBtn.textContent = "▶ Play";
  clearInterval(state.playInterval);
  displayStatistics();
}

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------

function updateLegend() {
  const list = document.getElementById("legend-list");
  list.innerHTML = "";

  Object.entries(state.visibleLayers).forEach(([key, visible]) => {
    if (!visible) return;
    if (key === "forestCover") {
      const li = document.createElement("li");
      li.className = "legend-item";
      li.innerHTML = `<span class="legend-swatch legend-swatch--forest-cover" aria-hidden="true"></span><span>Forest Cover (remaining)</span>`;
      list.appendChild(li);
      return;
    }
    const meta = LAYER_META[key];
    if (!meta) return;
    const li = document.createElement("li");
    li.className = "legend-item";
    li.innerHTML = `<span class="legend-swatch ${meta.swatchClass}" aria-hidden="true"></span><span>${meta.label}</span>`;
    list.appendChild(li);
  });

  const reservesToggle = document.getElementById("toggle-reserves");
  if (reservesToggle && reservesToggle.checked && forestReservesLayer) {
    const li = document.createElement("li");
    li.className = "legend-item";
    li.innerHTML = `<span class="legend-swatch legend-swatch--forest-reserves" aria-hidden="true"></span><span>Forest Reserves (OSM)</span>`;
    list.appendChild(li);
  }
}

// ---------------------------------------------------------------------------
// Metadata panel
// ---------------------------------------------------------------------------

function updateMetadataPanel() {
  const container = document.getElementById("metadata-content");
  container.innerHTML = "";
  Object.entries(LAYER_META).forEach(([key, meta]) => {
    const closestYear = getClosestYear(key, state.currentYear);
    const div = document.createElement("div");
    div.className = "metadata-item";
    div.innerHTML = `<strong>${meta.label}</strong>Source: ${meta.source}<br>Year: ${closestYear || state.currentYear}`;
    container.appendChild(div);
  });
}

// ---------------------------------------------------------------------------
// Statistics — static display (no WFS backend)
// Displays the selected district name and current year.
// Replace with pre-computed JSON files if you add a data/stats/ folder.
// ---------------------------------------------------------------------------

function displayStatistics() {
  updateMetadataPanel();
  const scope = state.selectedDistrictName
    ? `District: ${state.selectedDistrictName}`
    : "National";
  document.getElementById("stats-scope-label").textContent = scope;
  document.getElementById("stats-content").innerHTML =
    `<p class="stats-no-data">Statistics for ${state.currentYear} — connect a data source to populate this panel.</p>`;
}

// ---------------------------------------------------------------------------
// Map click — identify district from GeoJSON layer
// ---------------------------------------------------------------------------

function handleMapClick(e) {
  if (!districtLayer) return;
  let found = null;
  districtLayer.eachLayer(layer => {
    if (found) return;
    if (layer.getBounds && layer.getBounds().contains(e.latlng)) {
      // Rough bounding-box pre-filter; pointInLayer check via Leaflet
      try {
        if (layer.feature && leafletPip && leafletPip.pointInLayer) {
          // leaflet-pip optional — skip if not loaded
        }
      } catch (_) {}
      found = layer;
    }
  });

  const name = found?.feature?.properties?.NAME_1
    || found?.feature?.properties?.name
    || null;

  const popupHtml = name
    ? `<div class="popup-content"><strong>District</strong>${name}</div>`
    : `<div class="popup-content"><span class="popup-no-data">No district data at this location.</span></div>`;

  L.popup().setLatLng(e.latlng).setContent(popupHtml).openOn(map);

  if (name) {
    state.selectedDistrictName = name;
    displayStatistics();
  }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  initMap().catch(err => console.error("[app] Init failed:", err));
});
