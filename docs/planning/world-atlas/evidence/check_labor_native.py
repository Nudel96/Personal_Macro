"""Compare all native ILO values with the original CSV; isolated profile only."""
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
PROFILE = 'com.personal-macro.atlas-labor-20260909'
OUT = ROOT / 'apps/desktop/.tmp/atlas-validation/labor'
CONFIG = ROOT / 'apps/desktop/src/features/world-atlas/data/labor-catalog.json'

def verify_rows(rows):
    cfg = json.loads(CONFIG.read_text(encoding='utf-8'))
    raw = (OUT / 'employment.csv').read_bytes()
    assert len(raw) == cfg['bytes'] and hashlib.sha256(raw).hexdigest() == cfg['sha256']
    records = list(csv.DictReader(io.StringIO(raw.decode('utf-8-sig'))))
    from decimal import Decimal
    reference = {(r['ref_area'], r['classif1'], int(r['time'])): (int(Decimal(r['obs_value']) * 1000) if r['obs_value'] else None, r['obs_status']) for r in records}
    assert len(reference) == len(records) == cfg['expectedRows']
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
        assert [p['year'] for p in profile['points']] == list(range(1991, 2025))
        for point in profile['points']:
            assert set(point['values']) == {cfg['totalField'], *(m['field'] for m in cfg['metrics'])}
            for field, value in point['values'].items():
                original, flag = reference.get((area['code'], field, point['year']), (None, None))
                assert point['flags'].get(field) == flag
                assert original == value, (area['code'], field, point['year'], original, value)
                if value is None:
                    missing += 1
                else:
                    assert isinstance(value, int)
                    numeric += 1
    assert set(supported) <= found and (numeric, missing) == (96765, 135)
    return {'profiles': 190, 'numericCellsExact': numeric, 'missingCellsExact': missing, 'sourceSha256': cfg['sha256']}

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
            found = db.execute('SELECT value_json FROM app_settings WHERE key=?', ('atlas.labor.validation.' + args.phase,)).fetchone()
        if not found:
            print(json.dumps({'phase': args.phase, 'status': 'pending'}))
            return
        proof = json.loads(found[0])
        assert proof.get('ok'), proof.get('error', 'Incomplete proof')
        assert proof['identifier'] == PROFILE and proof['phase'] == args.phase
        assert proof['visualRevision'] == 3, 'Waiting for the final reviewed caption'
        report = verify_rows(proof['snapshots'])
        assert len(proof['snapshots']) == 192
        with sqlite3.connect((directory / 'atlas/cache.sqlite').as_uri() + '?mode=ro', uri=True) as db:
            assert db.execute('SELECT version,success FROM _sqlx_migrations ORDER BY version').fetchall() == [(i, 1) for i in range(1, 20)]
            profiles = {i: json.loads(t) for i, t in db.execute('SELECT geography_id,profile_json FROM atlas_labor_areas')}
        assert len(profiles) == 190
        assert verify_rows([{**r, 'profile': profiles.get(r['geography']['id'])} for r in proof['snapshots']]) == report
        assert proof['note']['snapshotStatus'] == 'available'
        params = proof['note']['context']['params']
        assert all(params[k] == v for k, v in {'perspective': 'labor', 'laborGroup': 'society', 'laborMetric': 'overview', 'laborSince': '1991'}.items())
        cfg = json.loads(CONFIG.read_text(encoding='utf-8'))
        assert any(s['family'] == 'ilo' and cfg['sha256'] in s['hashes'] for s in proof['note']['sources'])
        picture = base64.b64decode(proof['picture'], validate=True)
        assert picture[:8] == b'\x89PNG\r\n\x1a\n'
        (OUT / (args.phase + '.png')).write_bytes(picture)
        (OUT / (args.phase + '.json')).write_text(json.dumps(proof, ensure_ascii=False), encoding='utf-8')
        if args.phase == 'restart':
            first = json.loads((OUT / 'first.json').read_text(encoding='utf-8'))
            assert proof['jobs'] == [] and first['snapshots'] == proof['snapshots'] and first['note'] == proof['note']
        else:
            assert len(proof['jobs']) == 1 and proof['jobs'][0]['status'] == 'complete' and proof['jobs'][0]['observations'] == 96765
        report.update(identifier=PROFILE, nativeResponses=192, jobs=len(proof['jobs']), atlasMigrations=19, savedNoteAndPicture=True, pictureSha256=hashlib.sha256(picture).hexdigest(), exactResponsesAndNoteAfterRestart=args.phase == 'restart', productionDataAccessed=False)
    report.update(phase=args.phase, status='passed')
    (OUT / (args.phase + '-check.json')).write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report))

if __name__ == '__main__':
    main()
