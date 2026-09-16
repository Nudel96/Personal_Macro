# BIS commercial property source research

Research only; no implemented/local-data claim yet.

- Official topic: https://data.bis.org/topics/CPP (last release 27 August 2026).
- Original: https://data.bis.org/static/bulk/WS_CPP_csv_flat.zip
- Inventory: https://www.bis.org/statistics/pp_inventory_commercial.pdf (31 July 2025).
- National attribution: https://www.bis.org/statistics/pp_sources.pdf (31 July 2026).
- Changes: https://www.bis.org/statistics/pp_changes.pdf (29 January 2026).

The original contains 6,599 rows: 68 metadata-only rows and 6,531 observation
rows, some of which are explicitly `NaN`/`M`. Units, scale, titles, coverage,
methods, original publications and breaks live in metadata-only rows with an
empty frequency; numeric rows inherit by the other seven complete dimensions.
No averaging of metadata or date inference is allowed.

The 68 original series cover 26 source territories, including the Euro area.
Country data can cover only one city, multiple cities or the whole country.
Indices have heterogeneous reference dates; AED, USD and PHP are prices per
square metre according to the source metadata. None should be rebased or
converted to a common currency without an explicitly separate derived view.
The source includes residential investment properties and agricultural property;
these must be deliberately classified or excluded, never relabeled as offices.

Frequency `H` uses original `YYYY-S1`/`YYYY-S2` and requires a half-year calendar
coordinate. Japan's older land series instead use `Q` but publish Q1/Q3 only:
the absent intervening quarters remain gaps, not app-interpolated history.

Known boundaries to implement and test:

- US all-commercial index changes from appraisal series to CoStar repeat sales
  at 1996-Q1; preserve both histories with an explicit line break.
- Brazil incorporates Belo Horizonte in January 2014 and Porto Alegre in
  January 2016. Split at those dates, retain original values.
- Philippines Makati data from 2019-Q1 were revised by 28–43%; earlier revision
  remains possible. Retain the source statement and split the revision boundary.
- Hong Kong offices have original missing months; neither repair nor set zero.
- French experimental series end in 2021-Q2 in this archive.
- Iceland publishes separate nominal (BIS-calculated) and real indices;
  the real deflator is the credit-terms index, CPI-linked from mid-2008.
- Euro area is a fixed 20-country composition as of 1 January 2023. Give it
  an explicit source-region identity rather than merging with other aggregates.
- Greek final half-years and recent German quarters include provisional values.
- Source-country names include `KR: Korea` and `XM: Euro area`; don't infer
  identities solely by prefixes.

Local ignored probes: `cpp-series-probe.json`, `cpp-metadata-probe.json`, original
`WS_CPP.zip` in `apps/desktop/.tmp/atlas-remaining-40`.

Proposed view: explicitly named original national/city series with their own
units and frequency, selected per country; independent comparison selector and
common calendar but separate scales. Persist both actual series in notebook
context. No common index-level ranking or automatic over/undervaluation claim.
