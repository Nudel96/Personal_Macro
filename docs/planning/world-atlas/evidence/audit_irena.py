"""Compare every IRENA cell with the isolated native public cache.

Reads only original public PX downloads and the explicitly named capacity
validation profile. No personal journal, provider secret or production DB.
Run after the native capacity review has completed its real HTTP sync.
"""
import base64
import hashlib
import json
import os
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
REVIEW = ROOT / 'apps/desktop/.tmp/atlas-validation'
DATA = ROOT / 'apps/desktop/src/features/world-atlas/data'
PROFILE = Path(os.environ['APPDATA']) / 'com.personal-macro.atlas-capacity-validation/PersonalMacro'

def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))

def readonly(path):
    assert path.is_file(), path
    return sqlite3.connect(path.as_uri() + '?mode=ro', uri=True)

def main():
    catalog = read(DATA / 'catalog.json')
    config = read(DATA / 'capacity-catalog.json')
    iso = {g['iso3']: g['id'] for g in catalog['geographies'] if g['iso3']}
    technologies = {t['sourceLabel']: t['id'] for t in config['technologies']}
    region_ids = {r['code']: r['id'] for r in config['regions']}
    expected, originals, omitted = {}, [], []
    source_cells = numeric = nulls = 0
    for file in sorted(REVIEW.glob('irena-*-*.px')):
        if not re.fullmatch(r'irena-(country|region)-\d+\.px', file.name):
            continue
        raw = file.read_bytes()
        text = raw.decode('cp1252')
        headers = dict(re.findall(r'(?m)^([A-Z-]+(?:\("[^"]+"\))?)=(.*?);', text, re.S))
        assert headers['UNITS'] == '"MW"'
        assert headers['LAST-UPDATED'] == '"20260416 08:00"'
        strings = lambda key: re.findall(r'"([^"]*)"', headers[key])
        kind = 'Region' if 'region' in file.name else 'Country/area'
        codes, labels = strings(f'CODES("{kind}")'), strings(f'VALUES("{kind}")')
        tech, years = strings('VALUES("Technology")'), strings('VALUES("Year")')
        assert strings('VALUES("Grid connection")') == ['OnGrid', 'OffGrid']
        values = headers['DATA'].split()
        assert len(values) == len(codes) * len(tech) * 2 * len(years)
        source_cells += len(values)
        originals.append({'file': file.name, 'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw), 'cells': len(values)})
        for ai, (code, label) in enumerate(zip(codes, labels)):
            if kind == 'Country/area' and code in ('REA', 'OCA'):
                omitted.append({'code': code, 'label': label, 'reason': 'Regional row in country table; own region table used'})
                continue
            area = region_ids[code] if kind == 'Region' else iso[code]
            assert area not in expected
            output = {}
            for ti, technology in enumerate(tech):
                for gi, grid in enumerate(['ongrid', 'offgrid']):
                    for yi, year in enumerate(years):
                        token = values[((ai * len(tech) + ti) * 2 + gi) * len(years) + yi]
                        if token == '"-"':
                            value = None
                            nulls += 1
                        else:
                            value = float(token)
                            assert value >= 0
                            numeric += 1
                        output.setdefault(int(year), {})[f'{technologies[technology]}.{grid}'] = value
            expected[area] = output
    with readonly(PROFILE / 'atlas/cache.sqlite') as db:
        assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
        provenance = json.loads(db.execute('SELECT provenance_json FROM atlas_capacity_dataset').fetchone()[0])
        rows = {area: json.loads(profile) for area, profile in db.execute('SELECT geography_id, profile_json FROM atlas_capacity_areas')}
        migrations = db.execute('SELECT COUNT(*) FROM _sqlx_migrations WHERE success = 1').fetchone()[0]
    assert set(rows) == set(expected)
    for area, profile in rows.items():
        actual = {y['year']: y['values'] for y in profile['years']}
        assert set(actual) == set(expected[area])
        for year, values in actual.items():
            assert values.keys() == expected[area][year].keys()
            for key, value in values.items():
                original = expected[area][year][key]
                assert value is None if original is None else value is not None and abs(value-original) < 1e-7, (area,year,key,value,original)
    native_hashes = {f['sha256'] for f in provenance['files']}
    assert all(f['sha256'] in native_hashes for f in originals)
    assert migrations == 7
    with readonly(PROFILE / 'database/journal.sqlite') as db:
        result = json.loads(db.execute("SELECT value_json FROM app_settings WHERE key='atlas.capacity.validation'").fetchone()[0])
    assert result['ok']
    picture = base64.b64decode(result.pop('picture'))
    assert picture[:8] == b'\x89PNG\r\n\x1a\n'
    (REVIEW / 'capacity-native-picture.png').write_bytes(picture)
    result['pictureSha256'] = hashlib.sha256(picture).hexdigest()
    result['pictureBytes'] = len(picture)
    result['pictureSize'] = [int.from_bytes(picture[16:20], 'big'),int.from_bytes(picture[20:24], 'big')]
    output = {'checkedAt': datetime.now(timezone.utc).isoformat(), 'profile': 'com.personal-macro.atlas-capacity-validation', 'cacheMigrations': migrations,
              'profiles': len(rows), 'sourceCells': source_cells, 'comparedNumericCells': numeric, 'comparedNonNumericCells': nulls,
              'omittedCountryRows': omitted, 'sourceFiles': originals, 'nativeCheck': result}
    evidence = Path(__file__).with_name('capacity-native-readiness.json')
    if evidence.exists():
        previous = read(evidence)
        output['firstNativeCheck'] = previous.get('firstNativeCheck', previous.get('nativeCheck'))
    evidence.write_text(json.dumps(output, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({key: output[key] for key in ['profiles','sourceCells','comparedNumericCells','comparedNonNumericCells','cacheMigrations']}))

if __name__ == '__main__':
    main()
