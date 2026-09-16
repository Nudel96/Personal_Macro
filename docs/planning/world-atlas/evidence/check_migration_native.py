"""Check real native migration replies and the fixed chart across two processes."""
from audit_migration import CODES, PROFILE
from check_economic_contexts_native import main

if __name__ == "__main__":
    main(codes=CODES, profile=PROFILE, extra_limits=(
        "The first startup logged slow successful SQL writes for Atlas preferences, proof settings and a COT job; no failed migration download or persistence was observed.",
    ))
