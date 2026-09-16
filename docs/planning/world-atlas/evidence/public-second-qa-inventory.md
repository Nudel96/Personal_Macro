# Native QA inventory · public source expansion 2 · 2026-09-11

Own Tauri profile `com.personal-macro.atlas-public-20260911`; public Atlas cache
copied with SQLite backup after successful original imports. User journal is not
copied. Use the persistent Playwright CDP session and ordinary UI controls.

- Purchasing power: both current WDI price-level perspectives, Germany/India
  comparison, USA=100 when numbers enabled, numeric tooltips absent when disabled,
  2025 endpoint, source-estimate label and extrapolation explanation. Missing
  World observations must not become a synthesized world average.
- Census: United States selection from unsupported Germany/India; four separately
  named construction perspectives. Data centers start 2014, warehouses 1993;
  latest month 2026-07; numbers off/on/off, source flag p/r, explanation of nominal
  monthly NSA spending. Common source update disabled inside 24 hours.
- IEA: car sales share, stock share, EV total, BEV/PHEV/FCEV counts, three charging
  categories. All 13 perspective switches; no 2035 curve. India and World have
  actual data; IEA Africa uses its own geography. In 2025 world stock remains
  75 million while rounded components are 51/25 million; no artificial sum.
- Empty or unsupported selection: keep the explicitly chosen metric, offer a
  real available area, never substitute a different measurement silently.
- Coverage: searches for Kaufkraft, Rechenzentren, Logistikimmobilien,
  Elektromobilität, Ladeinfrastruktur lead to corresponding actual views.
- Persistence: save and restore one IEA or Census perspective with horizon and
  source details; retain original source IDs, publish date and provenance hash.
- Visual pass separate from interaction pass: full chart at native window size
  and at minimum 1024 px; no clipped labels, overflow, collapsed chart or missing
  year labels. Capture representative price-level, Census and IEA screenshots.

Source parsing/SQLite tests separately verify complete originals and corruption,
future-year, wrong-unit, duplicate and geographic-boundary guards. Browser preview
continues to expose catalog-only states, not simulated downloaded data.
