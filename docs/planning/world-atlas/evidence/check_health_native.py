"""Read only the isolated GHED test profile and public WHO reference files."""
import argparse
import base64
import hashlib
import json
import math
import os
from pathlib import Path
import sqlite3

ROOT=Path(__file__).resolve().parents[4]
PROFILE='com.personal-macro.atlas-health-finance-20260909'
OUT=ROOT/'apps/desktop/.tmp/atlas-validation/ghed'
CONFIG=ROOT/'apps/desktop/src/features/world-atlas/data/health-finance-catalog.json'

def verify_rows(rows, protocol=False):
    cfg=json.loads(CONFIG.read_text(encoding='utf-8'))
    reference=json.loads((OUT/'reference.json').read_text(encoding='utf-8'))
    for file in cfg['files']:
        original=OUT/file['localFile']
        assert original.stat().st_size==file['bytes'] and hashlib.sha256(original.read_bytes()).hexdigest()==file['sha256']
    supported={a['geographyId']:a for a in cfg['areas']}
    found=set(); numeric=missing=metadata=rounded=0
    names=['field','longCode','label','sources','comments','dataType','methods','footnote']
    for row in rows:
        id=row['geography']['id']; assert id not in found; found.add(id)
        provenance=row['provenance']; assert provenance['sha256']==cfg['files'][0]['sha256'] and provenance['notesSha256']==cfg['files'][1]['sha256'] and provenance['recipe']==cfg['recipe']
        if id not in supported:
            assert row['status']=='unsupported_area' and row['profile'] is None
            continue
        a=supported[id];code=a['code'];profile=row['profile']
        assert profile['providerCode']==code and profile['providerLabel']==a['label'] and profile['geographyId']==id
        expected=sorted(reference['profiles'][code],key=lambda p:p['year'])
        assert [p['year'] for p in profile['points']]==[p['year'] for p in expected]
        for actual,original in zip(profile['points'],expected):
            assert actual['values'].keys()==original['values'].keys()
            for field,value in actual['values'].items():
                source=original['values'][field]
                if source!=value:
                    assert protocol and source is not None and value is not None and source!=0 and value!=0 and abs(source-value)<=math.ulp(source),(code,actual['year'],field,source,value)
                    rounded+=1
        assert profile['metadata']==[dict(zip(names,r[4:])) for r in reference['metadata'][code]],(code,'metadata differ')
        notes=reference['notes'][code]
        assert profile['notes']=={'footnote':notes[3],'releaseNote':notes[4],'reportingCurrency':notes[6]},(code,'country notes differ')
        for point in profile['points']:
            for n in point['values'].values():
                if n is None:missing+=1
                else:numeric+=1
        metadata+=len(profile['metadata'])
    assert set(supported)<=found and (numeric,missing,metadata)==(81762,93494,32667)
    return {'profiles':195,'numericCellsChecked':numeric,'numericCellsExact':numeric-rounded,'protocolCellsWithinOneUlp':rounded,'missingCellsExact':missing,'metadataRowsExact':metadata,'countryNotesExact':195}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--phase',choices=['original','first','restart'],required=True)
    args=parser.parse_args()
    if args.phase=='original':
        # The default serde_json reader can round an f64 by one ULP while reading
        # profile_json. This checks the command response, not the raw cache file.
        report=verify_rows(json.loads((OUT/'native-review.json').read_text(encoding='utf-8')),protocol=True)
        (OUT/'original-check.json').write_text(json.dumps(report,indent=2)+'\n')
        print(json.dumps(report));return
    directory=(Path(os.environ['APPDATA'])/PROFILE/'PersonalMacro').resolve(strict=True)
    assert directory.parent.name==PROFILE and directory.name=='PersonalMacro'
    with sqlite3.connect((directory/'database/journal.sqlite').as_uri()+'?mode=ro',uri=True) as db:
        found=db.execute('SELECT value_json FROM app_settings WHERE key=?',('atlas.health.validation.'+args.phase,)).fetchone()
    if not found:print(json.dumps({'phase':args.phase,'status':'pending'}));return
    proof=json.loads(found[0]);assert proof.get('ok'),proof.get('error','Incomplete proof')
    assert proof['identifier']==PROFILE and proof['phase']==args.phase
    # Cache JSON is the persisted source of truth. Compare every original number,
    # missing cell, metadata text and country note, independently of the frontend.
    with sqlite3.connect((directory/'atlas/cache.sqlite').as_uri()+'?mode=ro',uri=True) as db:
        assert db.execute('SELECT version,success FROM _sqlx_migrations ORDER BY version').fetchall()==[(i,1) for i in range(1,18)]
        profiles={id:json.loads(text) for id,text in db.execute('SELECT geography_id,profile_json FROM atlas_health_areas')}
    assert len(profiles)==195 and len(proof['snapshots'])==197
    cache_rows=[{**r,'profile':profiles.get(r['geography']['id'])} for r in proof['snapshots']]
    report=verify_rows(cache_rows)
    assert proof['note']['snapshotStatus']=='available'
    assert proof['note']['context']['params']['healthGroup']=='volume' and proof['note']['context']['params']['healthMetric']=='overview'
    assert proof['note']['context']['params']['healthSince']=='2000' and proof['note']['context']['params']['perspective']=='health'
    cfg=json.loads(CONFIG.read_text(encoding='utf-8'))
    assert all(any(s['family']=='who' and f['sha256'] in s['hashes'] for s in proof['note']['sources']) for f in cfg['files'])
    picture=base64.b64decode(proof['picture'],validate=True);assert picture[:8]==b'\x89PNG\r\n\x1a\n'
    (OUT/(args.phase+'.json')).write_text(json.dumps(proof,ensure_ascii=False),encoding='utf-8')
    (OUT/(args.phase+'.png')).write_bytes(picture)
    if args.phase=='restart':
        first=json.loads((OUT/'first.json').read_text(encoding='utf-8'))
        assert proof['jobs']==[] and first['snapshots']==proof['snapshots'] and first['note']==proof['note']
    else: assert len(proof['jobs'])==1 and proof['jobs'][0]['status']=='complete' and proof['jobs'][0]['observations']==81762
    report.update(phase=args.phase,status='passed',runAt=proof['runAt'],identifier=PROFILE,nativeResponses=197,jobs=len(proof['jobs']),atlasMigrations=17,
        savedNoteAndPicture=True,pictureSha256=hashlib.sha256(picture).hexdigest(),exactResponsesAndNoteAfterRestart=args.phase=='restart',productionDataAccessed=False)
    (OUT/(args.phase+'-check.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report))
if __name__=='__main__':main()
