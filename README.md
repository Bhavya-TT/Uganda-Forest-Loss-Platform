# Uganda Forest Loss & Land Use Change Mapping Platform

Interactive web map tracking deforestation, urban growth, and agricultural expansion across Uganda (2001–2025).

**Live site:** https://Bhavya-TT.github.io/Uganda-Forest-Loss-Platform/

## Data sources
- **Forest Cover:** Hansen Global Forest Change v1.11 (Hansen/UMD/Google/USGS/NASA)
- **Urban Extent:** GHSL — Global Human Settlement Layer R2023A
- **Agricultural Land:** GLAD Annual Land Cover / ESA WorldCover
- **District Boundaries:** GADM v4.1
- **Forest Reserves:** OpenStreetMap via Overpass API

## Architecture
Fully serverless — no backend required. All layers are static PNG image overlays served directly from this repository via GitHub Pages.

## Folder structure
```
frontend/
├── index.html
├── css/style.css
├── js/
│   ├── config.js       ← layer config, bounding box, available years
│   └── app.js          ← all map logic
├── images/
│   ├── forest_cover/   ← 2001–2023 PNGs
│   ├── urban_extent/   ← 2000–2025 PNGs (5-yr steps)
│   └── agricultural_land/ ← 2017–2023 PNGs
└── data/
    └── uganda_districts.geojson  ← GADM ADM1 boundaries
```
