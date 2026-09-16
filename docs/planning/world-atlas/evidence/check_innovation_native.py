"""Compare all native WIPO values with the original CSV; isolated profile only."""
import argparse
import base64
import csv
import hashlib
import io
import json
import os
from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[4]
PROFILE = 'com.personal-macro.atlas-innovation-20260909'
OUT = ROOT / 'apps/desktop/.tmp/atlas-validation/innovation'
CONFIG = ROOT / 'apps/desktop/src/features/world-atlas/data/innovation-catalog.json'

def verify_rows(rows):
    cfg = json.loads(CONFIG.read_text(encoding='utf-8'))
    raw = (OUT / 'current-publications.csv').read_bytes()
    assert len(raw) == cfg['bytes'] and hashlib.sha256(raw).hexdigest() == cfg['sha256']
    records = list(csv.reader(io.StringIO('\n'.join(raw.decode('utf-8-sig').splitlines()[6:]))))
    reference = {}
    for r in records[1:]:
        code, field = r[1], r[3]
        field = '0' if field == 'Unknown' else field.split(' - ')[0]
        reference[code, field] = {int(y): int(v) if v else None for y, v in zip(records[0][4:], r[4:-1])}
    supported = {a['geographyId']: a for a in cfg['areas']}
    found = set()
    numeric = missing = 0
    for r in rows:
        area_id = r['geography']['id']
        assert area_id not in found
        found.add(area_id)
        provenance = r['provenance']
        assert provenance['sha256'] == cfg['sha256'] and provenance['recipe'] == cfg['recipe'] and provenance['sourceRelease'] == cfg['sourceRelease']
        if area_id not in supported:
            assert r['status'] == 'unsupported_area' and r['profile'] is None
            continue
        area = supported[area_id]
        profile = r['profile']
        assert r['status'] == 'available' and profile['geographyId'] == area_id
        assert profile['providerCode'] == area['code'] and profile['providerLabel'] == area['label']
        assert [p['year'] for p in profile['points']] == list(range(1980, 2025))
        for point in profile['points']:
            assert set(point['values']) == {str(i) for i in range(36)}
            for field, value in point['values'].items():
                original = reference.get((area['code'], field), {}).get(point['year'])
                assert original == value, (area['code'], field, point['year'], original, value)
                if value is None:
                    missing += 1
                else:
                    assert isinstance(value, int)
                    numeric += 1
    assert set(supported) <= found and (numeric, missing) == (108696, 213684)
    return {'profiles': 199, 'numericCellsExact': numeric, 'missingCellsExact': missing, 'sourceSha256': cfg['sha256']}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--phase', choices=['original', 'first', 'restart'], required=True)
    args = parser.parse_args()
    if args.phase == 'original':
        report = verify_rows(json.loads((OUT / 'native-review.json').read_text(encoding='utf-8')))
    else:
        directory = (Path(os.environ['APPDATA']) / PROFILE / 'PersonalMacro').resolve(strict=True)
        assert directory.parent.name == PROFILE and directory.name == 'PersonalMacro'
        with sqlite3.connect((directory / 'database/journal.sqlite').as_uri() + '?mode=ro', uri=True) as db:
            found = db.execute('SELECT value_json FROM app_settings WHERE key=?', ('atlas.innovation.validation.' + args.phase,)).fetchone()
        if not found:
            print(json.dumps({'phase': args.phase, 'status': 'pending'}))
            return
        proof = json.loads(found[0])
        assert proof.get('ok'), proof.get('error', 'Incomplete proof')
        assert proof['identifier'] == PROFILE and proof['phase'] == args.phase
        report = verify_rows(proof['snapshots'])
        assert len(proof['snapshots']) == 201
        with sqlite3.connect((directory / 'atlas/cache.sqlite').as_uri() + '?mode=ro', uri=True) as db:
            assert db.execute('SELECT version,success FROM _sqlx_migrations ORDER BY version').fetchall() == [(i, 1) for i in range(1, 19)]
            profiles = {i: json.loads(t) for i, t in db.execute('SELECT geography_id,profile_json FROM atlas_innovation_areas')}
        assert len(profiles) == 199
        assert verify_rows([{**r, 'profile': profiles.get(r['geography']['id'])} for r in proof['snapshots']]) == report
        assert proof['note']['snapshotStatus'] == 'available'
        params = proof['note']['context']['params']
        assert all(params[k] == v for k, v in {'perspective': 'innovation', 'innovationGroup': 'digital', 'innovationMetric': 'overview', 'innovationSince': '1980', 'innovationThrough': '2023'}.items())
        cfg = json.loads(CONFIG.read_text(encoding='utf-8'))
        assert any(s['family'] == 'wipo' and cfg['sha256'] in s['hashes'] for s in proof['note']['sources'])
        picture = base64.b64decode(proof['picture'], validate=True)
        assert picture[:8] == b'\x89PNG\r\n\x1a\n'
        (OUT / (args.phase + '.png')).write_bytes(picture)
        (OUT / (args.phase + '.json')).write_text(json.dumps(proof, ensure_ascii=False), encoding='utf-8')
        if args.phase == 'restart':
            first = json.loads((OUT / 'first.json').read_text(encoding='utf-8'))
            assert proof['jobs'] == [] and first['snapshots'] == proof['snapshots'] and first['note'] == proof['note']
        else:
            assert len(proof['jobs']) == 1 and proof['jobs'][0]['status'] == 'complete' and proof['jobs'][0]['observations'] == 108696
        report.update(identifier=PROFILE, nativeResponses=201, jobs=len(proof['jobs']), atlasMigrations=18, savedNoteAndPicture=True, pictureSha256=hashlib.sha256(picture).hexdigest(), exactResponsesAndNoteAfterRestart=args.phase == 'restart', productionDataAccessed=False)
    report.update(phase=args.phase, status='passed')
    (OUT / (args.phase + '-check.json')).write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report))

if __name__ == '__main__':
    main()
