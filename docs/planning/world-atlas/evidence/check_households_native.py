"""Read the dedicated UN households Tauri test profile only; never the production journal."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import sqlite3

ROOT=Path(__file__).resolve().parents[4]
PROFILE='com.personal-macro.atlas-households-20260909'
OUT=ROOT/'apps/desktop/.tmp/atlas-validation/households'

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--phase',choices=['first','restart'],required=True);args=parser.parse_args()
    directory=(Path(os.environ['APPDATA'])/PROFILE/'PersonalMacro').resolve(strict=True)
    assert directory.parent.name==PROFILE and directory.name=='PersonalMacro'
    with sqlite3.connect((directory/'database/journal.sqlite').as_uri()+'?mode=ro',uri=True) as db:
        found=db.execute('SELECT value_json FROM app_settings WHERE key=?',('atlas.households.validation.'+args.phase,)).fetchone()
    if not found:print(json.dumps({'phase':args.phase,'status':'pending'}));return
    proof=json.loads(found[0]);assert proof.get('ok'),proof.get('error','Incomplete proof')
    assert proof['identifier']==PROFILE and proof['phase']==args.phase
    cfg=json.loads((ROOT/'apps/desktop/src/features/world-atlas/data/households-catalog.json').read_text(encoding='utf-8'))
    rows={r['geography']['id']:r for r in proof['snapshots']};supported={a['geographyId']:a for a in cfg['areas']}
    assert set(rows)==set(supported)|{'world','un-wpp:903'}
    for key,r in rows.items():
        assert r['provenance']['sha256']==cfg['sha256'] and r['provenance']['recipe']==cfg['recipe']
        if key in supported:assert r['status']=='available' and len(r['profile']['observations'])==supported[key]['rowCount']
        else:assert r['status']=='unsupported_area' and r['profile'] is None
    assert proof['note']['snapshotStatus']=='available'
    assert proof['note']['context']['params']['hhGroup']=='size'
    assert proof['note']['context']['params']['hhSince']=='1959'
    assert proof['note']['context']['params']['hhMetric']=='averageSize'
    assert proof['note']['context']['params']['hhRecord'].startswith('unhh2026:')
    assert proof['note']['context']['params']['hhCompareRecord'].startswith('unhh2026:')
    assert any(s['family']=='un' and cfg['sha256'] in s['hashes'] for s in proof['note']['sources'])
    picture=base64.b64decode(proof['picture'],validate=True);assert picture[:8]==b'\x89PNG\r\n\x1a\n'
    OUT.mkdir(parents=True,exist_ok=True)
    (OUT/(args.phase+'.json')).write_text(json.dumps(proof,ensure_ascii=False),encoding='utf-8')
    (OUT/(args.phase+'.png')).write_bytes(picture)
    if args.phase=='restart':
        first=json.loads((OUT/'first.json').read_text(encoding='utf-8'))
        assert proof['jobs']==[] and first['snapshots']==proof['snapshots'] and first['note']==proof['note']
    else:assert len(proof['jobs'])==1 and proof['jobs'][0]['status']=='complete' and proof['jobs'][0]['observations']==36142
    with sqlite3.connect((directory/'atlas/cache.sqlite').as_uri()+'?mode=ro',uri=True) as db:
        assert db.execute('SELECT version,success FROM _sqlx_migrations ORDER BY version').fetchall()==[(i,1) for i in range(1,16)]
        assert db.execute('SELECT COUNT(*) FROM atlas_households_areas').fetchone()[0]==200
    report={'phase':args.phase,'status':'passed','runAt':proof['runAt'],'identifier':PROFILE,'nativeResponsesRead':len(rows),'availableCountries':200,'unsupported':['world','un-wpp:903'],'sourceSha256':cfg['sha256'],'numericCells':36142,'jobs':len(proof['jobs']),'atlasMigrations':15,'savedNoteAndPicture':True,'pictureSha256':hashlib.sha256(picture).hexdigest(),'savedPictureSha256':hashlib.sha256(base64.b64decode(proof['note']['snapshotDataUrl'].split(',')[1],validate=True)).hexdigest(),'exactPersistedResponsesAndNoteAfterRestart':args.phase=='restart','productionDataAccessed':False}
    (OUT/(args.phase+'-check.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps(report,ensure_ascii=False))

if __name__=='__main__':main()
