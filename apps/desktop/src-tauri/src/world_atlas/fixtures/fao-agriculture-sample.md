# FAOSTAT production-index fixture

Source: FAO, FAOSTAT, Production Indices (QI), release 2026-05-11.
Retrieved 2026-09-09 from
https://bulks-faostat.fao.org/production/Production_Indices_E_All_Data_(Normalized).zip

License: CC BY 4.0, as stated in the official catalogue:
https://data.fao.org/catalog/dataset/c978f18c-7f11-4564-a47d-fd92f6353b11

`fao-agriculture-sample.zip` retains the four original code directories and
160 unchanged original data rows selected by area codes 41, 79, 100, 231, 351,
5000, 5100; item codes 15, 661, 2051; and years from 2020. The ZIP container and
selection are test adaptations, not a complete FAOSTAT release. Missing combinations
remain absent. The source describes all supplied values as estimates (`E`).

Original full-file SHA-256:
`04c58034493d91f02e2495570d3864212ac870ec7f829a5f22577d143a6a8a72`.
The fixture checks published values, distinct mainland/broad China identities,
source definitions and atomic-cache behavior. Tests construct malformed variants
in memory. The explicit full-source test and independent Python audit separately
verify every row of the complete public source; they use temporary caches only.
