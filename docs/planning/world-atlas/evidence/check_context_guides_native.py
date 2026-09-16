"""Read only the explicitly isolated Atlas context-guide test profile."""
import json
import os
from pathlib import Path
import sqlite3

PROFILE = "com.personal-macro.atlas-context-guides-20260909"
ROOT = Path(os.environ["APPDATA"]) / PROFILE / "PersonalMacro"
assert PROFILE in ROOT.parts
DATABASE = ROOT / "database" / "journal.sqlite"
OUTPUT = Path(__file__).with_name("context-guides-readiness.json")


def main():
    if not DATABASE.is_file():
        print("Isolated profile has not initialized yet")
        return
    with sqlite3.connect(DATABASE.as_uri() + "?mode=ro", uri=True) as conn:
        phases = {}
        for phase in ("first", "restart"):
            found = conn.execute(
                "SELECT value_json FROM app_settings WHERE key = ?",
                (f"atlas.context.guides.validation.{phase}",),
            ).fetchone()
            if not found:
                print(phase, "pending")
                return
            result = json.loads(found[0])
            assert result["ok"], result.get("error")
            assert result["identifier"] == PROFILE
            assert result["guideCount"] == 10 and result["linkCount"] == 22
            assert result["entryCount"] == len(result["entries"]) == 32
            assert len({entry["id"] for entry in result["entries"]}) == 32
            phases[phase] = result
        assert phases["first"]["entries"] == phases["restart"]["entries"]
        entries = phases["first"]["entries"]
        for entry in entries:
            row = conn.execute(
                "SELECT context_json, sources_json, snapshot_png, trashed_at "
                "FROM atlas_notebook_entries WHERE id = ?", (entry["id"],),
            ).fetchone()
            assert row and json.loads(row[0]) == entry["context"]
            assert json.loads(row[1]) == [] and row[2] is None and row[3] is None
        origins = [e["context"]["params"].get("fromGuide") for e in entries]
        assert sum(bool(origin) for origin in origins) == 22
        assert len({origin for origin in origins if origin}) == 10
        result = {
            "identifier": PROFILE,
            "firstRunAt": phases["first"]["runAt"],
            "restartRunAt": phases["restart"]["runAt"],
            "guideContexts": 10,
            "destinationContexts": 22,
            "nativeNotebookRoundtrips": 32,
            "preservedAfterProcessRestart": 32,
            "lastContextVerifiedByNativeCommandAfterRestart": True,
            "sourceReferences": 0,
            "chartSnapshots": 0,
            "scope": "Navigation contexts only; this test does not claim source availability or native UI clicks.",
            "guideTopics": sorted({origin for origin in origins if origin}),
        }
        OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(result, ensure_ascii=True))


if __name__ == "__main__":
    main()
