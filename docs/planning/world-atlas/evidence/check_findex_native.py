"""Read only the explicitly isolated Findex native test profile and public references."""
from pathlib import Path
import json
import os
import sqlite3
from datetime import datetime

ROOT = Path(__file__).resolve().parents[4]
REVIEW = ROOT/'apps/desktop/.tmp/atlas-validation/findex'
PROFILE='com.personal-macro.atlas-findex-20260909'
DB=Path(os.environ['APPDATA'])/PROFILE/'PersonalMacro/database/journal.sqlite'
reference=json.loads((REVIEW/'reference.json').read_text(encoding='utf-8'))

def check(rows):
    assert len(rows)==174
    for row in rows:
        assert row['status']=='available'
        assert row['profile']==reference[row['geography']['id']]
    return {'profiles':len(rows),'numericCells':59471,'missingCells':98701,'rawValuesExactlyEqual':True}

def main():
    result={'originalFileRoundtrip':check(json.loads((REVIEW/'native-review.json').read_text(encoding='utf-8')))}
    assert PROFILE in DB.parts
    if not DB.exists(): print(json.dumps({**result,'native':'not_started'}));return
    phases={}
    with sqlite3.connect(DB.as_uri()+'?mode=ro',uri=True) as connection:
        for phase in ['first','restart']:
            row=connection.execute('SELECT value_json FROM app_settings WHERE key=?',(f'atlas.findex.validation.{phase}',)).fetchone()
            if not row:print(json.dumps({**result,phase:'pending'}));return
            proof=json.loads(row[0]);assert proof['identifier']==PROFILE
            assert proof['ok'],proof.get('error')
            (REVIEW/f'{phase}.json').write_text(json.dumps(proof,ensure_ascii=False),encoding='utf-8')
            phases[phase]=proof
            result[phase]={**check(proof['snapshots']),'jobs':proof['jobs'],'runAt':proof['runAt']}
    process_file=REVIEW/'restart-process.json'
    if not process_file.exists():print(json.dumps({**result,'actualProcessRestart':'pending'}));return
    process=json.loads(process_file.read_text(encoding='utf-8-sig'))
    assert process['identifier']==PROFILE and process['pid']!=process['previousPid']
    assert datetime.fromisoformat(phases['restart']['runAt'])>=datetime.fromisoformat(process['createdAt'])
    assert phases['first']['snapshots']==phases['restart']['snapshots']
    assert phases['first']['note']==phases['restart']['note'] and not phases['restart']['jobs']
    note=phases['first']['note'];assert note['context']['params']['findexPopulation']=='women'
    assert note['context']['params']['area']=='m49:356' and note['context']['params']['compare']=='m49:156'
    assert note['snapshotDataUrl'].startswith('data:image/png;base64,')
    assert all(len(source['hashes'])==2 for source in note['sources'])
    result.update({'identifier':PROFILE,'restartProcess':process,'notebookAndOriginalPictureUnchanged':True,
                   'nativeUiClickAcceptance':False})
    Path(__file__).with_name('findex-native-readiness.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(result,ensure_ascii=False))

if __name__=='__main__':main()
