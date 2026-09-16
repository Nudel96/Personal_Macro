# Native commercial property QA inventory, 2026-09-11

- Verify 65 original profiles / 5,586 values / 649 missing observations in reopened native SQLite.
- Germany: all five actual national/city series; original units and 2022 vs 2010 bases; provisional values visible.
- Original historical endpoints and breaks: US 1996-Q1, Brazil 2014-01/2016-01, Philippines 2019-Q1.
- Greece: four actual half-year histories and optional numbers; no invented annual means.
- Japan: Q1/Q3 land observations remain isolated by missing quarters; no interpolation.
- Compare actual national series with independent selector and separate scales. No silent replacement when the requested building type is absent.
- Explicitly switch to a different comparison building type, then save/reopen both real selections and their provenance.
- Unsupported India/World and excluded Swiss residential-investment property remain without a commercial series.
- Fixed Euro area 20 source-region is selectable separately from the other BIS Euro area.
- Source coverage lists only that country's available original series and provides an explicit source-region entry for missing countries.
- Numbers off/on, tooltips, month/quarter/half-year labels, initial view, normal window and 1024-pixel minimum.
- Inspect screenshots and native stderr; create final regular Windows release.
