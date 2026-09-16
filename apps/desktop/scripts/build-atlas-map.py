"""Build offline navigation geometry from audited Natural Earth map units.

Development only: pyshp 2.3.1. Run from apps/desktop with --input pointing to
the public source files. No journal data, network call or runtime dependency.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
SOURCE_COMMIT = "ca96624a56bd078437bca8184e78163e5039ad19"
SOURCE_PAGE = "https://www.naturalearthdata.com/downloads/110m-cultural-vectors/110m-admin-0-details/"
PREFIX = "ne_110m_admin_0_map_units"


def equal_earth(lon, lat):
    """Spherical Equal Earth, published coefficients; radians, unit sphere.

    Savric, Patterson, Jenny (2018), DOI 10.1080/13658816.2018.1504949.
    Independently checked against the rounded PROJ documentation vector.
    """
    t = math.asin(math.sqrt(3) / 2 * math.sin(math.radians(lat)))
    p = 1.340264 - 0.081106 * t**2 + 0.000893 * t**6 + 0.003796 * t**8
    derivative = 1.340264 - 3 * 0.081106 * t**2 + 7 * 0.000893 * t**6 + 9 * 0.003796 * t**8
    return math.radians(lon) * math.cos(t) / (math.sqrt(3) / 2 * derivative), t * p


MAX_X = equal_earth(180, 0)[0]
MAX_Y = equal_earth(0, 90)[1]
SCALE = 940 / (2 * MAX_X)
WIDTH, HEIGHT = 960, math.ceil(2 * MAX_Y * SCALE + 20)


def project(lon, lat):
    if not -180.000001 <= lon <= 180.000001 or not -90 <= lat <= 90:
        raise ValueError("Invalid source coordinate")
    x, y = equal_earth(lon, lat)
    return round(480 + x * SCALE, 2), round(10 + (MAX_Y - y) * SCALE, 2)


def path(points, closed=False):
    xy = [project(lon, lat) for lon, lat in points]
    return "M" + "L".join(f"{x:g},{y:g}" for x, y in xy) + ("Z" if closed else "")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    args = parser.parse_args()
    sys.path.insert(0, str(args.input / "python-deps"))
    import shapefile

    metadata = json.loads((args.input / "source.json").read_text())
    if metadata["commit"] != SOURCE_COMMIT:
        raise ValueError("Review the new source commit before regenerating")
    if (args.input / f"{PREFIX}.VERSION.txt").read_text().strip() != "5.1.1":
        raise ValueError("Unexpected Natural Earth release")
    if 'GEOGCS["GCS_WGS_1984"' not in (args.input / f"{PREFIX}.prj").read_text():
        raise ValueError("Unexpected source coordinate system")
    # Published PROJ unit-sphere example: 122E, 47N -> 1.55, 0.89.
    assert tuple(round(v, 2) for v in equal_earth(122, 47)) == (1.55, 0.89)
    assert equal_earth(0, 0) == (0, 0)
    catalog = json.loads((ROOT / "src/features/world-atlas/data/catalog.json").read_text(encoding="utf-8"))
    by_iso = {a["iso3"]: a for a in catalog["geographies"] if a["iso3"]}
    reader = shapefile.Reader(str(args.input / PREFIX), encoding="utf-8")
    if len(reader) != 183:
        raise ValueError("Unexpected map-unit count")
    grouped, unbound, crosswalk = {}, [], []
    for record in reader.iterShapeRecords():
        fields, shape = record.record.as_dict(), record.shape
        # These map units are explicitly separated by the source. Never assign
        # them to another catalog country from the sovereignty column.
        code = fields["ISO_A3"]
        method = "ISO_A3"
        if code == "-99":
            code, method = fields["ISO_A3_EH"], "ISO_A3_EH"
        if fields["GU_A3"] == "KOS":
            code, method = "XKX", "explicit KOS -> provider:XKX"
        area = by_iso.get(code)
        if area is None and fields["GU_A3"] not in ("CYN", "SOL"):
            raise ValueError(f"Review unmapped source identity: {fields['GU_A3']}")
        ends = list(shape.parts) + [len(shape.points)]
        paths = []
        for start, end in zip(ends, ends[1:]):
            points = shape.points[start:end]
            if len(points) < 4 or points[0] != points[-1]:
                raise ValueError("Invalid polygon ring")
            for a, b in zip(points, points[1:]):
                # The closing segment along the South Pole is intentional.
                if abs(b[0] - a[0]) > 180 and not (a[1] == b[1] == -90):
                    raise ValueError("Unsplit antimeridian crossing")
            paths.append(path(points, closed=True))
        geometry = "".join(paths)
        if area:
            grouped.setdefault(area["id"], []).append(geometry)
        else:
            unbound.append({"id": fields["GU_A3"], "label": {"CYN": "Nordzypern · eigener Quellenumriss", "SOL": "Somaliland · eigener Quellenumriss"}[fields["GU_A3"]], "path": geometry})
        crosswalk.append({"sourceUnit": fields["GU_A3"], "sourceName": fields["NAME"], "isoA3": fields["ISO_A3"], "isoA3Eh": fields["ISO_A3_EH"], "geographyId": area["id"] if area else None, "method": method if area else "No own catalog identity; outline only"})

    outline = path([(-180, lat) for lat in range(-90, 91, 2)] + [(180, lat) for lat in range(90, -91, -2)], closed=True)
    graticule = "".join(path([(lon, lat) for lon in range(-180, 181, 3)]) for lat in range(-60, 61, 30))
    graticule += "".join(path([(lon, lat) for lat in range(-90, 91, 3)]) for lon in range(-120, 121, 60))
    source = {"name": "Natural Earth 1:110m Admin 0 Map Units", "version": "5.1.1", "url": SOURCE_PAGE, "license": "Public domain", "commit": SOURCE_COMMIT}
    output = {"version": "2026-09-09.1", "source": source, "projection": "Spherical Equal Earth", "width": WIDTH, "height": HEIGHT, "outline": outline, "graticule": graticule, "areas": [{"id": key, "path": "".join(paths)} for key, paths in sorted(grouped.items())], "unbound": unbound}
    target = ROOT / "src/features/world-atlas/data/map-geometry.json"
    target.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    files = [{"name": f"{PREFIX}.{ext}", "url": f"{metadata['baseUrl']}.{ext}", "sha256": hashlib.sha256((args.input / f"{PREFIX}.{ext}").read_bytes()).hexdigest()} for ext in ("shp", "shx", "dbf", "prj", "cpg", "VERSION.txt")]
    audit = {"checkedOn": "2026-09-09", "source": source, "projectionReference": "https://proj.org/en/stable/operations/projections/eqearth.html", "sourceFiles": files, "sourceMapUnits": len(reader), "mappedAreas": len(grouped), "crosswalk": crosswalk, "listOnlyAreas": [a for a in catalog["geographies"] if a["id"] not in grouped]}
    (ROOT.parent.parent / "docs/planning/world-atlas/evidence/map-geography-audit.json").write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"sourceMapUnits": len(reader), "mappedAreas": len(grouped), "unboundOutlines": len(unbound), "listOnlyAreas": len(audit["listOnlyAreas"]), "outputBytes": target.stat().st_size}))


if __name__ == "__main__":
    main()
