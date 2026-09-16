"""Verify navigation contexts in an explicitly isolated test profile, read-only."""
import json
import os
from pathlib import Path
import sqlite3

PROFILE = "com.personal-macro.atlas-topic-links-20260909"
DATABASE = Path(os.environ["APPDATA"]) / PROFILE / "PersonalMacro/database/journal.sqlite"
assert PROFILE in DATABASE.parts


def main():
    with sqlite3.connect(DATABASE.as_uri() + "?mode=ro", uri=True) as conn:
        phases = {}
        for phase in ("first", "restart"):
            row = conn.execute(
                "SELECT value_json FROM app_settings WHERE key = ?",
                (f"atlas.topic-links.validation.{phase}",),
            ).fetchone()
            if not row:
                print(f"{phase}: pending")
                return
            result = json.loads(row[0])
            assert result["ok"], result.get("error")
            assert result["identifier"] == PROFILE
            assert result["guideCount"] == 14 and result["linkCount"] == 29
            assert result["entryCount"] == len(result["entries"]) == 46
            phases[phase] = result
        assert phases["first"]["entries"] == phases["restart"]["entries"]
        entries = phases["first"]["entries"]
        assert len({entry["id"] for entry in entries}) == 46
        for entry in entries:
            row = conn.execute(
                "SELECT context_json, sources_json, snapshot_png, trashed_at "
                "FROM atlas_notebook_entries WHERE id = ?", (entry["id"],),
            ).fetchone()
            assert row and json.loads(row[0]) == entry["context"]
            assert json.loads(row[1]) == [] and row[2] is None and row[3] is None
        params = [entry["context"]["params"] for entry in entries]
        origins = [p["fromGuide"] for p in params if p.get("fromGuide")]
        assert len(origins) == 29 and len(set(origins)) == 14
        valuation = [p for p in params if p.get("valTopic")]
        assert {p["valTopic"] for p in valuation} == {
            "electricity:utilities", "industry:aerospace", "industry:defense_industry"
        }
        assert all(p["valScope"] == "global" and p["area"] == "m49:276" for p in valuation)
        credit = next(p for p in params if p.get("fromGuide") == "finance:financial_stress" and p.get("creditMode"))
        assert credit["creditMode"] == "gap" and credit["creditSince"] == "0"
        result = {
            "identifier": PROFILE,
            "firstRunAt": phases["first"]["runAt"],
            "restartRunAt": phases["restart"]["runAt"],
            "guideContexts": 14,
            "guideDestinationContexts": 29,
            "valuationDestinationContexts": 3,
            "nativeNotebookRoundtrips": 46,
            "preservedAfterProcessRestart": 46,
            "lastContextVerifiedByNativeCommandAfterRestart": True,
            "sourceReferences": 0,
            "chartSnapshots": 0,
            "scope": "Navigation only; existing numeric data paths and formulas are unchanged. No native UI click or new data availability claim.",
        }
        Path(__file__).with_name("topic-links-readiness.json").write_text(
            json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        print(json.dumps(result))


if __name__ == "__main__":
    main()
