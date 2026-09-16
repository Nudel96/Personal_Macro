"""Verify every BIS credit cell against the explicitly isolated native cache.

Original public ZIP + independent stdlib CSV/Decimal parsing. No API key,
production journal, private account or personal Atlas notes are accessed.
The validation profile's own test-result setting contains only this public chart.
"""
import base64
import csv
import hashlib
import io
import json
import os
import sqlite3
import zipfile
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
REVIEW = ROOT / 'apps/desktop/.tmp/atlas-validation'
DATA = ROOT / 'apps/desktop/src/features/world-atlas/data'
PROFILE = Path(os.environ['APPDATA']) / 'com.personal-macro.atlas-credit-validation/PersonalMacro'


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def readonly(path):
    assert path.is_file(), path
    return sqlite3.connect(path.as_uri() + '?mode=ro', uri=True)


def main():
    raw = (REVIEW / 'WS_CREDIT_GAP_csv_flat.zip').read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    source = zipfile.ZipFile(io.BytesIO(raw))
    assert source.namelist() == ['WS_CREDIT_GAP_csv_flat.csv']
    rows = list(csv.DictReader(io.StringIO(source.read(source.namelist()[0]).decode('utf-8-sig'))))
    # Independent geography crosswalk from the original M49 planning directory.
    countries = read(ROOT / 'docs/planning/world-atlas/catalogs/geographies.json')['areas']
    mapping = {g['iso2']: g['id'] for g in countries}
    mapping['XM'] = 'bis:euro_area'
    metric = {'A': 'ratio', 'B': 'trend', 'C': 'gap'}
    expected, flags, maximum_error = {}, set(), Decimal(0)
    for row in rows:
        assert row['STRUCTURE_ID'] == 'BIS:WS_CREDIT_GAP(1.0): Credit-to-GDP gaps'
        assert row['FREQ:Frequency'] == 'Q: Quarterly'
        assert row['TC_BORROWERS:Borrowing sector'] == 'P: Private non-financial sector'
        assert row['TC_LENDERS:Lending sector'] == 'A: All sectors'
        assert row['UNIT_MEASURE:Unit of measure'] == '770: Percentage of GDP'
        assert row['UNIT_MULT:Unit Multiplier'] == '0: Units'
        assert row['COLLECTION:Collection Indicator'] == 'E: End of period'
        assert row['OBS_CONF:Observation confidentiality'] == 'F: Free'
        code = row["BORROWERS_CTY:Borrowers' country"].split(':')[0]
        key = (row['TIME_PERIOD:Time period or range'], metric[row['CG_DTYPE:Credit gap data type'].split(':')[0]])
        area = expected.setdefault(mapping[code], {})
        assert key not in area
        area[key] = Decimal(row['OBS_VALUE:Observation Value']) if row['OBS_VALUE:Observation Value'] else None
        flags.add(row['OBS_STATUS:Observation Status'])
    assert flags == {'A: Normal value'}
    db = readonly(PROFILE / 'atlas/cache.sqlite')
    assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
    stored = {area: json.loads(data) for area, data in db.execute('SELECT geography_id, profile_json FROM atlas_credit_areas')}
    metadata = json.loads(db.execute('SELECT provenance_json FROM atlas_credit_dataset').fetchone()[0])
    assert metadata['sha256'] == digest
    assert metadata['sourceRowCount'] == len(rows)
    assert set(expected) == set(stored)
    assert {a['geographyId'] for a in read(DATA / 'credit-catalog.json')['areas']} == set(stored)
    numeric, nulls = 0, 0
    coverage = []
    for area, profile in stored.items():
        seen = set()
        for point in profile['points']:
            for name in metric.values():
                key = (point['period'], name)
                assert key not in seen
                seen.add(key)
                expected_value = expected[area].get(key)
                if expected_value is None:
                    assert point[name] is None, (area, key, point[name])
                    nulls += 1
                else:
                    assert point[name] is not None
                    assert abs(Decimal(str(point[name])) - expected_value) < Decimal('1e-10'), (area, key)
                    numeric += 1
            if all(point[k] is not None for k in metric.values()):
                err = abs(Decimal(str(point['ratio'])) - Decimal(str(point['trend'])) - Decimal(str(point['gap'])))
                maximum_error = max(maximum_error, err)
        assert set(expected[area]) <= seen
        coverage.append({'id': area, 'providerCode': profile['providerCode'], 'quarters': len(profile['points']), 'firstRatio': next(p['period'] for p in profile['points'] if p['ratio'] is not None), 'firstGap': next(p['period'] for p in profile['points'] if p['gap'] is not None), 'lastPeriod': profile['points'][-1]['period']})
    assert numeric == metadata['numericCellCount']
    assert maximum_error <= Decimal('.000101')
    version = db.execute('SELECT MAX(version) FROM _sqlx_migrations').fetchone()[0]
    db.close()
    journal = readonly(PROFILE / 'database/journal.sqlite')
    proof = json.loads(journal.execute("SELECT value_json FROM app_settings WHERE key='atlas.credit.validation'").fetchone()[0])
    assert proof['ok'] and proof['identifier'] == 'com.personal-macro.atlas-credit-validation'
    image = base64.b64decode(proof.pop('picture'))
    assert image.startswith(b'\x89PNG\r\n\x1a\n')
    (REVIEW / 'credit-native-picture.png').write_bytes(image)
    journal.close()
    proof['picture'] = {'width': int.from_bytes(image[16:20], 'big'), 'height': int.from_bytes(image[20:24], 'big')}
    proof['picture']['bytes'] = len(image)
    proof['picture']['sha256'] = hashlib.sha256(image).hexdigest()
    result = {'verifiedAt': datetime.now(timezone.utc).isoformat(), 'sourceUrl': metadata['url'], 'sourceSha256': digest, 'sourceBytes': len(raw), 'sourceRows': len(rows), 'profiles': len(stored), 'matchedNumericCells': numeric, 'matchedNullCellsIncludingWarmup': nulls, 'maximumPublishedRoundingResidual': str(maximum_error), 'cacheSchema': version, 'coverage': sorted(coverage, key=lambda a: a['id']), 'native': proof}
    destination = Path(__file__).with_name('credit-native-readiness.json')
    if destination.exists():
        previous = read(destination)
        if previous['native'].get('restart') is False and proof.get('restart') is True:
            result['initialNative'] = previous['native']
    destination.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({k: v for k, v in result.items() if k not in ('coverage', 'native', 'initialNative')}, ensure_ascii=False))


if __name__ == '__main__':
    main()
