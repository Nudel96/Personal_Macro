"""Audit three WDI migration series with explicit historical source boundaries.

Uses the common public-file/cache comparison; never reads personal databases.
The standalone metadata endpoints and bounded global data pages are fetched fresh
with --prepare. Earlier unbounded research samples are not imported or approved.
"""
from audit_economic_contexts import main

PROFILE = "com.personal-macro.atlas-migration-20260909"
CODES = ["SM.POP.NETM", "SM.POP.TOTL", "SM.POP.TOTL.ZS"]
LIMITS = [
    "Net migration is an annual modeled balance, not gross flows or migrant stock.",
    "WPP 2024 historical estimates end in 2023; later net-migration projection years are excluded.",
    "Migrant stock estimates use birthplace or, when unavailable, citizenship and imputation.",
    "Boundary changes may alter international migrant classifications without an actual move.",
    "Sparse published stock years remain separate points, without invented annual values.",
    "Published migrant shares use the UN population denominator and are not recomputed from WDI population.",
    "A rounded source share of zero may coexist with a positive migrant count.",
    "The WDI world aggregate may differ from the UN total; net migration zero does not mean no migration.",
    "These are demographic context images, not market valuations or natural-cycle estimates.",
    "The audit verifies public data and an isolated cache, not native-window interaction.",
]

if __name__ == "__main__":
    main(codes=CODES, profile=PROFILE, limits=LIMITS, reuse_candidates=False)
