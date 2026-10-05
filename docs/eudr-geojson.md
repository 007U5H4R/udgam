# EUDR map file (GeoJSON)

Every public certificate offers **Download EUDR map file (GeoJSON)**. The file holds the geolocation of every plot whose harvest is in the batch, in the format the EU Information System accepts for a due diligence statement (DDS). This page documents that file: what it contains, the rules it follows, what the EU system rejects, and the sources.

- **Where:** `GET /api/verify/{batchId}/geojson?h={shortHash}`. It needs the same `h` as the certificate. An unknown batch, a missing `h` and a wrong `h` all get the proof feed's `404 {"error":"not_found"}`, byte for byte (TP8).
- **Response:** `200`, `Content-Type: application/geo+json`, `Content-Disposition: attachment; filename="udgam-{batchId}-eudr.geojson"`, `Cache-Control: no-store`.
- **Built from:** the batch's proof feed alone (technical-plan §8.4, TP16), the same records the certificate shows and the visitor's browser verifies. Each plot's shape and area come from its latest `plot_registered` or `plot_edited` ledger entry.
- **Code:** `src/lib/eudr/geojson.ts` (builder), `src/app/api/verify/[batchId]/geojson/route.ts` (route).
- **Schema:** [`eudr-geojson.schema.json`](./eudr-geojson.schema.json) (JSON Schema 2020-12). The builder's tests validate every file they build against it.
- **Decision:** TP24 in `decisions.md`; technical-plan §12.

## Shape

The file is an RFC 7946 `FeatureCollection` with one `Feature` per plot in the batch, in ledger order. This is the first Feature of the fixture batch (`evals/fixtures/feeds/batch-3-events.json`), pretty-printed:

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [75.739235, 12.421037] },
      "properties": {
        "ProducerName": "PR-0PDMRFJ3",
        "ProducerCountry": "IN",
        "ProductionPlace": "Kodagu, Karnataka",
        "Area": 2,
        "commodity": "coffee",
        "hs_code": "0901 11",
        "quantity_kg_cherry": 124.5,
        "crop": "Arabica",
        "batch_id": "B-CR3G933K",
        "certificate_url": "https://udgam.example/verify/B-CR3G933K?h=05d36abc389a"
      }
    }
  ]
}
```

## Properties

The EU system reads four properties. Their names are case-sensitive. It ignores every other property, so Udgam adds its own for buyers and for Solution-PRD F12. The builder emits exactly these keys; a test checks that this table and the builder agree.

| Property | Kind | Value | Source in the feed |
|---|---|---|---|
| `ProducerName` | EU | The plot's pseudonymous producer ID (`PR-` + 8 characters), never a farmer's name (EV16). An exporter can put names in its own private DDS. | `plot_registered` / `plot_edited` `producerId` |
| `ProducerCountry` | EU | `IN` (ISO 3166-1 alpha-2) | fixed |
| `ProductionPlace` | EU | The district and state, for example `Kodagu, Karnataka`. Never a village. A plot outside Kodagu and Chikkamagaluru reads `Karnataka`. | the anchored polygon's location (`src/lib/certificate/district.ts`) |
| `Area` | EU | Hectares as a JSON number, to two decimals. **Points only**; a Polygon carries no `Area`. | `areaHa` in the plot entry (computed by the server at registration); computed from the polygon if absent |
| `commodity` | Udgam | `coffee` | fixed |
| `hs_code` | Udgam | `0901 11`: coffee, not roasted, not decaffeinated (EUDR Annex I, heading 0901) | fixed |
| `quantity_kg_cherry` | Udgam | The **whole batch's** fresh-cherry kilograms, repeated on every Feature. It is not per plot. It is not the DDS quantity either, which is the net mass of the product placed on the market (green coffee after processing). | sum of the member `harvest_event` `capture.cherryKg` |
| `crop` | Udgam | The batch's crop as the certificate shows it, for example `Arabica` | `batch_created` `crop` |
| `batch_id` | Udgam | The batch ID | the feed |
| `certificate_url` | Udgam | The absolute certificate URL with its `h` (`PUBLIC_BASE_URL`) | the feed's `batchId` and `shortHash` |

**DDS reference data.** The HS code, the commodity description and the quantity basis travel as the Udgam properties above (TP24). Nothing else goes into the file. The exporter enters the DDS quantity (net mass, kg) in the Information System from its own processing records. `quantity_kg_cherry` says what was harvested, not what is declared.

## Geometry rules

| Rule | What Udgam does |
|---|---|
| **Coordinate system:** WGS84 (EPSG:4326), positions `[longitude, latitude]` | Plots are stored and anchored as GeoJSON `[lng, lat]`; the builder keeps that order. |
| **Precision:** at least 6 decimal digits | Every coordinate is rounded to 6 decimals (about 0.11 m) and written with exactly 6 digits, for example `12.420000`, not `12.42`. Consecutive positions that become equal after rounding are merged into one. |
| **Point or Polygon:** Reg. 2023/1115 Art. 2(28) allows a single point for a plot of up to 4 ha; a larger plot needs a polygon | Under 4 ha: a `Point` on the plot's surface (turf's point-on-surface; if that lands on the edge of a concave plot, the middle of the widest stretch of a horizontal line across the plot), with `Area`. **4 ha or more: a `Polygon`.** Solution-PRD says "point for plots < 4 ha", so a plot of exactly 4 ha is a Polygon, which is always accepted (TP24). The comparison uses the area at two decimals, as the product shows it (`4.00 ha`), so a plot measured at 3.999 ha is a Polygon too. |
| **Rings:** closed, at least 4 positions | The outer ring is re-closed after rounding. A ring with fewer than 4 positions left falls back to a Point. |
| **Holes** (inner rings) are rejected | Only the outer ring is exported. Registration already refuses a plot with a hole (`has_holes`, `src/lib/geo/validate.ts`). |
| **Self-intersection** (crossing edges, a figure-eight) is rejected | Prevented at registration: a crossing polygon cannot be registered (`self_intersection`, TC-026, `src/lib/geo/validate.ts`). Rounding to 0.11 m cannot make a valid plot of Udgam's size cross itself. |
| **LineString** and other geometry types are rejected | Only `Point`, `Polygon` and (for a plot anchored as several parts) `MultiPolygon` with outer rings are written. |
| **File size:** at most 25 MB per DDS | A Point plot is about 400 bytes. Registration caps a plot at 1,000 vertices, so even 50 plots at that cap stay near 1.1 MB. The route's test serves a 50-plot batch and checks it is under 25 MB. |

## Context: application dates

Reg. (EU) 2025/2650 moved the date of application of the EUDR to **30 December 2026** for large and medium operators and **30 June 2027** for micro and small ones, and added a simplified one-off declaration for micro and small primary operators. The file serves the exporter's or importer's DDS either way. This is context only; it changes nothing in the file.

## Sources

- European Commission, *EUDR GeoJson File Description*, version 1.5, 5 May 2025. It applies to both the Information System's user interface and its API. Source for the FeatureCollection shape, WGS84 `[longitude, latitude]` order, the 6-decimal precision, the property names `ProducerName`, `ProducerCountry`, `ProductionPlace` and `Area`, the rejected geometries, and the 25 MB limit.
- Regulation (EU) 2023/1115 (EUDR), Article 2(28) (definition of geolocation: a point for plots up to 4 ha, polygons for larger plots), Annex I (heading 0901, coffee) and Annex II (the DDS content, including the geolocation of all plots of land).
- Regulation (EU) 2025/2650, amending Regulation (EU) 2023/1115 (application dates and the simplified declaration).
- Udgam decisions: TP24 (this format), EV16 (no personal data in public files), TP16 (everything from the feed), TP8 (identical 404s).
