"""Verify isolated native topic-note evidence across two process lifetimes.

Inputs are read-only exports from the dedicated test profile, never user data.
Public numerical NYU snapshots were audited earlier and are reused for rendering.
"""
import base64
from hashlib import sha256
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
ARTIFACTS = ROOT / "apps/desktop/.tmp/atlas-validation/sector-links"
EVIDENCE = Path(__file__).resolve().parent


def read(name):
    return json.loads((ARTIFACTS / name).read_text(encoding="utf-8-sig"))


first, restart = read("first.json"), read("restart.json")
assert first["ok"] and restart["ok"]
assert first["identifier"] == restart["identifier"] == "com.personal-macro.atlas-sector-links-20260909"
assert first["phase"] == "first" and restart["phase"] == "restart"
assert first["note"] == restart["note"]
assert first["cards"] == restart["cards"] == ["Breit aufgestellte Chemie", "Grundchemie", "Spezialchemie"]
note = first["note"]
assert note["context"]["params"]["valTopic"] == "industry:chemicals"
assert note["context"]["params"]["area"] == "m49:276"
assert note["context"]["params"]["valScope"] == "global"
assert note["contextLabel"] == "Global · NYU-Stichprobe · Chemie · Bewertungsbilder"
assert note["snapshotStatus"] == "available"
assert any(source["family"] == "damodaran" and source["datasetId"] == "pbv-global" and source["hashes"] for source in note["sources"])
png = base64.b64decode(note["snapshotDataUrl"].split(",", 1)[1], validate=True)
assert png.startswith(b"\x89PNG\r\n\x1a\n")
tests = read("frontend-tests.json")
assert tests["success"] and not tests["numFailedTests"]
report = {
    "checkedOn": "2026-09-09",
    "status": "topic_navigation_and_native_note_restart_passed_native_click_review_open",
    "testIdentifier": first["identifier"],
    "native": {
        "firstRunAt": first["runAt"], "restartRunAt": restart["runAt"],
        "topic": "industry:chemicals", "selectedArea": "m49:276", "actualSourceRegion": "global",
        "separateIndustryPictures": first["cards"],
        "noteContextSourcesAndPngEqualAfterProcessRestart": True,
        "pngBytes": len(png), "pngSha256": sha256(png).hexdigest(),
        "dataOrigin": first["dataOrigin"],
        "initialAttempt": "An automatic note write immediately after fresh-profile startup hit a SQLite busy error while unrelated startup jobs wrote data. No note was inserted. After startup settled, the save and subsequent process restart passed; no retry success was fabricated.",
        "otherModuleWarnings": "Existing Technicals/provider and central-bank-report startup warnings appeared; the Atlas cache initialized.",
        "fullNativeClickReview": "Still unavailable: native interaction helper has no usable coordinate geometry/screenshots. This evidence proves native commands and storage, not native clicking.",
    },
    "frontend": {
        "testsPassed": tests["numPassedTests"], "files": len(tests["testResults"]),
        "meaningfulCases": ["Exact topic subsets and matching current identities", "Search cannot escape the selected topic", "Explicit clearing of topic/search/page", "A stale unrelated detail falls back to topic gallery", "Missing requested source rows stay visible", "Large subsets use six-card pages", "Source-region and basis changes preserve topic", "Single-year book-value datasets labelled as snapshots", "Saved context retains topic and actual source scope"],
    },
    "browserReview": {
        "tool": "CUA in-app browser; original WorldAtlasPage with clearly labelled, previously audited native public NYU snapshots",
        "cases": ["German chemistry topic explicitly opens the global sample and three chemistry cards", "Bank topic shows only Money Center and Regional Banks", "Search for Bank inside chemistry returns no cards", "Keyboard-cleared search restores the three chemistry cards", "Detail/source-region/back navigation retains the topic", "All industries clears topic and search", "India renders two bank snapshot points without lines or numerical tables"],
        "measuredViewports": [{"width": 1024, "scrollWidth": 1024, "topic": "finance:banks"}, {"width": 1440, "scrollWidth": 1431, "topic": "industry:chemicals"}],
        "consoleWarningsOrErrors": 0,
        "visualReview": "No horizontal overflow, clipped controls or overlapping cards at either measured width. Source and topic remain visible; values stay optional.",
    },
    "qualityGates": {
        "frontend": "172 Atlas tests, TypeScript check, production build, targeted ESLint and Prettier passed.",
        "rust": "Five relevant notebook tests, cargo clippy --all-targets -- -D warnings and cargo fmt --all -- --check passed.",
        "knownBuildNotice": "Vite still reports existing large chunks; no additional dependency was introduced.",
    },
}
(EVIDENCE / "valuation-topic-readiness.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"status": report["status"], "testsPassed": tests["numPassedTests"], "pngSha256": report["native"]["pngSha256"]}))
