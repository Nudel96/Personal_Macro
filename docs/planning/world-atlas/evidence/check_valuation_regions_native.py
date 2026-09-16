"""Check only the isolated regional-valuation notebook profile and public NYU proofs."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[4]
PROFILE = 'com.personal-macro.atlas-valuation-regions-20260909'
OUT = ROOT / 'apps/desktop/.tmp/atlas-validation/valuation-regions'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--phase', choices=['first', 'restart'], required=True)
    args = parser.parse_args()
    directory = (Path(os.environ['APPDATA']) / PROFILE / 'PersonalMacro').resolve(strict=True)
    assert directory.parent.name == PROFILE and directory.name == 'PersonalMacro'
    with sqlite3.connect((directory / 'database/journal.sqlite').as_uri() + '?mode=ro', uri=True) as db:
        found = db.execute('SELECT value_json FROM app_settings WHERE key=?', ('atlas.valuation-regions.validation.' + args.phase,)).fetchone()
    if not found:
        print(json.dumps({'phase': args.phase, 'status': 'pending'}))
        return
    proof = json.loads(found[0])
    assert proof.get('ok'), proof.get('error', 'Incomplete proof')
    assert proof['identifier'] == PROFILE and proof['phase'] == args.phase
    assert proof['matrix']['checked'] > 20000 and not proof['matrix']['unexpected']
    assert proof['jobs'] == [] and proof['tableCount'] == 0
    assert any('Indien' in label for label in proof['labels']) and any('USA' in label for label in proof['labels'])
    assert proof['note']['snapshotStatus'] == 'available'
    params = proof['note']['context']['params']
    assert params['valCompareScope'] == 'us' and params['valScope'] == 'india' and params['valBasis'] == 'pbv'
    assert params['numbers'] == '0'
    snapshots_path = ROOT / 'apps/desktop/.tmp/atlas-validation/valuation/native-valuation-snapshots.json'
    snapshots = {s['datasetId']: s for s in json.loads(snapshots_path.read_text(encoding='utf-8'))}
    sources = proof['note']['sources']
    assert len(sources) == 2 and {s['datasetId'] for s in sources} == {'pbv-india', 'pbv-us'}
    for source in sources:
        provenance = snapshots[source['datasetId']]['provenance']
        assert source['family'] == 'damodaran'
        assert set(source['hashes']) == {f['sha256'] for f in provenance['files']}
        assert source['retrievedAt'] == provenance['retrievedAt']
    picture = base64.b64decode(proof['picture'], validate=True)
    assert picture[:8] == b'\x89PNG\r\n\x1a\n'
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / (args.phase + '.json')).write_text(json.dumps(proof, ensure_ascii=False), encoding='utf-8')
    (OUT / (args.phase + '.png')).write_bytes(picture)
    if args.phase == 'restart':
        first = json.loads((OUT / 'first.json').read_text(encoding='utf-8'))
        assert first['note'] == proof['note'] and first['matrix'] == proof['matrix']
    report = {
        'phase': args.phase, 'status': 'passed', 'runAt': proof['runAt'], 'identifier': PROFILE,
        'sourceMode': 'Reused previously audited native public NYU responses; no new provider or download',
        'publicSnapshotSha256': hashlib.sha256(snapshots_path.read_bytes()).hexdigest(),
        'matrix': proof['matrix'], 'jobs': 0, 'twoSavedSourcePackages': True,
        'pictureSha256': hashlib.sha256(picture).hexdigest(),
        'savedPictureSha256': hashlib.sha256(base64.b64decode(proof['note']['snapshotDataUrl'].split(',')[1], validate=True)).hexdigest(),
        'exactNoteAndPictureAfterProcessRestart': args.phase == 'restart', 'productionDataAccessed': False,
    }
    (OUT / (args.phase + '-check.json')).write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    main()
