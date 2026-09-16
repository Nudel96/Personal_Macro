"""Download publisher SDMX CSV responses, retaining every dimension for the source review."""
import csv
import hashlib
import io
import json
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
DEST = ROOT / "apps/desktop/.tmp/atlas-remaining-40"
FLOWS = {"oecd-wages": "OECD.ELS.SAE,DSD_EARNINGS@AV_AN_WAGE,1.0", "oecd-hours": "OECD.ELS.SAE,DSD_HW@DF_AVG_ANN_HRS_WKD,1.0"}
for name, flow in FLOWS.items():
    url = f"https://sdmx.oecd.org/public/rest/data/{flow}/all?dimensionAtObservation=AllDimensions&format=csvfilewithlabels"
    path = DEST / f"{name}.csv"
    if not path.exists():
        req = urllib.request.Request(url, headers={"User-Agent": "PersonalMacro-Atlas source research", "Accept": "text/csv"})
        try:
            with urllib.request.urlopen(req, timeout=90) as response:
                data = response.read(32 * 1024 * 1024 + 1)
                assert len(data) <= 32 * 1024 * 1024
            path.write_bytes(data)
        except Exception as e:
            print(name, type(e).__name__, str(e)[:250], flush=True)
            continue
    data = path.read_bytes()
    reader = csv.DictReader(io.StringIO(data.decode('utf-8-sig')))
    fields = reader.fieldnames
    rows = list(reader)
    dims = {field: sorted(set(row[field] for row in rows)) for field in fields if field not in ['OBS_VALUE', 'Observation value', 'TIME_PERIOD', 'Time period']}
    out = {"url": url, "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data), "rows": len(rows), "headers": fields, "dimensions": dims, "examples": rows[:3]}
    (DEST / f"{name}-inspection.json").write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding='utf8')
    print(json.dumps({"id": name, "bytes": len(data), "rows": len(rows), "sha256": out['sha256'], "headers": fields}, indent=2), flush=True)
