"""Download and inspect public BIS originals; never reads the journal database."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import csv
import hashlib
import io
import json
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[4]
CACHE = ROOT / "apps/desktop/.tmp/atlas-remaining-40"
CACHE.mkdir(parents=True, exist_ok=True)


def probe(code):
    url = f"https://data.bis.org/static/bulk/{code}_csv_flat.zip"
    path = CACHE / f"{code}.zip"
    if not path.exists():
        req = urllib.request.Request(url, headers={"User-Agent": "PersonalMacro-Atlas/0.1"})
        with urllib.request.urlopen(req, timeout=90) as response:
            data = response.read(32 * 1024 * 1024 + 1)
            assert len(data) <= 32 * 1024 * 1024
            path.write_bytes(data)
    raw = path.read_bytes()
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        assert archive.namelist() == [f"{code}_csv_flat.csv"]
        data = archive.read(archive.namelist()[0]).decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(data))
    rows = list(reader)
    result = {
        "url": url,
        "sha256": hashlib.sha256(raw).hexdigest(),
        "bytes": len(raw),
        "rows": len(rows),
        "headers": reader.fieldnames,
        "dimensions": {
            field: sorted({r[field] for r in rows})
            for field in reader.fieldnames
            if "TIME_PERIOD" not in field and "OBS_VALUE" not in field
        },
        "samples": rows[:2],
    }
    (CACHE / f"{code}-inspection.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"source": code, "rows": len(rows), "bytes": len(raw), "headers": reader.fieldnames,
            "dimensions": {k: v if len(v) <= 35 else {"count": len(v), "first": v[:5]} for k, v in result["dimensions"].items()}}


if __name__ == "__main__":
    with ThreadPoolExecutor(max_workers=2) as pool:
        for result in pool.map(probe, ["WS_DSR", "WS_CPP"]):
            print(json.dumps(result, ensure_ascii=False))
